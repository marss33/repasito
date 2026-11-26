import asyncio
import base64
import time
from io import BytesIO

from PIL import Image

from app.db import SessionLocal
from app.rincon import TOPES, dar, monedas_por_pomodoro
from app.salas import Conexion, Persistencia, SalaEnVivo

from .conftest import crear_pdf


def crear_materia(cliente) -> int:
    return cliente.post("/api/materias", json={"nombre": "Física"}).json()["id"]


def subir(cliente, materia_id, nombre="apunte.pdf"):
    r = cliente.post(f"/api/materias/{materia_id}/documentos", files={"archivo": (nombre, crear_pdf(["Newton"]))})
    assert r.status_code == 201
    return r.json()


def data_url(ancho=400, alto=300, formato="PNG") -> str:
    imagen = BytesIO()
    Image.new("RGB", (ancho, alto), "orange").save(imagen, format=formato)
    return f"data:image/{formato.lower()};base64," + base64.b64encode(imagen.getvalue()).decode()


def test_rincon_nuevo_trae_monedas_de_regalo(cliente):
    rincon = cliente.get("/api/rincon").json()
    assert rincon["monedas"] == 100
    assert rincon["apariencia"]["mascota"] == "gato-naranja"
    assert {"id": "corona", "tipo": "cabeza", "precio": 150} in rincon["catalogo"]
    assert cliente.get("/api/auth/yo").json()["monedas"] == 100


def test_subir_apuntes_da_monedas_y_se_compra_en_la_tienda(cliente):
    # Con 100 no alcanza para la corona (150)
    r = cliente.post("/api/rincon/comprar", json={"articulo": "corona"})
    assert r.status_code == 400 and "50" in r.json()["detail"]

    assert subir(cliente, crear_materia(cliente))["monedas_ganadas"] == 20
    rincon = cliente.get("/api/rincon").json()
    # 20 por el apunte y 10 por el logro "primer apunte"
    assert (rincon["monedas"], rincon["ganado_hoy"]["archivos"]) == (130, 20)

    rincon = cliente.post("/api/rincon/comprar", json={"articulo": "gorro"}).json()
    assert (rincon["monedas"], rincon["comprados"]) == (100, ["gorro"])
    assert cliente.post("/api/rincon/comprar", json={"articulo": "gorro"}).status_code == 400
    assert cliente.post("/api/rincon/comprar", json={"articulo": "dragon"}).status_code == 404


def test_solo_se_usa_lo_que_se_compro(cliente):
    subir(cliente, crear_materia(cliente))
    cliente.post("/api/rincon/comprar", json={"articulo": "gorro"})

    base = {"mascota": "perro-caramelo", "nombre": "Toby"}  # las mascotas gratis las tiene todo el mundo
    r = cliente.put("/api/rincon/apariencia", json={**base, "cabeza": "gorro"})
    assert r.status_code == 200
    apariencia = r.json()["apariencia"]
    assert {k: apariencia[k] for k in ("mascota", "nombre", "cabeza", "decoracion")} == {
        **base,
        "cabeza": "gorro",
        "decoracion": [],
    }

    for cambio in ({"cabeza": "corona"}, {"mascota": "gato-siames"}, {"cara": "gorro"}, {"decoracion": ["luces"]}):
        assert cliente.put("/api/rincon/apariencia", json={**base, **cambio}).status_code == 400
    assert cliente.put("/api/rincon/apariencia", json={**base, "nombre": "  "}).status_code == 422


def test_tope_diario_de_monedas(cliente):
    usuario_id = cliente.get("/api/auth/yo").json()["id"]
    with SessionLocal() as db:
        total = sum(dar(db, usuario_id, "archivo", 20)[0] for _ in range(15))
        assert total == TOPES["archivos"]
        # El tope de las salas es aparte
        assert dar(db, usuario_id, "grupo", 40) == (40, 100 + TOPES["archivos"] + 40)


def test_foto_de_perfil(cliente):
    rincon = cliente.put("/api/rincon/foto", json={"imagen": data_url()}).json()
    assert rincon["foto"] == 1
    yo = cliente.get("/api/auth/yo").json()
    assert yo["foto"] == 1

    r = cliente.get(f"/api/rincon/foto/{yo['id']}?v=1")
    assert r.headers["content-type"] == "image/jpeg"
    assert Image.open(BytesIO(r.content)).size == (256, 256)  # recortada en cuadrado

    assert cliente.put("/api/rincon/foto", json={"imagen": "data:image/png;base64,no-es-una-imagen"}).status_code == 400
    assert cliente.put("/api/rincon/foto", json={"imagen": "data:text/html;base64,PGI+"}).status_code == 400

    assert cliente.delete("/api/rincon/foto").json()["foto"] == 0
    assert cliente.get(f"/api/rincon/foto/{yo['id']}").status_code == 404


