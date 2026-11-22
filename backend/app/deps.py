import hashlib
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import date

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from . import config, ocr
from .db import get_db
from .ia import TutorIA
from .idioma import idioma_actual, t
from .models import Documento, Flashcard, Materia, Sesion, Usuario, ahora

COOKIE_SESION = "repaso_sesion"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_ia() -> TutorIA:
    return TutorIA(idioma=idioma_actual.get())


def get_ocr() -> Callable[[list[bytes]], list[str]]:
    """Lector de texto de imágenes (Tesseract). Se puede reemplazar en los tests."""
    return ocr.leer


def buscar_usuario(db: Session, token: str | None) -> Usuario | None:
    """El usuario dueño de un token de sesión (de la cookie), si la sesión sigue vigente."""
    sesion = db.query(Sesion).filter_by(token_hash=hash_token(token)).first() if token else None
    if sesion is None or sesion.expira < ahora():
        return None
    return sesion.usuario


def token_del_pedido(request: Request) -> str | None:
    """La sesión viaja en la cookie o, dentro de Discord (donde el navegador puede bloquear las cookies
    de un iframe), en el header "Authorization: Bearer <token>" o en "?token=" (imágenes y descargas)."""
    autorizacion = request.headers.get("authorization", "")
    if autorizacion.lower().startswith("bearer "):
        return autorizacion[7:].strip() or None
    # Imágenes y descargas dentro de Discord: el navegador no puede mandar headers en un <img>
    return request.cookies.get(COOKIE_SESION) or request.query_params.get("token")


def usuario_opcional(request: Request, db: Session = Depends(get_db)) -> Usuario | None:
    return buscar_usuario(db, token_del_pedido(request))


def usuario_actual(usuario: Usuario | None = Depends(usuario_opcional)) -> Usuario:
    if usuario is None:
        raise HTTPException(401, t("sesion_requerida"))
    return usuario


# --- Límite diario de IA ---


def usos_de_hoy(usuario: Usuario) -> int:
    return usuario.uso_cantidad if usuario.uso_fecha == date.today() else 0


def verificar_uso(usuario: Usuario) -> None:
    if usos_de_hoy(usuario) >= config.LIMITE_DIARIO:
        raise HTTPException(429, t("limite_diario", limite=config.LIMITE_DIARIO))


def sumar_uso(db: Session, usuario: Usuario, cantidad: int) -> None:
    if cantidad <= 0:
        return
    usuario.uso_cantidad = usos_de_hoy(usuario) + cantidad
    usuario.uso_fecha = date.today()
    db.commit()


@contextmanager
def con_ia(db: Session, usuario: Usuario, ia: TutorIA) -> Iterator[TutorIA]:
    """Controla el límite antes de usar la IA y descuenta un uso, aunque haya fallado.
    Cada acción (una pregunta, un resumen, un quiz) cuenta como un uso, aunque internamente
    haga varios pedidos (por ejemplo, al resumir un documento largo por partes)."""
    verificar_uso(usuario)
    antes = ia.llamadas
    try:
        yield ia
    finally:
        sumar_uso(db, usuario, 1 if ia.llamadas > antes else 0)


# --- Recursos del usuario (si no es suyo, para él no existe) ---


def materia_o_404(
    materia_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)
) -> Materia:
    materia = db.get(Materia, materia_id)
    if materia is None or materia.usuario_id != usuario.id:
        raise HTTPException(404, t("materia_no_existe"))
    return materia


def documento_o_404(
    documento_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)
) -> Documento:
    documento = db.get(Documento, documento_id)
    if documento is None or documento.materia.usuario_id != usuario.id:
        raise HTTPException(404, t("documento_no_existe"))
    return documento


def flashcard_o_404(
    flashcard_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)
) -> Flashcard:
    tarjeta = db.get(Flashcard, flashcard_id)
    if tarjeta is None or tarjeta.materia.usuario_id != usuario.id:
        raise HTTPException(404, t("flashcard_no_existe"))
    return tarjeta
