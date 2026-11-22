"""Ícono pixel art de Repasito: un libro abierto con carita, sobre fondo cálido (32×32 píxeles).

Genera en frontend/public/: icono.svg (favicon), icono-512.png, icono-192.png, apple-touch-icon.png,
icono-maskable.png y icono-32.png (el logo chiquito de la app).

Uso:  python armar_icono.py"""

from pathlib import Path

from PIL import Image

SALIDA = Path(__file__).resolve().parent.parent / "public"

PALETA = {
    "o": "#3b2417",  # contorno
    "h": "#f6be82",  # fondo, brillo de arriba
    "f": "#f0a35e",  # fondo
    "d": "#d0803e",  # fondo, sombra de abajo
    "y": "#fff3b0",  # destellos
    "p": "#fbf3df",  # hojas
    "s": "#e8d4b0",  # sombra de las hojas
    "l": "#c9b48a",  # renglones
    "k": "#8a5a3b",  # lomo
    "g": "#4f8a5b",  # tapa
    "G": "#3a6a45",  # tapa oscura
    "e": "#2a1e24",  # ojos
    "w": "#ffffff",  # brillo de los ojos
    "r": "#f29ab0",  # rubor
    "m": "#3b2417",  # sonrisa
}

# La mitad izquierda del libro (12 columnas); la derecha es su espejo
LIBRO = [
    "...ooooooo..",
    "..oppppppoo.",
    ".opppppppppk",
    ".opllllllppk",
    ".opppppppppk",
    ".opppppwepp k".replace(" ", ""),
    ".opppppeeppk",
    ".opprrppppmk",
    ".opppppppppm",
    ".opllllllppk",
    ".opppppppppk",
    ".opllllllppk",
    ".osssssssssk",
    "ogggggggggGG",
    ".oooooooooooo"[:12],
]


def mapa() -> list[list[str]]:
    lado = 32
    m = [["." for _ in range(lado)] for _ in range(lado)]
    # fondo redondeado
    for y in range(lado):
        for x in range(lado):
            esquina = min(x, lado - 1 - x) + min(y, lado - 1 - y)
            if esquina < 2:
                continue
            borde = x in (0, lado - 1) or y in (0, lado - 1) or esquina == 2
            m[y][x] = "o" if borde else ("h" if y <= 3 else "d" if y >= 28 else "f")
    # destellos
    for x, y in [(24, 4), (24, 5), (22, 6), (23, 6), (24, 6), (25, 6), (26, 6), (24, 7), (24, 8), (7, 5), (6, 6), (7, 6), (8, 6), (7, 7)]:
        m[y][x] = "y"
    m[25][27] = "y"
    # el libro, centrado
    for j, fila in enumerate(LIBRO):
        completa = fila + fila[::-1]
        for i, letra in enumerate(completa):
            if letra != ".":
                m[10 + j][4 + i] = letra
    return m


def imagen(escala: int) -> Image.Image:
    m = mapa()
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    for y, fila in enumerate(m):
        for x, letra in enumerate(fila):
            if letra != ".":
                c = PALETA[letra].lstrip("#")
                img.putpixel((x, y), (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255))
    return img.resize((32 * escala, 32 * escala), Image.NEAREST)


def svg() -> str:
    m = mapa()
    rects = []
    for y, fila in enumerate(m):
        x = 0
        while x < 32:
            letra = fila[x]
            fin = x + 1
            while fin < 32 and fila[fin] == letra:
                fin += 1
            if letra != ".":
                rects.append(f'<rect x="{x}" y="{y}" width="{fin - x}" height="1" fill="{PALETA[letra]}"/>')
            x = fin
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">{"".join(rects)}</svg>\n'


def main() -> None:
    imagen(16).save(SALIDA / "icono-512.png", optimize=True)
    imagen(6).save(SALIDA / "icono-192.png", optimize=True)
    imagen(1).save(SALIDA / "icono-32.png", optimize=True)
    # Apple usa 180×180 y no quiere transparencias: el ícono a 5× sobre el color del fondo
    apple = Image.new("RGBA", (180, 180), PALETA["f"])
    apple.alpha_composite(imagen(5), (10, 10))
    apple.convert("RGB").save(SALIDA / "apple-touch-icon.png", optimize=True)
    # Maskable: el sistema recorta los bordes, así que el dibujo va más chico en el medio
    maskable = Image.new("RGBA", (512, 512), PALETA["f"])
    maskable.alpha_composite(imagen(12), (64, 64))
    maskable.save(SALIDA / "icono-maskable.png", optimize=True)
    (SALIDA / "icono.svg").write_text(svg(), encoding="utf-8")
    print("listo:", ", ".join(p.name for p in sorted(SALIDA.glob("icono*")) + [SALIDA / "apple-touch-icon.png"]))


if __name__ == "__main__":
    main()
