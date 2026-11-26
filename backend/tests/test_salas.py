import asyncio
import time

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.salas import Conexion, Pomodoro, SalaEnVivo, generar_codigo

from .conftest import registrar

T0 = 1_000_000.0


# --- Pomodoro ---


def test_pomodoro_inicia_pausa_y_sigue_donde_quedo():
    p = Pomodoro()
    p.iniciar(T0)
    assert p.fin == T0 + 25 * 60
    p.pausar(T0 + 60)
    assert (p.corriendo, p.restante) == (False, 24 * 60)
    p.iniciar(T0 + 1000)
    assert p.fin == T0 + 1000 + 24 * 60


def test_pomodoro_cambia_de_fase_solo_y_cuenta_ciclos():
    p = Pomodoro()
    p.iniciar(T0)
    assert p.actualizar(T0 + 25 * 60 + 1)
    assert (p.fase, p.ciclos) == ("descanso", 1)
    # Si nadie miró durante un rato largo, avanza varias fases de una
    p.actualizar(T0 + 2 * 30 * 60 + 10)
    assert (p.fase, p.ciclos) == ("estudio", 2)


def test_pomodoro_saltar_reiniciar_y_configurar():
    p = Pomodoro()
    p.iniciar(T0)
    p.saltar(T0 + 10)
    assert (p.fase, p.ciclos, p.fin) == ("descanso", 0, T0 + 10 + 5 * 60)
    p.reiniciar()
    assert (p.fase, p.corriendo, p.restante) == ("estudio", False, 25 * 60)
    p.configurar(50, 10)
    assert (p.estudio, p.descanso, p.restante) == (50 * 60, 10 * 60, 50 * 60)
    p.configurar(500, 0)  # fuera de rango: se ajusta
    assert (p.estudio, p.descanso) == (90 * 60, 60)


def test_codigos():
    codigo = generar_codigo()
    assert len(codigo) == 6 and codigo.isupper()
    assert not set(codigo) & set("0O1IL")


def test_aviso_de_fin_de_fase_llega_a_todos():
    class WSFalso:
        def __init__(self):
            self.recibido = []

        async def send_json(self, mensaje):
            self.recibido.append(mensaje)

    async def escenario():
        sala = SalaEnVivo("ABC123")
        ws = WSFalso()
        sala.conexiones.append(Conexion(ws, 1, "Ana"))
        sala.pomodoro_de(1).corriendo = True
        sala.pomodoro_de(1).fin = time.time() + 0.1
        sala.programar_aviso(1)
        await asyncio.sleep(0.4)
        sala.cancelar_aviso()
        return ws.recibido

    recibido = asyncio.run(escenario())
    assert {"tipo": "evento", "evento": "fase", "fase": "descanso"} in recibido


# --- API ---


def test_crear_listar_y_ver_sala(cliente):
    r = cliente.post("/api/salas", json={"nombre": "Parcial de Álgebra"})
    assert r.status_code == 201
    codigo = r.json()["codigo"]
    assert [s["nombre"] for s in cliente.get("/api/salas").json()] == ["Parcial de Álgebra"]

    r = cliente.get(f"/api/salas/{codigo.lower()}")  # el código no distingue mayúsculas
    assert (r.status_code, r.json()["mensajes"], r.json()["personas"]) == (200, [], 0)
    assert cliente.get("/api/salas/ZZZZZZ").status_code == 404
    assert cliente.post("/api/salas", json={"nombre": "  "}).status_code == 422


def test_sin_sesion_no_se_puede_crear(anonimo):
    assert anonimo.post("/api/salas", json={"nombre": "x"}).status_code == 401


# --- Tiempo real ---


def cookie(cliente) -> dict:
    return {"cookie": f"repaso_sesion={cliente.cookies.get('repaso_sesion')}"}


# Todas las conexiones de un mismo test tienen que ir por un mismo TestClient: cada uno corre su propio
# event loop, y en el servidor real hay uno solo compartido por todas las salas.


