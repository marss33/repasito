"""Mi rincón: monedas, tienda, avatar, mascota y foto de perfil.

Las monedas se ganan estudiando (subiendo apuntes y completando pomodoros en las salas) y se gastan
en la tienda: peinados, ropa, gorros y lentes para el avatar; mascotas y accesorios; cosas para el
escritorio. Los colores del avatar (piel, pelo, ojos, labios, uñas, ropa) son gratis y libres.
Los dibujos están en el frontend; acá solo están los precios y las reglas."""

import re
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from .idioma import ErrorTraducible
from .models import FotoMascota, MovimientoMonedas, Rincon

MONEDAS_DE_BIENVENIDA = 100
POR_ARCHIVO = 20
POR_MINUTO_DE_POMODORO = 1.2  # un pomodoro de 25 minutos = 30 monedas
# Topes por día, para que no se pueda "farmear" subiendo y borrando
TOPES = {"archivos": 200, "salas": 400}
# "grupo" y "solo" son de antes, cuando el pomodoro se compartía (quedan en el historial)
MOTIVOS = {"archivo": "archivos", "pomodoro": "salas", "trivia": "salas", "grupo": "salas", "solo": "salas"}


@dataclass(frozen=True)
class Articulo:
    id: str
    tipo: str  # avatar: peinado, ropa, sombrero, lentes · mascota: mascota, cabeza, cara, cuello · decoracion
    precio: int


