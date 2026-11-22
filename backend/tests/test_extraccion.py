import zipfile
from io import BytesIO

import pytest
from PIL import Image

from app.extraccion import ArchivoInvalido, extraer, partir, trocear, ubicacion, unir_paginas

from .conftest import crear_pdf


class Transcriptor:
    def __init__(self):
        self.imagenes = []

    def __call__(self, imagenes):
        self.imagenes.extend(imagenes)
        return [f"texto de imagen {i}" for i in range(len(imagenes))]


def sin_ia(imagenes):
    raise AssertionError("no debería usar la IA para este formato")


def test_pdf_con_texto_no_usa_ia():
    r = extraer("a.pdf", crear_pdf(["Primera pagina", "Segunda pagina"]), sin_ia)
    assert r.tipo == "pdf"
    assert r.paginas == ["Primera pagina", "Segunda pagina"]


def test_pdf_escaneado_usa_ia_solo_en_paginas_sin_texto():
    ocr = Transcriptor()
    r = extraer("a.pdf", crear_pdf(["Pagina con texto de verdad, bastante larga", ""]), ocr)
    assert len(ocr.imagenes) == 1
    assert r.paginas == ["Pagina con texto de verdad, bastante larga", "texto de imagen 0"]


def test_word():
    from docx import Document

    doc = Document()
    doc.add_heading("Mitosis", level=1)
    doc.add_paragraph("Es la division celular.")
    tabla = doc.add_table(rows=1, cols=2)
    tabla.rows[0].cells[0].text = "Fase"
    tabla.rows[0].cells[1].text = "Profase"
    archivo = BytesIO()
    doc.save(archivo)

    r = extraer("apunte.docx", archivo.getvalue(), sin_ia)
    assert r.tipo == "word"
    assert "Mitosis\nEs la division celular." in r.paginas[0]
    assert "Fase | Profase" in r.paginas[0]


def test_powerpoint_una_pagina_por_diapositiva_con_notas():
    from pptx import Presentation

    pres = Presentation()
    for titulo in ("La celula", "Mitocondrias"):
        diapo = pres.slides.add_slide(pres.slide_layouts[1])
        diapo.shapes.title.text = titulo
    pres.slides[1].notes_slide.notes_text_frame.text = "Producen ATP"
    archivo = BytesIO()
    pres.save(archivo)

    r = extraer("clase.pptx", archivo.getvalue(), sin_ia)
    assert r.tipo == "presentacion"
    assert r.paginas == ["La celula", "Mitocondrias\nNotas: Producen ATP"]


def test_excel_una_pagina_por_hoja():
    from openpyxl import Workbook

    libro = Workbook()
    libro.active.title = "Notas"
    libro.active.append(["Alumno", "Nota"])
    libro.active.append(["Ana", 9])
    libro.create_sheet("Vacia")
    archivo = BytesIO()
    libro.save(archivo)

    r = extraer("notas.xlsx", archivo.getvalue(), sin_ia)
    assert r.tipo == "planilla"
    assert r.paginas == ["Hoja «Notas»\nAlumno | Nota\nAna | 9", ""]


def test_opendocument():
    contenido = (
        '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>'
        "<text:h>Titulo</text:h><text:p>Hola <text:span>mundo</text:span></text:p>"
        "</office:text></office:body></office:document-content>"
    )
    archivo = BytesIO()
    with zipfile.ZipFile(archivo, "w") as z:
        z.writestr("content.xml", contenido)
    r = extraer("apunte.odt", archivo.getvalue(), sin_ia)
    assert r.paginas == ["Titulo\nHola mundo"]


def test_texto_html_y_rtf():
    assert extraer("a.txt", b"Hola\r\n\r\nmundo", sin_ia).paginas == ["Hola\n\nmundo"]
    assert extraer("a.txt", "Año".encode("cp1252"), sin_ia).paginas == ["Año"]
    html = b"<html><style>x{}</style><body><h1>Tema</h1><p>Texto</p><script>no()</script></body></html>"
    assert extraer("a.html", html, sin_ia).paginas == ["Tema\nTexto"]
    assert extraer("a.rtf", rb"{\rtf1\ansi Hola {\b mundo}}", sin_ia).paginas == ["Hola mundo"]


def test_foto_se_lee_con_ocr_y_se_achica():
    imagen = BytesIO()
    Image.new("RGB", (4000, 3000), "white").save(imagen, format="PNG")
    ocr = Transcriptor()

    r = extraer("foto.png", imagen.getvalue(), ocr)
    assert r.tipo == "imagen"
    assert r.paginas == ["texto de imagen 0"]
    with Image.open(BytesIO(ocr.imagenes[0])) as enviada:
        assert enviada.format == "JPEG"
        assert max(enviada.size) == 2500


def test_imagen_sin_extension_se_detecta():
    imagen = BytesIO()
    Image.new("RGB", (10, 10)).save(imagen, format="JPEG")
    assert extraer("WhatsApp Image", imagen.getvalue(), Transcriptor()).tipo == "imagen"


def test_formatos_viejos_y_desconocidos():
    with pytest.raises(ArchivoInvalido, match=r"\.docx"):
        extraer("viejo.doc", b"algo", sin_ia)
    with pytest.raises(ArchivoInvalido, match="no está soportado"):
        extraer("programa.exe", b"MZ\x00\x00\x01", sin_ia)
    with pytest.raises(ArchivoInvalido, match="dañado"):
        extraer("roto.pdf", b"esto no es un pdf", sin_ia)


def test_errores_de_la_ia_pasan_tal_cual():
    class Explota(Exception):
        pass

    def falla(imagenes):
        raise Explota()

    imagen = BytesIO()
    Image.new("RGB", (10, 10)).save(imagen, format="PNG")
    with pytest.raises(Explota):
        extraer("foto.png", imagen.getvalue(), falla)


def test_partir_respeta_parrafos():
    texto = "\n\n".join(["a" * 100] * 10)
    partes = partir(texto, tamano=350)
    assert all(len(p) <= 350 for p in partes)
    assert "".join(partes).count("a") == 1000


def test_trocear_respeta_tamano_y_paginas():
    texto = " ".join(f"palabra{i}" for i in range(400))
    trozos = trocear([texto, "corta"], tamano=300, solape=50)
    assert all(len(t.texto) <= 300 for t in trozos)
    assert trozos[-1].pagina == 2
    assert trozos[-1].texto == "corta"
    assert trozos[1].texto.split()[0] in trozos[0].texto  # solape
    palabras = {p for t in trozos[:-1] for p in t.texto.split()}
    assert palabras <= set(texto.split())  # no se cortan palabras


def test_ubicacion():
    assert ubicacion("pdf", 3, 10) == "pág. 3"
    assert ubicacion("pdf", 1, 1) == "pág. 1"
    assert ubicacion("presentacion", 2, 5) == "diap. 2"
    assert ubicacion("word", 1, 1) == ""
    assert ubicacion("imagen", 1, 1) == ""
    assert ubicacion("pdf", 3, 10, "en") == "p. 3"
    assert ubicacion("presentacion", 2, 5, "en") == "slide 2"
    assert unir_paginas("pdf", ["a", "", "c"]) == "[pág. 1]\na\n\n[pág. 3]\nc"
