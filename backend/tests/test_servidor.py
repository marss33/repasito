from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import Frontend


def test_cache_del_frontend(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html></html>")
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)")
    app = FastAPI()
    app.mount("/", Frontend(directory=tmp_path, html=True))
    cliente = TestClient(app)

    # index.html nunca se cachea, así siempre llega la última versión
    assert cliente.get("/").headers["cache-control"] == "no-cache"
    # los archivos con hash en el nombre se cachean para siempre
    assert "immutable" in cliente.get("/assets/index-abc123.js").headers["cache-control"]


def test_cabeceras_de_seguridad_y_compresion(anonimo):
    r = anonimo.get("/api/estado")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors" in r.headers["content-security-policy"]  # solo Discord puede mostrarla en un marco
    assert r.json()["ia_configurada"] is False
    assert r.json()["limite_diario"] == 40
    assert isinstance(r.json()["ocr_disponible"], bool)