def recibir(ws, tipo: str) -> dict:
    """Lee mensajes hasta encontrar uno del tipo pedido."""
    for _ in range(20):
        mensaje = ws.receive_json()
        if mensaje["tipo"] == tipo:
            return mensaje
    raise AssertionError(f"No llegó un mensaje de tipo {tipo}")


def test_dos_personas_en_la_misma_sala(cliente):
    codigo = cliente.post("/api/salas", json={"nombre": "Biblioteca"}).json()["codigo"]
    url = f"/api/salas/{codigo}/ws"
    with TestClient(app) as otro, TestClient(app) as tiempo_real:
        registrar(otro, "beto@mail.com", "Beto")

        with tiempo_real.websocket_connect(url, headers=cookie(cliente)) as ana:
            conectados = recibir(ana, "estado")["conectados"]
            assert [p["nombre"] for p in conectados] == ["Ana"]
            # Cada uno llega con su mascota y su foto, para dibujarlos en la biblioteca
            apariencia = conectados[0]["apariencia"]
            assert apariencia["foto"] == 0 and apariencia["mascota"] and apariencia["peinado"] and apariencia["piel"]

            with tiempo_real.websocket_connect(url, headers=cookie(otro)) as beto:
                assert recibir(ana, "evento") == {"tipo": "evento", "evento": "entro", "nombre": "Ana"}
                estado = recibir(ana, "estado")
                assert sorted(p["nombre"] for p in estado["conectados"]) == ["Ana", "Beto"]
                recibir(beto, "estado")

                # Chat
                beto.send_json({"tipo": "chat", "texto": "¿Arrancamos?"})
                mensaje = recibir(ana, "chat")["mensaje"]
                assert (mensaje["nombre"], mensaje["texto"]) == ("Beto", "¿Arrancamos?")

                # El pomodoro es personal: Ana inicia el suyo y el de Beto sigue quieto
                ana.send_json({"tipo": "pomodoro", "accion": "iniciar"})
                assert recibir(ana, "estado")["pomodoro"]["corriendo"] is True
                beto.send_json({"tipo": "ping"})
                assert recibir(beto, "pong")["tipo"] == "pong"  # a Beto no le llegó ningún estado nuevo

                # El clima de la ventana y el lugar se cambian para todos; lo que no existe se ignora
                ana.send_json({"tipo": "clima", "clima": "nieve"})
                ana.send_json({"tipo": "clima", "clima": "tornado"})
                ana.send_json({"tipo": "escena", "escena": "cafeteria"})
                estado = recibir(beto, "estado")
                while estado["escena"] != "cafeteria":
                    estado = recibir(beto, "estado")
                assert estado["clima"] == "nieve"

                # Beto se cambia el nombre y Ana lo ve con el nombre nuevo
                otro.put("/api/auth/perfil", json={"nombre": "Beto el Grande"})  # lo guarda y después avisa
                beto.send_json({"tipo": "perfil"})
                estado = recibir(ana, "estado")
                while "Beto el Grande" not in [p["nombre"] for p in estado["conectados"]]:
                    estado = recibir(ana, "estado")

                # Mensajes basura no rompen nada
                beto.send_text("esto no es json")
                beto.send_json({"tipo": "cualquiera"})
                beto.send_json({"tipo": "ping"})
                assert recibir(beto, "pong")["tipo"] == "pong"

            assert recibir(ana, "evento")["evento"] in ("salio", "pomodoro")

    # El chat queda guardado y la sala figura en las recientes de los dos
    assert [m["texto"] for m in cliente.get(f"/api/salas/{codigo}").json()["mensajes"]] == ["¿Arrancamos?"]


