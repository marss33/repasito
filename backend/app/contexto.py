from sqlalchemy.orm import Session, joinedload

from .busqueda import BM25
from .extraccion import ubicacion
from .ia import Contexto
from .models import Documento, Fragmento


def fragmentos_de(db: Session, materia_id: int) -> list[Fragmento]:
    return (
        db.query(Fragmento)
        .join(Documento)
        .filter(Documento.materia_id == materia_id)
        .options(joinedload(Fragmento.documento))
        .order_by(Fragmento.documento_id, Fragmento.orden)
        .all()
    )


def a_contexto(fragmento: Fragmento) -> Contexto:
    doc = fragmento.documento
    return Contexto(doc.nombre, ubicacion(doc.tipo, fragmento.pagina, doc.paginas), fragmento.texto)


def buscar(fragmentos: list[Fragmento], consulta: str, k: int) -> list[Contexto]:
    indice = BM25([f.texto for f in fragmentos])
    return [a_contexto(fragmentos[i]) for i, _ in indice.buscar(consulta, k)]
