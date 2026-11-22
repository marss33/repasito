"""Prueba Tesseract de verdad. Se saltea si no está instalado (en el CI y en Docker sí está)."""

from io import BytesIO

import pytest
from PIL import Image, ImageDraw, ImageFont

from app import ocr
from app.extraccion import extraer

pytestmark = pytest.mark.skipif(not ocr.disponible(), reason="Tesseract no está instalado")


def imagen_con_texto(lineas: list[str]) -> bytes:
    imagen = Image.new("RGB", (1600, 140 * len(lineas) + 100), "white")
    dibujo = ImageDraw.Draw(imagen)
    fuente = ImageFont.load_default(size=64)
    for i, linea in enumerate(lineas):
        dibujo.text((60, 60 + i * 140), linea, fill="black", font=fuente)
    salida = BytesIO()
    imagen.save(salida, format="PNG")
    return salida.getvalue()


def test_lee_una_foto_de_texto_impreso():
    resultado = extraer("foto.png", imagen_con_texto(["La mitosis produce", "dos celulas hijas"]), ocr.leer)
    texto = resultado.paginas[0].lower()
    assert "mitosis" in texto
    assert "celulas" in texto or "células" in texto
