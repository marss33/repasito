"""Límites simples en memoria para frenar abusos (intentos de login, cuentas de invitado)."""

import time
from collections import defaultdict, deque
from threading import Lock


class Limitador:
    def __init__(self, maximo: int, ventana_segundos: float):
        self.maximo = maximo
        self.ventana = ventana_segundos
        self._registros: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def permitir(self, clave: str) -> bool:
        ahora = time.monotonic()
        with self._lock:
            registros = self._registros[clave]
            while registros and ahora - registros[0] > self.ventana:
                registros.popleft()
            if len(registros) >= self.maximo:
                return False
            registros.append(ahora)
            return True

    def reiniciar(self) -> None:
        with self._lock:
            self._registros.clear()


intentos_de_login = Limitador(maximo=10, ventana_segundos=10 * 60)
cuentas_de_invitado = Limitador(maximo=10, ventana_segundos=24 * 3600)


def reiniciar_todos() -> None:
    intentos_de_login.reiniciar()
    cuentas_de_invitado.reiniciar()
