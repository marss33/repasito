"""Materia de ejemplo que reciben las cuentas nuevas, para probar la app sin subir nada."""

from sqlalchemy.orm import Session

from .extraccion import partir, trocear, unir_paginas
from .models import Documento, Flashcard, Fragmento, Materia, Usuario

APUNTE = """La célula: unidad básica de la vida

La célula es la unidad estructural y funcional de todos los seres vivos. Según la teoría celular, todos los \
organismos están formados por una o más células, toda célula proviene de otra célula preexistente y la célula \
es la unidad mínima capaz de realizar las funciones vitales: nutrición, relación y reproducción.

Células procariotas y eucariotas

Las células procariotas no tienen un núcleo definido: su material genético (ADN) está libre en el citoplasma, \
en una región llamada nucleoide. Son más pequeñas y simples, y no tienen organelas rodeadas de membrana. \
Las bacterias y las arqueas son procariotas.

Las células eucariotas tienen un núcleo rodeado por una doble membrana (la envoltura nuclear) que protege el ADN. \
Además tienen organelas membranosas que cumplen funciones específicas. Animales, plantas, hongos y protistas \
están formados por células eucariotas.

Organelas principales

La membrana plasmática rodea a la célula y controla qué sustancias entran y salen. Está formada por una bicapa \
de fosfolípidos con proteínas incrustadas; por eso se dice que tiene una estructura de mosaico fluido y que es \
selectivamente permeable.

Las mitocondrias producen la mayor parte de la energía de la célula en forma de ATP, mediante la respiración \
celular. Tienen su propio ADN, lo que apoya la teoría endosimbiótica: habrían sido bacterias que fueron \
incorporadas por otra célula hace millones de años.

Los ribosomas fabrican proteínas a partir de la información del ARN mensajero. Pueden estar libres en el \
citoplasma o unidos al retículo endoplasmático rugoso.

El retículo endoplasmático rugoso tiene ribosomas y participa en la síntesis de proteínas; el liso no tiene \
ribosomas y fabrica lípidos. El aparato de Golgi modifica, empaqueta y distribuye las proteínas y los lípidos.

Los lisosomas contienen enzimas digestivas que degradan moléculas y organelas dañadas.

Las células vegetales tienen además pared celular de celulosa, que les da rigidez, cloroplastos, donde ocurre \
la fotosíntesis, y una vacuola central grande que almacena agua.

Respiración celular y fotosíntesis

La respiración celular ocurre en las mitocondrias y transforma la glucosa en energía utilizable: \
glucosa + oxígeno → dióxido de carbono + agua + ATP.

La fotosíntesis ocurre en los cloroplastos y es el proceso inverso: usa la energía de la luz para fabricar \
glucosa a partir de dióxido de carbono y agua, liberando oxígeno. El pigmento que capta la luz es la clorofila.

División celular

En la mitosis, una célula se divide en dos células hijas genéticamente idénticas a la madre. Tiene cuatro fases: \
profase (los cromosomas se condensan), metafase (se alinean en el centro), anafase (las cromátidas se separan \
hacia los polos) y telofase (se forman dos núcleos). Sirve para el crecimiento y la reparación de tejidos.

En la meiosis, una célula se divide dos veces y forma cuatro células con la mitad de cromosomas (haploides). \
Así se forman los gametos: óvulos y espermatozoides. Durante la meiosis ocurre el entrecruzamiento, que \
intercambia material genético y genera variabilidad."""

TARJETAS = [
    ("¿Qué diferencia principal hay entre una célula procariota y una eucariota?",
     "La eucariota tiene un núcleo rodeado de membrana; en la procariota el ADN está libre en el citoplasma."),
    ("¿Qué función cumplen las mitocondrias?",
     "Producen la mayor parte de la energía de la célula (ATP) mediante la respiración celular."),
    ("¿Qué organelas tienen las células vegetales y las animales no?",
     "Pared celular de celulosa, cloroplastos y una vacuola central grande."),
    ("¿Cuál es el resultado de la mitosis?", "Dos células hijas genéticamente idénticas a la célula madre."),
    ("¿Para qué sirve la meiosis?",
     "Para formar gametos: cuatro células con la mitad de cromosomas, con variabilidad genética."),
    ("¿Qué hace el aparato de Golgi?", "Modifica, empaqueta y distribuye proteínas y lípidos."),
]  # fmt: skip


