from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import materia_o_404, usuario_actual
from ..models import Materia, Usuario
from ..schemas import MateriaIn, MateriaOut

router = APIRouter(prefix="/materias", tags=["materias"])


def a_salida(materia: Materia) -> MateriaOut:
    hoy = date.today()
    return MateriaOut(
        id=materia.id,
        nombre=materia.nombre,
        documentos=len(materia.documentos),
        flashcards=len(materia.flashcards),
        pendientes=sum(1 for f in materia.flashcards if f.proxima <= hoy),
    )


@router.get("", response_model=list[MateriaOut])
def listar(usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    materias = db.query(Materia).filter_by(usuario_id=usuario.id).order_by(Materia.nombre).all()
    return [a_salida(m) for m in materias]


@router.post("", response_model=MateriaOut, status_code=201)
def crear(datos: MateriaIn, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    materia = Materia(usuario=usuario, nombre=datos.nombre.strip())
    db.add(materia)
    db.commit()
    return a_salida(materia)


@router.get("/{materia_id}", response_model=MateriaOut)
def ver(materia: Materia = Depends(materia_o_404)):
    return a_salida(materia)


@router.put("/{materia_id}", response_model=MateriaOut)
def renombrar(datos: MateriaIn, materia: Materia = Depends(materia_o_404), db: Session = Depends(get_db)):
    materia.nombre = datos.nombre.strip()
    db.commit()
    return a_salida(materia)


@router.delete("/{materia_id}", status_code=204)
def borrar(materia: Materia = Depends(materia_o_404), db: Session = Depends(get_db)):
    db.delete(materia)
    db.commit()
