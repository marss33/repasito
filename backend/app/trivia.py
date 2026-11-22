"""Trivia grupal de la sala, tipo "Preguntados".

Alguien de la sala sube archivos y escribe un tema; la IA arma las preguntas con los usos de esa
persona. A los demás les llega una invitación y el que quiere se suma. Todos ven la misma pregunta
a la vez: acertar rápido da más puntos, y al final el podio y cada acierto se pagan en monedas."""

import secrets
from dataclasses import dataclass, field

PREGUNTAS = 8
SEG_INVITACION = 30
SEG_PREGUNTA = 20
SEG_REVELAR = 5
PUNTOS_MAX = 1000
PUNTOS_MIN = 500
PODIO = (30, 20, 10)  # monedas para el 1.º, 2.º y 3.º (si jugaron al menos dos)
POR_ACIERTO = 2
MAX_TEMA = 120


@dataclass
class Jugador:
    nombre: str
    puntos: int = 0
    aciertos: int = 0
    respuesta: int | None = None  # la de la pregunta actual
    acerto: bool | None = None


@dataclass
class Trivia:
    tema: str
    creador_id: int
    creador: str
    preguntas: list[dict]  # enunciado, opciones, correcta, explicacion
    id: str = field(default_factory=lambda: secrets.token_hex(4))
    fase: str = "invitando"  # invitando, pregunta, revelando, terminada
    indice: int = -1
    fin: float = 0.0  # cuándo termina la fase actual (reloj del servidor)
    jugadores: dict[int, Jugador] = field(default_factory=dict)
    premiada: bool = False

    def invitar(self, ahora: float) -> None:
        self.fase = "invitando"
        self.fin = ahora + SEG_INVITACION
        self.unir(self.creador_id, self.creador)

    def unir(self, usuario_id: int, nombre: str) -> bool:
        """Se puede sumar mientras se juega (arranca con 0 puntos). No después del final."""
        if self.fase == "terminada" or usuario_id in self.jugadores:
            return False
        self.jugadores[usuario_id] = Jugador(nombre)
        return True

    def empezar(self, ahora: float) -> bool:
        if self.fase != "invitando":
            return False
        self._siguiente(ahora)
        return True

    def _siguiente(self, ahora: float) -> None:
        self.indice += 1
        for jugador in self.jugadores.values():
            jugador.respuesta = jugador.acerto = None
        if self.indice >= len(self.preguntas):
            self.fase, self.fin = "terminada", 0.0
        else:
            self.fase, self.fin = "pregunta", ahora + SEG_PREGUNTA

    @property
    def pregunta(self) -> dict | None:
        return self.preguntas[self.indice] if 0 <= self.indice < len(self.preguntas) else None

    def responder(self, usuario_id: int, opcion: object, ahora: float) -> bool:
        jugador = self.jugadores.get(usuario_id)
        pregunta = self.pregunta
        if (
            self.fase != "pregunta"
            or jugador is None
            or jugador.respuesta is not None
            or pregunta is None
            or not isinstance(opcion, int)
            or not 0 <= opcion < len(pregunta["opciones"])
        ):
            return False
        jugador.respuesta = opcion
        jugador.acerto = opcion == pregunta["correcta"]
        if jugador.acerto:
            resto = max(0.0, min(1.0, (self.fin - ahora) / SEG_PREGUNTA))
            jugador.puntos += round(PUNTOS_MIN + (PUNTOS_MAX - PUNTOS_MIN) * resto)
            jugador.aciertos += 1
        return True

    def todos_respondieron(self) -> bool:
        return bool(self.jugadores) and all(j.respuesta is not None for j in self.jugadores.values())

    def avanzar(self, ahora: float) -> bool:
        """Pasa a la fase siguiente si se terminó el tiempo (o si ya respondieron todos)."""
        if self.fase == "invitando" and ahora >= self.fin:
            return self.empezar(ahora)
        if self.fase == "pregunta" and (ahora >= self.fin or self.todos_respondieron()):
            self.fase, self.fin = "revelando", ahora + SEG_REVELAR
            return True
        if self.fase == "revelando" and ahora >= self.fin:
            self._siguiente(ahora)
            return True
        return False

    def ranking(self) -> list[tuple[int, Jugador]]:
        return sorted(self.jugadores.items(), key=lambda par: (-par[1].puntos, -par[1].aciertos, par[1].nombre))

    def premios(self) -> dict[int, int]:
        """Monedas de cada jugador: por cada acierto, y el podio si jugaron al menos dos."""
        premios = {uid: j.aciertos * POR_ACIERTO for uid, j in self.jugadores.items()}
        if len(self.jugadores) >= 2:
            for (uid, jugador), monedas in zip(self.ranking(), PODIO, strict=False):
                if jugador.puntos > 0:
                    premios[uid] += monedas
        return {uid: m for uid, m in premios.items() if m > 0}

    def a_dict(self) -> dict:
        """Lo que ven todos. La respuesta correcta solo se muestra al revelar."""
        pregunta = self.pregunta
        revelar = self.fase == "revelando"
        return {
            "id": self.id,
            "tema": self.tema,
            "creador": self.creador,
            "creador_id": self.creador_id,
            "fase": self.fase,
            "indice": self.indice,
            "total": len(self.preguntas),
            "fin": self.fin,
            "segundos": SEG_PREGUNTA,
            "pregunta": (
                {
                    "enunciado": pregunta["enunciado"],
                    "opciones": pregunta["opciones"],
                    "correcta": pregunta["correcta"] if revelar else None,
                    "explicacion": pregunta.get("explicacion", "") if revelar else None,
                }
                if pregunta and self.fase in ("pregunta", "revelando")
                else None
            ),
            "jugadores": [
                {
                    "id": uid,
                    "nombre": j.nombre,
                    "puntos": j.puntos,
                    "aciertos": j.aciertos,
                    "respondio": j.respuesta is not None,
                    "acerto": j.acerto if revelar else None,
                }
                for uid, j in self.ranking()
            ],
        }