def test_websocket_sin_sesion_o_sala_inexistente(cliente, anonimo):
    codigo = cliente.post("/api/salas", json={"nombre": "Sala"}).json()["codigo"]
    with TestClient(app) as sin_sesion, sin_sesion.websocket_connect(f"/api/salas/{codigo}/ws") as ws:
        with pytest.raises(WebSocketDisconnect) as error:
            ws.receive_json()
        assert error.value.code == 4401

    with (
        TestClient(app) as tiempo_real,
        tiempo_real.websocket_connect("/api/salas/NOEXIS/ws", headers=cookie(cliente)) as ws,
    ):
        with pytest.raises(WebSocketDisconnect) as error:
            ws.receive_json()
        assert error.value.code == 4404


# --- Pizarra ---


def elemento(id_, version, nonce=1, **extra):
    return {"id": id_, "type": "rectangle", "version": version, "versionNonce": nonce, "x": 0, "y": 0, **extra}


def test_gana_la_version_mas_nueva_como_en_excalidraw():
    from app.salas import gana_el_nuevo

    assert gana_el_nuevo(None, elemento("a", 1))
    assert gana_el_nuevo(elemento("a", 1), elemento("a", 2))
    assert not gana_el_nuevo(elemento("a", 3), elemento("a", 2))
    # Empate de versión: gana el versionNonce más bajo (todos llegan al mismo resultado)
    assert gana_el_nuevo(elemento("a", 2, nonce=50), elemento("a", 2, nonce=10))
    assert not gana_el_nuevo(elemento("a", 2, nonce=10), elemento("a", 2, nonce=50))


def test_validaciones_de_la_pizarra():
    from app.salas import elemento_valido, imagen_valida

    assert elemento_valido(elemento("a", 1))
    assert not elemento_valido({"id": "a"})
    assert not elemento_valido(elemento("x" * 100, 1))
    assert not elemento_valido("cualquier cosa")
    assert imagen_valida({"id": "f1", "mimeType": "image/png", "dataURL": "data:image/png;base64,AAAA"})
    assert not imagen_valida({"id": "f1", "mimeType": "text/html", "dataURL": "data:text/html,<script>"})
    assert not imagen_valida({"id": "f1", "mimeType": "image/png", "dataURL": "data:image/png;" + "A" * 5_000_000})


def test_pizarra_en_vivo_y_guardada(cliente):
    codigo = cliente.post("/api/salas", json={"nombre": "Pizarra"}).json()["codigo"]
    url = f"/api/salas/{codigo}/ws"
    imagen = {"id": "foto1", "mimeType": "image/png", "dataURL": "data:image/png;base64,iVBORw0KGgo="}

    with TestClient(app) as otro, TestClient(app) as tiempo_real:
        registrar(otro, "beto@mail.com", "Beto")

        with (
            tiempo_real.websocket_connect(url, headers=cookie(cliente)) as ana,
            tiempo_real.websocket_connect(url, headers=cookie(otro)) as beto,
        ):
            assert recibir(ana, "pizarra") == {"tipo": "pizarra", "elementos": [], "inicial": True}
            recibir(beto, "pizarra")

            # Ana dibuja y Beto lo recibe
            ana.send_json({"tipo": "pizarra", "elementos": [elemento("r1", 1)]})
            assert recibir(beto, "pizarra")["elementos"][0]["id"] == "r1"

            # Beto lo mueve (versión 2) y Ana recibe el cambio
            beto.send_json({"tipo": "pizarra", "elementos": [elemento("r1", 2, x=50)]})
            assert recibir(ana, "pizarra")["elementos"][0]["x"] == 50

            # Un cambio viejo (versión 1) no pisa al nuevo ni se reenvía; basura tampoco
            ana.send_json({"tipo": "pizarra", "elementos": [elemento("r1", 1), {"id": 5}, "x"]})
            ana.send_json({"tipo": "pizarra", "elementos": "no es una lista"})

            # Imagen pegada
            beto.send_json({"tipo": "imagen", "archivo": imagen})
            assert recibir(ana, "imagen")["archivo"]["dataURL"] == imagen["dataURL"]

            # Cursor de Ana, con su nombre, solo para los demás
            ana.send_json({"tipo": "puntero", "x": 10.5, "y": 20, "boton": "down"})
            puntero = recibir(beto, "puntero")
            assert (puntero["nombre"], puntero["x"], puntero["boton"]) == ("Ana", 10.5, "down")

        # Se fueron todos: la pizarra quedó guardada y al volver está
        with tiempo_real.websocket_connect(url, headers=cookie(cliente)) as ana:
            inicial = recibir(ana, "pizarra")
            assert [(e["id"], e["version"], e["x"]) for e in inicial["elementos"]] == [("r1", 2, 50)]

    assert cliente.get(f"/api/salas/{codigo}/imagenes").json()[0]["id"] == "foto1"


