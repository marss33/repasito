import contextvars
import logging
import secrets
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from .. import config, rincon
from ..db import SessionLocal, get_db
from ..deps import con_ia, documento_o_404, get_ia, get_ocr, materia_o_404, usuario_actual
from ..extraccion import ArchivoInvalido, extraer, trocear, unir_paginas
from ..ia import TutorIA
from ..idioma import t
from ..models import Documento, Flashcard, Fragmento, Materia, Usuario
from ..ocr import OCRNoDisponible
from ..schemas import DocumentoDetalle, DocumentoOut, FlashcardOut, GenerarFlashcardsIn, SubidaPendiente

router = APIRouter(tags=["documentos"])
log = logging.getLogger(__name__)


def a_salida(doc: Documento, detalle: bool = False):
    datos = dict(
        id=doc.id,
        nombre=doc.nombre,
        tipo=doc.tipo,
        paginas=doc.paginas,
        fragmentos=len(doc.fragmentos),
        tiene_resumen=bool(doc.resumen),
        creado=doc.creado,
    )
    if detalle:
        return DocumentoDetalle(**datos, resumen=doc.resumen)
    return DocumentoOut(**datos)


@router.get("/materias/{materia_id}/documentos", response_model=list[DocumentoOut])
def listar(materia: Materia = Depends(materia_o_404)):
    return [a_salida(d) for d in materia.documentos]


def revisar_subida(materia: Materia, datos: bytes) -> None:
    if len(materia.documentos) >= config.MAX_DOCUMENTOS_POR_MATERIA:
        raise HTTPException(400, t("muchos_documentos", maximo=config.MAX_DOCUMENTOS_POR_MATERIA))
    if len(datos) > config.MAX_ARCHIVO_MB * 1024 * 1024:
        raise HTTPException(413, t("archivo_grande", mb=config.MAX_ARCHIVO_MB))
    if not datos:
        raise HTTPException(400, t("archivo_vacio"))


def guardar_documento(
    db: Session, materia: Materia, nombre: str, datos: bytes, leer_imagenes: Callable[[list[bytes]], list[str]]
) -> DocumentoOut:
    """Lee el archivo, lo guarda como apunte de la materia y da las monedas por subirlo."""
    revisar_subida(materia, datos)
    try:
        extraido = extraer(nombre, datos, leer_imagenes)
    except ArchivoInvalido as e:
        raise HTTPException(400, e.texto()) from e

    trozos = trocear(extraido.paginas)
    doc = Documento(
        materia=materia,
        nombre=nombre,
        tipo=extraido.tipo,
        paginas=len(extraido.paginas),
        texto=unir_paginas(extraido.tipo, extraido.paginas),
    )
    doc.fragmentos = [Fragmento(pagina=t.pagina, orden=i, texto=t.texto) for i, t in enumerate(trozos)]
    db.add(doc)
    db.commit()
    salida = a_salida(doc)
    salida.monedas_ganadas, _ = rincon.dar(db, materia.usuario_id, "archivo", rincon.POR_ARCHIVO)
    return salida


# --- Subidas que tardan: se terminan de procesar en segundo plano ---
# Leer un PDF escaneado o una foto (OCR) puede tardar más de lo que Discord o el navegador
# esperan una respuesta. El pedido espera un rato; si no terminó, contesta "procesando" y el
# apunte aparece solo cuando está listo. De a uno por vez, para no ahogar un servidor chico.

ESPERA_MAXIMA = 20.0  # segundos
_trabajos = ThreadPoolExecutor(max_workers=1, thread_name_prefix="apuntes")
_candado = threading.Lock()


@dataclass
class Pendiente:
    id: str
    materia_id: int
    nombre: str
    estado: str = "procesando"  # procesando, listo o error
    error: str | None = None
    codigo: int = 500
    documento: DocumentoOut | None = None
    fin: float = 0.0
    terminado: threading.Event = field(default_factory=threading.Event)


_pendientes: dict[str, Pendiente] = {}


def _procesar(pendiente: Pendiente, datos: bytes, leer_imagenes: Callable[[list[bytes]], list[str]]) -> None:
    try:
        with SessionLocal() as db:
            materia = db.get(Materia, pendiente.materia_id)
            if materia is None:
                raise HTTPException(404, t("materia_no_existe"))
            pendiente.documento = guardar_documento(db, materia, pendiente.nombre, datos, leer_imagenes)
            pendiente.estado = "listo"
    except HTTPException as e:
        pendiente.estado, pendiente.error, pendiente.codigo = "error", str(e.detail), e.status_code
    except OCRNoDisponible as e:
        pendiente.estado, pendiente.error, pendiente.codigo = "error", e.texto(), 503
    except Exception:
        log.exception("No se pudo procesar %s", pendiente.nombre)
        pendiente.estado, pendiente.error = "error", t("error_procesando", nombre=pendiente.nombre)
    finally:
        pendiente.fin = time.monotonic()
        pendiente.terminado.set()


