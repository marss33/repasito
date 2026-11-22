"""Saca el texto de casi cualquier archivo: PDF (también escaneados), Word, PowerPoint,
Excel, OpenDocument, RTF, HTML, texto plano, imágenes y fotos.

Las imágenes y las páginas escaneadas se pasan a texto con OCR (`transcribir`)."""

import re
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from html.parser import HTMLParser
from io import BytesIO
from pathlib import PurePath
from xml.etree import ElementTree

import pypdfium2 as pdfium
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from pypdf import PdfReader

from . import config
from .idioma import ErrorTraducible, idioma_actual

register_heif_opener()  # fotos .heic de iPhone

# Recibe imágenes JPEG y devuelve el texto de cada una, en el mismo orden
Transcriptor = Callable[[list[bytes]], list[str]]


class ArchivoInvalido(ErrorTraducible):
    pass


class _FalloAlTranscribir(Exception):
    def __init__(self, original: Exception):
        self.original = original


@dataclass
class Extraido:
    tipo: str  # pdf, word, presentacion, planilla, texto, imagen
    paginas: list[str]  # una entrada por página, diapositiva, hoja o parte


@dataclass
class Trozo:
    pagina: int
    texto: str


EXT_IMAGEN = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".heif"}
EXT_TEXTO = {
    ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".tex", ".log", ".xml", ".yaml", ".yml",
    ".py", ".c", ".h", ".cpp", ".java", ".js", ".ts", ".sql", ".r", ".m",
}  # fmt: skip
EXT_HTML = {".html", ".htm"}
FORMATOS_VIEJOS = {".doc": ".docx", ".ppt": ".pptx", ".xls": ".xlsx"}

UNIDADES = {
    "es": {"pdf": "pág.", "presentacion": "diap.", "planilla": "hoja", "word": "parte", "texto": "parte", "imagen": ""},
    "en": {"pdf": "p.", "presentacion": "slide", "planilla": "sheet", "word": "part", "texto": "part", "imagen": ""},
}


def ubicacion(tipo: str, numero: int, total: int, idioma: str | None = None) -> str:
    """Cómo se nombra un lugar del documento en las citas: "pág. 3", "diap. 5", etc."""
    unidades = UNIDADES.get(idioma or idioma_actual.get(), UNIDADES["es"])
    unidad = unidades.get(tipo, unidades["texto"])
    if not unidad or (total == 1 and tipo != "pdf"):
        return ""
    return f"{unidad} {numero}"


def extraer(nombre: str, datos: bytes, transcribir: Transcriptor) -> Extraido:
    extension = PurePath(nombre).suffix.lower()
    if extension in FORMATOS_VIEJOS:
        raise ArchivoInvalido("formato_viejo", extension=extension, nuevo=FORMATOS_VIEJOS[extension])

    def ocr(imagenes: list[bytes]) -> list[str]:
        try:
            return transcribir(imagenes)
        except Exception as e:
            raise _FalloAlTranscribir(e) from e

    try:
        extraido = _extraer_segun_formato(extension, datos, ocr)
    except _FalloAlTranscribir as e:
        raise e.original from None  # errores de la IA o del límite de uso, tal cual
    except ArchivoInvalido:
        raise
    except Exception as e:
        raise ArchivoInvalido("archivo_danado", nombre=nombre) from e

    extraido.paginas = [limpiar(p) for p in extraido.paginas]
    if not any(len(re.sub(r"\W", "", p)) >= 3 for p in extraido.paginas):
        raise ArchivoInvalido("foto_ilegible" if extraido.tipo in ("imagen", "pdf") else "sin_texto", nombre=nombre)
    return extraido