# --- Sala personal, escena y archivos compartidos ---


def test_sala_personal_es_solo_de_su_dueno(cliente):
    sala = cliente.post("/api/salas/personal").json()
    assert sala["personal"] is True and len(sala["codigo"]) == 8
    assert cliente.post("/api/salas/personal").json()["codigo"] == sala["codigo"]  # siempre la misma
    assert cliente.get(f"/api/salas/{sala['codigo']}").json()["personal"] is True
    assert cliente.get("/api/salas").json() == []  # no aparece entre las salas recientes

    with TestClient(app) as otro, TestClient(app) as tiempo_real:
        registrar(otro, "beto@mail.com", "Beto")
        assert otro.get(f"/api/salas/{sala['codigo']}").status_code == 404
        with tiempo_real.websocket_connect(f"/api/salas/{sala['codigo']}/ws", headers=cookie(otro)) as ws:
            with pytest.raises(WebSocketDisconnect) as error:
                ws.receive_json()
            assert error.value.code == 4404
        # El dueño entra y la escena arranca en su escritorio
        with tiempo_real.websocket_connect(f"/api/salas/{sala['codigo']}/ws", headers=cookie(cliente)) as ws:
            assert recibir(ws, "estado")["escena"] == "escritorio"
            ws.send_json({"tipo": "escena", "escena": "chimenea"})
            assert recibir(ws, "estado")["escena"] == "chimenea"


def test_archivos_compartidos_en_la_sala(cliente):
    from .conftest import crear_pdf

    codigo = cliente.post("/api/salas", json={"nombre": "Nube"}).json()["codigo"]
    url = f"/api/salas/{codigo}/archivos"
    with TestClient(app) as otro, TestClient(app) as tiempo_real:
        registrar(otro, "beto@mail.com", "Beto")
        with tiempo_real.websocket_connect(f"/api/salas/{codigo}/ws", headers=cookie(otro)) as beto:
            recibir(beto, "estado")
            # Se sube por el mismo TestClient del WebSocket (un solo event loop, como en el servidor real)
            r = tiempo_real.post(
                url,
                files={"archivo": ("resumen final.pdf", crear_pdf(["Derivadas"]), "application/pdf")},
                headers=cookie(cliente),
            )
            assert r.status_code == 201
            archivo = r.json()
            assert (archivo["nombre"], archivo["por"]) == ("resumen final.pdf", "Ana")
            # Beto se entera al instante
            assert recibir(beto, "archivos") == {"tipo": "archivos"}
            assert recibir(beto, "evento")["archivo"] == "resumen final.pdf"

        # Beto lo ve, lo descarga y lo guarda en una materia suya
        assert [a["nombre"] for a in otro.get(url).json()] == ["resumen final.pdf"]
        r = otro.get(f"{url}/{archivo['id']}")
        assert r.content.startswith(b"%PDF") and "resumen%20final.pdf" in r.headers["content-disposition"]
        materia = otro.post("/api/materias", json={"nombre": "Análisis"}).json()["id"]
        doc = otro.post(f"{url}/{archivo['id']}/a-materia", json={"materia_id": materia}).json()
        assert doc["nombre"] == "resumen final.pdf" and doc["monedas_ganadas"] == 20
        # No puede guardarlo en una materia ajena ni borrar el archivo de Ana
        ajena = cliente.post("/api/materias", json={"nombre": "De Ana"}).json()["id"]
        assert otro.post(f"{url}/{archivo['id']}/a-materia", json={"materia_id": ajena}).status_code == 404
        assert otro.delete(f"{url}/{archivo['id']}").status_code == 403

    assert cliente.delete(f"{url}/{archivo['id']}").status_code == 204
    assert cliente.get(url).json() == []
    assert cliente.get(f"{url}/{archivo['id']}").status_code == 404
    assert cliente.post(url, files={"archivo": ("vacio.txt", b"")}).status_code == 400