def subir_apunte(
    materia: Materia,
    nombre: str,
    datos: bytes,
    leer_imagenes: Callable[[list[bytes]], list[str]],
    respuesta: Response,
) -> DocumentoOut | SubidaPendiente:
    """Guarda un apunte. Si se procesa rápido devuelve el documento; si no, queda procesando."""
    revisar_subida(materia, datos)
    pendiente = Pendiente(id=secrets.token_hex(6), materia_id=materia.id, nombre=nombre[:255])
    with _candado:
        ahora = time.monotonic()
        for viejo in [p for p in _pendientes.values() if p.fin and ahora - p.fin > 3600]:
            _pendientes.pop(viejo.id, None)
        _pendientes[pendiente.id] = pendiente
    # copy_context: el trabajo responde en el idioma de quien subió el archivo
    _trabajos.submit(contextvars.copy_context().run, _procesar, pendiente, datos, leer_imagenes)
    if not pendiente.terminado.wait(ESPERA_MAXIMA):
        respuesta.status_code = 202
        return SubidaPendiente(id=pendiente.id, nombre=pendiente.nombre)
    with _candado:
        _pendientes.pop(pendiente.id, None)
    if pendiente.estado == "error":
        raise HTTPException(pendiente.codigo, pendiente.error)
    respuesta.status_code = 201
    return pendiente.documento


@router.post("/materias/{materia_id}/documentos", response_model=DocumentoOut | SubidaPendiente, status_code=201)
def subir(
    archivo: UploadFile,
    respuesta: Response,
    materia: Materia = Depends(materia_o_404),
    leer_imagenes: Callable[[list[bytes]], list[str]] = Depends(get_ocr),
):
    return subir_apunte(materia, archivo.filename or "apunte", archivo.file.read(), leer_imagenes, respuesta)


@router.get("/materias/{materia_id}/documentos/procesando", response_model=list[SubidaPendiente])
def procesando(materia: Materia = Depends(materia_o_404)):
    """Los apuntes que se están procesando. Los que ya terminaron se informan una vez y se olvidan."""
    with _candado:
        de_la_materia = [p for p in _pendientes.values() if p.materia_id == materia.id]
        for p in de_la_materia:
            if p.estado != "procesando":
                _pendientes.pop(p.id, None)
    return [
        SubidaPendiente(
            id=p.id,
            nombre=p.nombre,
            estado=p.estado,
            error=p.error,
            monedas_ganadas=p.documento.monedas_ganadas if p.documento else 0,
        )
        for p in de_la_materia
    ]


@router.get("/documentos/{documento_id}", response_model=DocumentoDetalle)
def ver(doc: Documento = Depends(documento_o_404)):
    return a_salida(doc, detalle=True)


@router.delete("/documentos/{documento_id}", status_code=204)
def borrar(doc: Documento = Depends(documento_o_404), db: Session = Depends(get_db)):
    db.delete(doc)
    db.commit()


@router.post("/documentos/{documento_id}/resumen", response_model=DocumentoDetalle)
def resumir(
    doc: Documento = Depends(documento_o_404),
    usuario: Usuario = Depends(usuario_actual),
    db: Session = Depends(get_db),
    ia: TutorIA = Depends(get_ia),
):
    with con_ia(db, usuario, ia):
        doc.resumen = ia.resumir(doc.nombre, doc.texto)
    db.commit()
    return a_salida(doc, detalle=True)


@router.post("/documentos/{documento_id}/flashcards", response_model=list[FlashcardOut], status_code=201)
def generar_flashcards(
    datos: GenerarFlashcardsIn,
    doc: Documento = Depends(documento_o_404),
    usuario: Usuario = Depends(usuario_actual),
    db: Session = Depends(get_db),
    ia: TutorIA = Depends(get_ia),
):
    with con_ia(db, usuario, ia):
        tarjetas = ia.generar_flashcards(doc.nombre, doc.texto, datos.cantidad)
    nuevas = [
        Flashcard(materia_id=doc.materia_id, documento=doc, frente=t.frente.strip(), dorso=t.dorso.strip())
        for t in tarjetas
    ]
    db.add_all(nuevas)
    db.commit()
    return nuevas
