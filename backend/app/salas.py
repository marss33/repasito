"""Salas de estudio en grupo: lo que pasa en tiempo real (quién está, música, chat y el pomodoro de cada uno).

El estado de cada sala vive en memoria mientras haya alguien conectado. El servidor es el que
manda: los navegadores solo muestran lo que reciben y mandan acciones ("iniciar", "pausar"...)."""

import asyncio
import contextlib
import logging
import math
import secrets
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from fastapi import WebSocket

from .rincon import monedas_por_pomodoro
from .trivia import Trivia

log = logging.getLogger(__name__)

ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # sin 0/O ni 1/I/L, que se confunden

# Topes de la pizarra, para que una sala no pueda llenar el servidor
MAX_ELEMENTOS = 5000
MAX_ELEMENTOS_POR_MENSAJE = 500
MAX_IMAGENES = 40
MAX_IMAGEN = 4_000_000  # caracteres del data URL (~3 MB de imagen)
DEMORA_GUARDADO = 2.0  # segundos sin cambios antes de guardar la pizarra en la base
ESCENAS = ("biblioteca", "aula", "cafeteria", "invernadero", "cabana", "escritorio", "chimenea")
# El clima que se ve por las ventanas de la sala (se cambia tocando una ventana)
CLIMAS = ("medianoche", "amanecer", "dia", "cafe", "lluvia", "nieve")
MAX_CHAT = 500
ESPERA_ENTRE_MENSAJES = 0.4  # segundos, para que nadie inunde el chat


def generar_codigo(largo: int = 6) -> str:
    return "".join(secrets.choice(ALFABETO_CODIGO) for _ in range(largo))


@dataclass
class Pomodoro:
    estudio: int = 25 * 60  # segundos
    descanso: int = 5 * 60
    fase: str = "estudio"  # "estudio" o "descanso"
    corriendo: bool = False
    fin: float | None = None  # momento (epoch) en que termina la fase actual, si está corriendo
    restante: int = 25 * 60  # segundos que faltan, si está pausado
    ciclos: int = 0  # bloques de estudio completados

    def duracion(self, fase: str) -> int:
        return self.estudio if fase == "estudio" else self.descanso

    def actualizar(self, ahora: float) -> bool:
        """Avanza de fase si ya pasó el tiempo. Devuelve True si cambió algo."""
        cambio = False
        while self.corriendo and self.fin is not None and ahora >= self.fin:
            if self.fase == "estudio":
                self.ciclos += 1
                self.fase = "descanso"
            else:
                self.fase = "estudio"
            self.fin += self.duracion(self.fase)
            cambio = True
        return cambio

    def iniciar(self, ahora: float) -> None:
        if not self.corriendo:
            self.corriendo = True
            self.fin = ahora + self.restante

    def pausar(self, ahora: float) -> None:
        self.actualizar(ahora)
        if self.corriendo and self.fin is not None:
            self.restante = max(1, math.ceil(self.fin - ahora))
        self.corriendo = False
        self.fin = None

    def saltar(self, ahora: float) -> None:
        """Pasa a la fase siguiente sin esperar (no cuenta como bloque completado)."""
        self.actualizar(ahora)
        self.fase = "descanso" if self.fase == "estudio" else "estudio"
        self.restante = self.duracion(self.fase)
        if self.corriendo:
            self.fin = ahora + self.restante

    def reiniciar(self) -> None:
        self.fase = "estudio"
        self.corriendo = False
        self.fin = None
        self.restante = self.estudio

    def configurar(self, estudio_min: int, descanso_min: int) -> None:
        self.estudio = max(5, min(90, int(estudio_min))) * 60
        self.descanso = max(1, min(30, int(descanso_min))) * 60
        if not self.corriendo:
            self.restante = self.duracion(self.fase)

    def a_dict(self, ahora: float) -> dict:
        self.actualizar(ahora)
        return {
            "fase": self.fase,
            "corriendo": self.corriendo,
            "fin": self.fin,
            "restante": self.restante,
            "estudio": self.estudio,
            "descanso": self.descanso,
            "ciclos": self.ciclos,
        }


@dataclass(eq=False)
class Conexion:
    ws: WebSocket
    usuario_id: int
    nombre: str
    apariencia: dict = field(default_factory=dict)  # su mascota y su foto, para la biblioteca
    desde: float = field(default_factory=time.time)
    ultimo_mensaje: float = 0.0


# Función que guarda un mensaje del chat y devuelve cómo se manda a los navegadores
GuardarMensaje = Callable[[Conexion, str], Awaitable[dict]]