CATALOGO = {
    a.id: a
    for a in [
        # Avatar pixel (arte LPC; ver frontend/scripts/piezas_avatar.json). Lo de precio 0 lo tiene todo el mundo.
        Articulo("pelo-afro", "peinado", 0),
        Articulo("pelo-bangs", "peinado", 25),
        Articulo("pelo-bangs-bun", "peinado", 35),
        Articulo("pelo-bangslong", "peinado", 35),
        Articulo("pelo-bangsshort", "peinado", 25),
        Articulo("pelo-bedhead", "peinado", 25),
        Articulo("pelo-bob", "peinado", 0),
        Articulo("pelo-bob-side-part", "peinado", 25),
        Articulo("pelo-cornrows", "peinado", 35),
        Articulo("pelo-cowlick", "peinado", 25),
        Articulo("pelo-cowlick-tall", "peinado", 40),
        Articulo("pelo-curly-long", "peinado", 35),
        Articulo("pelo-curly-short", "peinado", 0),
        Articulo("pelo-curly-short2", "peinado", 35),
        Articulo("pelo-curtains", "peinado", 25),
        Articulo("pelo-curtains-long", "peinado", 35),
        Articulo("pelo-dreadlocks-long", "peinado", 35),
        Articulo("pelo-dreadlocks-short", "peinado", 35),
        Articulo("pelo-flat-top-fade", "peinado", 25),
        Articulo("pelo-flat-top-straight", "peinado", 25),
        Articulo("pelo-half-up", "peinado", 35),
        Articulo("pelo-halfmessy", "peinado", 25),
        Articulo("pelo-high-and-tight", "peinado", 25),
        Articulo("pelo-idol", "peinado", 40),
        Articulo("pelo-jewfro", "peinado", 25),
        Articulo("pelo-lob", "peinado", 25),
        Articulo("pelo-long", "peinado", 35),
        Articulo("pelo-long-messy", "peinado", 35),
        Articulo("pelo-long-messy2", "peinado", 35),
        Articulo("pelo-long-straight", "peinado", 0),
        Articulo("pelo-longhawk", "peinado", 40),
        Articulo("pelo-loose", "peinado", 25),
        Articulo("pelo-messy1", "peinado", 0),
        Articulo("pelo-messy2", "peinado", 25),
        Articulo("pelo-messy3", "peinado", 25),
        Articulo("pelo-mop", "peinado", 25),
        Articulo("pelo-natural", "peinado", 35),
        Articulo("pelo-page", "peinado", 25),
        Articulo("pelo-page2", "peinado", 25),
        Articulo("pelo-parted", "peinado", 25),
        Articulo("pelo-parted2", "peinado", 25),
        Articulo("pelo-parted3", "peinado", 25),
        Articulo("pelo-parted-side-bangs", "peinado", 25),
        Articulo("pelo-parted-side-bangs2", "peinado", 25),
        Articulo("pelo-pigtails", "peinado", 35),
        Articulo("pelo-pigtails-bangs", "peinado", 35),
        Articulo("pelo-pixie", "peinado", 25),
        Articulo("pelo-plain", "peinado", 0),
        Articulo("pelo-relm-short", "peinado", 25),
        Articulo("pelo-shorthawk", "peinado", 40),
        Articulo("pelo-spiked", "peinado", 40),
        Articulo("pelo-spiked2", "peinado", 40),
        Articulo("pelo-spiked-beehive", "peinado", 40),
        Articulo("pelo-spiked-liberty", "peinado", 40),
        Articulo("pelo-spiked-liberty2", "peinado", 40),
        Articulo("pelo-spiked-porcupine", "peinado", 40),
        Articulo("pelo-swoop", "peinado", 25),
        Articulo("pelo-swoop-side", "peinado", 25),
        Articulo("pelo-twists-fade", "peinado", 35),
        Articulo("pelo-twists-straight", "peinado", 35),
        Articulo("pelo-unkempt", "peinado", 25),
        # Pelos largos con capa de atrás
        Articulo("pelo-bangslong2", "peinado", 35),
        Articulo("pelo-braid", "peinado", 35),
        Articulo("pelo-braid2", "peinado", 35),
        Articulo("pelo-bunches", "peinado", 30),
        Articulo("pelo-curls-large", "peinado", 40),
        Articulo("pelo-curls-large-xlong", "peinado", 45),
        Articulo("pelo-long-band", "peinado", 40),
        Articulo("pelo-long-center-part", "peinado", 35),
        Articulo("pelo-long-tied", "peinado", 35),
        Articulo("pelo-ponytail2", "peinado", 30),
        Articulo("pelo-princess", "peinado", 45),
        Articulo("pelo-relm-xlong", "peinado", 45),
        Articulo("pelo-sara", "peinado", 35),
        Articulo("pelo-shoulderl", "peinado", 35),
        Articulo("pelo-shoulderr", "peinado", 35),
        Articulo("pelo-single", "peinado", 35),
        Articulo("pelo-wavy", "peinado", 40),
        Articulo("pelo-xlong", "peinado", 40),
        Articulo("pelo-xlong-wavy", "peinado", 45),
        Articulo("ropa-buzo", "ropa", 0),
        Articulo("ropa-remera", "ropa", 0),
        Articulo("ropa-cardigan", "ropa", 30),
        Articulo("ropa-polo", "ropa", 25),
        Articulo("ropa-escote-v", "ropa", 25),
        Articulo("ropa-camisa", "ropa", 30),
        Articulo("ropa-cuello-redondo", "ropa", 25),
        Articulo("ropa-punos", "ropa", 25),
        Articulo("ropa-cardigan-corto", "ropa", 25),
        Articulo("ropa-polo-corto", "ropa", 25),
        Articulo("ropa-remera-v", "ropa", 25),
        Articulo("ropa-remera-botones", "ropa", 25),
        Articulo("ropa-musculosa", "ropa", 25),
        Articulo("ropa-chaleco", "ropa", 30),
        Articulo("abajo-pantalon", "abajo", 0),
        Articulo("abajo-pollera", "abajo", 0),
        Articulo("abajo-jean", "abajo", 20),
        Articulo("abajo-short", "abajo", 20),
        Articulo("abajo-short-corto", "abajo", 20),
        Articulo("abajo-calzas", "abajo", 20),
        Articulo("abajo-arremangado", "abajo", 20),
        Articulo("abajo-vestir", "abajo", 30),
        Articulo("abajo-rayado", "abajo", 30),
        Articulo("abajo-bombacha", "abajo", 25),
        Articulo("abajo-pollera-tablas", "abajo", 30),
        Articulo("calzado-zapatillas", "calzado", 0),
        Articulo("calzado-botas", "calzado", 25),
        Articulo("calzado-botas-dobladas", "calzado", 25),
        Articulo("calzado-sandalias", "calzado", 20),
        Articulo("calzado-pantuflas", "calzado", 20),
        Articulo("calzado-guillies", "calzado", 25),
        Articulo("calzado-medias-altas", "calzado", 20),
        Articulo("gorro-vincha", "sombrero", 20),
        Articulo("gorro-vincha-fina", "sombrero", 20),
        Articulo("gorro-colita", "sombrero", 15),
        Articulo("gorro-bandana", "sombrero", 30),
        Articulo("gorro-panuelo", "sombrero", 30),
        Articulo("gorro-capucha", "sombrero", 30),
        Articulo("gorro-gorra-cuero", "sombrero", 30),
        Articulo("gorro-bombin", "sombrero", 30),
        Articulo("gorro-galera", "sombrero", 45),
        Articulo("gorro-tiara", "sombrero", 50),
        Articulo("gorro-corona", "sombrero", 60),
        Articulo("gorro-gorro-navidad", "sombrero", 35),
        Articulo("gorro-duende", "sombrero", 35),
        Articulo("gorro-celestial", "sombrero", 50),
        Articulo("gorro-luna", "sombrero", 50),
        Articulo("gorro-mago", "sombrero", 45),
        Articulo("anteojos-clasicos", "lentes", 20),
        Articulo("anteojos-redondos", "lentes", 20),
        Articulo("anteojos-nerd", "lentes", 20),
        Articulo("anteojos-media-luna", "lentes", 20),
        Articulo("anteojos-secretaria", "lentes", 20),
        Articulo("anteojos-oscuros", "lentes", 30),
        Articulo("anteojos-de-sol", "lentes", 30),
        Articulo("adorno-monito", "adorno", 20),
        Articulo("adorno-monito-grande", "adorno", 20),
        Articulo("adorno-corbata", "adorno", 25),
        Articulo("adorno-bufanda", "adorno", 20),
        Articulo("adorno-collar", "adorno", 20),
        Articulo("adorno-collar-grande", "adorno", 30),
        Articulo("adorno-panuelo-cuello", "adorno", 20),
        Articulo("adorno-volados", "adorno", 30),
        # Mascotas
        Articulo("gato-naranja", "mascota", 0),
        Articulo("perro-caramelo", "mascota", 0),
        Articulo("raton", "mascota", 30),
        Articulo("rata-blanca", "mascota", 35),
        Articulo("gato-gris", "mascota", 40),
        Articulo("perro-chocolate", "mascota", 40),
        Articulo("perro-negro", "mascota", 40),
        Articulo("conejo", "mascota", 40),
        Articulo("chihuahua", "mascota", 50),
        Articulo("salchicha", "mascota", 50),
        Articulo("tortuga", "mascota", 50),
        Articulo("gato-negro", "mascota", 60),
        Articulo("caniche", "mascota", 60),
        Articulo("doberman", "mascota", 60),
        Articulo("mono", "mascota", 60),
        Articulo("murcielago", "mascota", 60),
        Articulo("suricata", "mascota", 60),
        Articulo("lagarto", "mascota", 60),
        Articulo("perro-dalmata", "mascota", 70),
        Articulo("mapache", "mascota", 70),
        Articulo("oso-bebe", "mascota", 70),
        Articulo("gato-siames", "mascota", 80),
        Articulo("caballo-bebe", "mascota", 80),
        Articulo("empanada", "mascota", 80),
        Articulo("mate-termo", "mascota", 80),  # los dos juntos, se compran una vez
        Articulo("perro-husky", "mascota", 90),
        Articulo("unicornio-bebe", "mascota", 100),
        Articulo("dragon-bebe", "mascota", 120),
        Articulo("mascota-foto", "mascota", 500),  # personalizada: con la foto que suba el usuario
        # Cabeza
        Articulo("flor", "cabeza", 20),
        Articulo("gorro", "cabeza", 30),
        Articulo("gorra", "cabeza", 40),
        Articulo("auriculares", "cabeza", 60),
        Articulo("sombrero-mago", "cabeza", 90),
        Articulo("birrete", "cabeza", 100),
        Articulo("corona", "cabeza", 150),
        # Cara
        Articulo("anteojos", "cara", 30),
        Articulo("lentes-sol", "cara", 45),
        Articulo("lentes-corazon", "cara", 65),
        # Cuello
        Articulo("monito", "cuello", 25),
        Articulo("collar", "cuello", 30),
        Articulo("panuelo", "cuello", 35),
        Articulo("bufanda", "cuello", 45),
        # Escritorio
        Articulo("taza", "decoracion", 15),
        Articulo("libros", "decoracion", 20),
        Articulo("planta", "decoracion", 25),
        Articulo("globo", "decoracion", 45),
        Articulo("luces", "decoracion", 60),
        Articulo("mate-escritorio", "decoracion", 15),
        Articulo("matcha", "decoracion", 20),
        # Trajes: ropa en conjunto (ver TRAJES)
        Articulo("traje-uniforme", "traje", 60),
        Articulo("traje-oficina", "traje", 60),
        Articulo("traje-jardinero", "traje", 50),
        Articulo("traje-tiradores", "traje", 55),
        Articulo("traje-pijama", "traje", 40),
        Articulo("traje-deportivo", "traje", 40),
        Articulo("traje-invierno", "traje", 50),
        Articulo("traje-gaucho", "traje", 60),
    ]
}

