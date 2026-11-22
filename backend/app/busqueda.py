"""Búsqueda de fragmentos con BM25, sin dependencias externas."""

import math
import re
import unicodedata
from collections import Counter

STOPWORDS = set(
    """
    a al algo algun alguna algunas algunos ante antes aqui asi cada como con contra cual cuales
    cuando de del desde donde dos durante e el ella ellas ello ellos en entre era eran es esa esas
    ese eso esos esta estas este esto estos fue fueron ha han hay la las le les lo los mas me mi
    mis muy ni no nos o otra otras otro otros para pero poco por porque que quien se sea segun ser
    si sin sobre son su sus tal tambien tan te tiene tienen todo todos tu un una unas uno unos y ya
    yo explica explicame explicar sirve hace cuanto
    the of and to in is are was were be been for on with at by from as it its this that these those
    an or not but what which who how why when where do does did can could would should will has have had
    """.split()
)


def normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


def tokenizar(texto: str) -> list[str]:
    tokens = []
    for palabra in re.findall(r"\w+", normalizar(texto)):
        if len(palabra) < 2 or palabra in STOPWORDS:
            continue
        # plural simple: "derivadas" -> "derivada"
        if len(palabra) > 3 and palabra.endswith("s"):
            palabra = palabra[:-1]
        tokens.append(palabra)
    return tokens


class BM25:
    def __init__(self, textos: list[str], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        tokens = [tokenizar(t) for t in textos]
        self.frecuencias = [Counter(t) for t in tokens]
        self.largos = [len(t) for t in tokens]
        self.n = len(textos)
        self.promedio = (sum(self.largos) / self.n) if self.n else 0.0
        apariciones: Counter[str] = Counter()
        for frec in self.frecuencias:
            apariciones.update(frec.keys())
        self.idf = {termino: math.log(1 + (self.n - df + 0.5) / (df + 0.5)) for termino, df in apariciones.items()}

    def puntuar(self, consulta: str) -> list[float]:
        terminos = tokenizar(consulta)
        promedio = self.promedio or 1.0
        puntajes = []
        for frec, largo in zip(self.frecuencias, self.largos, strict=True):
            puntaje = 0.0
            for termino in terminos:
                tf = frec.get(termino)
                if not tf:
                    continue
                norma = self.k1 * (1 - self.b + self.b * largo / promedio)
                puntaje += self.idf[termino] * tf * (self.k1 + 1) / (tf + norma)
            puntajes.append(puntaje)
        return puntajes

    def buscar(self, consulta: str, k: int = 5) -> list[tuple[int, float]]:
        """Devuelve (índice, puntaje) de los k textos más relevantes con puntaje > 0."""
        puntajes = self.puntuar(consulta)
        orden = sorted(range(self.n), key=lambda i: puntajes[i], reverse=True)
        return [(i, puntajes[i]) for i in orden[:k] if puntajes[i] > 0]
