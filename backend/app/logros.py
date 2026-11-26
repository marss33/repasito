"""Logros e insignias: se desbloquean solos al estudiar y cada uno da monedas una vez."""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from .models import ContadorUsuario
from .rincon import dar


@dataclass(frozen=True)
class Logro:
    clave: str
    emoji: str
    contador: str  # qué se cuenta
    meta: int
    monedas: int


LOGROS = (
    Logro("primer_pomodoro", "🍅", "pomodoros", 1, 10),
    Logro("pomodoros_10", "⏱️", "pomodoros", 10, 30),
    Logro("pomodoros_50", "🏅", "pomodoros", 50, 80),
    Logro("pomodoros_100", "👑", "pomodoros", 100, 150),
    Logro("primer_apunte", "📄", "apuntes", 1, 10),
    Logro("apuntes_10", "📚", "apuntes", 10, 30),
    Logro("resumenes_5", "📝", "resumenes", 5, 25),
    Logro("repasos_50", "🧠", "repasos", 50, 40),
    Logro("primera_trivia", "🎲", "trivias", 1, 10),
    Logro("trivias_10", "🎯", "trivias", 10, 30),
    Logro("primera_victoria", "🏆", "victorias", 1, 20),
    Logro("victorias_10", "🥇", "victorias", 10, 60),
)
CONTADORES = sorted({logro.contador for logro in LOGROS})


def valores(db: Session, usuario_id: int) -> dict[str, int]:
    filas = db.query(ContadorUsuario).filter_by(usuario_id=usuario_id)
    actuales = dict.fromkeys(CONTADORES, 0)
    actuales.update({f.clave: f.valor for f in filas})
    return actuales


def sumar(db: Session, usuario_id: int, contador: str, cantidad: int = 1) -> list[Logro]:
    """Suma al contador y paga las monedas de los logros que se acaban de desbloquear."""
    fila = db.get(ContadorUsuario, (usuario_id, contador))
    if fila is None:
        fila = ContadorUsuario(usuario_id=usuario_id, clave=contador, valor=0)
        db.add(fila)
    antes = fila.valor
    fila.valor = antes + cantidad
    db.commit()
    nuevos = [lg for lg in LOGROS if lg.contador == contador and antes < lg.meta <= fila.valor]
    for logro in nuevos:
        dar(db, usuario_id, "logro", logro.monedas)
    return nuevos


def estado(db: Session, usuario_id: int) -> list[dict]:
    actuales = valores(db, usuario_id)
    return [
        {
            "clave": lg.clave,
            "emoji": lg.emoji,
            "actual": min(actuales[lg.contador], lg.meta),
            "meta": lg.meta,
            "monedas": lg.monedas,
            "logrado": actuales[lg.contador] >= lg.meta,
        }
        for lg in LOGROS
    ]
