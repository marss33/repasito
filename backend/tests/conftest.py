import os
import tempfile
from pathlib import Path

# Por defecto un SQLite en un archivo temporal (no en memoria: ahí todos los hilos comparten una
# sola conexión y las tareas en segundo plano se pisan); TEST_DATABASE_URL permite usar Postgres
_BASE_DE_PRUEBA = Path(tempfile.mkdtemp(prefix="repasito-tests-")) / "pruebas.db"
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_BASE_DE_PRUEBA.as_posix()}")
os.environ["GROQ_API_KEY"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.deps import get_ia, get_ocr  # noqa: E402
from app.ia import Concepto, Pregunta, Respuesta, Tarjeta  # noqa: E402
from app.limites import reiniciar_todos  # noqa: E402
from app.main import app  # noqa: E402


class IAFalsa:
    """Reemplaza a la IA en los tests: no hace llamadas reales."""

    def __init__(self):
        self.llamadas = 0
        self.ultimo_contexto = []

    def responder(self, pregunta, contexto, historial):
        self.llamadas += 1
        self.ultimo_contexto = contexto
        fuentes = [
            {"n": 1, "documento": c.documento, "ubicacion": c.ubicacion, "cita": c.texto[:30]} for c in contexto[:1]
        ]
        return Respuesta(texto=f"Respuesta a: {pregunta} [1]", fuentes=fuentes)

    def responder_en_vivo(self, pregunta, contexto, historial):
        self.llamadas += 1
        self.ultimo_contexto = contexto
        yield "Según tus apuntes, "
        yield f"la respuesta a «{pregunta}» está acá [1]."

    def resumir(self, nombre, texto):
        self.llamadas += 1
        return f"# Resumen de {nombre}"

    def generar_flashcards(self, nombre, texto, cantidad):
        self.llamadas += 1
        return [Tarjeta(frente=f"Pregunta {i}", dorso=f"Respuesta {i}") for i in range(cantidad)]

    def generar_conceptos(self, contexto, cantidad):
        self.llamadas += 1
        palabras = ["mitocondria", "ribosoma", "nucleo", "membrana", "citoplasma", "cloroplasto"]
        return [Concepto(termino=p, pista=f"pista de {p}") for p in palabras[:cantidad]]

    def generar_trivia(self, contexto, cantidad, tema, modo, dificultad):
        self.llamadas += 1
        self.ultima_trivia = (cantidad, modo, dificultad)
        opciones = ["Verdadero", "Falso"] if modo == "vf" else ["a", "b", "c", "d"]
        return [
            Pregunta(enunciado=f"P{i}", opciones=opciones, correcta=0, explicacion="porque sí") for i in range(cantidad)
        ]

    def generar_quiz(self, contexto, cantidad, tema):
        self.llamadas += 1
        return [
            Pregunta(enunciado=f"P{i}", opciones=["a", "b", "c", "d"], correcta=0, explicacion="porque sí")
            for i in range(cantidad)
        ]


class OCRFalso:
    """Reemplaza a Tesseract en los tests."""

    def __init__(self):
        self.imagenes = 0

    def __call__(self, imagenes):
        self.imagenes += len(imagenes)
        return [f"Texto de la foto {i}: la fotosintesis ocurre en los cloroplastos" for i in range(len(imagenes))]


@pytest.fixture
def ia():
    return IAFalsa()


@pytest.fixture
def ocr_falso():
    return OCRFalso()


@pytest.fixture
def anonimo(ia, ocr_falso):
    """Cliente sin sesión iniciada."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    reiniciar_todos()
    app.dependency_overrides[get_ia] = lambda: ia
    app.dependency_overrides[get_ocr] = lambda: ocr_falso
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def registrar(cliente, email="ana@mail.com", nombre="Ana"):
    r = cliente.post("/api/auth/registro", json={"nombre": nombre, "email": email, "password": "clave-segura"})
    assert r.status_code == 201, r.text
    return r


@pytest.fixture
def cliente(anonimo):
    """Cliente con un usuario registrado y logueado."""
    registrar(anonimo)
    return anonimo


def crear_pdf(paginas: list[str]) -> bytes:
    """Arma un PDF mínimo válido con una línea de texto por página (solo ASCII)."""
    n = len(paginas)
    ids_paginas = [4 + 2 * i for i in range(n)]
    objetos = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{' '.join(f'{p} 0 R' for p in ids_paginas)}] /Count {n} >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for i, texto in enumerate(paginas):
        escapado = texto.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        contenido = f"BT /F1 12 Tf 72 720 Td ({escapado}) Tj ET" if texto else ""
        objetos.append(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {ids_paginas[i] + 1} 0 R >>"
        )
        objetos.append(f"<< /Length {len(contenido)} >>\nstream\n{contenido}\nendstream")

    salida = b"%PDF-1.4\n"
    posiciones = []
    for numero, objeto in enumerate(objetos, start=1):
        posiciones.append(len(salida))
        salida += f"{numero} 0 obj\n{objeto}\nendobj\n".encode("latin-1")
    xref = len(salida)
    salida += f"xref\n0 {len(objetos) + 1}\n0000000000 65535 f \n".encode()
    for pos in posiciones:
        salida += f"{pos:010d} 00000 n \n".encode()
    salida += f"trailer\n<< /Size {len(objetos) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return salida
