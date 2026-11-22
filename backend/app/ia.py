"""Todo lo que habla con la IA: modelos open source (gpt-oss, Qwen) en el plan gratis de Groq."""

import logging
import re
from collections.abc import Iterator
from dataclasses import dataclass, field

import groq
from pydantic import BaseModel, ValidationError

from . import config
from .extraccion import partir
from .idioma import ErrorTraducible

log = logging.getLogger(__name__)


class ErrorIA(ErrorTraducible):
    pass


# --- Formatos de salida estructurada ---


class Tarjeta(BaseModel):
    frente: str
    dorso: str


class Tarjetas(BaseModel):
    tarjetas: list[Tarjeta]


class Pregunta(BaseModel):
    enunciado: str
    opciones: list[str]
    correcta: int
    explicacion: str


class Quiz(BaseModel):
    preguntas: list[Pregunta]


EJEMPLO_TARJETAS = '{"tarjetas": [{"frente": "pregunta", "dorso": "respuesta"}]}'
EJEMPLO_QUIZ = (
    '{"preguntas": [{"enunciado": "pregunta", "opciones": ["A", "B", "C", "D"], '
    '"correcta": 0, "explicacion": "por qué"}]}'
)


@dataclass
class Contexto:
    """Un fragmento de apunte que se le pasa a la IA."""

    documento: str
    ubicacion: str  # "pág. 3", "diap. 2", "" si el documento no tiene partes
    texto: str


@dataclass
class Respuesta:
    texto: str
    fuentes: list[dict] = field(default_factory=list)


# Las instrucciones están en español; esta línea define en qué idioma responde la IA
RESPONDER_EN = {
    "es": "Respondé siempre en español.",
    "en": "Always answer in English, even if the notes are in Spanish or another language.",
}
SECCION_FINAL = {"es": "Lo que no te podés olvidar", "en": "Key takeaways"}

SISTEMA_CHAT = """Sos un tutor que ayuda a un estudiante universitario a estudiar con sus propios apuntes.
Los fragmentos de los apuntes vienen numerados dentro de <apuntes>.

- {idioma} Explicá de forma clara y ordenada.
- Basate solo en los fragmentos. Si la respuesta no está ahí, decilo y sugerí qué buscar; no inventes.
- Cuando uses información de un fragmento, poné su número entre corchetes al final de la oración, \
por ejemplo [2] o [1][3]. Usá solo números de fragmentos que existan.
- Si sirve, sumá un ejemplo corto o una analogía para que se entienda mejor.
- Usá Markdown simple (negrita, listas, tablas) cuando ayude a leer. No uses etiquetas HTML como <br>.
- Si los fragmentos están cortados o mal leídos (por ejemplo, de una foto), no completes datos ni \
resultados por tu cuenta: decí qué parte no se entiende.
- Escribí las fórmulas en LaTeX: $...$ dentro del texto y $$...$$ en un renglón aparte \
(no uses \\( \\) ni \\[ \\])."""

SISTEMA_GENERAR = """Sos un profesor que prepara material de estudio a partir de los apuntes de un estudiante \
universitario. {idioma} Basate únicamente en el contenido de los apuntes. \
Si hay fórmulas, escribilas en LaTeX entre $...$ o $$...$$ (no uses \\( \\) ni \\[ \\]). \
No uses etiquetas HTML como <br>. \
Los apuntes pueden venir de fotos leídas automáticamente y tener errores de lectura: corregí solo los \
evidentes y, si una parte no se entiende, decilo en vez de inventar datos, números o resultados."""

# Hasta cuántas partes se leen para resumir un documento largo
MAX_PARTES_RESUMEN = 6


def _traducir_error(e: Exception) -> ErrorIA:
    if isinstance(e, ErrorIA):
        return e
    if isinstance(e, groq.AuthenticationError | groq.PermissionDeniedError):
        return ErrorIA("ia_key_invalida")
    if isinstance(e, groq.RateLimitError):
        return ErrorIA("ia_sin_cupo")
    if isinstance(e, groq.APIStatusError):
        if e.status_code == 413:
            return ErrorIA("ia_texto_largo")
        if e.status_code >= 500:
            return ErrorIA("ia_no_disponible")
        log.warning("Groq rechazó el pedido: %s", e)
        return ErrorIA("ia_rechazo", codigo=e.status_code)
    if isinstance(e, groq.APIConnectionError):
        return ErrorIA("ia_sin_conexion")
    log.error("Error llamando a Groq", exc_info=e)
    return ErrorIA("ia_sin_conexion")


def _probar_otro_modelo(e: Exception) -> bool:
    """Errores en los que conviene pasar al siguiente modelo: cupo agotado, texto demasiado grande
    para ese modelo, modelo dado de baja o servicio caído."""
    if not isinstance(e, groq.APIStatusError):
        return False
    return e.status_code in (404, 413, 429, 500, 502, 503) or "decommission" in str(e)