def gana_el_nuevo(actual: dict | None, nuevo: dict) -> bool:
    """El mismo criterio que usa Excalidraw para combinar cambios de varias personas:
    gana la versión más alta y, si empatan, el `versionNonce` más bajo."""
    if actual is None:
        return True
    if nuevo["version"] != actual["version"]:
        return nuevo["version"] > actual["version"]
    return nuevo["versionNonce"] < actual["versionNonce"]


def elemento_valido(elemento) -> bool:
    return (
        isinstance(elemento, dict)
        and isinstance(elemento.get("id"), str)
        and 0 < len(elemento["id"]) <= 64
        and isinstance(elemento.get("version"), int)
        and isinstance(elemento.get("versionNonce"), int)
    )


def imagen_valida(archivo) -> bool:
    return (
        isinstance(archivo, dict)
        and isinstance(archivo.get("id"), str)
        and 0 < len(archivo["id"]) <= 64
        and str(archivo.get("mimeType", "")).startswith("image/")
        and isinstance(archivo.get("dataURL"), str)
        and archivo["dataURL"].startswith("data:image/")
        and len(archivo["dataURL"]) <= MAX_IMAGEN
    )


@dataclass
class Persistencia:
    """Cómo guarda la sala su pizarra en la base (lo pone el router; en los tests se reemplaza)."""

    guardar_pizarra: Callable[[str, list[dict]], Awaitable[None]]
    guardar_imagen: Callable[[str, dict], Awaitable[None]]
    # (ids de usuario, motivo, monedas) -> {id: (ganadas, total)}
    dar_monedas: Callable[[list[int], str, int], Awaitable[dict[int, tuple[int, int]]]] | None = None
    # id de usuario -> (apodo, apariencia pública), recién leídos de la base
    leer_perfil: Callable[[int], Awaitable[tuple[str, dict] | None]] | None = None
    # (id de usuario, contador) -> suma 1 para los logros (trivias jugadas, victorias)
    contar: Callable[[int, str], Awaitable[None]] | None = None