def test_foto_requiere_sesion(anonimo):
    assert anonimo.get("/api/rincon/foto/1").status_code == 401
    assert anonimo.get("/api/rincon").status_code == 401


# --- Monedas por estudiar en las salas ---


class WSFalso:
    def __init__(self):
        self.recibido = []

    async def send_json(self, mensaje):
        self.recibido.append(mensaje)


def test_monedas_por_pomodoro():
    assert monedas_por_pomodoro(25) == 30


def test_cada_uno_gana_monedas_por_su_propio_pomodoro():
    pedidos = []

    async def dar_monedas(usuarios, motivo, cantidad):
        pedidos.append((sorted(usuarios), motivo, cantidad))
        return {u: (cantidad, 100) for u in usuarios}

    async def nada(*_):
        pass

    async def escenario():
        sala = SalaEnVivo("ABC123", persistencia=Persistencia(nada, nada, dar_monedas))
        hace_rato = time.time() - 30 * 60
        ana, beto, cami = WSFalso(), WSFalso(), WSFalso()
        sala.conexiones += [
            Conexion(ana, 1, "Ana", desde=hace_rato),
            Conexion(beto, 2, "Beto", desde=hace_rato),
            Conexion(cami, 3, "Cami"),  # recién llegó: no le toca
        ]
        # Ana completó un bloque de su pomodoro; el de Beto sigue en cero
        sala.pomodoro_de(1).ciclos = 1
        sala.pomodoro_de(2)
        for usuario in (1, 2):
            await sala.premiar_bloques(usuario)
        await sala.premiar_bloques(1)  # el mismo bloque no se premia dos veces
        # Cami completó uno pero recién llegó (no estuvo ni medio bloque): no se gana salteando
        sala.pomodoro_de(3).ciclos = 1
        await sala.premiar_bloques(3)
        return ana, beto, cami

    ana, beto, cami = asyncio.run(escenario())
    assert pedidos == [([1], "pomodoro", 30)]
    assert ana.recibido == [{"tipo": "monedas", "ganadas": 30, "total": 100, "motivo": "pomodoro"}]
    assert beto.recibido == [] and cami.recibido == []


def test_avatar_colores_libres_y_ropa_comprada(cliente):
    base = {"mascota": "gato-naranja", "nombre": "Michi"}
    colores = {"piel": "#8D5524", "pelo": "#FF00AA", "ojos": "#00ff00", "labios": "#123456", "unas": "#abcdef"}
    r = cliente.put(
        "/api/rincon/apariencia", json={**base, **colores, "peinado": "pelo-bob", "silueta": "b", "escena": "chimenea"}
    )
    assert r.status_code == 200
    apariencia = r.json()["apariencia"]
    assert (apariencia["piel"], apariencia["pelo"], apariencia["escena"], apariencia["silueta"]) == (
        "#8d5524",
        "#ff00aa",
        "chimenea",
        "b",
    )
    assert apariencia["ropa"] == "ropa-buzo"  # lo que no se manda queda como al principio

    # Un color mal escrito se ignora; la ropa, gorros y peinados hay que comprarlos
    assert (
        cliente.put("/api/rincon/apariencia", json={**base, "piel": "rojo"})
        .json()["apariencia"]["piel"]
        .startswith("#")
    )
    for cambio in (
        {"peinado": "pelo-pigtails"},
        {"ropa": "ropa-cardigan"},
        {"abajo": "abajo-short"},
        {"calzado": "calzado-botas"},
        {"sombrero": "gorro-corona"},
        {"lentes": "anteojos-redondos"},
        {"adorno": "adorno-monito"},
        {"lentes": "gorro"},
    ):
        assert cliente.put("/api/rincon/apariencia", json={**base, **cambio}).status_code == 400
    assert cliente.put("/api/rincon/apariencia", json={**base, "escena": "playa"}).status_code == 400


