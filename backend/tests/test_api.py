import json
import time
from io import BytesIO

from PIL import Image

from app import config

from .conftest import crear_pdf, registrar

EJEMPLO = "Biología (ejemplo)"


def crear_materia(cliente, nombre="Biología"):
    r = cliente.post("/api/materias", json={"nombre": nombre})
    assert r.status_code == 201
    return r.json()["id"]


def nombres_de_materias(cliente):
    return sorted(m["nombre"] for m in cliente.get("/api/materias").json())


def subir(cliente, materia_id, datos, nombre="apunte.pdf"):
    return cliente.post(f"/api/materias/{materia_id}/documentos", files={"archivo": (nombre, datos)})


def subir_pdf(cliente, materia_id, paginas, nombre="apunte.pdf"):
    return subir(cliente, materia_id, crear_pdf(paginas), nombre)


def foto() -> bytes:
    imagen = BytesIO()
    Image.new("RGB", (50, 50), "white").save(imagen, format="JPEG")
    return imagen.getvalue()


def leer_eventos(texto: str) -> list[tuple[str, object]]:
    eventos = []
    for bloque in texto.strip().split("\n\n"):
        lineas = dict(linea.split(": ", 1) for linea in bloque.splitlines())
        eventos.append((lineas["event"], json.loads(lineas["data"])))
    return eventos


# --- Cuentas ---


def test_registro_login_y_logout(anonimo):
    assert anonimo.get("/api/auth/yo").json() is None

    registrar(anonimo)
    yo = anonimo.get("/api/auth/yo").json()
    assert (yo["nombre"], yo["es_invitado"], yo["usos_hoy"]) == ("Ana", False, 0)

    assert anonimo.post("/api/auth/logout").status_code == 204
    assert anonimo.get("/api/auth/yo").json() is None

    r = anonimo.post("/api/auth/login", json={"email": "ANA@mail.com", "password": "clave-segura"})
    assert r.status_code == 200
    assert anonimo.get("/api/auth/yo").status_code == 200


def test_cuenta_nueva_trae_materia_de_ejemplo(cliente):
    materias = cliente.get("/api/materias").json()
    assert [(m["nombre"], m["documentos"], m["flashcards"]) for m in materias] == [(EJEMPLO, 1, 6)]
    # el apunte de ejemplo se puede usar en el chat
    r = cliente.post(f"/api/materias/{materias[0]['id']}/chat", json={"pregunta": "¿Qué hacen las mitocondrias?"})
    assert r.status_code == 200
    assert r.json()["fuentes"][0]["documento"].startswith("La célula")


def test_login_incorrecto(anonimo):
    registrar(anonimo)
    anonimo.post("/api/auth/logout")
    r = anonimo.post("/api/auth/login", json={"email": "ana@mail.com", "password": "otra-clave"})
    assert r.status_code == 401
    r = anonimo.post("/api/auth/login", json={"email": "nadie@mail.com", "password": "clave-segura"})
    assert r.status_code == 401


def test_demasiados_intentos_de_login(anonimo):
    registrar(anonimo)
    anonimo.post("/api/auth/logout")
    for _ in range(10):
        anonimo.post("/api/auth/login", json={"email": "ana@mail.com", "password": "otra-clave"})
    r = anonimo.post("/api/auth/login", json={"email": "ana@mail.com", "password": "clave-segura"})
    assert r.status_code == 429


def test_registro_duplicado_y_validaciones(anonimo):
    registrar(anonimo)
    datos = {"nombre": "Otra", "email": "ana@mail.com", "password": "clave-segura"}
    assert anonimo.post("/api/auth/registro", json=datos).status_code == 409

    r = anonimo.post("/api/auth/registro", json={**datos, "email": "no-es-email"})
    assert (r.status_code, r.json()["detail"]) == (422, "El email no es válido.")
    r = anonimo.post("/api/auth/registro", json={**datos, "email": "b@mail.com", "password": "corta"})
    assert r.status_code == 422
    assert "8 caracteres" in r.json()["detail"]


