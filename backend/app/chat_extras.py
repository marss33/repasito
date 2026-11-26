"""Reacciones con emojis y encuestas del chat de la sala, guardadas en la base."""

from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import EncuestaSala, MensajeSala, ReaccionSala, Sala

EMOJIS = ("👍", "❤️", "😂", "😮", "🎉", "🔥")
MAX_PREGUNTA = 200
MAX_OPCION = 80
OPCIONES = (2, 4)  # mínimo y máximo


def _mensaje_de_la_sala(db: Session, codigo: str, mensaje_id: object) -> MensajeSala | None:
    if not isinstance(mensaje_id, int):
        return None
    mensaje = db.get(MensajeSala, mensaje_id)
    if mensaje is None:
        return None
    sala = db.get(Sala, mensaje.sala_id)
    return mensaje if sala and sala.codigo == codigo else None


def reacciones_de(db: Session, mensaje_ids: list[int]) -> dict[int, dict[str, list[int]]]:
    """{id de mensaje: {emoji: [ids de quienes reaccionaron]}}"""
    salida: dict[int, dict[str, list[int]]] = {}
    if not mensaje_ids:
        return salida
    filas = db.query(ReaccionSala).filter(ReaccionSala.mensaje_id.in_(mensaje_ids)).order_by(ReaccionSala.id)
    for r in filas:
        salida.setdefault(r.mensaje_id, {}).setdefault(r.emoji, []).append(r.usuario_id)
    return salida


def _vista_encuesta(encuesta: EncuestaSala) -> dict:
    votos: list[list[int]] = [[] for _ in encuesta.opciones]
    for usuario, opcion in (encuesta.votos or {}).items():
        if 0 <= opcion < len(votos):
            votos[opcion].append(int(usuario))
    return {"opciones": encuesta.opciones, "votos": votos}


def encuestas_de(db: Session, mensaje_ids: list[int]) -> dict[int, dict]:
    if not mensaje_ids:
        return {}
    filas = db.query(EncuestaSala).filter(EncuestaSala.mensaje_id.in_(mensaje_ids))
    return {e.mensaje_id: _vista_encuesta(e) for e in filas}


def reaccionar(codigo: str, usuario_id: int, mensaje_id: object, emoji: object) -> dict | None:
    """Pone o saca una reacción. Devuelve lo que hay que mandarle a toda la sala."""
    if emoji not in EMOJIS:
        return None
    with SessionLocal() as db:
        mensaje = _mensaje_de_la_sala(db, codigo, mensaje_id)
        if mensaje is None:
            return None
        existente = db.query(ReaccionSala).filter_by(mensaje_id=mensaje.id, usuario_id=usuario_id, emoji=emoji).first()
        if existente:
            db.delete(existente)
        else:
            db.add(ReaccionSala(mensaje_id=mensaje.id, usuario_id=usuario_id, emoji=emoji))
        db.commit()
        reacciones = reacciones_de(db, [mensaje.id]).get(mensaje.id, {})
        return {"tipo": "reacciones", "mensaje_id": mensaje.id, "reacciones": reacciones}


def crear_encuesta(codigo: str, usuario_id: int, nombre: str, pregunta: object, opciones: object) -> dict | None:
    """Crea una encuesta como mensaje del chat. Devuelve el mensaje para mandarle a la sala."""
    if not isinstance(pregunta, str) or not isinstance(opciones, list):
        return None
    pregunta = " ".join(pregunta.split())[:MAX_PREGUNTA]
    limpias = [" ".join(str(o).split())[:MAX_OPCION] for o in opciones if isinstance(o, str) and o.strip()]
    if not pregunta or not OPCIONES[0] <= len(limpias) <= OPCIONES[1]:
        return None
    with SessionLocal() as db:
        sala = db.query(Sala).filter_by(codigo=codigo).one()
        mensaje = MensajeSala(sala=sala, usuario_id=usuario_id, nombre=nombre, texto=pregunta)
        db.add(mensaje)
        db.flush()
        encuesta = EncuestaSala(mensaje_id=mensaje.id, opciones=limpias, votos={})
        db.add(encuesta)
        db.commit()
        return {
            "tipo": "chat",
            "mensaje": {
                "id": mensaje.id,
                "usuario_id": usuario_id,
                "nombre": nombre,
                "texto": pregunta,
                "creado": mensaje.creado.isoformat(),
                "reacciones": {},
                "encuesta": _vista_encuesta(encuesta),
            },
        }


def votar(codigo: str, usuario_id: int, mensaje_id: object, opcion: object) -> dict | None:
    """Vota (o cambia el voto; votar lo mismo otra vez lo saca)."""
    if not isinstance(opcion, int):
        return None
    with SessionLocal() as db:
        mensaje = _mensaje_de_la_sala(db, codigo, mensaje_id)
        encuesta = db.query(EncuestaSala).filter_by(mensaje_id=mensaje.id).first() if mensaje else None
        if encuesta is None or not 0 <= opcion < len(encuesta.opciones):
            return None
        votos = dict(encuesta.votos or {})
        if votos.get(str(usuario_id)) == opcion:
            votos.pop(str(usuario_id))
        else:
            votos[str(usuario_id)] = opcion
        encuesta.votos = votos  # se reasigna para que se guarde el cambio
        db.commit()
        return {"tipo": "encuesta", "mensaje_id": mensaje.id, "encuesta": _vista_encuesta(encuesta)}
