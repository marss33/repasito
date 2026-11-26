import asyncio
import json
import logging
import random
import time
from collections.abc import Callable
from pathlib import PurePosixPath
from typing import Annotated
from urllib.parse import quote

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import chat_extras, config, logros
from ..busqueda import BM25
from ..db import SessionLocal, get_db
from ..deps import COOKIE_SESION, buscar_usuario, con_ia, get_ia, get_ocr, usuario_actual, verificar_uso
from ..extraccion import ArchivoInvalido, extraer, trocear, ubicacion
from ..ia import Contexto, TutorIA
from ..idioma import ErrorTraducible, t
from ..models import (
    ArchivoPizarra,
    ArchivoSala,
    ItemSala,
    Materia,
    MensajeSala,
    MiembroSala,
    Pizarra,
    Sala,
    SalaPersonal,
    Usuario,
    ahora,
)
from ..rincon import apariencia_publica, dar, version_foto_mascota
from ..salas import ESPERA_ENTRE_MENSAJES, Conexion, Persistencia, generar_codigo, gestor
from ..schemas import (
    AMateriaIn,
    ArchivoSalaOut,
    DocumentoOut,
    ItemSalaCambio,
    ItemSalaIn,
    ItemSalaOut,
    MensajeSalaOut,
    SalaDetalle,
    SalaIn,
    SalaOut,
    SubidaPendiente,
)
from ..trivia import CANTIDADES, DIFICULTADES, MAX_TEMA, MODOS, Trivia
from .documentos import subir_apunte

router = APIRouter(prefix="/salas", tags=["salas"])
log = logging.getLogger(__name__)

MENSAJES_AL_ENTRAR = 50
SALAS_RECIENTES = 12
MAX_ARCHIVOS_SALA = 30
MAX_MB_SALA = 150


def _dueno_si_es_personal(db: Session, sala: Sala) -> int | None:
    personal = db.query(SalaPersonal).filter_by(sala_id=sala.id).first()
    return personal.usuario_id if personal else None


def _sala_o_404(db: Session, codigo: str, usuario: Usuario) -> Sala:
    sala = db.query(Sala).filter_by(codigo=codigo.upper()).first()
    if sala is None:
        raise HTTPException(404, t("sala_no_existe"))
    dueno = _dueno_si_es_personal(db, sala)
    if dueno is not None and dueno != usuario.id:  # la sala personal es solo de su dueño
        raise HTTPException(404, t("sala_no_existe"))
    return sala


def _a_salida(sala: Sala, personal: bool = False) -> SalaOut:
    return SalaOut(codigo=sala.codigo, nombre=sala.nombre, personas=gestor.personas_en(sala.codigo), personal=personal)


def _registrar_visita(db: Session, sala: Sala, usuario: Usuario) -> None:
    miembro = db.query(MiembroSala).filter_by(sala_id=sala.id, usuario_id=usuario.id).first()
    if miembro is None:
        db.add(MiembroSala(sala=sala, usuario=usuario))
    else:
        miembro.ultima_visita = ahora()
    db.commit()


