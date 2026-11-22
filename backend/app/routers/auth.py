import base64
import hashlib
import secrets
from datetime import timedelta

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..deps import COOKIE_SESION, hash_token, usos_de_hoy, usuario_actual, usuario_opcional
from ..ejemplo import crear_materia_de_ejemplo
from ..idioma import idioma_actual, t
from ..limites import cuentas_de_invitado, intentos_de_login
from ..models import Sesion, Usuario, ahora
from ..rincon import MONEDAS_DE_BIENVENIDA
from ..schemas import LoginIn, PerfilIn, RegistroIn, UsuarioOut

router = APIRouter(prefix="/auth", tags=["auth"])


def solo_desde_discord() -> None:
    """Con la app en modo "solo Discord", desde la web no se pueden crear cuentas ni entrar."""
    if config.SOLO_DISCORD:
        raise HTTPException(403, t("solo_discord"))


ENTRADA_WEB = [Depends(solo_desde_discord)]


def _preparar(password: str) -> bytes:
    # bcrypt solo usa los primeros 72 bytes: se pasa primero por SHA-256 para no perder nada
    return base64.b64encode(hashlib.sha256(password.encode()).digest())


def hashear(password: str) -> str:
    return bcrypt.hashpw(_preparar(password), bcrypt.gensalt()).decode()


def verificar(password: str, hash_guardado: str) -> bool:
    return bcrypt.checkpw(_preparar(password), hash_guardado.encode())


# Para que un email inexistente tarde lo mismo que una contraseña incorrecta
_HASH_FALSO = hashear(secrets.token_hex(8))


def _ip(request: Request) -> str:
    return request.client.host if request.client else "desconocida"


def a_salida(usuario: Usuario) -> UsuarioOut:
    return UsuarioOut(
        id=usuario.id,
        nombre=usuario.nombre,
        email="" if usuario.es_invitado or usuario.email.endswith("@discord.local") else usuario.email,
        es_invitado=usuario.es_invitado,
        usos_hoy=usos_de_hoy(usuario),
        limite_diario=config.LIMITE_DIARIO,
        monedas=usuario.rincon.monedas if usuario.rincon else MONEDAS_DE_BIENVENIDA,
        foto=usuario.rincon.foto_version if usuario.rincon and usuario.rincon.foto else 0,
    )


def iniciar_sesion(db: Session, usuario: Usuario, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    db.add(Sesion(usuario=usuario, token_hash=hash_token(token), expira=ahora() + timedelta(days=config.DIAS_SESION)))
    db.commit()
    response.set_cookie(
        COOKIE_SESION,
        token,
        max_age=config.DIAS_SESION * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=config.COOKIE_SEGURA,
    )


def _email_libre(db: Session, email: str) -> str:
    email = email.lower()
    if db.query(Usuario).filter_by(email=email).first():
        raise HTTPException(409, t("email_en_uso"))
    return email


@router.post("/registro", response_model=UsuarioOut, status_code=201, dependencies=ENTRADA_WEB)
def registrarse(datos: RegistroIn, response: Response, db: Session = Depends(get_db)):
    usuario = Usuario(
        email=_email_libre(db, datos.email), nombre=datos.nombre.strip(), password_hash=hashear(datos.password)
    )
    db.add(usuario)
    crear_materia_de_ejemplo(db, usuario, idioma_actual.get())
    db.commit()
    iniciar_sesion(db, usuario, response)
    return a_salida(usuario)


@router.post("/invitado", response_model=UsuarioOut, status_code=201, dependencies=ENTRADA_WEB)
def entrar_como_invitado(request: Request, response: Response, db: Session = Depends(get_db)):
    if not cuentas_de_invitado.permitir(_ip(request)):
        raise HTTPException(429, t("muchos_invitados"))
    usuario = Usuario(
        email=f"invitado-{secrets.token_hex(8)}@invitado.local",
        # Con número, para distinguir a varios invitados en una misma sala
        nombre=f"{'Guest' if idioma_actual.get() == 'en' else 'Invitado'} {secrets.randbelow(900) + 100}",
        password_hash=hashear(secrets.token_urlsafe(24)),
        es_invitado=True,
    )
    db.add(usuario)
    crear_materia_de_ejemplo(db, usuario, idioma_actual.get())
    db.commit()
    iniciar_sesion(db, usuario, response)
    return a_salida(usuario)


@router.post("/convertir", response_model=UsuarioOut, dependencies=ENTRADA_WEB)
def guardar_cuenta_de_invitado(
    datos: RegistroIn, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)
):
    """Un invitado pasa a tener cuenta propia sin perder lo que ya cargó."""
    if not usuario.es_invitado:
        raise HTTPException(400, t("ya_registrada"))
    usuario.email = _email_libre(db, datos.email)
    usuario.nombre = datos.nombre.strip()
    usuario.password_hash = hashear(datos.password)
    usuario.es_invitado = False
    db.commit()
    return a_salida(usuario)


@router.post("/login", response_model=UsuarioOut, dependencies=ENTRADA_WEB)
def entrar(datos: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = datos.email.lower()
    if not intentos_de_login.permitir(f"{_ip(request)}|{email}"):
        raise HTTPException(429, t("muchos_intentos"))
    usuario = db.query(Usuario).filter_by(email=email, es_invitado=False).first()
    if not verificar(datos.password, usuario.password_hash if usuario else _HASH_FALSO) or usuario is None:
        raise HTTPException(401, t("login_incorrecto"))
    iniciar_sesion(db, usuario, response)
    return a_salida(usuario)


@router.post("/logout", status_code=204)
def salir(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE_SESION)
    if token:
        db.query(Sesion).filter_by(token_hash=hash_token(token)).delete()
        db.commit()
    response.delete_cookie(COOKIE_SESION)


@router.put("/perfil", response_model=UsuarioOut)
def editar_perfil(datos: PerfilIn, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    usuario.nombre = datos.nombre.strip()
    db.commit()
    return a_salida(usuario)


@router.get("/yo", response_model=UsuarioOut | None)
def yo(usuario: Usuario | None = Depends(usuario_opcional)):
    """El usuario con sesión iniciada, o null si no hay (no es un error: es la pantalla de login)."""
    return a_salida(usuario) if usuario else None