def test_perfil_se_ve_en_la_sala_al_instante(cliente):
    # El perfil se guarda por la API: color del apodo y descripción (qué estudia o cómo se siente)
    r = cliente.put("/api/rincon/perfil", json={"color_apodo": "#E0A43A", "descripcion": "  📚 Estudiando   álgebra  "})
    assert r.status_code == 200
    a = r.json()["apariencia"]
    assert (a["color_apodo"], a["descripcion"]) == ("#e0a43a", "📚 Estudiando álgebra")
    # Un color inválido vuelve al de siempre; vestirse no borra el perfil
    assert cliente.put("/api/rincon/perfil", json={"color_apodo": "rojo"}).json()["apariencia"]["color_apodo"] is None
    cliente.put("/api/rincon/perfil", json={"color_apodo": "#3f6aa0"})
    a = cliente.put("/api/rincon/apariencia", json={"mascota": "gato-naranja", "nombre": "Michi"}).json()["apariencia"]
    assert (a["color_apodo"], a["descripcion"]) == ("#3f6aa0", "📚 Estudiando álgebra")

    codigo = cliente.post("/api/salas", json={"nombre": "Perfiles"}).json()["codigo"]
    with (
        TestClient(app) as tiempo_real,
        tiempo_real.websocket_connect(f"/api/salas/{codigo}/ws", headers=cookie(cliente)) as ws,
    ):
        recibir(ws, "estado")
        cliente.put("/api/rincon/perfil", json={"descripcion": "😊 Me siento con ganas"})
        cliente.put("/api/auth/perfil", json={"nombre": "Anita"})
        # Avisa que cambió algo: la sala lo vuelve a leer de la base (lo que manda el navegador no cuenta)
        ws.send_json({"tipo": "perfil", "nombre": "Otro nombre inventado"})
        yo = recibir(ws, "estado")["conectados"][0]
        assert yo["nombre"] == "Anita"
        assert yo["apariencia"]["descripcion"] == "😊 Me siento con ganas"


# --- Tablero, reacciones y encuestas ---


def test_tablero_de_metas_y_notas(cliente):
    codigo = cliente.post("/api/salas", json={"nombre": "Parcial"}).json()["codigo"]
    url = f"/api/salas/{codigo}/tablero"
    with TestClient(app) as otro, TestClient(app) as tiempo_real:
        registrar(otro, "beto@mail.com", "Beto")
        with tiempo_real.websocket_connect(f"/api/salas/{codigo}/ws", headers=cookie(otro)) as beto:
            recibir(beto, "estado")
            meta = tiempo_real.post(url, json={"tipo": "meta", "texto": "Terminar el TP 2"}, headers=cookie(cliente))
            assert meta.status_code == 201
            assert recibir(beto, "tablero") == {"tipo": "tablero"}  # Beto se entera al instante
            nota = tiempo_real.post(url, json={"tipo": "nota", "texto": "Parcial el 3/12"}, headers=cookie(cliente))
            assert nota.status_code == 201

            # Beto tilda la meta de Ana
            r = tiempo_real.patch(f"{url}/{meta.json()['id']}", json={"hecho": True}, headers=cookie(otro))
            assert (r.json()["hecho"], r.json()["hecho_por"]) == (True, "Beto")
            # pero no puede borrar la nota de Ana
            assert tiempo_real.delete(f"{url}/{nota.json()['id']}", headers=cookie(otro)).status_code == 403

    items = cliente.get(url).json()
    assert [(i["tipo"], i["texto"], i["hecho"]) for i in items] == [
        ("meta", "Terminar el TP 2", True),
        ("nota", "Parcial el 3/12", False),
    ]
    assert cliente.post(url, json={"tipo": "otra", "texto": "x"}).status_code == 422
    assert cliente.delete(f"{url}/{items[1]['id']}").status_code == 204
    assert len(cliente.get(url).json()) == 1