@dataclass
class SalaEnVivo:
    codigo: str
    conexiones: list[Conexion] = field(default_factory=list)
    # El pomodoro es personal: cada uno tiene el suyo, aunque estudien en la misma sala
    pomodoros: dict[int, Pomodoro] = field(default_factory=dict)
    pizarra: dict[str, dict] | None = None  # None = todavía no se cargó de la base
    imagenes: set[str] = field(default_factory=set)
    persistencia: Persistencia | None = None
    escena: str = "biblioteca"  # dónde se ve a todos estudiando
    clima: str = "medianoche"
    _avisos: dict[int, asyncio.Task] = field(default_factory=dict)
    _guardado: asyncio.Task | None = None
    _pizarra_sin_guardar: bool = False
    _premiados: dict[int, int] = field(default_factory=dict)  # bloques ya premiados de cada uno
    trivia: Trivia | None = None
    preparando_trivia: dict | None = None  # {usuario_id, por, tema} mientras la IA arma las preguntas
    _reloj_trivia: asyncio.Task | None = None
    tarea_trivia: asyncio.Task | None = None  # la IA armando preguntas (se guarda para que no se pierda)

    def conectados(self) -> list[dict]:
        vistos: dict[int, dict] = {}
        for c in self.conexiones:
            vistos.setdefault(c.usuario_id, {"id": c.usuario_id, "nombre": c.nombre, "apariencia": c.apariencia})
        return list(vistos.values())

    def pomodoro_de(self, usuario_id: int) -> Pomodoro:
        return self.pomodoros.setdefault(usuario_id, Pomodoro())

    def estado(self) -> dict:
        """Lo que ven todos. El pomodoro de cada uno se agrega al mandárselo (ver enviar)."""
        ahora = time.time()
        return {
            "tipo": "estado",
            "ahora": ahora,
            "conectados": self.conectados(),
            "escena": self.escena,
            "clima": self.clima,
            "trivia": self.trivia.a_dict() if self.trivia else None,
            "preparando_trivia": (
                {"por": self.preparando_trivia["por"], "tema": self.preparando_trivia["tema"]}
                if self.preparando_trivia
                else None
            ),
        }

    async def enviar(self, conexion: Conexion, mensaje: dict) -> None:
        if mensaje.get("tipo") == "estado":
            mensaje = {**mensaje, "pomodoro": self.pomodoro_de(conexion.usuario_id).a_dict(time.time())}
        try:
            await conexion.ws.send_json(mensaje)
        except Exception:
            # Se desconectó mientras le mandábamos algo: se limpia cuando termine su bucle
            log.debug("No se pudo enviar a %s", conexion.nombre)

    async def a_todos(self, *mensajes: dict) -> None:
        for conexion in list(self.conexiones):
            for mensaje in mensajes:
                await self.enviar(conexion, mensaje)

    async def al_usuario(self, usuario_id: int, *mensajes: dict) -> None:
        """A todas las pestañas de una misma persona."""
        for conexion in list(self.conexiones):
            if conexion.usuario_id == usuario_id:
                for mensaje in mensajes:
                    await self.enviar(conexion, mensaje)

    async def a_los_demas(self, origen: Conexion, mensaje: dict) -> None:
        for conexion in list(self.conexiones):
            if conexion is not origen:
                await self.enviar(conexion, mensaje)

    async def unir(self, conexion: Conexion) -> None:
        nuevo = all(c.usuario_id != conexion.usuario_id for c in self.conexiones)
        self.conexiones.append(conexion)
        if nuevo:
            await self.a_todos(self.estado(), {"tipo": "evento", "evento": "entro", "nombre": conexion.nombre})
        else:
            await self.enviar(conexion, self.estado())

    async def salir(self, conexion: Conexion) -> None:
        if conexion in self.conexiones:
            self.conexiones.remove(conexion)
        if all(c.usuario_id != conexion.usuario_id for c in self.conexiones):
            # Se fue del todo: su pomodoro se termina con él
            self.cancelar_aviso(conexion.usuario_id)
            self.pomodoros.pop(conexion.usuario_id, None)
            self._premiados.pop(conexion.usuario_id, None)
            await self.a_todos(self.estado(), {"tipo": "evento", "evento": "salio", "nombre": conexion.nombre})
        if not self.conexiones:
            self.cancelar_aviso()

    async def recibir(self, conexion: Conexion, mensaje: dict, guardar: GuardarMensaje) -> None:
        tipo = mensaje.get("tipo")
        ahora = time.time()

        if tipo == "chat":
            texto = str(mensaje.get("texto", "")).strip()[:MAX_CHAT]
            if not texto or ahora - conexion.ultimo_mensaje < ESPERA_ENTRE_MENSAJES:
                return
            conexion.ultimo_mensaje = ahora
            await self.a_todos({"tipo": "chat", "mensaje": await guardar(conexion, texto)})

        elif tipo == "pomodoro":
            # Cada uno maneja solo su propio pomodoro; los demás no se enteran
            usuario = conexion.usuario_id
            pomodoro = self.pomodoro_de(usuario)
            accion = mensaje.get("accion")
            if accion == "iniciar":
                pomodoro.iniciar(ahora)
            elif accion == "pausar":
                pomodoro.pausar(ahora)
            elif accion == "saltar":
                pomodoro.saltar(ahora)
            elif accion == "reiniciar":
                pomodoro.reiniciar()
            elif accion == "configurar":
                try:
                    pomodoro.configurar(mensaje.get("estudio", 25), mensaje.get("descanso", 5))
                except (TypeError, ValueError):
                    return
            else:
                return
            self.programar_aviso(usuario)
            await self.al_usuario(usuario, self.estado())
            await self.premiar_bloques(usuario)

        elif tipo == "trivia":
            await self._trivia(conexion, mensaje, ahora)

        elif tipo == "escena":
            escena = mensaje.get("escena")
            if escena in ESCENAS and escena != self.escena:
                self.escena = escena
                await self.a_todos(self.estado())

        elif tipo == "clima":
            clima = mensaje.get("clima")
            if clima in CLIMAS and clima != self.clima:
                self.clima = clima
                await self.a_todos(self.estado())

        elif tipo == "pizarra":
            await self._cambios_de_pizarra(conexion, mensaje.get("elementos"))

        elif tipo == "imagen":
            await self._imagen_de_pizarra(conexion, mensaje.get("archivo"))

        elif tipo == "puntero":
            try:
                x, y = float(mensaje["x"]), float(mensaje["y"])
            except (KeyError, TypeError, ValueError):
                return
            await self.a_los_demas(
                conexion,
                {
                    "tipo": "puntero",
                    "usuario_id": conexion.usuario_id,
                    "nombre": conexion.nombre,
                    "x": x,
                    "y": y,
                    "boton": "down" if mensaje.get("boton") == "down" else "up",
                },
            )

        elif tipo == "perfil":
            # Cambió su apodo, su foto, su avatar o su descripción (ya guardados por la API): se vuelven a
            # leer de la base, así nadie puede hacerse pasar por otro mandando datos inventados
            nombre = str(mensaje.get("nombre", "")).strip()[:80]
            apariencia = None
            if self.persistencia and self.persistencia.leer_perfil:
                leido = await self.persistencia.leer_perfil(conexion.usuario_id)
                if leido:
                    nombre, apariencia = leido
            if nombre:
                for c in self.conexiones:
                    if c.usuario_id == conexion.usuario_id:
                        c.nombre = nombre
                        if apariencia is not None:
                            c.apariencia = apariencia
                await self.a_todos(self.estado())

        elif tipo == "ping":
            await self.enviar(conexion, {"tipo": "pong", "ahora": ahora})

    # --- Pizarra ---

    async def _cambios_de_pizarra(self, conexion: Conexion, elementos) -> None:
        if self.pizarra is None or not isinstance(elementos, list):
            return
        aceptados = []
        for elemento in elementos[:MAX_ELEMENTOS_POR_MENSAJE]:
            if not elemento_valido(elemento):
                continue
            actual = self.pizarra.get(elemento["id"])
            if actual is None and len(self.pizarra) >= MAX_ELEMENTOS:
                continue
            if gana_el_nuevo(actual, elemento):
                self.pizarra[elemento["id"]] = elemento
                aceptados.append(elemento)
        if aceptados:
            await self.a_los_demas(conexion, {"tipo": "pizarra", "elementos": aceptados})
            self._programar_guardado()

    async def _imagen_de_pizarra(self, conexion: Conexion, archivo) -> None:
        if not imagen_valida(archivo) or archivo["id"] in self.imagenes or len(self.imagenes) >= MAX_IMAGENES:
            return
        self.imagenes.add(archivo["id"])
        imagen = {k: archivo[k] for k in ("id", "mimeType", "dataURL")} | {"created": int(time.time() * 1000)}
        if self.persistencia:
            await self.persistencia.guardar_imagen(self.codigo, imagen)
        await self.a_los_demas(conexion, {"tipo": "imagen", "archivo": imagen})

    def _programar_guardado(self) -> None:
        self._pizarra_sin_guardar = True
        if self._guardado and not self._guardado.done():
            self._guardado.cancel()
        self._guardado = asyncio.create_task(self._guardar_en_un_rato())

    async def _guardar_en_un_rato(self) -> None:
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.sleep(DEMORA_GUARDADO)
            await self.guardar_pizarra()

    async def guardar_pizarra(self) -> None:
        """Guarda ya la pizarra si tiene cambios (también se llama cuando se va el último)."""
        if self._pizarra_sin_guardar and self.pizarra is not None and self.persistencia:
            self._pizarra_sin_guardar = False
            await self.persistencia.guardar_pizarra(self.codigo, list(self.pizarra.values()))

    # --- Aviso de cambio de fase ---

    def cancelar_aviso(self, usuario_id: int | None = None) -> None:
        """Cancela el aviso de fin de fase de una persona (o de todas)."""
        for usuario in [usuario_id] if usuario_id is not None else list(self._avisos):
            tarea = self._avisos.pop(usuario, None)
            if tarea and not tarea.done():
                tarea.cancel()

    def programar_aviso(self, usuario_id: int) -> None:
        """Deja programado el aviso de fin de fase del pomodoro de esa persona."""
        self.cancelar_aviso(usuario_id)
        pomodoro = self.pomodoros.get(usuario_id)
        if pomodoro and pomodoro.corriendo and pomodoro.fin is not None:
            self._avisos[usuario_id] = asyncio.create_task(self._esperar_fin_de_fase(usuario_id, pomodoro.fin))

    async def _esperar_fin_de_fase(self, usuario_id: int, fin: float) -> None:
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.sleep(max(0.0, fin - time.time()) + 0.05)
            pomodoro = self.pomodoros.get(usuario_id)
            if pomodoro is None:
                return
            if pomodoro.actualizar(time.time()):
                await self.al_usuario(
                    usuario_id, self.estado(), {"tipo": "evento", "evento": "fase", "fase": pomodoro.fase}
                )
            self.programar_aviso(usuario_id)
            await self.premiar_bloques(usuario_id)

    # --- Trivia grupal ---

    def puede_preparar_trivia(self) -> bool:
        en_juego = self.trivia is not None and self.trivia.fase != "terminada"
        return not en_juego and self.preparando_trivia is None

    async def iniciar_trivia(self, trivia: Trivia) -> None:
        """Las preguntas están listas: se invita a todos los de la sala."""
        self.preparando_trivia = None
        self.trivia = trivia
        trivia.invitar(time.time())
        await self.a_todos(
            self.estado(),
            {"tipo": "evento", "evento": "trivia", "nombre": trivia.creador, "tema": trivia.tema, "para": trivia.rival},
        )
        self._programar_trivia()

    async def _trivia(self, conexion: Conexion, mensaje: dict, ahora: float) -> None:
        trivia = self.trivia
        if trivia is None:
            return
        accion = mensaje.get("accion")
        if accion == "unirme":
            cambio = trivia.unir(conexion.usuario_id, conexion.nombre)
        elif accion == "empezar":
            cambio = conexion.usuario_id == trivia.creador_id and trivia.empezar(ahora)
        elif accion == "responder":
            cambio = trivia.responder(conexion.usuario_id, mensaje.get("opcion"), ahora)
            if cambio:
                trivia.avanzar(ahora)  # si ya respondieron todos (o, en rápido, alguien acertó)
        elif accion == "cerrar":
            cambio = trivia.fase == "terminada" or conexion.usuario_id == trivia.creador_id
            if cambio:
                self.trivia = None
        else:
            return
        if cambio:
            await self._trivia_cambio()

    async def _trivia_cambio(self) -> None:
        trivia = self.trivia
        if trivia and trivia.fase == "terminada" and not trivia.premiada:
            trivia.premiada = True
            await self._premiar_trivia(trivia)
        await self.a_todos(self.estado())
        self._programar_trivia()

    def _programar_trivia(self) -> None:
        if self._reloj_trivia and not self._reloj_trivia.done():
            self._reloj_trivia.cancel()
        trivia = self.trivia
        if trivia and trivia.fase != "terminada":
            self._reloj_trivia = asyncio.create_task(self._esperar_trivia(trivia.id, trivia.fin))

    async def _esperar_trivia(self, trivia_id: str, fin: float) -> None:
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.sleep(max(0.0, fin - time.time()) + 0.05)
            trivia = self.trivia
            if trivia and trivia.id == trivia_id and trivia.avanzar(time.time()):
                await self._trivia_cambio()

    async def _premiar_trivia(self, trivia: Trivia) -> None:
        if not self.persistencia:
            return
        if self.persistencia.contar:
            ranking = trivia.ranking()
            for usuario_id, _ in ranking:
                await self.persistencia.contar(usuario_id, "trivias")
            if len(ranking) >= 2 and ranking[0][1].puntos > 0:
                await self.persistencia.contar(ranking[0][0], "victorias")
        if not self.persistencia.dar_monedas:
            return
        for usuario_id, monedas in trivia.premios().items():
            resultado = await self.persistencia.dar_monedas([usuario_id], "trivia", monedas)
            ganadas, total = resultado.get(usuario_id, (0, 0))
            if ganadas:
                await self.al_usuario(
                    usuario_id, {"tipo": "monedas", "ganadas": ganadas, "total": total, "motivo": "trivia"}
                )

    # --- Monedas por estudiar ---

    async def premiar_bloques(self, usuario_id: int) -> None:
        """Cuando alguien completa un bloque de estudio de su pomodoro, gana monedas (una vez por bloque).
        Tiene que haber estado en la sala al menos la mitad del bloque: así no se gana salteando."""
        pomodoro = self.pomodoros.get(usuario_id)
        if pomodoro is None or pomodoro.ciclos <= self._premiados.get(usuario_id, 0):
            return
        self._premiados[usuario_id] = pomodoro.ciclos
        if not self.persistencia or not self.persistencia.dar_monedas:
            return
        suyas = [c for c in self.conexiones if c.usuario_id == usuario_id]
        if not suyas or min(c.desde for c in suyas) > time.time() - pomodoro.estudio / 2:
            return
        cantidad = monedas_por_pomodoro(pomodoro.estudio / 60)
        resultado = await self.persistencia.dar_monedas([usuario_id], "pomodoro", cantidad)
        ganadas, total = resultado.get(usuario_id, (0, 0))
        if ganadas:
            await self.al_usuario(
                usuario_id, {"tipo": "monedas", "ganadas": ganadas, "total": total, "motivo": "pomodoro"}
            )


class Gestor:
    def __init__(self):
        self.salas: dict[str, SalaEnVivo] = {}

    def obtener(self, codigo: str) -> SalaEnVivo:
        return self.salas.setdefault(codigo, SalaEnVivo(codigo))

    def limpiar(self, codigo: str) -> None:
        """Cuando se va el último, la sala se olvida (el chat queda guardado en la base)."""
        sala = self.salas.get(codigo)
        if sala and not sala.conexiones:
            sala.cancelar_aviso()
            for tarea in (sala._guardado, sala._reloj_trivia):
                if tarea and not tarea.done():
                    tarea.cancel()
            del self.salas[codigo]

    def personas_en(self, codigo: str) -> int:
        sala = self.salas.get(codigo)
        return len(sala.conectados()) if sala else 0


gestor = Gestor()
