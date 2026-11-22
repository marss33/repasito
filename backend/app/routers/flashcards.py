import csv
import io
from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import flashcard_o_404, materia_o_404
from ..models import Flashcard, Materia
from ..repaso_espaciado import Estado, repasar
from ..schemas import FlashcardIn, FlashcardOut, RepasoIn

router = APIRouter(tags=["flashcards"])


@router.get("/materias/{materia_id}/flashcards", response_model=list[FlashcardOut])
def listar(materia: Materia = Depends(materia_o_404), db: Session = Depends(get_db)):
    return db.query(Flashcard).filter(Flashcard.materia_id == materia.id).order_by(Flashcard.id.desc()).all()


@router.get("/materias/{materia_id}/flashcards/exportar")
def exportar(materia: Materia = Depends(materia_o_404)):
    """CSV de dos columnas (frente, dorso) que se puede importar en Anki o Quizlet."""
    salida = io.StringIO()
    escritor = csv.writer(salida)
    for tarjeta in sorted(materia.flashcards, key=lambda t: t.id):
        escritor.writerow([tarjeta.frente, tarjeta.dorso])
    nombre = quote(f"flashcards - {materia.nombre}.csv")
    return Response(
        content="﻿" + salida.getvalue(),  # BOM para que Excel respete los acentos
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{nombre}"},
    )


@router.get("/materias/{materia_id}/flashcards/pendientes", response_model=list[FlashcardOut])
def pendientes(materia: Materia = Depends(materia_o_404), db: Session = Depends(get_db)):
    return (
        db.query(Flashcard)
        .filter(Flashcard.materia_id == materia.id, Flashcard.proxima <= date.today())
        .order_by(Flashcard.proxima, Flashcard.id)
        .all()
    )


@router.post("/materias/{materia_id}/flashcards", response_model=FlashcardOut, status_code=201)
def crear(datos: FlashcardIn, materia: Materia = Depends(materia_o_404), db: Session = Depends(get_db)):
    tarjeta = Flashcard(materia=materia, frente=datos.frente.strip(), dorso=datos.dorso.strip())
    db.add(tarjeta)
    db.commit()
    return tarjeta


@router.put("/flashcards/{flashcard_id}", response_model=FlashcardOut)
def editar(datos: FlashcardIn, tarjeta: Flashcard = Depends(flashcard_o_404), db: Session = Depends(get_db)):
    tarjeta.frente = datos.frente.strip()
    tarjeta.dorso = datos.dorso.strip()
    db.commit()
    return tarjeta


@router.post("/flashcards/{flashcard_id}/repaso", response_model=FlashcardOut)
def registrar_repaso(datos: RepasoIn, tarjeta: Flashcard = Depends(flashcard_o_404), db: Session = Depends(get_db)):
    actual = Estado(tarjeta.facilidad, tarjeta.intervalo, tarjeta.repeticiones)
    nuevo, proxima = repasar(actual, datos.calidad, date.today())
    tarjeta.facilidad = nuevo.facilidad
    tarjeta.intervalo = nuevo.intervalo
    tarjeta.repeticiones = nuevo.repeticiones
    tarjeta.proxima = proxima
    db.commit()
    return tarjeta


@router.delete("/flashcards/{flashcard_id}", status_code=204)
def borrar(tarjeta: Flashcard = Depends(flashcard_o_404), db: Session = Depends(get_db)):
    db.delete(tarjeta)
    db.commit()