def test_invitado_y_despues_guardar_la_cuenta(anonimo):
    r = anonimo.post("/api/auth/invitado")
    assert r.status_code == 201
    assert r.json()["es_invitado"]
    assert r.json()["email"] == ""
    materia = crear_materia(anonimo, "Física")

    r = anonimo.post("/api/auth/convertir", json={"nombre": "Ana", "email": "ana@mail.com", "password": "clave-segura"})
    assert r.status_code == 200
    assert not r.json()["es_invitado"]

    # puede volver a entrar con su email y tiene lo que cargó como invitado
    anonimo.post("/api/auth/logout")
    anonimo.post("/api/auth/login", json={"email": "ana@mail.com", "password": "clave-segura"})
    assert anonimo.get(f"/api/materias/{materia}").status_code == 200
    # y no se puede "convertir" dos veces
    r = anonimo.post("/api/auth/convertir", json={"nombre": "Ana", "email": "x@mail.com", "password": "clave-segura"})
    assert r.status_code == 400


def test_invitados_tienen_nombre_con_numero_y_lo_pueden_cambiar(anonimo):
    import re

    nombre = anonimo.post("/api/auth/invitado").json()["nombre"]
    assert re.fullmatch(r"Invitado \d{3}", nombre)
    r = anonimo.put("/api/auth/perfil", json={"nombre": "  Ana  "})
    assert r.json()["nombre"] == "Ana"
    assert anonimo.put("/api/auth/perfil", json={"nombre": "   "}).status_code == 422
    anonimo.post("/api/auth/logout")
    assert anonimo.post("/api/auth/invitado", headers={"X-Idioma": "en"}).json()["nombre"].startswith("Guest ")


def test_invitados_por_ip_tienen_limite(anonimo):
    for _ in range(10):
        assert anonimo.post("/api/auth/invitado").status_code == 201
    assert anonimo.post("/api/auth/invitado").status_code == 429


def test_sin_sesion_no_se_puede_usar_nada(anonimo):
    assert anonimo.get("/api/materias").status_code == 401
    assert anonimo.post("/api/materias", json={"nombre": "x"}).status_code == 401


def test_cada_usuario_ve_solo_lo_suyo(anonimo):
    registrar(anonimo, "ana@mail.com")
    materia = crear_materia(anonimo, "De Ana")
    doc = subir_pdf(anonimo, materia, ["Secreto"]).json()
    tarjeta = anonimo.post(f"/api/materias/{materia}/flashcards", json={"frente": "a", "dorso": "b"}).json()

    anonimo.post("/api/auth/logout")
    registrar(anonimo, "beto@mail.com", "Beto")
    assert nombres_de_materias(anonimo) == [EJEMPLO]
    assert anonimo.get(f"/api/materias/{materia}").status_code == 404
    assert anonimo.get(f"/api/documentos/{doc['id']}").status_code == 404
    assert anonimo.delete(f"/api/flashcards/{tarjeta['id']}").status_code == 404
    assert anonimo.post(f"/api/materias/{materia}/chat", json={"pregunta": "x"}).status_code == 404


# --- Materias y documentos ---


def test_crear_renombrar_y_listar_materias(cliente):
    fisica = crear_materia(cliente, "Física")
    crear_materia(cliente, "Álgebra")
    assert nombres_de_materias(cliente) == [EJEMPLO, "Física", "Álgebra"]

    r = cliente.put(f"/api/materias/{fisica}", json={"nombre": "Física I"})
    assert r.json()["nombre"] == "Física I"
    assert cliente.put(f"/api/materias/{fisica}", json={"nombre": "   "}).status_code == 422


def test_subir_pdf(cliente, ia):
    materia = crear_materia(cliente)
    r = subir_pdf(cliente, materia, ["La mitosis es la division celular", "La meiosis forma gametos"])
    assert r.status_code == 201
    doc = r.json()
    assert (doc["tipo"], doc["paginas"], doc["fragmentos"]) == ("pdf", 2, 2)
    assert ia.llamadas == 0  # un PDF con texto no gasta IA


def test_subir_foto_se_lee_con_ocr_sin_gastar_ia(cliente, ia, ocr_falso):
    materia = crear_materia(cliente)
    r = subir(cliente, materia, foto(), "pizarron.jpg")
    assert r.status_code == 201
    assert r.json()["tipo"] == "imagen"
    assert ocr_falso.imagenes == 1
    assert ia.llamadas == 0
    assert cliente.get("/api/auth/yo").json()["usos_hoy"] == 0

    # el texto de la foto queda disponible para el chat
    cliente.post(f"/api/materias/{materia}/chat", json={"pregunta": "¿Dónde ocurre la fotosíntesis?"})
    assert ia.ultimo_contexto[0].documento == "pizarron.jpg"