# Cada traje viste varias partes a la vez y trae sus colores. Tenerlo habilita también sus prendas sueltas.
# "capa" es una pieza que solo existe en el traje (el jardinero y los tiradores van encima de la ropa).
TRAJES: dict[str, dict] = {
    "traje-uniforme": {
        "piezas": {
            "ropa": "ropa-camisa",
            "abajo": "abajo-pollera-tablas",
            "calzado": "calzado-medias-altas",
            "adorno": "adorno-corbata",
        },
        "colores": {
            "color_ropa": "#f6f2ea",
            "color_abajo": "#2f3a5a",
            "color_calzado": "#2f3440",
            "color_accesorio": "#c25b56",
        },
    },
    "traje-oficina": {
        "piezas": {
            "ropa": "ropa-camisa",
            "abajo": "abajo-vestir",
            "calzado": "calzado-guillies",
            "adorno": "adorno-corbata",
        },
        "colores": {
            "color_ropa": "#eef2f6",
            "color_abajo": "#3a3f4a",
            "color_calzado": "#3b2417",
            "color_accesorio": "#3f6aa0",
        },
    },
    "traje-jardinero": {
        "piezas": {"ropa": "ropa-remera", "abajo": "abajo-pantalon", "calzado": "calzado-zapatillas"},
        "colores": {"color_ropa": "#f6e7c8", "color_abajo": "#4a6a9a", "color_calzado": "#c25b56"},
        "capa": "jardinero",
    },
    "traje-tiradores": {
        "piezas": {
            "ropa": "ropa-camisa",
            "abajo": "abajo-vestir",
            "calzado": "calzado-guillies",
            "adorno": "adorno-monito",
        },
        "colores": {
            "color_ropa": "#f6f2ea",
            "color_abajo": "#5a4a42",
            "color_calzado": "#3b2417",
            "color_accesorio": "#c25b56",
        },
        "capa": "tiradores",
    },
    "traje-pijama": {
        "piezas": {"ropa": "ropa-remera", "abajo": "abajo-calzas", "calzado": "calzado-pantuflas"},
        "colores": {"color_ropa": "#f2c4d8", "color_abajo": "#f2c4d8", "color_calzado": "#f6e7c8"},
    },
    "traje-deportivo": {
        "piezas": {"ropa": "ropa-musculosa", "abajo": "abajo-short", "calzado": "calzado-zapatillas"},
        "colores": {"color_ropa": "#3f6aa0", "color_abajo": "#2f3440", "color_calzado": "#f6f6ee"},
    },
    "traje-invierno": {
        "piezas": {"ropa": "ropa-buzo", "abajo": "abajo-jean", "calzado": "calzado-botas", "adorno": "adorno-bufanda"},
        "colores": {
            "color_ropa": "#c25b56",
            "color_abajo": "#3b4a6b",
            "color_calzado": "#5a3825",
            "color_accesorio": "#e0a43a",
        },
    },
    "traje-gaucho": {
        "piezas": {
            "ropa": "ropa-camisa",
            "abajo": "abajo-bombacha",
            "calzado": "calzado-botas",
            "adorno": "adorno-panuelo-cuello",
        },
        "colores": {
            "color_ropa": "#f6e7c8",
            "color_abajo": "#4a3a32",
            "color_calzado": "#3b2417",
            "color_accesorio": "#c25b56",
        },
    },
}
# Lo que se compró antes de juntar el mate y el termo en una sola mascota
ANTES_ERA = {"mate-termo": ("mate", "termo")}
SLOTS = ("cabeza", "cara", "cuello", "sombrero", "lentes", "adorno", "traje")  # opcionales
OBLIGATORIOS = ("mascota", "peinado", "ropa", "abajo", "calzado")
COLORES = ("piel", "pelo", "ojos", "labios", "unas", "color_ropa", "color_abajo", "color_calzado", "color_accesorio")
SILUETAS = ("a", "b", "c")  # c: delgada y unisex
FORMAS_DE_OJOS = ("redondos", "almendrados", "cansados", "cuadrados")
DETALLES = ("pestanas", "rubor", "pecas")  # sí / no, gratis
ESCENAS_SOLO = ("escritorio", "chimenea")
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
NOMBRE_DE_MASCOTA = {"gato": "Michi", "perro": "Toby"}
# Lo que se ve en el miniperfil, además de la foto y el apodo
PERFIL = ("color_apodo", "descripcion")
MAX_DESCRIPCION = 100

