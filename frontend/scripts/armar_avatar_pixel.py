"""Arma el atlas del avatar pixel (frontend/public/pixel/) a partir del generador de personajes LPC.

Uso:  python armar_avatar_pixel.py <carpeta del repo Universal-LPC-Spritesheet-Character-Generator>

Toma solo las piezas de src/pixel/piezas_avatar.json, recorta el cuadro mirando de frente (sentado en silla y de
pie), las junta en una sola imagen y genera CREDITOS_ARTE.md con los autores y licencias de cada pieza
(las licencias de LPC piden dar crédito)."""

import csv
import json
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
SALIDA = AQUI.parent / "public" / "pixel"
LADO = 64
# En las hojas de LPC la fila 3 (índice 2) mira hacia abajo, o sea, de frente
POSES = {"sit": ("sit.png", 2), "idle": ("idle.png", 0)}


def rutas_de(piezas: dict) -> set[str]:
    siluetas = piezas["siluetas"].values()
    rutas: set[str] = set()

    def agregar(plantilla: str) -> None:
        for s in siluetas:
            rutas.add(plantilla.format(torso=s["torso"], piernas=s["piernas"], cuello=s["cuello"], id="{id}"))

    for s in siluetas:
        rutas.update([s["cuerpo"], s["cabeza"]])
    for nombre in piezas["peinado"]["lista"]:
        rutas.add(piezas["peinado"]["_ruta"].format(id=nombre))
    # Pelos largos con dos capas: adelante (fg) y detrás del cuerpo (bg)
    for nombre in piezas["peinado"]["con_capas"]:
        base = piezas["peinado"]["_ruta"].format(id=nombre)
        rutas.update([f"{base}/fg", f"{base}/bg"])
    for plantilla in piezas["trajes"].values():
        agregar(plantilla)
    for grupo in ("ropa", "abajo", "calzado", "sombrero", "lentes", "adorno"):
        for valor in piezas[grupo]["piezas"].values():
            agregar(valor["ruta"] if isinstance(valor, dict) else valor)
    return rutas


def main(lpc: Path) -> None:
    piezas = json.loads((AQUI.parent / "src" / "pixel" / "piezas_avatar.json").read_text(encoding="utf-8"))
    hojas = lpc / "spritesheets"
    marcos: list[tuple[str, Image.Image]] = []
    faltan = []
    usados: set[str] = set()
    for ruta in sorted(rutas_de(piezas)):
        for pose, (archivo, columna) in POSES.items():
            hoja = hojas / ruta / archivo
            if not hoja.exists():
                faltan.append(f"{ruta}/{archivo}")
                continue
            imagen = Image.open(hoja).convert("RGBA")
            marco = imagen.crop((columna * LADO, 2 * LADO, (columna + 1) * LADO, 3 * LADO))
            if marco.getbbox() is None:
                continue
            marcos.append((f"{ruta}|{pose}", marco))
            usados.add(f"{ruta}/{archivo}")

    columnas = 16
    filas = (len(marcos) + columnas - 1) // columnas
    atlas = Image.new("RGBA", (columnas * LADO, filas * LADO), (0, 0, 0, 0))
    indice = {}
    for i, (clave, marco) in enumerate(marcos):
        x, y = (i % columnas) * LADO, (i // columnas) * LADO
        atlas.alpha_composite(marco, (x, y))
        indice[clave] = [x, y]
    SALIDA.mkdir(parents=True, exist_ok=True)
    atlas.save(SALIDA / "avatar.png", optimize=True)
    (SALIDA / "avatar.json").write_text(json.dumps({"lado": LADO, "marcos": indice}, separators=(",", ":")), encoding="utf-8")
    print(f"{len(marcos)} cuadros -> {SALIDA / 'avatar.png'} ({(SALIDA / 'avatar.png').stat().st_size // 1024} KB)")
    if faltan:
        print(f"sin esa pose ({len(faltan)}):", ", ".join(faltan[:12]), "…" if len(faltan) > 12 else "")

    # Créditos de cada pieza usada
    creditos: dict[tuple[str, str, str], list[str]] = {}
    with open(lpc / "CREDITS.csv", encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            nombre = fila["filename"].strip()
            if nombre in usados:
                clave = (fila["authors"].strip(), fila["licenses"].strip(), fila["urls"].strip())
                creditos.setdefault(clave, []).append(nombre)
    lineas = [
        "# Créditos del arte",
        "",
        "Los personajes pixel de Repaso están hechos con piezas del proyecto",
        "[Liberated Pixel Cup (LPC)](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator).",
        "Cada pieza conserva su licencia original; abajo están sus autores, licencias y enlaces.",
        "",
    ]
    for (autores, licencias, urls), archivos in sorted(creditos.items(), key=lambda x: x[1][0]):
        carpetas = sorted({a.rsplit("/", 1)[0] for a in archivos})
        lineas += [f"## {', '.join(carpetas[:3])}{' …' if len(carpetas) > 3 else ''}", "", f"- Autores: {autores}", f"- Licencias: {licencias}"]
        lineas += [f"- Enlaces: {' · '.join(u.strip() for u in urls.split(',') if u.strip())}", ""]
    sin_credito = sorted(usados - {a for v in creditos.values() for a in v})
    if sin_credito:
        carpetas = sorted({a.rsplit("/", 1)[0] for a in sin_credito})
        lineas += [
            "## Piezas sin fila propia en CREDITS.csv",
            "",
            f"- Archivos: {', '.join(carpetas)}",
            "- Origen: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator",
            "- Autores y licencias: ver los créditos de ese repositorio (sus piezas son CC0, CC-BY, CC-BY-SA, OGA-BY o GPL).",
            "",
        ]
    (RAIZ / "CREDITOS_ARTE.md").write_text("\n".join(lineas), encoding="utf-8")
    print(f"créditos: {len(creditos)} grupos; piezas sin fila en CREDITS.csv: {len(sin_credito)}", sin_credito[:5])


if __name__ == "__main__":
    main(Path(sys.argv[1]))