def test_limite_de_archivos_por_materia(cliente, monkeypatch):
    monkeypatch.setattr(config, "MAX_DOCUMENTOS_POR_MATERIA", 3)
    materia = crear_materia(cliente)
    for i in range(3):
        assert subir(cliente, materia, f"Apunte {i}".encode(), f"a{i}.txt").status_code == 201
    r = subir(cliente, materia, b"uno mas", "a3.txt")
    assert r.status_code == 400
    assert "3 archivos" in r.json()["detail"]
    # en otra materia se puede seguir subiendo
    otra = crear_materia(cliente, "Otra")
    assert subir(cliente, otra, b"Apunte", "b.txt").status_code == 201
    estado = cliente.get("/api/estado").json()
    assert (estado["max_documentos"], estado["max_archivo_mb"]) == (3, 20)


def test_archivos_invalidos(cliente):
    materia = crear_materia(cliente)
    assert subir(cliente, materia, b"esto no es un pdf", "roto.pdf").status_code == 400
    assert subir(cliente, materia, b"x", "viejo.doc").status_code == 400
    assert subir(cliente, materia, b"", "vacio.txt").status_code == 400


def test_foto_sin_ocr_instalado_da_error_claro(cliente):
    from app.deps import get_ocr
    from app.main import app
    from app.ocr import OCRNoDisponible

    def sin_tesseract(imagenes):
        raise OCRNoDisponible("ocr_no_disponible")

    app.dependency_overrides[get_ocr] = lambda: sin_tesseract
    materia = crear_materia(cliente)
    r = subir(cliente, materia, foto(), "foto.jpg")
    assert r.status_code == 503
    assert "Tesseract" in r.json()["detail"]
    # un txt sigue funcionando
    assert subir(cliente, materia, b"Apuntes en texto", "notas.txt").status_code == 201


def test_foto_ilegible(cliente, ocr_falso):
    from app.deps import get_ocr
    from app.main import app

    app.dependency_overrides[get_ocr] = lambda: lambda imagenes: ["  ~ "]
    materia = crear_materia(cliente)
    r = subir(cliente, materia, foto(), "borrosa.jpg")
    assert r.status_code == 400
    assert "más nítida" in r.json()["detail"]


def test_ia_sin_configurar_da_error_claro(cliente):
    from app.deps import get_ia
    from app.ia import TutorIA
    from app.main import app

    app.dependency_overrides[get_ia] = lambda: TutorIA()
    materia = cliente.get("/api/materias").json()[0]["id"]
    r = cliente.post(f"/api/materias/{materia}/chat", json={"pregunta": "¿Qué es la mitosis?"})
    assert r.status_code == 502
    assert "GROQ_API_KEY" in r.json()["detail"]
    assert cliente.get("/api/auth/yo").json()["usos_hoy"] == 0  # no se descuenta si no se llegó a usar


# --- IA ---


def test_chat_usa_los_fragmentos_relevantes(cliente, ia):
    materia = crear_materia(cliente)
    subir_pdf(cliente, materia, ["La mitosis es la division celular", "La fotosintesis ocurre en las hojas"])

    r = cliente.post(f"/api/materias/{materia}/chat", json={"pregunta": "¿Qué es la mitosis?"})
    assert r.status_code == 200
    assert r.json()["fuentes"][0]["ubicacion"] == "pág. 1"
    assert [c.ubicacion for c in ia.ultimo_contexto] == ["pág. 1"]

    historial = cliente.get(f"/api/materias/{materia}/chat").json()
    assert [m["rol"] for m in historial] == ["user", "assistant"]

    assert cliente.delete(f"/api/materias/{materia}/chat").status_code == 204
    assert cliente.get(f"/api/materias/{materia}/chat").json() == []