def test_reacciones_y_encuestas_en_el_chat(cliente):
    codigo = cliente.post("/api/salas", json={"nombre": "Parcial"}).json()["codigo"]
    with TestClient(app) as otro, TestClient(app) as tiempo_real:
        registrar(otro, "beto@mail.com", "Beto")
        beto_id = otro.get("/api/auth/yo").json()["id"]
        with (
            tiempo_real.websocket_connect(f"/api/salas/{codigo}/ws", headers=cookie(cliente)) as ana,
            tiempo_real.websocket_connect(f"/api/salas/{codigo}/ws", headers=cookie(otro)) as beto,
        ):
            recibir(ana, "estado")
            recibir(beto, "estado")  # que Beto ya esté adentro antes del primer mensaje
            ana.send_json({"tipo": "chat", "texto": "¿Arrancamos?"})
            mensaje = recibir(beto, "chat")["mensaje"]

            beto.send_json({"tipo": "reaccion", "mensaje_id": mensaje["id"], "emoji": "👍"})
            r = recibir(ana, "reacciones")
            assert (r["mensaje_id"], r["reacciones"]) == (mensaje["id"], {"👍": [beto_id]})
            beto.send_json({"tipo": "reaccion", "mensaje_id": mensaje["id"], "emoji": "💩"})  # no está permitido
            beto.send_json({"tipo": "reaccion", "mensaje_id": mensaje["id"], "emoji": "👍"})  # la saca
            assert recibir(ana, "reacciones")["reacciones"] == {}

            time.sleep(0.5)  # el chat tiene una pausa mínima entre mensajes de una misma persona
            ana.send_json({"tipo": "encuesta", "pregunta": "¿Qué repasamos?", "opciones": ["Límites", "Derivadas"]})
            encuesta = recibir(beto, "chat")["mensaje"]
            assert (encuesta["texto"], encuesta["encuesta"]["opciones"]) == (
                "¿Qué repasamos?",
                ["Límites", "Derivadas"],
            )
            beto.send_json({"tipo": "votar", "mensaje_id": encuesta["id"], "opcion": 1})
            assert recibir(ana, "encuesta")["encuesta"]["votos"] == [[], [beto_id]]
            beto.send_json({"tipo": "votar", "mensaje_id": encuesta["id"], "opcion": 0})  # cambia el voto
            assert recibir(ana, "encuesta")["encuesta"]["votos"] == [[beto_id], []]
            # Con una sola opción no se puede
            ana.send_json({"tipo": "encuesta", "pregunta": "x", "opciones": ["solo una"]})
            ana.send_json({"tipo": "ping"})
            assert recibir(ana, "pong")["tipo"] == "pong"

    # Al volver a entrar se ven las reacciones y los votos guardados
    detalle = cliente.get(f"/api/salas/{codigo}").json()["mensajes"]
    assert [m["texto"] for m in detalle] == ["¿Arrancamos?", "¿Qué repasamos?"]
    assert detalle[1]["encuesta"]["votos"] == [[beto_id], []]