@router.post("", response_model=SalaOut, status_code=201)
def crear(datos: SalaIn, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    codigo = generar_codigo()
    while db.query(Sala).filter_by(codigo=codigo).first():  # casi imposible, pero por las dudas
        codigo = generar_codigo()
    sala = Sala(codigo=codigo, nombre=datos.nombre.strip(), creador_id=usuario.id)
    db.add(sala)
    _registrar_visita(db, sala, usuario)
    return _a_salida(sala)


@router.get("", response_model=list[SalaOut])
def recientes(usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    """Las salas en las que estuvo el usuario, de la más reciente a la más vieja."""
    personales = db.query(SalaPersonal.sala_id)
    miembros = (
        db.query(MiembroSala)
        .filter_by(usuario_id=usuario.id)
        .filter(MiembroSala.sala_id.not_in(personales))
        .order_by(MiembroSala.ultima_visita.desc())
        .limit(SALAS_RECIENTES)
        .all()
    )
    return [_a_salida(m.sala) for m in miembros]


@router.post("/personal", response_model=SalaOut)
def personal(usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    """La sala para estudiar solo. Se crea la primera vez que se abre."""
    propia = db.get(SalaPersonal, usuario.id)
    if propia is None:
        codigo = generar_codigo(8)
        while db.query(Sala).filter_by(codigo=codigo).first():
            codigo = generar_codigo(8)
        sala = Sala(codigo=codigo, nombre=t("mi_sala"), creador_id=usuario.id)
        db.add(sala)
        db.flush()
        propia = SalaPersonal(usuario_id=usuario.id, sala_id=sala.id)
        db.add(propia)
        db.commit()
    return _a_salida(db.get(Sala, propia.sala_id), personal=True)


@router.get("/{codigo}", response_model=SalaDetalle)
def ver(codigo: str, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    sala = _sala_o_404(db, codigo, usuario)
    mensajes = (
        db.query(MensajeSala).filter_by(sala_id=sala.id).order_by(MensajeSala.id.desc()).limit(MENSAJES_AL_ENTRAR).all()
    )
    return SalaDetalle(
        **_a_salida(sala, personal=_dueno_si_es_personal(db, sala) is not None).model_dump(),
        mensajes=_con_extras(db, list(reversed(mensajes))),
        creador_id=sala.creador_id,
    )


def _con_extras(db: Session, mensajes: list[MensajeSala]) -> list[MensajeSalaOut]:
    """Los mensajes del chat con sus reacciones y, si son encuestas, sus votos."""
    ids = [m.id for m in mensajes]
    reacciones = chat_extras.reacciones_de(db, ids)
    encuestas = chat_extras.encuestas_de(db, ids)
    salida = []
    for m in mensajes:
        out = MensajeSalaOut.model_validate(m)
        out.reacciones = reacciones.get(m.id, {})
        out.encuesta = encuestas.get(m.id)
        salida.append(out)
    return salida


# --- Tiempo real ---


def _entrar(token: str | None, codigo: str) -> tuple[int, str, dict, bool] | int:
    """Verifica la sesión y la sala. Devuelve (id, nombre, apariencia, es personal) o un código de cierre."""
    with SessionLocal() as db:
        usuario = buscar_usuario(db, token)
        if usuario is None:
            return 4401
        sala = db.query(Sala).filter_by(codigo=codigo).first()
        if sala is None:
            return 4404
        dueno = _dueno_si_es_personal(db, sala)
        if dueno is not None and dueno != usuario.id:
            return 4404
        _registrar_visita(db, sala, usuario)
        return (
            usuario.id,
            usuario.nombre,
            apariencia_publica(usuario.rincon, usuario.id, version_foto_mascota(db, usuario.id)),
            dueno is not None,
        )


def _cargar_pizarra(codigo: str) -> tuple[dict[str, dict], set[str]]:
    with SessionLocal() as db:
        sala = db.query(Sala).filter_by(codigo=codigo).one()
        pizarra = db.query(Pizarra).filter_by(sala_id=sala.id).first()
        elementos = {e["id"]: e for e in (pizarra.elementos if pizarra else [])}
        imagenes = {fila.archivo_id for fila in db.query(ArchivoPizarra.archivo_id).filter_by(sala_id=sala.id)}
        return elementos, imagenes


def _guardar_pizarra(codigo: str, elementos: list[dict]) -> None:
    with SessionLocal() as db:
        sala = db.query(Sala).filter_by(codigo=codigo).one()
        pizarra = db.query(Pizarra).filter_by(sala_id=sala.id).first() or Pizarra(sala_id=sala.id)
        pizarra.elementos = elementos
        db.add(pizarra)
        db.commit()


def _guardar_imagen(codigo: str, imagen: dict) -> None:
    with SessionLocal() as db:
        sala = db.query(Sala).filter_by(codigo=codigo).one()
        if not db.query(ArchivoPizarra).filter_by(sala_id=sala.id, archivo_id=imagen["id"]).first():
            db.add(
                ArchivoPizarra(
                    sala_id=sala.id, archivo_id=imagen["id"], mime=imagen["mimeType"], datos=imagen["dataURL"]
                )
            )
            db.commit()


async def _guardar_pizarra_async(codigo: str, elementos: list[dict]) -> None:
    await run_in_threadpool(_guardar_pizarra, codigo, elementos)


async def _guardar_imagen_async(codigo: str, imagen: dict) -> None:
    await run_in_threadpool(_guardar_imagen, codigo, imagen)


def _dar_monedas(usuarios: list[int], motivo: str, cantidad: int) -> dict[int, tuple[int, int]]:
    with SessionLocal() as db:
        resultado = {u: dar(db, u, motivo, cantidad) for u in usuarios}
        if motivo == "pomodoro":
            for u in usuarios:
                logros.sumar(db, u, "pomodoros")
        return resultado


def _contar(usuario_id: int, contador: str) -> None:
    with SessionLocal() as db:
        logros.sumar(db, usuario_id, contador)


async def _contar_async(usuario_id: int, contador: str) -> None:
    await run_in_threadpool(_contar, usuario_id, contador)


async def _dar_monedas_async(usuarios: list[int], motivo: str, cantidad: int) -> dict[int, tuple[int, int]]:
    return await run_in_threadpool(_dar_monedas, usuarios, motivo, cantidad)


def _leer_perfil(usuario_id: int) -> tuple[str, dict] | None:
    with SessionLocal() as db:
        usuario = db.get(Usuario, usuario_id)
        if usuario is None:
            return None
        return usuario.nombre, apariencia_publica(usuario.rincon, usuario.id, version_foto_mascota(db, usuario.id))


async def _leer_perfil_async(usuario_id: int) -> tuple[str, dict] | None:
    return await run_in_threadpool(_leer_perfil, usuario_id)


PERSISTENCIA = Persistencia(
    guardar_pizarra=_guardar_pizarra_async,
    guardar_imagen=_guardar_imagen_async,
    dar_monedas=_dar_monedas_async,
    contar=_contar_async,
    leer_perfil=_leer_perfil_async,
)


@router.get("/{codigo}/imagenes")
def imagenes(codigo: str, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    """Las imágenes pegadas en la pizarra. Van aparte de los trazos porque pueden pesar varios MB."""
    sala = _sala_o_404(db, codigo, usuario)
    filas = db.query(ArchivoPizarra).filter_by(sala_id=sala.id).order_by(ArchivoPizarra.id).all()
    return [{"id": f.archivo_id, "mimeType": f.mime, "dataURL": f.datos, "created": 0} for f in filas]


def _guardar_mensaje(codigo: str, usuario_id: int, nombre: str, texto: str) -> dict:
    with SessionLocal() as db:
        sala = db.query(Sala).filter_by(codigo=codigo).one()
        mensaje = MensajeSala(sala=sala, usuario_id=usuario_id, nombre=nombre, texto=texto)
        db.add(mensaje)
        db.commit()
        return MensajeSalaOut.model_validate(mensaje).model_dump(mode="json")


@router.websocket("/{codigo}/ws")
async def conectar(websocket: WebSocket, codigo: str):
    codigo = codigo.upper()
    await websocket.accept()
    # Dentro de Discord la sesión llega como ?token= (los WebSocket no pueden mandar headers)
    token = websocket.query_params.get("token") or websocket.cookies.get(COOKIE_SESION)
    resultado = await run_in_threadpool(_entrar, token, codigo)
    if isinstance(resultado, int):
        await websocket.close(code=resultado)  # 4401: sin sesión · 4404: no existe la sala
        return

    usuario_id, nombre, apariencia, es_personal = resultado
    sala = gestor.obtener(codigo)
    sala.persistencia = PERSISTENCIA
    if es_personal and not sala.conexiones:
        sala.escena = apariencia.get("escena", "escritorio")
    if sala.pizarra is None:
        elementos, imagenes_guardadas = await run_in_threadpool(_cargar_pizarra, codigo)
        if sala.pizarra is None:  # por si otro la cargó mientras tanto
            sala.pizarra, sala.imagenes = elementos, imagenes_guardadas
    conexion = Conexion(websocket, usuario_id, nombre, apariencia)

    async def guardar(c: Conexion, texto: str) -> dict:
        return await run_in_threadpool(_guardar_mensaje, codigo, c.usuario_id, c.nombre, texto)

    await sala.unir(conexion)
    # Lo que ya está dibujado, completo, para quien acaba de entrar
    await sala.enviar(conexion, {"tipo": "pizarra", "elementos": list(sala.pizarra.values()), "inicial": True})
    try:
        while True:
            texto = await websocket.receive_text()
            try:
                mensaje = json.loads(texto)
            except json.JSONDecodeError:
                continue
            if not isinstance(mensaje, dict):
                continue
            tipo = mensaje.get("tipo")
            if tipo in ("reaccion", "encuesta", "votar"):
                # Reacciones y encuestas del chat: se guardan en la base y se avisa a todos
                if tipo == "encuesta":
                    momento = time.time()
                    if momento - conexion.ultimo_mensaje < ESPERA_ENTRE_MENSAJES:
                        continue
                    conexion.ultimo_mensaje = momento
                salida = await run_in_threadpool(_extra_del_chat, codigo, conexion, mensaje)
                if salida:
                    await sala.a_todos(salida)
                continue
            await sala.recibir(conexion, mensaje, guardar)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("Error en la sala %s", codigo)
    finally:
        await sala.salir(conexion)
        if not sala.conexiones:
            await sala.guardar_pizarra()
        gestor.limpiar(codigo)


def _extra_del_chat(codigo: str, conexion: Conexion, mensaje: dict) -> dict | None:
    tipo = mensaje.get("tipo")
    if tipo == "reaccion":
        return chat_extras.reaccionar(codigo, conexion.usuario_id, mensaje.get("mensaje_id"), mensaje.get("emoji"))
    if tipo == "encuesta":
        return chat_extras.crear_encuesta(
            codigo, conexion.usuario_id, conexion.nombre, mensaje.get("pregunta"), mensaje.get("opciones")
        )
    return chat_extras.votar(codigo, conexion.usuario_id, mensaje.get("mensaje_id"), mensaje.get("opcion"))


# --- Tablero: metas del grupo y notas fijadas ---

MAX_METAS = 20
MAX_NOTAS = 10


@router.get("/{codigo}/tablero", response_model=list[ItemSalaOut])
def tablero(codigo: str, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    sala = _sala_o_404(db, codigo, usuario)
    return db.query(ItemSala).filter_by(sala_id=sala.id).order_by(ItemSala.id).all()


@router.post("/{codigo}/tablero", response_model=ItemSalaOut, status_code=201)
async def agregar_al_tablero(codigo: str, datos: ItemSalaIn, usuario: Usuario = Depends(usuario_actual)):
    def guardar() -> ItemSalaOut:
        with SessionLocal() as db:
            sala = _sala_o_404(db, codigo, usuario)
            cantidad = db.query(func.count(ItemSala.id)).filter_by(sala_id=sala.id, tipo=datos.tipo).scalar()
            maximo = MAX_METAS if datos.tipo == "meta" else MAX_NOTAS
            if cantidad >= maximo:
                raise HTTPException(400, t("tablero_lleno", maximo=maximo))
            item = ItemSala(
                sala_id=sala.id, usuario_id=usuario.id, por=usuario.nombre, tipo=datos.tipo, texto=datos.texto.strip()
            )
            db.add(item)
            db.commit()
            return ItemSalaOut.model_validate(item)

    item = await run_in_threadpool(guardar)
    await _avisar_a_la_sala(codigo, {"tipo": "tablero"})
    return item


@router.patch("/{codigo}/tablero/{item_id}", response_model=ItemSalaOut)
async def tildar_meta(codigo: str, item_id: int, datos: ItemSalaCambio, usuario: Usuario = Depends(usuario_actual)):
    """Cualquiera de la sala puede marcar una meta como cumplida (o desmarcarla)."""

    def guardar() -> ItemSalaOut:
        with SessionLocal() as db:
            item = _item_o_404(db, codigo, item_id, usuario)
            item.hecho = datos.hecho
            item.hecho_por = usuario.nombre if datos.hecho else None
            db.commit()
            return ItemSalaOut.model_validate(item)

    item = await run_in_threadpool(guardar)
    await _avisar_a_la_sala(codigo, {"tipo": "tablero"})
    return item


@router.delete("/{codigo}/tablero/{item_id}", status_code=204)
async def borrar_del_tablero(codigo: str, item_id: int, usuario: Usuario = Depends(usuario_actual)):
    def borrar() -> None:
        with SessionLocal() as db:
            item = _item_o_404(db, codigo, item_id, usuario)
            sala = db.get(Sala, item.sala_id)
            if usuario.id not in (item.usuario_id, sala.creador_id):
                raise HTTPException(403, t("no_es_tu_item"))
            db.delete(item)
            db.commit()

    await run_in_threadpool(borrar)
    await _avisar_a_la_sala(codigo, {"tipo": "tablero"})


def _item_o_404(db: Session, codigo: str, item_id: int, usuario: Usuario) -> ItemSala:
    sala = _sala_o_404(db, codigo, usuario)
    item = db.get(ItemSala, item_id)
    if item is None or item.sala_id != sala.id:
        raise HTTPException(404, t("item_no_existe"))
    return item


# --- Archivos compartidos (la "nube" de la sala) ---


async def _avisar_a_la_sala(codigo: str, *mensajes: dict) -> None:
    sala = gestor.salas.get(codigo.upper())
    if sala:
        await sala.a_todos(*mensajes)


@router.get("/{codigo}/archivos", response_model=list[ArchivoSalaOut])
def archivos(codigo: str, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    sala = _sala_o_404(db, codigo, usuario)
    return db.query(ArchivoSala).filter_by(sala_id=sala.id).order_by(ArchivoSala.id.desc()).all()


def _guardar_archivo_de_sala(codigo: str, usuario: Usuario, nombre: str, mime: str, datos: bytes) -> ArchivoSalaOut:
    with SessionLocal() as db:
        sala = _sala_o_404(db, codigo, usuario)
        if len(datos) > config.MAX_ARCHIVO_MB * 1024 * 1024:
            raise HTTPException(413, t("archivo_grande", mb=config.MAX_ARCHIVO_MB))
        if not datos:
            raise HTTPException(400, t("archivo_vacio"))
        cantidad, ocupado = (
            db.query(func.count(ArchivoSala.id), func.coalesce(func.sum(ArchivoSala.tamano), 0))
            .filter_by(sala_id=sala.id)
            .one()
        )
        if cantidad >= MAX_ARCHIVOS_SALA:
            raise HTTPException(400, t("muchos_archivos_sala", maximo=MAX_ARCHIVOS_SALA))
        if ocupado + len(datos) > MAX_MB_SALA * 1024 * 1024:
            raise HTTPException(400, t("sala_llena_de_archivos", mb=MAX_MB_SALA))
        archivo = ArchivoSala(
            sala_id=sala.id,
            usuario_id=usuario.id,
            por=usuario.nombre,
            nombre=nombre,
            mime=mime,
            tamano=len(datos),
            datos=datos,
        )
        db.add(archivo)
        db.commit()
        return ArchivoSalaOut.model_validate(archivo)


@router.post("/{codigo}/archivos", response_model=ArchivoSalaOut, status_code=201)
async def subir_archivo(codigo: str, archivo: UploadFile, usuario: Usuario = Depends(usuario_actual)):
    datos = await archivo.read()
    nombre = (archivo.filename or "archivo")[:255]
    mime = (archivo.content_type or "application/octet-stream")[:120]
    salida = await run_in_threadpool(_guardar_archivo_de_sala, codigo, usuario, nombre, mime, datos)
    await _avisar_a_la_sala(
        codigo,
        {"tipo": "archivos"},
        {"tipo": "evento", "evento": "archivo", "nombre": usuario.nombre, "archivo": nombre},
    )
    return salida


def _archivo_o_404(db: Session, codigo: str, archivo_id: int, usuario: Usuario) -> ArchivoSala:
    sala = _sala_o_404(db, codigo, usuario)
    archivo = db.get(ArchivoSala, archivo_id)
    if archivo is None or archivo.sala_id != sala.id:
        raise HTTPException(404, t("archivo_no_existe"))
    return archivo


@router.get("/{codigo}/archivos/{archivo_id}")
def descargar(codigo: str, archivo_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    archivo = _archivo_o_404(db, codigo, archivo_id, usuario)
    return Response(
        archivo.datos,
        media_type=archivo.mime,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(archivo.nombre)}",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _borrar_archivo(codigo: str, archivo_id: int, usuario: Usuario) -> None:
    with SessionLocal() as db:
        archivo = _archivo_o_404(db, codigo, archivo_id, usuario)
        if usuario.id not in (archivo.usuario_id, archivo.sala.creador_id):
            raise HTTPException(403, t("no_es_tu_archivo"))
        db.delete(archivo)
        db.commit()


def _sala_en_vivo(codigo: str):
    sala = gestor.salas.get(codigo.upper())
    if sala is None:
        raise HTTPException(409, t("entra_a_la_sala"))
    return sala


def _comprobar_sala(codigo: str, usuario: Usuario) -> None:
    with SessionLocal() as db:
        _sala_o_404(db, codigo, usuario)


@router.delete("/{codigo}/archivos/{archivo_id}", status_code=204)
async def borrar_archivo(codigo: str, archivo_id: int, usuario: Usuario = Depends(usuario_actual)):
    await run_in_threadpool(_borrar_archivo, codigo, archivo_id, usuario)
    await _avisar_a_la_sala(codigo, {"tipo": "archivos"})


@router.post(
    "/{codigo}/archivos/{archivo_id}/a-materia", response_model=DocumentoOut | SubidaPendiente, status_code=201
)
def guardar_en_materia(
    codigo: str,
    archivo_id: int,
    datos: AMateriaIn,
    respuesta: Response,
    usuario: Usuario = Depends(usuario_actual),
    db: Session = Depends(get_db),
    leer_imagenes: Callable[[list[bytes]], list[str]] = Depends(get_ocr),
):
    """Copia un archivo de la sala a una materia propia, como apunte (para chatear, resumir, etc.)."""
    archivo = _archivo_o_404(db, codigo, archivo_id, usuario)
    materia = db.get(Materia, datos.materia_id)
    if materia is None or materia.usuario_id != usuario.id:
        raise HTTPException(404, t("materia_no_existe"))
    return subir_apunte(materia, archivo.nombre, archivo.datos, leer_imagenes, respuesta)


# --- Trivia grupal: la arma la IA con los archivos que sube alguien de la sala ---

MAX_ARCHIVOS_TRIVIA = 3
TROZOS_POR_TRIVIA = 12


def _preguntas_de_trivia(
    usuario_id: int,
    tema: str,
    archivos: list[tuple[str, bytes]],
    leer_imagenes: Callable[[list[bytes]], list[str]],
    ia: TutorIA,
    opciones: dict,
) -> list[dict]:
    contexto: list[Contexto] = []
    for nombre, datos in archivos:
        try:
            extraido = extraer(nombre, datos, leer_imagenes)
        except ArchivoInvalido as e:
            raise HTTPException(400, f"{nombre}: {e.texto()}") from e
        total = len(extraido.paginas)
        contexto += [
            Contexto(nombre, ubicacion(extraido.tipo, trozo.pagina, total), trozo.texto)
            for trozo in trocear(extraido.paginas)
        ]
    if not contexto:
        raise HTTPException(400, t("trivia_sin_texto"))
    if tema:
        elegidos = [contexto[i] for i, _ in BM25([c.texto for c in contexto]).buscar(tema, TROZOS_POR_TRIVIA)]
        contexto = elegidos or contexto[:TROZOS_POR_TRIVIA]
    else:
        contexto = random.sample(contexto, min(TROZOS_POR_TRIVIA, len(contexto)))
    with SessionLocal() as db:
        usuario = db.get(Usuario, usuario_id)
        with con_ia(db, usuario, ia):
            preguntas = ia.generar_trivia(
                contexto, opciones["cantidad"], tema or None, opciones["modo"], opciones["dificultad"]
            )
    return [p.model_dump() for p in preguntas]


async def _preparar_trivia(
    sala, usuario_id: int, nombre: str, tema: str, archivos, leer_imagenes, ia, opciones
) -> None:
    try:
        preguntas = await run_in_threadpool(
            _preguntas_de_trivia, usuario_id, tema, archivos, leer_imagenes, ia, opciones
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            texto = str(e.detail)
        elif isinstance(e, ErrorTraducible):
            texto = e.texto()
        else:
            log.exception("No se pudo armar la trivia")
            texto = t("trivia_error")
        sala.preparando_trivia = None
        await sala.a_todos(sala.estado())
        await sala.al_usuario(usuario_id, {"tipo": "aviso", "texto": texto})
        return
    titulo = tema or PurePosixPath(archivos[0][0]).stem[:MAX_TEMA]
    trivia = Trivia(titulo, usuario_id, nombre, preguntas, modo=opciones["modo"], dificultad=opciones["dificultad"])
    trivia.rival, trivia.rival_nombre = opciones["rival"], opciones["rival_nombre"]
    await sala.iniciar_trivia(trivia)


@router.post("/{codigo}/trivia", status_code=202)
async def crear_trivia(
    codigo: str,
    archivos: Annotated[list[UploadFile], File()],
    tema: Annotated[str, Form()] = "",
    modo: Annotated[str, Form()] = "opciones",
    dificultad: Annotated[str, Form()] = "media",
    cantidad: Annotated[int, Form()] = 8,
    rival: Annotated[int | None, Form()] = None,
    usuario: Usuario = Depends(usuario_actual),
    leer_imagenes: Callable[[list[bytes]], list[str]] = Depends(get_ocr),
    ia: TutorIA = Depends(get_ia),
):
    """Arma una trivia para toda la sala. Gasta un uso de IA de quien la crea.
    Contesta enseguida: las preguntas se arman en segundo plano y después llega la invitación."""
    sala = _sala_en_vivo(codigo)
    await run_in_threadpool(_comprobar_sala, codigo, usuario)
    verificar_uso(usuario)
    if not 1 <= len(archivos) <= MAX_ARCHIVOS_TRIVIA:
        raise HTTPException(400, t("trivia_archivos", maximo=MAX_ARCHIVOS_TRIVIA))
    leidos = []
    for archivo in archivos:
        datos = await archivo.read()
        if len(datos) > config.MAX_ARCHIVO_MB * 1024 * 1024:
            raise HTTPException(413, t("archivo_grande", mb=config.MAX_ARCHIVO_MB))
        if datos:
            leidos.append((archivo.filename or "archivo", datos))
    if not leidos:
        raise HTTPException(400, t("archivo_vacio"))
    if not sala.puede_preparar_trivia():
        raise HTTPException(409, t("trivia_en_curso"))
    if modo not in MODOS or dificultad not in DIFICULTADES or cantidad not in CANTIDADES:
        raise HTTPException(400, t("trivia_opciones"))
    rival_nombre = None
    if rival is not None:
        # Duelo: el rival tiene que estar en la sala ahora mismo
        rival_nombre = next((c["nombre"] for c in sala.conectados() if c["id"] == rival and rival != usuario.id), None)
        if rival_nombre is None:
            raise HTTPException(400, t("rival_no_esta"))
    opciones = {
        "modo": modo,
        "dificultad": dificultad,
        "cantidad": cantidad,
        "rival": rival,
        "rival_nombre": rival_nombre,
    }
    tema = " ".join(tema.split())[:MAX_TEMA]
    sala.preparando_trivia = {"usuario_id": usuario.id, "por": usuario.nombre, "tema": tema}
    await sala.a_todos(sala.estado())
    sala.tarea_trivia = asyncio.create_task(
        _preparar_trivia(sala, usuario.id, usuario.nombre, tema, leidos, leer_imagenes, ia, opciones)
    )