NOTES = """The cell: the basic unit of life

The cell is the structural and functional unit of all living things. According to cell theory, every \
organism is made of one or more cells, every cell comes from a pre-existing cell, and the cell is the \
smallest unit able to carry out the functions of life: nutrition, interaction and reproduction.

Prokaryotic and eukaryotic cells

Prokaryotic cells have no defined nucleus: their genetic material (DNA) floats in the cytoplasm, in a \
region called the nucleoid. They are smaller and simpler, and they have no membrane-bound organelles. \
Bacteria and archaea are prokaryotes.

Eukaryotic cells have a nucleus surrounded by a double membrane (the nuclear envelope) that protects the DNA. \
They also have membrane-bound organelles with specific jobs. Animals, plants, fungi and protists are made of \
eukaryotic cells.

Main organelles

The plasma membrane surrounds the cell and controls which substances get in and out. It is a phospholipid \
bilayer with embedded proteins, which is why it is described as a fluid mosaic and as selectively permeable.

Mitochondria produce most of the cell's energy as ATP, through cellular respiration. They have their own DNA, \
which supports the endosymbiotic theory: they would have been bacteria engulfed by another cell millions of \
years ago.

Ribosomes build proteins from the information in messenger RNA. They can float free in the cytoplasm or be \
attached to the rough endoplasmic reticulum.

The rough endoplasmic reticulum has ribosomes and takes part in protein synthesis; the smooth one has no \
ribosomes and makes lipids. The Golgi apparatus modifies, packages and ships proteins and lipids.

Lysosomes contain digestive enzymes that break down molecules and damaged organelles.

Plant cells also have a cellulose cell wall, which makes them rigid, chloroplasts, where photosynthesis takes \
place, and a large central vacuole that stores water.

Cellular respiration and photosynthesis

Cellular respiration happens in the mitochondria and turns glucose into usable energy: \
glucose + oxygen → carbon dioxide + water + ATP.

Photosynthesis happens in the chloroplasts and is the reverse process: it uses light energy to make glucose \
from carbon dioxide and water, releasing oxygen. The pigment that captures light is chlorophyll.

Cell division

In mitosis, one cell divides into two daughter cells that are genetically identical to the parent. It has four \
phases: prophase (chromosomes condense), metaphase (they line up in the middle), anaphase (sister chromatids \
move to opposite poles) and telophase (two nuclei form). It is used for growth and tissue repair.

In meiosis, a cell divides twice and produces four cells with half the chromosomes (haploid). This is how \
gametes are made: eggs and sperm. During meiosis, crossing over swaps genetic material and creates variation."""

CARDS = [
    ("What is the main difference between a prokaryotic and a eukaryotic cell?",
     "Eukaryotic cells have a membrane-bound nucleus; in prokaryotes the DNA floats in the cytoplasm."),
    ("What do mitochondria do?", "They produce most of the cell's energy (ATP) through cellular respiration."),
    ("Which organelles do plant cells have that animal cells don't?",
     "A cellulose cell wall, chloroplasts and a large central vacuole."),
    ("What is the result of mitosis?", "Two daughter cells genetically identical to the parent cell."),
    ("What is meiosis for?", "To make gametes: four cells with half the chromosomes, with genetic variation."),
    ("What does the Golgi apparatus do?", "It modifies, packages and ships proteins and lipids."),
]  # fmt: skip

EJEMPLOS = {
    "es": ("Biología (ejemplo)", "La célula - apunte de ejemplo.txt", APUNTE, TARJETAS),
    "en": ("Biology (example)", "The cell - example notes.txt", NOTES, CARDS),
}


def crear_materia_de_ejemplo(db: Session, usuario: Usuario, idioma: str = "es") -> Materia:
    nombre_materia, nombre_documento, apunte, tarjetas = EJEMPLOS.get(idioma, EJEMPLOS["es"])
    materia = Materia(usuario=usuario, nombre=nombre_materia)
    paginas = partir(apunte, tamano=1800)
    documento = Documento(
        materia=materia,
        nombre=nombre_documento,
        tipo="texto",
        paginas=len(paginas),
        texto=unir_paginas("texto", paginas),
    )
    documento.fragmentos = [Fragmento(pagina=t.pagina, orden=i, texto=t.texto) for i, t in enumerate(trocear(paginas))]
    materia.flashcards = [Flashcard(documento=documento, frente=f, dorso=d) for f, d in tarjetas]
    db.add(materia)
    return materia