def test_peinado_que_dejo_de_ser_gratis_se_puede_seguir_usando(cliente):
    from app.models import Rincon

    usuario_id = cliente.get("/api/auth/yo").json()["id"]
    cliente.get("/api/rincon")
    with SessionLocal() as db:  # alguien que eligió un peinado que antes era gratis
        rincon = db.get(Rincon, usuario_id)
        rincon.apariencia = {**rincon.apariencia, "peinado": "pelo-swoop"}
        db.commit()
    base = {"mascota": "gato-naranja", "nombre": "Michi", "peinado": "pelo-swoop"}
    assert cliente.put("/api/rincon/apariencia", json={**base, "pelo": "#123456"}).status_code == 200
    # Pero si se lo saca, para volver a ponérselo hay que comprarlo
    assert cliente.put("/api/rincon/apariencia", json={**base, "peinado": "pelo-bob"}).status_code == 200
    assert cliente.put("/api/rincon/apariencia", json=base).status_code == 400


def test_facciones_gratis(cliente):
    base = {"mascota": "gato-naranja", "nombre": "Michi"}
    r = cliente.put(
        "/api/rincon/apariencia",
        json={**base, "ojos_forma": "almendrados", "pestanas": False, "rubor": False, "pecas": True},
    )
    a = r.json()["apariencia"]
    assert (a["ojos_forma"], a["pestanas"], a["rubor"], a["pecas"]) == ("almendrados", False, False, True)
    # Lo que no se manda queda como estaba; una forma que no existe se ignora
    a = cliente.put("/api/rincon/apariencia", json={**base, "ojos_forma": "de_dragon"}).json()["apariencia"]
    assert (a["ojos_forma"], a["pecas"]) == ("redondos", True)


def test_mascota_personalizada_con_foto(cliente):
    usuario_id = cliente.get("/api/auth/yo").json()["id"]
    foto = {"imagen": data_url()}
    # Sin comprarla no se puede subir la foto
    assert cliente.put("/api/rincon/foto-mascota", json=foto).status_code == 400
    with SessionLocal() as db:
        dar(db, usuario_id, "grupo", 400)  # 100 + 400 = 500 justo
    assert cliente.post("/api/rincon/comprar", json={"articulo": "mascota-foto"}).json()["monedas"] == 0
    assert cliente.put("/api/rincon/foto-mascota", json=foto).json()["foto_mascota"] == 1
    r = cliente.get(f"/api/rincon/foto-mascota/{usuario_id}")
    assert r.headers["content-type"] == "image/jpeg"
    a = cliente.put("/api/rincon/apariencia", json={"mascota": "mascota-foto", "nombre": "Firulais"}).json()[
        "apariencia"
    ]
    assert a["mascota"] == "mascota-foto"


def test_traje_habilita_sus_prendas(cliente):
    base = {"mascota": "gato-naranja", "nombre": "Michi"}
    # Sin el traje, la camisa no se puede usar
    assert cliente.put("/api/rincon/apariencia", json={**base, "ropa": "ropa-camisa"}).status_code == 400
    r = cliente.post("/api/rincon/comprar", json={"articulo": "traje-uniforme"}).json()
    assert "traje-uniforme" in r["comprados"]
    assert {"ropa-camisa", "abajo-pollera-tablas", "calzado-medias-altas", "adorno-corbata"} <= set(r["habilitados"])
    assert r["trajes"]["traje-uniforme"]["piezas"]["ropa"] == "ropa-camisa"
    puesto = {**base, "traje": "traje-uniforme", **r["trajes"]["traje-uniforme"]["piezas"]}
    a = cliente.put("/api/rincon/apariencia", json=puesto).json()["apariencia"]
    assert (a["traje"], a["ropa"], a["adorno"]) == ("traje-uniforme", "ropa-camisa", "adorno-corbata")
    # Un traje que no compró no se puede poner
    assert cliente.put("/api/rincon/apariencia", json={**base, "traje": "traje-gaucho"}).status_code == 400


def test_mate_y_termo_son_una_sola_mascota(cliente):
    from app.models import Rincon

    usuario_id = cliente.get("/api/auth/yo").json()["id"]
    cliente.get("/api/rincon")
    with SessionLocal() as db:  # alguien que había comprado el termo cuando eran dos mascotas
        rincon = db.get(Rincon, usuario_id)
        rincon.comprados = ["termo"]
        rincon.apariencia = {**rincon.apariencia, "mascota": "termo"}
        db.commit()
    r = cliente.get("/api/rincon").json()
    assert r["apariencia"]["mascota"] == "mate-termo"
    assert "mate-termo" in r["habilitados"]
    assert not any(a["id"] in ("mate", "termo") for a in r["catalogo"])
    assert (
        cliente.put("/api/rincon/apariencia", json={"mascota": "mate-termo", "nombre": "Matecito"}).status_code == 200
    )