def _sin_razonamiento(texto: str) -> str:
    # Algunos modelos open source (como Qwen) escriben su razonamiento entre <think>...</think>
    return re.sub(r"<think>.*?</think>", "", texto, flags=re.DOTALL).strip()


class FiltroRazonamiento:
    """Saca el <think>...</think> de una respuesta que llega en pedazos.
    Las etiquetas pueden venir partidas entre dos pedazos ("<thi" + "nk>"), así que se guarda
    el final de cada pedazo hasta saber si es el comienzo de una etiqueta."""

    ABRE, CIERRA = "<think>", "</think>"

    def __init__(self):
        self.pendiente = ""
        self.adentro = False

    def pasar(self, texto: str) -> str:
        self.pendiente += texto
        salida = []
        while True:
            if self.adentro:
                fin = self.pendiente.find(self.CIERRA)
                if fin == -1:
                    self.pendiente = self.pendiente[-(len(self.CIERRA) - 1) :]  # por si la etiqueta viene partida
                    break
                self.pendiente = self.pendiente[fin + len(self.CIERRA) :].lstrip()
                self.adentro = False
            else:
                inicio = self.pendiente.find(self.ABRE)
                if inicio == -1:
                    guardar = _prefijo_al_final(self.pendiente, self.ABRE)
                    salida.append(self.pendiente[: len(self.pendiente) - guardar])
                    self.pendiente = self.pendiente[len(self.pendiente) - guardar :]
                    break
                salida.append(self.pendiente[:inicio])
                self.pendiente = self.pendiente[inicio + len(self.ABRE) :]
                self.adentro = True
        return "".join(salida)

    def terminar(self) -> str:
        resto = "" if self.adentro else self.pendiente
        self.pendiente = ""
        return resto


def _prefijo_al_final(texto: str, etiqueta: str) -> int:
    """Cuántos caracteres del final de `texto` podrían ser el comienzo de `etiqueta`."""
    for largo in range(min(len(etiqueta) - 1, len(texto)), 0, -1):
        if texto.endswith(etiqueta[:largo]):
            return largo
    return 0