# Para que no todos arranquen iguales, el avatar inicial sale del id del usuario
_PIELES = ["#f9dcc4", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffe0d0"]
_PELOS = ["#2b1d1a", "#5a3825", "#a0522d", "#e6c07b", "#1f2a44", "#c0392b", "#7d5ba6", "#f5a3c7"]
_OJOS = ["#5b3a29", "#2e86c1", "#27ae60", "#8e44ad", "#c0392b", "#34495e"]
_ROPAS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#10b981"]


def apariencia_inicial(usuario_id: int) -> dict:
    u = usuario_id
    return {
        "mascota": "gato-naranja" if u % 2 else "perro-caramelo",
        "nombre": "Michi" if u % 2 else "Toby",
        "decoracion": [],
        "silueta": "a" if u % 2 == 0 else "b",
        "peinado": ("pelo-long-straight", "pelo-messy1", "pelo-bob", "pelo-curly-short", "pelo-afro", "pelo-plain")[
            u % 6
        ],
        "ropa": "ropa-buzo",
        "abajo": "abajo-pantalon" if u % 3 else "abajo-pollera",
        "calzado": "calzado-zapatillas",
        "color_abajo": "#3b4a6b",
        "color_calzado": "#5a3825",
        "color_accesorio": "#e88aa8",
        "piel": _PIELES[u % len(_PIELES)],
        "pelo": _PELOS[(u * 3) % len(_PELOS)],
        "ojos": _OJOS[(u * 5) % len(_OJOS)],
        "labios": "#e06c75",
        "unas": "#f4a6c1",
        "color_ropa": _ROPAS[(u * 7) % len(_ROPAS)],
        "escena": "escritorio",
        "ojos_forma": "redondos",
        "pestanas": True,
        "rubor": True,
        "pecas": False,
    }


class ErrorRincon(ErrorTraducible):
    pass


def rincon_de(db: Session, usuario_id: int) -> Rincon:
    """El rincón del usuario; si es la primera vez, se lo crea con monedas de regalo."""
    rincon = db.get(Rincon, usuario_id)
    if rincon is None:
        rincon = Rincon(
            usuario_id=usuario_id,
            monedas=MONEDAS_DE_BIENVENIDA,
            comprados=[],
            apariencia=apariencia_inicial(usuario_id),
        )
        db.add(rincon)
        db.add(MovimientoMonedas(usuario_id=usuario_id, motivo="bienvenida", cantidad=MONEDAS_DE_BIENVENIDA))
        db.flush()
    return rincon


def ganado_hoy(db: Session, usuario_id: int) -> dict[str, int]:
    filas = (
        db.query(MovimientoMonedas.motivo, func.sum(MovimientoMonedas.cantidad))
        .filter_by(usuario_id=usuario_id, fecha=date.today())
        .group_by(MovimientoMonedas.motivo)
        .all()
    )
    hoy = dict.fromkeys(TOPES, 0)
    for motivo, cantidad in filas:
        if motivo in MOTIVOS:
            hoy[MOTIVOS[motivo]] += cantidad
    return hoy


def dar(db: Session, usuario_id: int, motivo: str, cantidad: int) -> tuple[int, int]:
    """Suma monedas respetando el tope del día. Devuelve (cuántas ganó, cuántas tiene ahora)."""
    rincon = rincon_de(db, usuario_id)
    tope = TOPES[MOTIVOS[motivo]]
    ganadas = max(0, min(cantidad, tope - ganado_hoy(db, usuario_id)[MOTIVOS[motivo]]))
    if ganadas:
        rincon.monedas += ganadas
        db.add(MovimientoMonedas(usuario_id=usuario_id, motivo=motivo, cantidad=ganadas))
    db.commit()
    return ganadas, rincon.monedas


def monedas_por_pomodoro(minutos: float) -> int:
    return round(minutos * POR_MINUTO_DE_POMODORO)


def lo_tiene(rincon: Rincon, articulo_id: str) -> bool:
    articulo = CATALOGO.get(articulo_id)
    if articulo is None:
        return False
    comprados = set(rincon.comprados)
    if articulo.precio == 0 or articulo_id in comprados:
        return True
    if comprados & set(ANTES_ERA.get(articulo_id, ())):
        return True
    # las prendas de un traje que ya tiene
    return any(articulo_id in traje["piezas"].values() for id_traje, traje in TRAJES.items() if id_traje in comprados)


def habilitados(rincon: Rincon) -> list[str]:
    """Todo lo que puede usar sin comprar: lo comprado, lo gratis y lo que viene en sus trajes."""
    return [a for a in CATALOGO if lo_tiene(rincon, a)]


def comprar(db: Session, rincon: Rincon, articulo_id: str) -> None:
    articulo = CATALOGO.get(articulo_id)
    if articulo is None:
        raise ErrorRincon("articulo_no_existe")
    if lo_tiene(rincon, articulo_id):
        raise ErrorRincon("ya_lo_tenes")
    if rincon.monedas < articulo.precio:
        raise ErrorRincon("monedas_insuficientes", faltan=articulo.precio - rincon.monedas)
    rincon.monedas -= articulo.precio
    rincon.comprados = [*rincon.comprados, articulo_id]
    db.add(MovimientoMonedas(usuario_id=rincon.usuario_id, motivo="compra", cantidad=-articulo.precio))
    db.commit()


def _es_mio(rincon: Rincon, articulo_id, tipo: str) -> bool:
    articulo = CATALOGO.get(articulo_id) if isinstance(articulo_id, str) else None
    return articulo is not None and articulo.tipo == tipo and lo_tiene(rincon, articulo_id)


def cambiar_apariencia(db: Session, rincon: Rincon, datos: dict) -> None:
    """Arma el avatar, viste a la mascota y decora el escritorio, solo con cosas que el usuario tiene.
    Los colores son libres. Lo que ya tenía puesto se puede seguir usando aunque después haya dejado
    de ser gratis."""
    puesto = completar(rincon.apariencia, rincon.usuario_id)
    nueva = {"nombre": datos["nombre"].strip(), "escena": datos.get("escena") or "escritorio", "decoracion": []}
    if nueva["escena"] not in ESCENAS_SOLO:
        raise ErrorRincon("articulo_no_existe")
    base = apariencia_inicial(rincon.usuario_id)
    for slot in OBLIGATORIOS:
        valor = datos.get(slot) or base[slot]
        if valor != puesto.get(slot) and not _es_mio(rincon, valor, slot):
            raise ErrorRincon("articulo_no_comprado")
        nueva[slot] = valor
    for slot in SLOTS:
        valor = datos.get(slot)
        if valor:
            if valor != puesto.get(slot) and not _es_mio(rincon, valor, slot):
                raise ErrorRincon("articulo_no_comprado")
            nueva[slot] = valor
    for color in COLORES:
        valor = datos.get(color) or base[color]
        nueva[color] = valor.lower() if COLOR.match(valor) else base[color]
    silueta = datos.get("silueta") or puesto.get("silueta") or base["silueta"]
    nueva["silueta"] = silueta if silueta in SILUETAS else base["silueta"]
    forma = datos.get("ojos_forma") or base["ojos_forma"]
    nueva["ojos_forma"] = forma if forma in FORMAS_DE_OJOS else base["ojos_forma"]
    for detalle in DETALLES:
        valor = datos.get(detalle)
        nueva[detalle] = valor if isinstance(valor, bool) else puesto[detalle]
    for item in dict.fromkeys(datos.get("decoracion") or []):
        if not _es_mio(rincon, item, "decoracion"):
            raise ErrorRincon("articulo_no_comprado")
        nueva["decoracion"].append(item)
    for campo in PERFIL:  # el perfil se cambia aparte; vestirse no lo borra
        if puesto.get(campo) is not None:
            nueva[campo] = puesto[campo]
    rincon.apariencia = nueva
    db.commit()


def cambiar_perfil(db: Session, rincon: Rincon, color_apodo: str | None, descripcion: str | None) -> None:
    """El color del apodo y la descripción del miniperfil (qué estudia, cómo se siente). None = no cambiar."""
    apariencia = completar(rincon.apariencia, rincon.usuario_id)
    if color_apodo is not None:
        apariencia["color_apodo"] = color_apodo.lower() if COLOR.match(color_apodo) else None
    if descripcion is not None:
        apariencia["descripcion"] = " ".join(descripcion.split())[:MAX_DESCRIPCION] or None
    rincon.apariencia = apariencia
    db.commit()


def completar(apariencia: dict | None, usuario_id: int) -> dict:
    """Las apariencias guardadas antes de que existiera el avatar no tienen todos los campos."""
    completa = {**apariencia_inicial(usuario_id), **(apariencia or {})}
    for nueva, viejas in ANTES_ERA.items():
        if completa.get("mascota") in viejas:
            completa["mascota"] = nueva
    return completa


def version_foto_mascota(db: Session, usuario_id: int) -> int:
    foto = db.get(FotoMascota, usuario_id)
    return foto.version if foto else 0


def apariencia_publica(rincon: Rincon | None, usuario_id: int, foto_mascota: int = 0) -> dict:
    """Lo que ven los demás en la biblioteca."""
    apariencia = completar(rincon.apariencia if rincon else None, usuario_id)
    return {**apariencia, "foto": rincon.foto_version if rincon and rincon.foto else 0, "foto_mascota": foto_mascota}
