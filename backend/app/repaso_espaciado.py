"""Repetición espaciada con el algoritmo SM-2 (el de SuperMemo, base de Anki)."""

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass
class Estado:
    facilidad: float = 2.5
    intervalo: int = 0  # días hasta el próximo repaso
    repeticiones: int = 0  # aciertos seguidos


def repasar(estado: Estado, calidad: int, hoy: date) -> tuple[Estado, date]:
    """`calidad` va de 0 (no me acordaba nada) a 5 (perfecto).
    Si es menor a 3 la tarjeta vuelve a aparecer hoy mismo."""
    if not 0 <= calidad <= 5:
        raise ValueError("La calidad tiene que estar entre 0 y 5")

    if calidad < 3:
        repeticiones = 0
        intervalo = 0
    else:
        repeticiones = estado.repeticiones + 1
        if repeticiones == 1:
            intervalo = 1
        elif repeticiones == 2:
            intervalo = 6
        else:
            intervalo = round(max(estado.intervalo, 1) * estado.facilidad)

    error = 5 - calidad
    facilidad = estado.facilidad + (0.1 - error * (0.08 + error * 0.02))
    facilidad = max(1.3, round(facilidad, 2))

    return Estado(facilidad, intervalo, repeticiones), hoy + timedelta(days=intervalo)