class TutorIA:
    def __init__(self, cliente: groq.Groq | None = None, modelos: list[str] | None = None, idioma: str = "es"):
        self._cliente = cliente
        self.modelos = modelos or config.MODELOS
        self.idioma = idioma if idioma in RESPONDER_EN else "es"
        self.llamadas = 0

    @property
    def cliente(self) -> groq.Groq:
        if self._cliente is None:
            if not config.hay_api_key():
                raise ErrorIA("ia_sin_configurar")
            self._cliente = groq.Groq(api_key=config.GROQ_API_KEY, max_retries=1, timeout=90)
        return self._cliente

    @property
    def _sistema_generar(self) -> str:
        return SISTEMA_GENERAR.format(idioma=RESPONDER_EN[self.idioma])

    def _pedir(self, mensajes: list[dict], max_tokens: int, json: bool = False, stream: bool = False):
        """Hace el pedido probando los modelos en orden. Devuelve la respuesta del primero que funcione."""
        cliente = self.cliente
        self.llamadas += 1
        opciones = {"messages": mensajes, "temperature": 0.4, "max_completion_tokens": max_tokens, "stream": stream}
        if json:
            opciones["response_format"] = {"type": "json_object"}
        for i, modelo in enumerate(self.modelos):
            # gpt-oss piensa antes de responder: con "low" contesta mucho más rápido y alcanza para estudiar
            extra = {"reasoning_effort": "low"} if modelo.startswith("openai/gpt-oss") else {}
            try:
                return cliente.chat.completions.create(model=modelo, **opciones, **extra)
            except Exception as e:
                if _probar_otro_modelo(e) and i + 1 < len(self.modelos):
                    log.info("Modelo %s no disponible (%s), pruebo el siguiente", modelo, getattr(e, "status_code", ""))
                    continue
                raise _traducir_error(e) from e
        raise ErrorIA("ia_sin_modelos")

    def _generar(self, pedido: str, max_tokens: int = 2500) -> str:
        mensajes = [{"role": "system", "content": self._sistema_generar}, {"role": "user", "content": pedido}]
        texto = _sin_razonamiento(self._pedir(mensajes, max_tokens).choices[0].message.content or "")
        if not texto:
            raise ErrorIA("ia_sin_respuesta")
        return texto

    def _generar_json[T: BaseModel](self, pedido: str, esquema: type[T], ejemplo: str, max_tokens: int = 3000) -> T:
        mensajes = [
            {"role": "system", "content": self._sistema_generar},
            {
                "role": "user",
                "content": f"{pedido}\n\nRespondé solo con un objeto JSON válido con esta forma:\n{ejemplo}",
            },
        ]
        for _ in range(2):  # si el modelo devuelve algo mal formado, se reintenta una vez
            try:
                respuesta = self._pedir(mensajes, max_tokens, json=True)
                return esquema.model_validate_json(_sin_razonamiento(respuesta.choices[0].message.content or ""))
            except ValidationError:
                continue
            except ErrorIA as e:
                if e.clave != "ia_rechazo" or e.datos.get("codigo") != 400:  # 400 = no logró armar el JSON
                    raise
        raise ErrorIA("ia_formato")

    # --- Chat con citas ---

    def _mensajes_chat(self, pregunta: str, contexto: list[Contexto], historial: list[tuple[str, str]]) -> list[dict]:
        if contexto:
            apuntes = "\n\n".join(
                f'<fragmento numero="{i}" fuente="{c.documento}{", " + c.ubicacion if c.ubicacion else ""}">\n'
                f"{c.texto}\n</fragmento>"
                for i, c in enumerate(contexto, start=1)
            )
        else:
            apuntes = "(No se encontraron fragmentos de los apuntes relacionados con esta pregunta.)"

        mensajes = [{"role": "system", "content": SISTEMA_CHAT.format(idioma=RESPONDER_EN[self.idioma])}]
        # Las marcas [n] viejas apuntaban a otros fragmentos: se sacan para no confundir
        mensajes += [{"role": rol, "content": _sin_citas(texto)} for rol, texto in historial]
        mensajes.append({"role": "user", "content": f"<apuntes>\n{apuntes}\n</apuntes>\n\nPregunta: {pregunta}"})
        return mensajes

    def responder(self, pregunta: str, contexto: list[Contexto], historial: list[tuple[str, str]]) -> Respuesta:
        respuesta = self._pedir(self._mensajes_chat(pregunta, contexto, historial), max_tokens=1500)
        texto = _sin_razonamiento(respuesta.choices[0].message.content or "")
        if not texto:
            raise ErrorIA("ia_sin_respuesta")
        return renumerar_citas(texto, contexto)

    def responder_en_vivo(
        self, pregunta: str, contexto: list[Contexto], historial: list[tuple[str, str]]
    ) -> Iterator[str]:
        """Devuelve la respuesta en pedazos, a medida que la IA la escribe.
        Las citas se renumeran al final con `renumerar_citas`."""
        flujo = self._pedir(self._mensajes_chat(pregunta, contexto, historial), max_tokens=1500, stream=True)
        filtro = FiltroRazonamiento()
        escribio = False
        try:
            for pedazo in flujo:
                texto = filtro.pasar((pedazo.choices[0].delta.content or "") if pedazo.choices else "")
                if texto:
                    escribio = True
                    yield texto
        except Exception as e:
            raise _traducir_error(e) from e
        if resto := filtro.terminar():
            escribio = True
            yield resto
        if not escribio:
            raise ErrorIA("ia_sin_respuesta")

    # --- Generación de material ---

    def resumir(self, nombre: str, texto: str) -> str:
        pedido_final = (
            "Hacé un resumen para estudiar. Usá Markdown con títulos por tema, listas con las ideas clave y en "
            f"negrita los conceptos importantes. Cerrá con una sección corta titulada '{SECCION_FINAL[self.idioma]}'."
        )
        if len(texto) <= config.TEXTO_POR_PEDIDO:
            return self._generar(f"{_documento(nombre, texto)}\n\n{pedido_final}")

        # Documento largo: primero se anotan las ideas de cada parte y después se resume todo junto
        partes = _elegir_parejo(partir(texto, config.TEXTO_POR_PEDIDO), MAX_PARTES_RESUMEN)
        notas = []
        for i, parte in enumerate(partes, start=1):
            pedido = (
                f'<parte numero="{i}" de="{len(partes)}" documento="{nombre}">\n{parte}\n</parte>\n\n'
                "Anotá en una lista breve las ideas, definiciones y fórmulas clave de esta parte."
            )
            notas.append(self._generar(pedido, max_tokens=800))
        juntas = "\n\n".join(f"Parte {i}:\n{n}" for i, n in enumerate(notas, start=1))
        return self._generar(f'<notas documento="{nombre}">\n{juntas}\n</notas>\n\nCon estas notas: {pedido_final}')

    def generar_flashcards(self, nombre: str, texto: str, cantidad: int) -> list[Tarjeta]:
        pedido = (
            f"{_documento(nombre, _muestra(texto, config.TEXTO_POR_PEDIDO))}\n\n"
            f"Creá {cantidad} flashcards sobre los conceptos más importantes, repartidas por todo el documento. "
            "El frente es una pregunta concreta y el dorso una respuesta corta (1 a 3 oraciones). "
            "Evitá preguntas de sí o no y no repitas conceptos."
        )
        tarjetas = self._generar_json(pedido, Tarjetas, EJEMPLO_TARJETAS).tarjetas
        return [t for t in tarjetas if t.frente.strip() and t.dorso.strip()][:cantidad]

    def generar_quiz(self, contexto: list[Contexto], cantidad: int, tema: str | None) -> list[Pregunta]:
        apuntes = "\n\n".join(f"--- {c.documento} {c.ubicacion} ---\n{c.texto}" for c in contexto)
        enfoque = f" enfocadas en: {tema}" if tema else ""
        pedido = (
            f"<apuntes>\n{_muestra(apuntes, config.TEXTO_POR_PEDIDO)}\n</apuntes>\n\n"
            f"Creá {cantidad} preguntas de opción múltiple{enfoque}. Cada una con 4 opciones, una sola correcta "
            "(`correcta` es el índice de la correcta, empezando en 0) y opciones incorrectas creíbles. "
            "En `explicacion` contá por qué la correcta es la correcta."
        )
        preguntas = self._generar_json(pedido, Quiz, EJEMPLO_QUIZ).preguntas
        validas = [p for p in preguntas if len(p.opciones) >= 2 and 0 <= p.correcta < len(p.opciones)]
        if not validas:
            raise ErrorIA("ia_sin_preguntas")
        return validas[:cantidad]


