"""Actividad de Discord: la app abierta dentro de un canal de voz o de texto.

El SDK de Discord le da al navegador un código; acá se cambia por un token de Discord (con el secreto
de la aplicación, que nunca sale del servidor), se averigua quién es y se le abre una sesión en Repaso.
Todos los que abren la misma actividad (mismo "instance_id") entran a la misma sala."""

import secrets
from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..deps import hash_token, usuario_actual
from ..ejemplo import crear_materia_de_ejemplo
from ..idioma import idioma_actual, t
from ..models import CuentaDiscord, Sala, SalaDiscord, Sesion, Usuario, ahora
from ..salas import generar_codigo
from ..schemas import SalaOut, UsuarioOut
from .auth import a_salida, hashear
from .salas import _a_salida, _registrar_visita

router = APIRouter(prefix="/discord", tags=["discord"])

API = "https://discord.com/api/v10"


class CodigoIn(BaseModel):
    code: str = Field(min_length=1, max_length=200)


class InstanciaIn(BaseModel):
    instancia: str = Field(min_length=1, max_length=64)
    nombre: str | None = Field(default=None, max_length=80)


class SesionDiscordOut(BaseModel):
    access_token: str  # el de Discord, para que el SDK termine de autenticarse
    sesion: str  # el de Repaso, para los pedidos a la API y la sala en vivo
    usuario: UsuarioOut


def intercambiar_codigo(code: str) -> tuple[str, dict]:
    """Cambia el código del SDK por un token de Discord y devuelve (token, datos del usuario)."""
    try:
        with httpx.Client(timeout=10) as cliente:
            r = cliente.post(
                f"{API}/oauth2/token",
                data={
                    "client_id": config.DISCORD_CLIENT_ID,
                    "client_secret": config.DISCORD_CLIENT_SECRET,
                    "grant_type": "authorization_code",
                    "code": code,
                },
            )
            if r.status_code != 200:
                raise HTTPException(401, t("discord_fallo"))
            token = r.json()["access_token"]
            yo = cliente.get(f"{API}/users/@me", headers={"Authorization": f"Bearer {token}"})
            if yo.status_code != 200:
                raise HTTPException(401, t("discord_fallo"))
            return token, yo.json()
    except httpx.HTTPError:
        raise HTTPException(502, t("discord_fallo")) from None


@router.post("/token", response_model=SesionDiscordOut)
def token(datos: CodigoIn, db: Session = Depends(get_db)):
    if not (config.DISCORD_CLIENT_ID and config.DISCORD_CLIENT_SECRET):
        raise HTTPException(503, t("discord_no_configurado"))
    access_token, perfil = intercambiar_codigo(datos.code)
    discord_id = str(perfil["id"])
    nombre = (perfil.get("global_name") or perfil.get("username") or "Discord")[:80]

    cuenta = db.get(CuentaDiscord, discord_id)
    if cuenta is None:
        usuario = Usuario(
            email=f"discord-{discord_id}@discord.local",
            nombre=nombre,
            password_hash=hashear(secrets.token_urlsafe(24)),
            es_invitado=False,
        )
        db.add(usuario)
        db.flush()
        db.add(CuentaDiscord(discord_id=discord_id, usuario_id=usuario.id))
        crear_materia_de_ejemplo(db, usuario, idioma_actual.get())
    else:
        usuario = db.get(Usuario, cuenta.usuario_id)

    sesion = secrets.token_urlsafe(32)
    db.add(Sesion(usuario=usuario, token_hash=hash_token(sesion), expira=ahora() + timedelta(days=config.DIAS_SESION)))
    db.commit()
    return SesionDiscordOut(access_token=access_token, sesion=sesion, usuario=a_salida(usuario))


@router.post("/sala", response_model=SalaOut)
def sala_de_la_actividad(datos: InstanciaIn, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    """La sala de esta actividad de Discord: la crea el primero que entra y los demás se suman."""
    vinculo = db.get(SalaDiscord, datos.instancia)
    if vinculo is None:
        codigo = generar_codigo()
        while db.query(Sala).filter_by(codigo=codigo).first():
            codigo = generar_codigo()
        sala = Sala(codigo=codigo, nombre=(datos.nombre or "Discord").strip()[:80] or "Discord", creador_id=usuario.id)
        db.add(sala)
        db.flush()
        db.add(SalaDiscord(instancia=datos.instancia, sala_id=sala.id))
        _registrar_visita(db, sala, usuario)
    else:
        sala = db.get(Sala, vinculo.sala_id)
    return _a_salida(sala)
