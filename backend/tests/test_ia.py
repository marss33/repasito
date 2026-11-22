from types import SimpleNamespace

import groq
import httpx
import pytest

from app import config
from app.ia import Contexto, ErrorIA, TutorIA, _elegir_parejo, _muestra


def error_api(codigo: int, mensaje: str = "error") -> groq.APIStatusError:
    clases = {
        400: groq.BadRequestError,
        401: groq.AuthenticationError,
        404: groq.NotFoundError,
        429: groq.RateLimitError,
    }
    clase = clases.get(codigo, groq.InternalServerError if codigo >= 500 else groq.APIStatusError)
    respuesta = httpx.Response(codigo, request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"))
    return clase(mensaje, response=respuesta, body=None)


def completado(texto: str):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=texto))])


def pedazo(texto: str | None):
    return SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=texto))])


class GroqFalso:
    """Imita `cliente.chat.completions.create`: cada modelo responde lo que se le configure.
    Una lista es una respuesta por llamada (para simular reintentos); una tupla son los pedazos
    de una respuesta en vivo."""

    def __init__(self, respuestas: dict):
        self.respuestas = {m: list(r) if isinstance(r, list) else [r] for m, r in respuestas.items()}
        self.pedidos: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, model, messages, stream=False, **opciones):
        self.pedidos.append({"model": model, "messages": messages, "stream": stream, **opciones})
        cola = self.respuestas[model]
        respuesta = cola.pop(0) if len(cola) > 1 else cola[0]
        if isinstance(respuesta, Exception):
            raise respuesta
        if stream:
            return iter([pedazo(None), *(pedazo(p) for p in respuesta)])
        return completado(respuesta)

    @property
    def modelos_usados(self):
        return [p["model"] for p in self.pedidos]


def tutor(respuestas: dict) -> tuple[TutorIA, GroqFalso]:
    cliente = GroqFalso(respuestas)
    return TutorIA(cliente=cliente, modelos=list(respuestas)), cliente


CONTEXTO = [Contexto("a.pdf", "pág. 1", "La mitosis es la division celular")]


def test_responde_con_citas():
    ia, cliente = tutor({"llama": "Es la división celular [1]."})
    respuesta = ia.responder("¿Qué es la mitosis?", CONTEXTO, [])
    assert respuesta.texto == "Es la división celular [1]."
    assert respuesta.fuentes[0]["ubicacion"] == "pág. 1"
    mensajes = cliente.pedidos[0]["messages"]
    assert mensajes[0]["role"] == "system"
    assert "La mitosis es la division celular" in mensajes[-1]["content"]


def test_si_se_agota_el_cupo_usa_el_modelo_siguiente():
    ia, cliente = tutor({"llama": error_api(429), "gpt-oss": "Respuesta [1]."})
    assert ia.responder("x", CONTEXTO, []).texto == "Respuesta [1]."
    assert cliente.modelos_usados == ["llama", "gpt-oss"]
    assert ia.llamadas == 1


def test_modelo_dado_de_baja_o_texto_muy_grande_pasa_al_siguiente():
    ia, cliente = tutor({"viejo": error_api(404), "chico": error_api(413), "bueno": "ok"})
    assert ia.responder("x", CONTEXTO, []).texto == "ok"
    assert cliente.modelos_usados == ["viejo", "chico", "bueno"]


def test_si_todos_fallan_el_error_es_claro():
    ia, _ = tutor({"llama": error_api(429), "gpt-oss": error_api(429)})
    with pytest.raises(ErrorIA, match="uso gratis"):
        ia.responder("x", CONTEXTO, [])


def test_api_key_invalida_no_prueba_otros_modelos():
    ia, cliente = tutor({"llama": error_api(401), "gpt-oss": "no debería llegar"})
    with pytest.raises(ErrorIA, match="API key de Groq"):
        ia.responder("x", CONTEXTO, [])
    assert cliente.modelos_usados == ["llama"]


def test_se_saca_el_razonamiento_de_los_modelos_que_piensan():
    ia, _ = tutor({"qwen": "<think>a ver...</think>\nEs la división celular [1]."})
    assert ia.responder("x", CONTEXTO, []).texto == "Es la división celular [1]."


def test_salida_json():
    ia, cliente = tutor({"llama": '{"tarjetas": [{"frente": "¿A?", "dorso": "B"}, {"frente": " ", "dorso": "vacía"}]}'})
    tarjetas = ia.generar_flashcards("a.pdf", "texto", 5)
    assert [(t.frente, t.dorso) for t in tarjetas] == [("¿A?", "B")]
    assert cliente.pedidos[0]["response_format"] == {"type": "json_object"}
    assert "JSON" in cliente.pedidos[0]["messages"][-1]["content"]


def test_json_mal_formado_se_reintenta_una_vez():
    ia, cliente = tutor({"llama": ["esto no es json", '{"tarjetas": [{"frente": "¿A?", "dorso": "B"}]}']})
    assert len(ia.generar_flashcards("a.pdf", "texto", 5)) == 1
    assert len(cliente.pedidos) == 2

    ia, _ = tutor({"llama": "nunca es json"})
    with pytest.raises(ErrorIA, match="formato inesperado"):
        ia.generar_flashcards("a.pdf", "texto", 5)


def test_json_rechazado_por_el_modelo_se_reintenta():
    ia, cliente = tutor({"llama": [error_api(400, "json_validate_failed"), '{"tarjetas": []}']})
    assert ia.generar_flashcards("a.pdf", "texto", 5) == []
    assert len(cliente.pedidos) == 2