def _documento(nombre: str, texto: str) -> str:
    return f'<documento nombre="{nombre}">\n{texto}\n</documento>'


def _elegir_parejo(elementos: list[str], cantidad: int) -> list[str]:
    """Elige `cantidad` elementos repartidos de forma pareja (principio, medio y final)."""
    if len(elementos) <= cantidad:
        return elementos
    if cantidad == 1:
        return [elementos[0]]
    return [elementos[round(i * (len(elementos) - 1) / (cantidad - 1))] for i in range(cantidad)]


def _muestra(texto: str, maximo: int) -> str:
    """Si el texto es más largo que `maximo`, toma pedazos de todo el documento en vez de solo el principio."""
    if len(texto) <= maximo:
        return texto
    pedazos = _elegir_parejo(partir(texto, maximo // 4), 4)
    return "\n\n[...]\n\n".join(p[: maximo // 4] for p in pedazos)


def _recortar(texto: str, largo: int = 220) -> str:
    texto = " ".join(texto.split())
    if len(texto) <= largo:
        return texto
    return texto[: texto.rfind(" ", 0, largo)] + "…"


# No cuenta si está pegado a una palabra o comando, como en LaTeX: \sqrt[3]{x}
_CITA = re.compile(r"(?<![A-Za-z\\])\[(\d+(?:\s*[,;]\s*\d+)*)\]")


def _limpiar_espacios(texto: str) -> str:
    return re.sub(r"[ \t]+([.,;:])", r"\1", texto)  # espacios que quedan antes de un punto al sacar marcas


def _normalizar_citas(texto: str) -> str:
    """Algunos modelos citan con 【1】 o 【1†fuente】: se pasa al formato [1]."""
    # Con un espacio adelante: suelen venir pegadas a la palabra ("round【2】")
    return re.sub(r"\s*【(\d+)[^】]*】", r" [\1]", texto)


def _sin_citas(texto: str) -> str:
    return _limpiar_espacios(_CITA.sub("", _normalizar_citas(texto)))


def renumerar_citas(texto: str, contexto: list[Contexto]) -> Respuesta:
    """Pasa las marcas [n] de la IA (número de fragmento) a fuentes numeradas 1, 2, 3...
    en orden de aparición, y descarta las que apuntan a fragmentos que no existen."""
    texto = _normalizar_citas(_sin_razonamiento(texto))
    numero_nuevo: dict[int, int] = {}
    fuentes: list[dict] = []

    def reemplazar(marca: re.Match) -> str:
        salida: list[int] = []
        for numero in (int(n) for n in re.split(r"[,;]", marca.group(1))):
            if not 1 <= numero <= len(contexto):
                continue
            if numero not in numero_nuevo:
                numero_nuevo[numero] = len(fuentes) + 1
                fragmento = contexto[numero - 1]
                fuentes.append(
                    {
                        "n": numero_nuevo[numero],
                        "documento": fragmento.documento,
                        "ubicacion": fragmento.ubicacion,
                        "cita": _recortar(fragmento.texto),
                    }
                )
            if numero_nuevo[numero] not in salida:
                salida.append(numero_nuevo[numero])
        return "".join(f"[{n}]" for n in salida)

    texto = _CITA.sub(reemplazar, texto)
    texto = re.sub(r"(\[\d+\])\1+", r"\1", texto)  # [1][1] -> [1]
    return Respuesta(texto=_limpiar_espacios(texto).strip(), fuentes=fuentes)
