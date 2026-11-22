import pytest
from fastapi.testclient import TestClient

from app import trivia as modulo
from app.main import app
from app.trivia import Trivia

from .conftest import registrar
from .test_salas import cookie, recibir

T0 = 1_000_000.0


def juego_de(ws) -> dict:
    """La trivia del próximo estado que la tenga (los de antes de armarla llegan sin trivia)."""
    while (juego := recibir(ws, "estado")["trivia"]) is None:
        pass
    return juego


def preguntas(n=3):
    return [
        {"enunciado": f"P{i}", "opciones": ["a", "b", "c", "d"], "correcta": 0, "explicacion": ""} for i in range(n)
    ]


def test_partida_completa_puntos_por_velocidad_y_premios():
    t = Trivia("Células", 1, "Ana", preguntas(2))
    t.invitar(T0)
    assert (t.fase, list(t.jugadores)) == ("invitando", [1])
    assert t.unir(2, "Beto") and not t.unir(2, "Beto")
    assert t.a_dict()["pregunta"] is None

    assert t.empezar(T0 + 5) and t.fase == "pregunta"
    vista = t.a_dict()["pregunta"]
    assert vista["enunciado"] == "P0" and vista["correcta"] is None  # no se ve la respuesta antes de tiempo
    assert t.responder(1, 0, T0 + 5)  # al instante: 1000 puntos
    assert not t.responder(1, 1, T0 + 6)  # no se cambia la respuesta
    assert t.responder(2, 3, T0 + 6)  # incorrecta
    assert t.todos_respondieron() and t.avanzar(T0 + 6)
    assert t.fase == "revelando" and t.a_dict()["pregunta"]["correcta"] == 0
    assert [(j["nombre"], j["acerto"]) for j in t.a_dict()["jugadores"]] == [("Ana", True), ("Beto", False)]

    assert not t.avanzar(T0 + 7)  # sigue mostrando la respuesta
    assert t.avanzar(T0 + 6 + modulo.SEG_REVELAR) and (t.fase, t.indice) == ("pregunta", 1)
    t.responder(2, 0, t.fin - modulo.SEG_PREGUNTA / 2)  # a mitad de tiempo: 750
    assert t.avanzar(t.fin)  # se terminó el tiempo aunque Ana no respondió
    t.avanzar(t.fin)
    assert t.fase == "terminada"
    assert [(j["nombre"], j["puntos"]) for j in t.a_dict()["jugadores"]] == [("Ana", 1000), ("Beto", 750)]
    assert t.premios() == {1: 30 + 2, 2: 20 + 2}


def test_jugando_solo_no_hay_podio_y_la_invitacion_vence():
    t = Trivia("Solo", 1, "Ana", preguntas(1))
    t.invitar(T0)
    assert t.avanzar(T0 + modulo.SEG_INVITACION) and t.fase == "pregunta"
    t.responder(1, 0, T0 + modulo.SEG_INVITACION)
    assert t.premios() == {1: modulo.POR_ACIERTO}
    assert not t.responder(1, 9, T0)  # opción inválida


def test_trivia_en_la_sala(cliente, monkeypatch):
    monkeypatch.setattr(modulo, "SEG_REVELAR", 0.05)
    codigo = cliente.post("/api/salas", json={"nombre": "Repaso"}).json()["codigo"]
    with TestClient(app) as otro, TestClient(app) as tiempo_real:
        registrar(otro, "beto@mail.com", "Beto")
        with (
            tiempo_real.websocket_connect(f"/api/salas/{codigo}/ws", headers=cookie(cliente)) as ana,
            tiempo_real.websocket_connect(f"/api/salas/{codigo}/ws", headers=cookie(otro)) as beto,
        ):
            recibir(ana, "estado")
            recibir(beto, "estado")
            url = f"/api/salas/{codigo}/trivia"
            # Sin archivos no se puede
            assert tiempo_real.post(url, data={"tema": "x"}, headers=cookie(cliente)).status_code == 422
            r = tiempo_real.post(
                url,
                data={"tema": "Mitosis"},
                files=[("archivos", ("celulas.txt", "La mitosis divide una célula en dos.".encode(), "text/plain"))],
                headers=cookie(cliente),
            )
            assert r.status_code == 202

            # A Beto le llega la invitación
            # (el estado con la trivia llega justo antes del aviso)
            juego = None
            while (m := beto.receive_json()).get("evento") != "trivia":
                if m["tipo"] == "estado":
                    juego = m["trivia"]
            assert (m["nombre"], m["tema"]) == ("Ana", "Mitosis")
            assert (juego["fase"], juego["total"]) == ("invitando", 8)
            assert [j["nombre"] for j in juego["jugadores"]] == ["Ana"]
            # Mientras se juega no se puede armar otra
            assert (
                tiempo_real.post(
                    url, files=[("archivos", ("b.txt", b"texto", "text/plain"))], headers=cookie(cliente)
                ).status_code
                == 409
            )

            beto.send_json({"tipo": "trivia", "accion": "unirme"})
            beto.send_json({"tipo": "trivia", "accion": "empezar"})  # solo puede la que la creó
            ana.send_json({"tipo": "trivia", "accion": "empezar"})
            for i in range(8):
                for ws in (ana, beto):
                    while (j := juego_de(ws))["fase"] != "pregunta" or j["indice"] != i:
                        pass
                ana.send_json({"tipo": "trivia", "accion": "responder", "opcion": 0})
                beto.send_json({"tipo": "trivia", "accion": "responder", "opcion": 1})

            # Al terminar, a Ana le llegan sus monedas y el ranking final
            monedas = final = None
            while final is None or final["fase"] != "terminada":
                m = ana.receive_json()
                if m["tipo"] == "monedas":
                    monedas = m
                elif m["tipo"] == "estado":
                    final = m["trivia"]
            assert [(j["nombre"], j["aciertos"]) for j in final["jugadores"]] == [("Ana", 8), ("Beto", 0)]
            assert (monedas["motivo"], monedas["ganadas"]) == ("trivia", 30 + 8 * 2)

            ana.send_json({"tipo": "trivia", "accion": "cerrar"})
            assert recibir(ana, "estado")["trivia"] is None

    # La trivia gastó un uso de IA de Ana
    assert cliente.get("/api/auth/yo").json()["usos_hoy"] == 1


@pytest.mark.parametrize("cantidad", [0, 4])
def test_trivia_pide_entre_uno_y_tres_archivos(cliente, cantidad):
    codigo = cliente.post("/api/salas", json={"nombre": "Repaso"}).json()["codigo"]
    with TestClient(app) as tiempo_real:
        with tiempo_real.websocket_connect(f"/api/salas/{codigo}/ws", headers=cookie(cliente)) as ws:
            recibir(ws, "estado")
            archivos = [("archivos", (f"{i}.txt", b"texto", "text/plain")) for i in range(cantidad)]
            r = tiempo_real.post(f"/api/salas/{codigo}/trivia", files=archivos or None, headers=cookie(cliente))
            assert r.status_code in (400, 422)