def test_quiz_descarta_preguntas_invalidas():
    json_quiz = (
        '{"preguntas": ['
        '{"enunciado": "ok", "opciones": ["a", "b"], "correcta": 1, "explicacion": "e"},'
        '{"enunciado": "mal", "opciones": ["a", "b"], "correcta": 5, "explicacion": "e"}]}'
    )
    ia, _ = tutor({"llama": json_quiz})
    assert [p.enunciado for p in ia.generar_quiz(CONTEXTO, 5, None)] == ["ok"]


def test_resumen_corto_en_un_solo_pedido():
    ia, cliente = tutor({"llama": "# Resumen"})
    assert ia.resumir("a.pdf", "texto corto") == "# Resumen"
    assert len(cliente.pedidos) == 1


def test_resumen_de_documento_largo_por_partes(monkeypatch):
    monkeypatch.setattr(config, "TEXTO_POR_PEDIDO", 1000)
    texto = "\n\n".join(f"Parrafo {i}: " + "palabra " * 60 for i in range(40))  # ~20 partes
    ia, cliente = tutor({"llama": "- idea"})
    ia.resumir("largo.pdf", texto)
    # 6 partes repartidas por todo el documento + el resumen final
    assert len(cliente.pedidos) == 7
    primera, ultima = cliente.pedidos[0]["messages"][-1]["content"], cliente.pedidos[5]["messages"][-1]["content"]
    assert "Parrafo 0:" in primera
    assert "Parrafo 39:" in ultima
    assert "<notas" in cliente.pedidos[6]["messages"][-1]["content"]
    assert all(len(p["messages"][-1]["content"]) < 1600 for p in cliente.pedidos[:6])


def test_flashcards_de_documento_largo_usan_una_muestra_de_todo(monkeypatch):
    monkeypatch.setattr(config, "TEXTO_POR_PEDIDO", 2000)
    texto = "\n\n".join(f"Tema {i}: " + "x " * 100 for i in range(50))
    ia, cliente = tutor({"llama": '{"tarjetas": []}'})
    ia.generar_flashcards("largo.pdf", texto, 5)
    pedido = cliente.pedidos[0]["messages"][-1]["content"]
    assert "Tema 0:" in pedido and "Tema 49:" in pedido
    assert len(pedido) < 3000


def test_en_vivo():
    ia, cliente = tutor({"llama": ("Hola", " mundo")})
    assert "".join(ia.responder_en_vivo("x", CONTEXTO, [])) == "Hola mundo"
    assert cliente.pedidos[0]["stream"] is True


def test_en_vivo_cambia_de_modelo_si_no_hay_cupo():
    ia, cliente = tutor({"llama": error_api(429), "gpt-oss": ("Hola",)})
    assert "".join(ia.responder_en_vivo("x", CONTEXTO, [])) == "Hola"
    assert cliente.modelos_usados == ["llama", "gpt-oss"]


def test_en_vivo_sin_texto():
    ia, _ = tutor({"llama": ()})
    with pytest.raises(ErrorIA, match="no devolvió"):
        list(ia.responder_en_vivo("x", CONTEXTO, []))


def test_responde_en_el_idioma_elegido():
    ia, cliente = tutor({"llama": "It's cell division [1]."})
    ia.idioma = "en"
    ia.responder("What is mitosis?", CONTEXTO, [])
    assert "Always answer in English" in cliente.pedidos[0]["messages"][0]["content"]

    ia, cliente = tutor({"llama": "# Summary"})
    ia.idioma = "en"
    ia.resumir("a.pdf", "texto")
    pedido = cliente.pedidos[0]["messages"]
    assert "Always answer in English" in pedido[0]["content"]
    assert "Key takeaways" in pedido[1]["content"]


def test_idioma_invalido_usa_espanol():
    assert TutorIA(idioma="fr").idioma == "es"


def test_en_vivo_esconde_el_razonamiento_aunque_venga_partido():
    pedazos = ("<thi", "nk>pienso", " mucho</th", "ink>\nLa mitosis", " divide <b>la</b> célula [1] <", "3")
    ia, _ = tutor({"qwen": pedazos})
    assert "".join(ia.responder_en_vivo("x", CONTEXTO, [])) == "La mitosis divide <b>la</b> célula [1] <3"


def test_gpt_oss_piensa_poco_y_los_demas_no_reciben_el_parametro():
    ia, cliente = tutor({"openai/gpt-oss-120b": error_api(429), "qwen/qwen3.8-27b": "ok"})
    ia.responder("x", CONTEXTO, [])
    assert cliente.pedidos[0]["reasoning_effort"] == "low"
    assert "reasoning_effort" not in cliente.pedidos[1]


def test_sin_api_key():
    with pytest.raises(ErrorIA, match="GROQ_API_KEY"):
        TutorIA().responder("x", CONTEXTO, [])


def test_historial_sin_marcas_de_citas_viejas():
    ia, cliente = tutor({"llama": "ok"})
    ia.responder("¿y eso?", CONTEXTO, [("user", "¿Qué es?"), ("assistant", "Es la división [1][2].")])
    assert cliente.pedidos[0]["messages"][2] == {"role": "assistant", "content": "Es la división."}


def test_elegir_parejo_y_muestra():
    assert _elegir_parejo(list("abcdefghij"), 3) == ["a", "e", "j"]
    assert _elegir_parejo(["a", "b"], 5) == ["a", "b"]
    assert _muestra("corto", 100) == "corto"
