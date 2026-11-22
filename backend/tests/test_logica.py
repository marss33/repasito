from datetime import date, timedelta

import pytest

from app.busqueda import BM25, tokenizar
from app.ia import Contexto, renumerar_citas
from app.repaso_espaciado import Estado, repasar

HOY = date(2026, 3, 10)


# --- Repetición espaciada ---


def test_primer_acierto_vuelve_en_un_dia():
    estado, proxima = repasar(Estado(), 4, HOY)
    assert estado.repeticiones == 1
    assert proxima == HOY + timedelta(days=1)


def test_segundo_acierto_vuelve_en_seis_dias():
    estado, _ = repasar(Estado(), 4, HOY)
    estado, proxima = repasar(estado, 4, HOY)
    assert estado.repeticiones == 2
    assert proxima == HOY + timedelta(days=6)


def test_intervalo_crece_con_la_facilidad():
    estado = Estado(facilidad=2.5, intervalo=6, repeticiones=2)
    estado, proxima = repasar(estado, 5, HOY)
    assert estado.intervalo == 15
    assert proxima == HOY + timedelta(days=15)


def test_error_reinicia_y_vuelve_hoy():
    estado = Estado(facilidad=2.5, intervalo=15, repeticiones=3)
    nuevo, proxima = repasar(estado, 1, HOY)
    assert nuevo.repeticiones == 0
    assert proxima == HOY
    assert nuevo.facilidad < estado.facilidad


def test_facilidad_tiene_minimo():
    nuevo, _ = repasar(Estado(facilidad=1.3), 0, HOY)
    assert nuevo.facilidad == 1.3


def test_calidad_invalida():
    with pytest.raises(ValueError):
        repasar(Estado(), 7, HOY)


# --- Búsqueda ---


def test_tokenizar_saca_acentos_stopwords_y_plurales():
    assert tokenizar("Las Derivadas de la función") == ["derivada", "funcion"]


def test_bm25_encuentra_el_texto_relevante():
    textos = [
        "La mitosis es la division celular que produce dos celulas hijas identicas.",
        "La derivada mide la tasa de cambio instantanea de una funcion.",
        "El teorema de Pitagoras relaciona los lados de un triangulo rectangulo.",
    ]
    resultados = BM25(textos).buscar("¿Qué es una derivada?", k=2)
    assert resultados[0][0] == 1
    assert len(resultados) == 1  # los otros textos no comparten términos


def test_bm25_sin_coincidencias():
    assert BM25(["hola mundo"]).buscar("termodinamica") == []


def test_bm25_vacio():
    assert BM25([]).buscar("algo") == []


# --- Citas ---


def test_renumerar_citas():
    contexto = [Contexto("a.pdf", "pág. 1", "uno"), Contexto("b.pdf", "pág. 3", "dos"), Contexto("c.pdf", "", "tres")]
    r = renumerar_citas("La célula se divide [2][2]. Y crece [1, 3]. Inventado [9].", contexto)
    assert r.texto == "La célula se divide [1]. Y crece [2][3]. Inventado."
    assert [(f["n"], f["documento"], f["ubicacion"]) for f in r.fuentes] == [
        (1, "b.pdf", "pág. 3"),
        (2, "a.pdf", "pág. 1"),
        (3, "c.pdf", ""),
    ]


def test_renumerar_citas_no_toca_latex():
    r = renumerar_citas("La raíz cúbica $\\sqrt[3]{8} = 2$ [1].", [Contexto("a.pdf", "pág. 1", "uno")])
    assert r.texto == "La raíz cúbica $\\sqrt[3]{8} = 2$ [1]."


def test_renumerar_citas_con_formato_de_otros_modelos():
    contexto = [Contexto("a.pdf", "p. 1", "uno"), Contexto("b.pdf", "p. 2", "dos")]
    r = renumerar_citas("Mitosis has one round【2】. Meiosis has two【1†source】.", contexto)
    assert r.texto == "Mitosis has one round [1]. Meiosis has two [2]."
    assert [f["documento"] for f in r.fuentes] == ["b.pdf", "a.pdf"]


def test_renumerar_citas_sin_marcas():
    r = renumerar_citas("No está en los apuntes.", [Contexto("a.pdf", "pág. 1", "uno")])
    assert r.texto == "No está en los apuntes."
    assert r.fuentes == []