def _extraer_segun_formato(extension: str, datos: bytes, ocr: Transcriptor) -> Extraido:
    if extension == ".pdf":
        return Extraido("pdf", _pdf(datos, ocr))
    if extension == ".docx":
        return Extraido("word", partir(_docx(datos)))
    if extension == ".pptx":
        return Extraido("presentacion", _pptx(datos))
    if extension in (".xlsx", ".xlsm"):
        return Extraido("planilla", _xlsx(datos))
    if extension in (".odt", ".ods"):
        return Extraido("word" if extension == ".odt" else "planilla", partir(_odf(datos)))
    if extension == ".odp":
        return Extraido("presentacion", _odp(datos))
    if extension == ".rtf":
        from striprtf.striprtf import rtf_to_text

        return Extraido("texto", partir(rtf_to_text(decodificar(datos))))
    if extension in EXT_HTML:
        return Extraido("texto", partir(_html(decodificar(datos))))
    if extension in EXT_IMAGEN or _es_imagen(datos):
        return Extraido("imagen", ocr([a_jpeg(Image.open(BytesIO(datos)))]))
    if extension in EXT_TEXTO or _parece_texto(datos):
        return Extraido("texto", partir(decodificar(datos)))
    raise ArchivoInvalido("formato_no_soportado")


# --- Formatos ---


def _pdf(datos: bytes, ocr: Transcriptor) -> list[str]:
    lector = PdfReader(BytesIO(datos))
    if lector.is_encrypted and not lector.decrypt(""):
        raise ArchivoInvalido("pdf_con_contrasena")
    paginas = [limpiar(p.extract_text() or "") for p in lector.pages]

    # Páginas sin texto: escaneadas, fotos o diapositivas que son solo imagen
    escaneadas = [i for i, texto in enumerate(paginas) if len(re.sub(r"\s", "", texto)) < 10]
    if escaneadas:
        if len(escaneadas) > config.MAX_PAGINAS_OCR:
            raise ArchivoInvalido("muchas_paginas_escaneadas", cantidad=len(escaneadas), maximo=config.MAX_PAGINAS_OCR)
        documento = pdfium.PdfDocument(datos)
        # scale=3 son ~216 dpi: la resolución que necesita el OCR para leer bien
        imagenes = [a_jpeg(documento[i].render(scale=3).to_pil()) for i in escaneadas]
        for i, texto in zip(escaneadas, ocr(imagenes), strict=True):
            paginas[i] = texto
    return paginas


def _docx(datos: bytes) -> str:
    from docx import Document
    from docx.table import Table

    documento = Document(BytesIO(datos))
    lineas = []
    for bloque in documento.iter_inner_content():
        if isinstance(bloque, Table):
            for fila in bloque.rows:
                lineas.append(" | ".join(celda.text.strip() for celda in fila.cells))
            lineas.append("")
        else:
            lineas.append(bloque.text)
    return "\n".join(lineas)


def _pptx(datos: bytes) -> list[str]:
    from pptx import Presentation

    def textos(formas):
        for forma in formas:
            if forma.shape_type == 6:  # grupo
                yield from textos(forma.shapes)
            elif forma.has_text_frame:
                yield forma.text_frame.text
            elif getattr(forma, "has_table", False) and forma.has_table:
                for fila in forma.table.rows:
                    yield " | ".join(celda.text for celda in fila.cells)

    diapositivas = []
    for diapositiva in Presentation(BytesIO(datos)).slides:
        partes = [t for t in textos(diapositiva.shapes) if t.strip()]
        if diapositiva.has_notes_slide:
            notas = diapositiva.notes_slide.notes_text_frame.text.strip()
            if notas:
                partes.append(f"Notas: {notas}")
        diapositivas.append("\n".join(partes))
    return diapositivas


def _xlsx(datos: bytes, max_filas: int = 3000) -> list[str]:
    from openpyxl import load_workbook

    libro = load_workbook(BytesIO(datos), read_only=True, data_only=True)
    hojas = []
    for hoja in libro.worksheets:
        filas = []
        for fila in hoja.iter_rows(values_only=True):
            if any(v is not None for v in fila):
                filas.append(" | ".join("" if v is None else str(v) for v in fila))
            if len(filas) >= max_filas:
                break
        hojas.append(f"Hoja «{hoja.title}»\n" + "\n".join(filas) if filas else "")
    return hojas


def _odf_contenido(datos: bytes) -> ElementTree.Element:
    with zipfile.ZipFile(BytesIO(datos)) as archivo:
        return ElementTree.fromstring(archivo.read("content.xml"))


