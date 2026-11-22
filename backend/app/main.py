import logging
import mimetypes
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config, ocr
from .db import Base, SessionLocal, engine
from .ia import ErrorIA
from .idioma import MENSAJES, elegir, idioma_actual, t
from .models import Sesion, Usuario, ahora
from .routers import auth, chat, discord, documentos, flashcards, materias, quiz, rincon, salas

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("repaso")


def limpiar_datos_viejos() -> None:
    """Borra las sesiones vencidas y las cuentas de invitado sin uso hace más de 30 días."""
    limite = ahora() - timedelta(days=config.DIAS_SESION)
    with SessionLocal() as db:
        db.query(Sesion).filter(Sesion.expira < ahora()).delete()
        viejos = db.query(Usuario).filter(Usuario.es_invitado, Usuario.creado < limite).all()
        for usuario in viejos:
            if not any(s.expira > ahora() for s in usuario.sesiones):
                db.delete(usuario)
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    try:
        limpiar_datos_viejos()
    except Exception:
        log.exception("No se pudieron limpiar los datos viejos")
    if not config.hay_api_key():
        log.warning("GROQ_API_KEY no está configurada: las funciones de IA no van a andar")
    if not ocr.disponible():
        log.warning("Tesseract no está instalado: no se van a poder leer fotos ni escaneos")
    yield


MARCOS_PERMITIDOS = " ".join(
    [
        "'self'",
        "https://discord.com",
        "https://*.discord.com",
        "https://discordapp.com",
        "https://*.discordapp.com",
        "https://*.discordsays.com",
    ]
)


class QuitarProxyDeDiscord:
    """Dentro de una actividad de Discord los pedidos pueden llegar como /.proxy/api/...: se atienden
    igual que /api/... (también los WebSocket)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket") and scope["path"].startswith("/.proxy/"):
            scope = dict(scope)
            scope["path"] = scope["path"][len("/.proxy") :]
            scope["raw_path"] = scope["path"].encode()
        await self.app(scope, receive, send)


app = FastAPI(title="Repasito", lifespan=lifespan)
app.add_middleware(QuitarProxyDeDiscord)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def idioma_y_seguridad(request: Request, call_next):
    # El idioma del pedido (selector del frontend o idioma del navegador) para mensajes y respuestas de la IA
    marca = idioma_actual.set(elegir(request.headers.get("x-idioma") or request.headers.get("accept-language")))
    try:
        respuesta = await call_next(request)
    finally:
        idioma_actual.reset(marca)
    respuesta.headers.setdefault("X-Content-Type-Options", "nosniff")
    respuesta.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Nadie puede meter la app dentro de otra página, salvo Discord (la actividad se muestra en un iframe)
    respuesta.headers.setdefault("Content-Security-Policy", f"frame-ancestors {MARCOS_PERMITIDOS}")
    return respuesta


@app.exception_handler(ErrorIA)
async def error_ia(request: Request, exc: ErrorIA):
    return JSONResponse(status_code=502, content={"detail": exc.texto()})


@app.exception_handler(ocr.OCRNoDisponible)
async def ocr_no_disponible(request: Request, exc: ocr.OCRNoDisponible):
    return JSONResponse(status_code=503, content={"detail": exc.texto()})


@app.exception_handler(RequestValidationError)
async def error_validacion(request: Request, exc: RequestValidationError):
    campo = next((str(e["loc"][-1]) for e in exc.errors() if e.get("loc")), "")
    clave = f"validacion_{campo}" if f"validacion_{campo}" in MENSAJES else "validacion_general"
    return JSONResponse(status_code=422, content={"detail": t(clave)})


api = APIRouter(prefix="/api")


@api.get("/estado")
def estado():
    return {
        "ia_configurada": config.hay_api_key(),
        "discord_client_id": config.DISCORD_CLIENT_ID or None,
        "solo_discord": config.SOLO_DISCORD,
        "ocr_disponible": ocr.disponible(),
        "limite_diario": config.LIMITE_DIARIO,
        "max_documentos": config.MAX_DOCUMENTOS_POR_MATERIA,
        "max_archivo_mb": config.MAX_ARCHIVO_MB,
        "max_paginas_escaneadas": config.MAX_PAGINAS_OCR,
    }


for modulo in (auth, materias, documentos, chat, flashcards, quiz, salas, rincon, discord):
    api.include_router(modulo.router)
app.include_router(api)


# Windows no siempre conoce estos tipos y los serviría como "application/octet-stream"
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("application/manifest+json", ".webmanifest")


class Frontend(StaticFiles):
    """Sirve el frontend compilado. Los archivos de /assets y /fonts llevan un hash en el nombre,
    así que se pueden cachear para siempre; index.html nunca, para que siempre llegue la última versión."""

    async def get_response(self, path, scope):
        respuesta = await super().get_response(path, scope)
        if path.replace("\\", "/").startswith(("assets/", "fonts/")):  # en Windows la ruta viene con "\"
            respuesta.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            respuesta.headers["Cache-Control"] = "no-cache"
        return respuesta


if config.FRONTEND_DIST.exists():
    app.mount("/", Frontend(directory=config.FRONTEND_DIST, html=True), name="frontend")
