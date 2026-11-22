"""Lectura de texto en fotos y escaneos con Tesseract (open source, corre en el mismo servidor).
Lee español e inglés."""

import os
import shutil
from io import BytesIO

import pytesseract
from PIL import Image, ImageOps

from . import config
from .idioma import ErrorTraducible


class OCRNoDisponible(ErrorTraducible):
    pass


_RUTAS_WINDOWS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
]
_idiomas: str | None = None


def _preparar() -> str:
    """Encuentra Tesseract y devuelve los idiomas a usar (español e inglés si están)."""
    global _idiomas
    if _idiomas is not None:
        return _idiomas
    comando = (
        config.TESSERACT_CMD
        or shutil.which("tesseract")
        or next((r for r in _RUTAS_WINDOWS if os.path.exists(r)), None)
    )
    if not comando:
        raise OCRNoDisponible("ocr_no_disponible")
    pytesseract.pytesseract.tesseract_cmd = comando
    if config.TESSDATA_DIR:
        # Carpeta con los idiomas, si no es la de la instalación (Tesseract la lee de esta variable)
        os.environ["TESSDATA_PREFIX"] = config.TESSDATA_DIR
    try:
        instalados = set(pytesseract.get_languages())
    except Exception as e:
        raise OCRNoDisponible("ocr_no_disponible") from e
    _idiomas = "+".join(i for i in ("spa", "eng") if i in instalados) or "eng"
    return _idiomas


def disponible() -> bool:
    try:
        _preparar()
        return True
    except OCRNoDisponible:
        return False


def leer(imagenes: list[bytes]) -> list[str]:
    """Devuelve el texto de cada imagen (JPEG), en el mismo orden."""
    idiomas = _preparar()
    textos = []
    for datos in imagenes:
        with Image.open(BytesIO(datos)) as imagen:
            # Grises y más contraste: Tesseract lee mejor fotos con sombras o papel amarillento
            limpia = ImageOps.autocontrast(ImageOps.grayscale(imagen), cutoff=1)
            texto = pytesseract.image_to_string(limpia, lang=idiomas, config="--psm 3", timeout=90)
        textos.append(texto)
    return textos