def _odf_parrafos(raiz: ElementTree.Element) -> list[str]:
    return ["".join(e.itertext()) for e in raiz.iter() if e.tag.endswith("}p") or e.tag.endswith("}h")]


def _odf(datos: bytes) -> str:
    return "\n".join(_odf_parrafos(_odf_contenido(datos)))


def _odp(datos: bytes) -> list[str]:
    raiz = _odf_contenido(datos)
    return ["\n".join(_odf_parrafos(pagina)) for pagina in raiz.iter() if pagina.tag.endswith("}page")]


class _LectorHtml(HTMLParser):
    BLOQUES = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article"}

    def __init__(self):
        super().__init__()
        self.partes: list[str] = []
        self.ignorar = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.ignorar += 1
        elif tag in self.BLOQUES:
            self.partes.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.ignorar = max(0, self.ignorar - 1)

    def handle_data(self, data):
        if not self.ignorar:
            self.partes.append(data)


def _html(html: str) -> str:
    lector = _LectorHtml()
    lector.feed(html)
    return "".join(lector.partes)


# --- Utilidades ---


def a_jpeg(imagen: Image.Image, lado_maximo: int = 2500) -> bytes:
    """Normaliza cualquier imagen (gira según EXIF, achica y pasa a JPEG) para leerla con OCR."""
    imagen = ImageOps.exif_transpose(imagen).convert("RGB")
    imagen.thumbnail((lado_maximo, lado_maximo))
    salida = BytesIO()
    imagen.save(salida, format="JPEG", quality=90)
    return salida.getvalue()


def _es_imagen(datos: bytes) -> bool:
    try:
        with Image.open(BytesIO(datos)) as imagen:
            imagen.verify()
        return True
    except Exception:
        return False


def _parece_texto(datos: bytes) -> bool:
    muestra = datos[:4000]
    return b"\x00" not in muestra and bool(muestra.strip())


def decodificar(datos: bytes) -> str:
    try:
        return datos.decode("utf-8-sig")
    except UnicodeDecodeError:
        return datos.decode("cp1252", errors="replace")


def limpiar(texto: str) -> str:
    texto = texto.replace("\x00", "").replace("\r\n", "\n")
    texto = re.sub(r"[ \t]+", " ", texto)
    texto = re.sub(r" *\n *", "\n", texto)
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    return texto.strip()


def partir(texto: str, tamano: int = 3000) -> list[str]:
    """Divide un texto sin páginas en partes de ~`tamano` caracteres, respetando párrafos."""
    partes: list[str] = []
    actual = ""
    for parrafo in re.split(r"\n\s*\n", limpiar(texto)):
        if actual and len(actual) + len(parrafo) > tamano:
            partes.append(actual)
            actual = parrafo
        else:
            actual = f"{actual}\n\n{parrafo}" if actual else parrafo
    if actual:
        partes.append(actual)
    return partes


def trocear(paginas: list[str], tamano: int = 1200, solape: int = 200) -> list[Trozo]:
    """Divide cada página en fragmentos de ~`tamano` caracteres que se solapan un poco,
    cortando en espacios para no partir palabras. Son los que usa la búsqueda."""
    trozos: list[Trozo] = []
    for numero, texto in enumerate(paginas, start=1):
        inicio = 0
        while inicio < len(texto):
            fin = min(inicio + tamano, len(texto))
            if fin < len(texto):
                corte = texto.rfind(" ", inicio + tamano // 2, fin)
                if corte != -1:
                    fin = corte
            pedazo = texto[inicio:fin].strip()
            if pedazo:
                trozos.append(Trozo(numero, pedazo))
            if fin >= len(texto):
                break
            siguiente = max(fin - solape, inicio + 1)
            espacio = texto.find(" ", siguiente, fin)
            inicio = espacio + 1 if espacio != -1 else siguiente
    return trozos


def unir_paginas(tipo: str, paginas: list[str]) -> str:
    """Texto completo del documento, marcando dónde empieza cada página."""
    bloques = []
    for numero, texto in enumerate(paginas, start=1):
        if not texto:
            continue
        lugar = ubicacion(tipo, numero, len(paginas))
        bloques.append(f"[{lugar}]\n{texto}" if lugar else texto)
    return "\n\n".join(bloques)
