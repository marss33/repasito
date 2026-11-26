import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..contexto import a_contexto, buscar, fragmentos_de
from ..db import get_db
from ..deps import con_ia, get_ia, materia_o_404, usuario_actual
from ..ia import TutorIA
from ..idioma import t
from ..models import Materia, Usuario
from ..schemas import ConceptoOut, ConceptosIn, QuizIn, QuizOut

router = APIRouter(tags=["quiz"])

FRAGMENTOS_POR_QUIZ = 10


@router.post("/materias/{materia_id}/quiz", response_model=QuizOut)
def generar(
    datos: QuizIn,
    materia: Materia = Depends(materia_o_404),
    usuario: Usuario = Depends(usuario_actual),
    db: Session = Depends(get_db),
    ia: TutorIA = Depends(get_ia),
):
    fragmentos = fragmentos_de(db, materia.id)
    if not fragmentos:
        raise HTTPException(400, t("sin_apuntes"))

    tema = (datos.tema or "").strip() or None
    if tema:
        contexto = buscar(fragmentos, tema, FRAGMENTOS_POR_QUIZ)
        if not contexto:
            raise HTTPException(404, t("tema_no_encontrado", tema=tema))
    else:
        elegidos = random.sample(fragmentos, min(FRAGMENTOS_POR_QUIZ, len(fragmentos)))
        contexto = [a_contexto(f) for f in elegidos]

    with con_ia(db, usuario, ia):
        preguntas = ia.generar_quiz(contexto, datos.cantidad, tema)
    return QuizOut(preguntas=[p.model_dump() for p in preguntas])


@router.post("/materias/{materia_id}/conceptos", response_model=list[ConceptoOut])
def conceptos(
    datos: ConceptosIn,
    materia: Materia = Depends(materia_o_404),
    usuario: Usuario = Depends(usuario_actual),
    db: Session = Depends(get_db),
    ia: TutorIA = Depends(get_ia),
):
    """Palabras clave de los apuntes para jugar al ahorcado o a la sopa de letras."""
    fragmentos = fragmentos_de(db, materia.id)
    if not fragmentos:
        raise HTTPException(400, t("sin_apuntes"))
    tema = (datos.tema or "").strip() or None
    if tema:
        contexto = buscar(fragmentos, tema, FRAGMENTOS_POR_QUIZ)
        if not contexto:
            raise HTTPException(404, t("tema_no_encontrado", tema=tema))
    else:
        elegidos = random.sample(fragmentos, min(FRAGMENTOS_POR_QUIZ, len(fragmentos)))
        contexto = [a_contexto(f) for f in elegidos]
    with con_ia(db, usuario, ia):
        lista = ia.generar_conceptos(contexto, datos.cantidad)
    return [ConceptoOut(termino=c.termino.strip(), pista=c.pista.strip()) for c in lista]
