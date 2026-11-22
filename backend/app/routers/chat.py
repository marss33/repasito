import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..contexto import buscar, fragmentos_de
from ..db import SessionLocal, get_db
from ..deps import con_ia, get_ia, materia_o_404, sumar_uso, usuario_actual, verificar_uso
from ..ia import Contexto, ErrorIA, TutorIA, renumerar_citas
from ..idioma import idioma_actual, t
from ..models import Materia, Mensaje, Usuario
from ..schemas import MensajeOut, PreguntaIn

router = APIRouter(prefix="/materias/{materia_id}/chat", tags=["chat"])

FRAGMENTOS_POR_PREGUNTA = 6
MENSAJES_DE_HISTORIAL = 6


@router.get("", response_model=list[MensajeOut])
def historial(materia: Materia = Depends(materia_o_404)):
    return materia.mensajes


def _preparar(db: Session, materia: Materia, pregunta: str) -> tuple[list[Contexto], list[tuple[str, str]]]:
    fragmentos = fragmentos_de(db, materia.id)
    if not fragmentos:
        raise HTTPException(400, t("sin_apuntes"))
    anteriores = materia.mensajes[-MENSAJES_DE_HISTORIAL:]
    # Sumar la pregunta anterior ayuda con repreguntas como "¿y eso para qué sirve?"
    ultima = next((m.texto for m in reversed(anteriores) if m.rol == "user"), "")
    contexto = buscar(fragmentos, f"{pregunta} {ultima}", FRAGMENTOS_POR_PREGUNTA)
    return contexto, [(m.rol, m.texto) for m in anteriores]


@router.post("", response_model=MensajeOut)
def preguntar(
    datos: PreguntaIn,
    materia: Materia = Depends(materia_o_404),
    usuario: Usuario = Depends(usuario_actual),
    db: Session = Depends(get_db),
    ia: TutorIA = Depends(get_ia),
):
    contexto, historial = _preparar(db, materia, datos.pregunta)
    with con_ia(db, usuario, ia):
        respuesta = ia.responder(datos.pregunta, contexto, historial)

    db.add(Mensaje(materia=materia, rol="user", texto=datos.pregunta))
    mensaje = Mensaje(materia=materia, rol="assistant", texto=respuesta.texto, fuentes=respuesta.fuentes)
    db.add(mensaje)
    db.commit()
    return mensaje


def _evento(nombre: str, datos) -> str:
    return f"event: {nombre}\ndata: {json.dumps(datos, ensure_ascii=False)}\n\n"


@router.post("/en-vivo")
def preguntar_en_vivo(
    datos: PreguntaIn,
    materia: Materia = Depends(materia_o_404),
    usuario: Usuario = Depends(usuario_actual),
    db: Session = Depends(get_db),
    ia: TutorIA = Depends(get_ia),
):
    """Igual que `preguntar`, pero manda la respuesta a medida que la IA la escribe (Server-Sent Events).
    Eventos: `texto` (un pedazo), `fin` (el mensaje guardado, con las citas) o `error`."""
    contexto, historial = _preparar(db, materia, datos.pregunta)
    verificar_uso(usuario)
    materia_id, usuario_id, idioma = materia.id, usuario.id, idioma_actual.get()

    def eventos() -> Iterator[str]:
        # Esto corre mientras se envía la respuesta, así que usa su propia sesión de base de datos
        partes: list[str] = []
        error: str | None = None
        try:
            for pedazo in ia.responder_en_vivo(datos.pregunta, contexto, historial):
                partes.append(pedazo)
                yield _evento("texto", pedazo)
        except ErrorIA as e:
            error = e.texto(idioma)

        with SessionLocal() as sesion:
            sumar_uso(sesion, sesion.get(Usuario, usuario_id), 1 if ia.llamadas else 0)
            if error:
                yield _evento("error", {"detail": error})
                return
            respuesta = renumerar_citas("".join(partes), contexto)
            sesion.add(Mensaje(materia_id=materia_id, rol="user", texto=datos.pregunta))
            mensaje = Mensaje(materia_id=materia_id, rol="assistant", texto=respuesta.texto, fuentes=respuesta.fuentes)
            sesion.add(mensaje)
            sesion.commit()
            yield _evento("fin", MensajeOut.model_validate(mensaje).model_dump(mode="json"))

    return StreamingResponse(
        eventos(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@router.delete("", status_code=204)
def borrar_historial(materia: Materia = Depends(materia_o_404), db: Session = Depends(get_db)):
    materia.mensajes.clear()
    db.commit()
