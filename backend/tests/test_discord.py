from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.routers import discord


def test_sin_configurar_avisa(anonimo, monkeypatch):
    monkeypatch.setattr(config, "DISCORD_CLIENT_ID", "")
    assert anonimo.post("/api/discord/token", json={"code": "x"}).status_code == 503


def test_entrar_con_discord_y_compartir_sala(anonimo, monkeypatch):
    monkeypatch.setattr(config, "DISCORD_CLIENT_ID", "123")
    monkeypatch.setattr(config, "DISCORD_CLIENT_SECRET", "secreto")
    perfiles = {
        "codigo-ana": {"id": "111", "username": "ana_k", "global_name": "Ana"},
        "codigo-beto": {"id": "222", "username": "beto"},
    }
    monkeypatch.setattr(discord, "intercambiar_codigo", lambda code: ("token-discord", perfiles[code]))

    r = anonimo.post("/api/discord/token", json={"code": "codigo-ana"})
    assert r.status_code == 200
    ana = r.json()
    assert (ana["access_token"], ana["usuario"]["nombre"], ana["usuario"]["email"]) == ("token-discord", "Ana", "")
    # La sesión va en el header (dentro de Discord las cookies del iframe pueden no andar)
    cabecera_ana = {"Authorization": f"Bearer {ana['sesion']}"}
    with TestClient(app) as limpio:
        assert limpio.get("/api/auth/yo", headers=cabecera_ana).json()["nombre"] == "Ana"
        # Volver a entrar no crea otra cuenta
        otra_vez = limpio.post("/api/discord/token", json={"code": "codigo-ana"}).json()
        assert otra_vez["usuario"]["id"] == ana["usuario"]["id"]

        beto = limpio.post("/api/discord/token", json={"code": "codigo-beto"}).json()
        cabecera_beto = {"Authorization": f"Bearer {beto['sesion']}"}
        sala_ana = limpio.post(
            "/api/discord/sala", json={"instancia": "i-1", "nombre": "#estudio"}, headers=cabecera_ana
        ).json()
        sala_beto = limpio.post("/api/discord/sala", json={"instancia": "i-1"}, headers=cabecera_beto).json()
        assert sala_ana["codigo"] == sala_beto["codigo"] and sala_ana["nombre"] == "#estudio"
        otra = limpio.post("/api/discord/sala", json={"instancia": "i-2"}, headers=cabecera_beto).json()
        assert otra["codigo"] != sala_ana["codigo"]

        # Las imágenes y descargas aceptan el token por la URL (un <img> no puede mandar headers)
        assert limpio.get(f"/api/salas/{sala_ana['codigo']}/archivos?token={ana['sesion']}").status_code == 200
        assert limpio.get(f"/api/salas/{sala_ana['codigo']}/archivos?token=falso").status_code == 401

        # La sala en vivo acepta el token por la URL
        with limpio.websocket_connect(f"/api/salas/{sala_ana['codigo']}/ws?token={ana['sesion']}") as ws:
            for _ in range(10):
                mensaje = ws.receive_json()
                if mensaje["tipo"] == "estado":
                    break
            assert [p["nombre"] for p in mensaje["conectados"]] == ["Ana"]


def test_rutas_con_el_proxy_de_discord(anonimo):
    assert anonimo.get("/.proxy/api/estado").json()["ia_configurada"] in (True, False)


def test_discord_puede_mostrar_la_app_en_su_marco(anonimo):
    r = anonimo.get("/api/estado")
    assert "x-frame-options" not in r.headers  # bloquearía el iframe de la actividad
    politica = r.headers["content-security-policy"]
    assert (
        "frame-ancestors" in politica and "https://*.discordsays.com" in politica and "https://discord.com" in politica
    )


def test_modo_solo_discord_cierra_la_web(anonimo, monkeypatch):
    monkeypatch.setattr(config, "SOLO_DISCORD", True)
    assert anonimo.get("/api/estado").json()["solo_discord"] is True
    # Desde la web no se puede crear cuenta, entrar ni probar como invitado
    assert anonimo.post("/api/auth/invitado").status_code == 403
    assert anonimo.post("/api/auth/login", json={"email": "a@b.com", "password": "12345678"}).status_code == 403
    datos = {"email": "a@b.com", "nombre": "Ana", "password": "12345678"}
    assert anonimo.post("/api/auth/registro", json=datos).status_code == 403
    # Discord sigue andando
    monkeypatch.setattr(config, "DISCORD_CLIENT_ID", "123")
    monkeypatch.setattr(config, "DISCORD_CLIENT_SECRET", "secreto")
    monkeypatch.setattr(discord, "intercambiar_codigo", lambda code: ("t", {"id": "9", "username": "eva"}))
    assert anonimo.post("/api/discord/token", json={"code": "c"}).status_code == 200
