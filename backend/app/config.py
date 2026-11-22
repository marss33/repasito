import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _url_base_de_datos() -> str:
    url = os.getenv("DATABASE_URL", f"sqlite:///{(BASE_DIR / 'repaso.db').as_posix()}").strip()
    # Neon / Render dan URLs "postgres://" o "postgresql://"; SQLAlchemy necesita el driver
    for prefijo in ("postgres://", "postgresql://"):
        if url.startswith(prefijo):
            return "postgresql+psycopg://" + url[len(prefijo) :]
    return url


DATABASE_URL = _url_base_de_datos()

# --- IA: modelos open source en Groq (plan gratis) ---
# Las claves se limpian de espacios o saltos de línea que se cuelan al pegarlas en el panel
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
# Actividad de Discord (opcional): se crea en el Discord Developer Portal
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "").strip()
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "").strip()
# En orden de preferencia: si uno no está disponible o se le agota el cupo, se prueba el siguiente
MODELOS = [
    m.strip()
    for m in os.getenv("REPASO_MODELOS", "openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b").split(",")
    if m.strip()
]
# Usos de IA por usuario por día (el plan gratis se comparte entre todos)
LIMITE_DIARIO = int(os.getenv("REPASO_LIMITE_DIARIO", "40"))
# Caracteres de apunte por pedido a la IA (el plan gratis limita los tokens por minuto)
TEXTO_POR_PEDIDO = int(os.getenv("REPASO_TEXTO_POR_PEDIDO", "14000"))

# --- Lectura de fotos con Tesseract ---
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")  # si no está en el PATH
TESSDATA_DIR = os.getenv("TESSDATA_DIR", "")  # carpeta con los idiomas, si no es la de la instalación
# Páginas escaneadas o fotos que se leen por archivo
MAX_PAGINAS_OCR = int(os.getenv("REPASO_MAX_PAGINAS_OCR", "15"))

MAX_ARCHIVO_MB = int(os.getenv("REPASO_MAX_ARCHIVO_MB", "20"))
MAX_DOCUMENTOS_POR_MATERIA = int(os.getenv("REPASO_MAX_DOCUMENTOS", "50"))
COOKIE_SEGURA = os.getenv("REPASO_COOKIE_SEGURA", "false").lower() == "true"
# En producción la app es solo una actividad de Discord: no se pueden crear cuentas ni entrar desde la web
SOLO_DISCORD = os.getenv("REPASITO_SOLO_DISCORD", "false").lower() == "true"
DIAS_SESION = 30
CORS_ORIGINS = [o.strip() for o in os.getenv("REPASO_CORS", "http://localhost:5173").split(",") if o.strip()]
FRONTEND_DIST = Path(os.getenv("REPASO_FRONTEND", BASE_DIR.parent / "frontend" / "dist"))


def hay_api_key() -> bool:
    return bool(GROQ_API_KEY)