def test_chat_en_vivo(cliente):
    materia = crear_materia(cliente)
    subir_pdf(cliente, materia, ["La mitosis es la division celular"])

    r = cliente.post(f"/api/materias/{materia}/chat/en-vivo", json={"pregunta": "mitosis"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    eventos = leer_eventos(r.text)
    assert [e for e, _ in eventos] == ["texto", "texto", "fin"]
    final = eventos[-1][1]
    assert final["texto"] == "Según tus apuntes, la respuesta a «mitosis» está acá [1]."
    assert final["fuentes"][0]["documento"] == "apunte.pdf"

    historial = cliente.get(f"/api/materias/{materia}/chat").json()
    assert [m["rol"] for m in historial] == ["user", "assistant"]
    assert cliente.get("/api/auth/yo").json()["usos_hoy"] == 1


def test_chat_en_vivo_con_error_de_ia(cliente, ia):
    from app.ia import ErrorIA

    def falla(*args):
        ia.llamadas += 1
        yield "Empiezo a responder"
        raise ErrorIA("ia_sin_cupo")

    ia.responder_en_vivo = falla
    materia = crear_materia(cliente)
    subir_pdf(cliente, materia, ["La mitosis es la division celular"])

    eventos = leer_eventos(cliente.post(f"/api/materias/{materia}/chat/en-vivo", json={"pregunta": "x"}).text)
    assert eventos[-1] == ("error", {"detail": "Se agotó el uso gratis de la IA por ahora. Probá de nuevo en un rato."})

    # el error llega en el idioma elegido
    r = cliente.post(f"/api/materias/{materia}/chat/en-vivo", json={"pregunta": "x"}, headers={"X-Idioma": "en"})
    assert leer_eventos(r.text)[-1][1]["detail"].startswith("The free AI quota is used up")
    assert cliente.get(f"/api/materias/{materia}/chat").json() == []  # no se guarda una respuesta cortada


def test_chat_sin_apuntes(cliente):
    materia = crear_materia(cliente)
    assert cliente.post(f"/api/materias/{materia}/chat", json={"pregunta": "hola"}).status_code == 400
    assert cliente.post(f"/api/materias/{materia}/chat/en-vivo", json={"pregunta": "hola"}).status_code == 400


def test_limite_diario_de_ia(cliente, monkeypatch):
    monkeypatch.setattr(config, "LIMITE_DIARIO", 2)
    materia = crear_materia(cliente)
    subir_pdf(cliente, materia, ["La mitosis es la division celular"])

    for _ in range(2):
        assert cliente.post(f"/api/materias/{materia}/chat", json={"pregunta": "mitosis"}).status_code == 200
    r = cliente.post(f"/api/materias/{materia}/chat", json={"pregunta": "mitosis"})
    assert r.status_code == 429
    assert "límite" in r.json()["detail"]
    assert cliente.post(f"/api/materias/{materia}/chat/en-vivo", json={"pregunta": "mitosis"}).status_code == 429
    # lo que no usa IA sigue andando
    assert cliente.post(f"/api/materias/{materia}/flashcards", json={"frente": "a", "dorso": "b"}).status_code == 201


def test_resumen(cliente):
    materia = crear_materia(cliente)
    doc = subir_pdf(cliente, materia, ["Contenido"]).json()
    r = cliente.post(f"/api/documentos/{doc['id']}/resumen")
    assert r.json()["resumen"] == "# Resumen de apunte.pdf"
    assert cliente.get(f"/api/documentos/{doc['id']}").json()["tiene_resumen"]


def test_flashcards_y_repaso(cliente):
    materia = crear_materia(cliente)
    doc = subir_pdf(cliente, materia, ["Contenido"]).json()

    r = cliente.post(f"/api/documentos/{doc['id']}/flashcards", json={"cantidad": 3})
    assert r.status_code == 201
    tarjetas = r.json()
    assert len(tarjetas) == 3
    assert len(cliente.get(f"/api/materias/{materia}/flashcards/pendientes").json()) == 3

    r = cliente.post(f"/api/flashcards/{tarjetas[0]['id']}/repaso", json={"calidad": 4})
    assert r.json()["intervalo"] == 1
    # una tarjeta fallada sigue pendiente hoy
    cliente.post(f"/api/flashcards/{tarjetas[1]['id']}/repaso", json={"calidad": 1})

    pendientes = cliente.get(f"/api/materias/{materia}/flashcards/pendientes").json()
    assert {t["id"] for t in pendientes} == {tarjetas[1]["id"], tarjetas[2]["id"]}
    assert cliente.get(f"/api/materias/{materia}").json()["pendientes"] == 2


def test_editar_borrar_y_exportar_flashcards(cliente):
    materia = crear_materia(cliente, "Física")
    tarjeta = cliente.post(f"/api/materias/{materia}/flashcards", json={"frente": "¿2+2?", "dorso": "4"}).json()["id"]
    cliente.post(
        f"/api/materias/{materia}/flashcards", json={"frente": "¿Qué es la fuerza?", "dorso": "masa, aceleración"}
    )
    assert cliente.put(f"/api/flashcards/{tarjeta}", json={"frente": "¿2+3?", "dorso": "5"}).json()["dorso"] == "5"

    r = cliente.get(f"/api/materias/{materia}/flashcards/exportar")
    assert r.headers["content-type"].startswith("text/csv")
    assert "filename*=UTF-8''flashcards%20-%20F%C3%ADsica.csv" in r.headers["content-disposition"]
    assert r.text == '﻿¿2+3?,5\r\n¿Qué es la fuerza?,"masa, aceleración"\r\n'

    assert cliente.delete(f"/api/flashcards/{tarjeta}").status_code == 204
    assert len(cliente.get(f"/api/materias/{materia}/flashcards").json()) == 1


def test_quiz_por_tema(cliente):
    materia = crear_materia(cliente)
    subir_pdf(cliente, materia, ["La mitosis es la division celular"])

    r = cliente.post(f"/api/materias/{materia}/quiz", json={"tema": "mitosis", "cantidad": 2})
    assert r.status_code == 200
    assert len(r.json()["preguntas"]) == 2
    assert cliente.post(f"/api/materias/{materia}/quiz", json={"tema": "termodinamica"}).status_code == 404


def test_borrar_materia_borra_todo(cliente):
    materia = crear_materia(cliente)
    doc = subir_pdf(cliente, materia, ["Contenido"]).json()
    cliente.post(f"/api/documentos/{doc['id']}/flashcards", json={"cantidad": 2})

    assert cliente.delete(f"/api/materias/{materia}").status_code == 204
    assert cliente.get(f"/api/documentos/{doc['id']}").status_code == 404
    assert nombres_de_materias(cliente) == [EJEMPLO]


def test_errores_de_validacion_en_espanol(cliente):
    r = cliente.post("/api/materias/1/chat", json={"pregunta": ""})
    assert r.json()["detail"] == "Escribí una pregunta (hasta 2000 caracteres)."


# --- Idiomas ---

INGLES = {"X-Idioma": "en"}


def test_todo_en_ingles(anonimo, ia):
    anonimo.post("/api/auth/invitado", headers=INGLES)
    materia = anonimo.get("/api/materias", headers=INGLES).json()[0]
    assert materia["nombre"] == "Biology (example)"

    assert anonimo.get("/api/materias/999", headers=INGLES).json()["detail"] == "That subject doesn't exist."
    r = anonimo.post(f"/api/materias/{materia['id']}/chat", json={"pregunta": ""}, headers=INGLES)
    assert r.json()["detail"] == "Write a question (up to 2000 characters)."
    r = subir_en(anonimo, materia["id"], b"x", "viejo.doc", INGLES)
    assert r.json()["detail"] == "Old .doc files can't be read. Open it and save it as .docx."

    # las citas usan las etiquetas en inglés ("part 2", no "parte 2")
    r = anonimo.post(
        f"/api/materias/{materia['id']}/chat", json={"pregunta": "What do mitochondria do?"}, headers=INGLES
    )
    assert r.json()["fuentes"][0]["ubicacion"].startswith("part ")


def test_sin_idioma_es_espanol_y_el_navegador_tambien_cuenta(anonimo):
    assert anonimo.get("/api/materias/999").json()["detail"] == "Iniciá sesión para continuar."
    r = anonimo.get("/api/materias/999", headers={"Accept-Language": "en-US,en;q=0.9"})
    assert r.json()["detail"] == "Please log in to continue."
    r = anonimo.get("/api/materias/999", headers={"Accept-Language": "fr-FR,fr;q=0.9"})
    assert r.json()["detail"] == "Iniciá sesión para continuar."


def test_la_ia_recibe_el_idioma():
    from app.deps import get_ia
    from app.idioma import idioma_actual

    marca = idioma_actual.set("en")
    try:
        assert get_ia().idioma == "en"
    finally:
        idioma_actual.reset(marca)
    assert get_ia().idioma == "es"


def subir_en(cliente, materia_id, datos, nombre, headers):
    return cliente.post(f"/api/materias/{materia_id}/documentos", files={"archivo": (nombre, datos)}, headers=headers)


def test_subida_lenta_queda_procesando_y_aparece_sola(cliente, monkeypatch):
    import threading

    from app.deps import get_ocr
    from app.main import app
    from app.routers import documentos

    seguir = threading.Event()

    def ocr_lento(imagenes):
        seguir.wait(10)
        return ["Mitocondria: respiración celular"] * len(imagenes)

    monkeypatch.setattr(documentos, "ESPERA_MAXIMA", 0.2)
    app.dependency_overrides[get_ocr] = lambda: ocr_lento
    materia = crear_materia(cliente)
    r = subir(cliente, materia, foto(), "pizarron.jpg")
    assert r.status_code == 202
    assert r.json()["nombre"] == "pizarron.jpg"
    url = f"/api/materias/{materia}/documentos/procesando"
    assert [p["estado"] for p in cliente.get(url).json()] == ["procesando"]

    seguir.set()
    for _ in range(50):
        lista = cliente.get(url).json()
        if lista and lista[0]["estado"] != "procesando":
            break
        time.sleep(0.1)
    assert (lista[0]["estado"], lista[0]["monedas_ganadas"]) == ("listo", 20)
    assert cliente.get(url).json() == []  # ya se informó
    assert [d["nombre"] for d in cliente.get(f"/api/materias/{materia}/documentos").json()] == ["pizarron.jpg"]


def test_subida_lenta_que_falla_avisa_el_error(cliente, monkeypatch):
    from app.deps import get_ocr
    from app.main import app
    from app.routers import documentos

    def ocr_roto(imagenes):
        time.sleep(0.5)
        raise RuntimeError("se rompió")

    monkeypatch.setattr(documentos, "ESPERA_MAXIMA", 0.1)
    app.dependency_overrides[get_ocr] = lambda: ocr_roto
    materia = crear_materia(cliente)
    assert subir(cliente, materia, foto(), "borroso.jpg").status_code == 202
    for _ in range(50):
        lista = cliente.get(f"/api/materias/{materia}/documentos/procesando").json()
        if lista and lista[0]["estado"] != "procesando":
            break
        time.sleep(0.1)
    assert lista[0]["estado"] == "error" and "borroso.jpg" in lista[0]["error"]


def test_conceptos_para_los_juegos(cliente):
    materia = crear_materia(cliente)
    assert cliente.post(f"/api/materias/{materia}/conceptos", json={}).status_code == 400  # sin apuntes
    subir(cliente, materia, b"La mitocondria produce energia.", "notas.txt")
    r = cliente.post(f"/api/materias/{materia}/conceptos", json={"cantidad": 5})
    assert r.status_code == 200
    assert [c["termino"] for c in r.json()][:2] == ["mitocondria", "ribosoma"]
    assert cliente.get("/api/auth/yo").json()["usos_hoy"] == 1


def test_logros_se_desbloquean_y_dan_monedas(cliente):
    def logro(clave):
        return next(lg for lg in cliente.get("/api/rincon/logros").json() if lg["clave"] == clave)

    assert logro("primer_apunte")["logrado"] is False
    antes = cliente.get("/api/rincon").json()["monedas"]
    materia = crear_materia(cliente)
    subir(cliente, materia, b"La mitocondria produce energia.", "notas.txt")
    assert logro("primer_apunte") | {"actual": 1} == logro("primer_apunte")
    assert logro("primer_apunte")["logrado"] is True
    assert logro("apuntes_10")["actual"] == 1 and not logro("apuntes_10")["logrado"]
    # 20 por subir el apunte + 10 por el logro
    assert cliente.get("/api/rincon").json()["monedas"] == antes + 20 + 10
    yo = cliente.get("/api/auth/yo").json()["id"]
    assert cliente.get(f"/api/rincon/insignias/{yo}").json() == [{"clave": "primer_apunte", "emoji": "📄"}]
