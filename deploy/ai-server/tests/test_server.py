"""Tests for the reference AI server; inference is replaced, so no model is downloaded.

Run from deploy/ai-server: `pip install -r requirements.txt pytest httpx && python -m pytest tests`.
"""

from __future__ import annotations

import base64
import importlib
import io
import sys
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as server


def png(width: int = 20, height: int = 20, fmt: str = "PNG") -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), "blue").save(out, fmt)
    return out.getvalue()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(server, "run_background_removal", lambda data, model: png(5, 5))
    monkeypatch.setattr(server, "API_KEY", "")
    monkeypatch.setattr(server, "ALLOW_NO_KEY", True)
    with TestClient(server.app) as test_client:
        yield test_client


def post(client, data: bytes | None = None, **form):
    return client.post(
        "/v1/background-removal",
        files={"image": ("a.png", png() if data is None else data, "image/png")},
        data=form,
    )


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_only_the_active_models_are_offered_the_default_first(client):
    models = client.get("/v1/models").json()["models"]
    assert [m["id"] for m in models] == [server.DEFAULT_MODEL] + [
        m for m in server.ACTIVE_MODELS if m != server.DEFAULT_MODEL
    ]
    assert all(m["tasks"] == ["background-removal"] for m in models)


@pytest.mark.parametrize("model", ["birefnet-general-lite", "anything-else"])
def test_a_model_that_is_not_offered_is_refused(client, model):
    assert model not in server.ACTIVE_MODELS
    res = post(client, model=model)
    assert res.status_code == 400 and res.json()["error"]["code"] == "unknown_model"


def test_a_default_outside_the_active_models_is_not_added(monkeypatch):
    monkeypatch.setenv("AVAILABLE_MODELS", "u2netp")
    monkeypatch.setenv("DEFAULT_MODEL", "birefnet-general-lite")
    reloaded = importlib.reload(server)
    try:
        assert reloaded.ACTIVE_MODELS == ["u2netp"] and reloaded.DEFAULT_MODEL == "u2netp"
    finally:
        monkeypatch.delenv("AVAILABLE_MODELS")
        monkeypatch.delenv("DEFAULT_MODEL")
        importlib.reload(server)


def test_png_and_json_answers(client):
    res = post(client)
    assert res.status_code == 200 and res.headers["content-type"] == "image/png"
    res = client.post(
        "/v1/background-removal",
        files={"image": ("a.png", png(), "image/png")},
        headers={"Accept": "application/json"},
    )
    assert base64.b64decode(res.json()["image_b64"]) == png(5, 5)


def test_unknown_task(client):
    res = client.post("/v1/upscale", files={"image": ("a.png", png(), "image/png")})
    assert res.status_code == 404


def test_the_key_is_checked_before_the_body_is_read(client, monkeypatch):
    monkeypatch.setattr(server, "API_KEY", "k-123")
    read = []
    monkeypatch.setattr(server, "_checked_image", lambda data: read.append(data))
    assert post(client).status_code == 401 and read == []
    assert client.get("/v1/models").status_code == 401
    assert client.get("/health").status_code == 200
    ok = client.post(
        "/v1/background-removal",
        files={"image": ("a.png", png(), "image/png")},
        headers={"Authorization": "Bearer k-123"},
    )
    assert ok.status_code == 200
    assert client.get("/v1/models", headers={"X-Api-Key": "k-123"}).status_code == 200


def test_a_body_over_the_limit_is_refused_before_parsing(client, monkeypatch):
    monkeypatch.setattr(server, "MAX_BODY_BYTES", 1000)
    res = post(client, png(200, 200) + b"\0" * 2000)
    assert res.status_code == 413 and res.json()["error"]["code"] == "too_large"


def test_dimensions_are_checked_from_the_header_before_decoding(client):
    huge = png(server.MAX_DIMENSION + 1, 1)
    res = post(client, huge)
    assert res.status_code == 413


@pytest.mark.parametrize("fmt", ["GIF", "BMP"])
def test_only_png_jpeg_and_webp_are_accepted(client, fmt):
    res = post(client, png(fmt=fmt))
    assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_image"


def test_busy_answers_429(client, monkeypatch):
    started, release = threading.Event(), threading.Event()

    def slow(data, model):
        started.set()
        release.wait(5)
        return png(5, 5)

    monkeypatch.setattr(server, "run_background_removal", slow)
    results = []
    worker = threading.Thread(target=lambda: results.append(post(client).status_code))
    worker.start()
    assert started.wait(5)
    busy = post(client)
    assert busy.status_code == 429 and busy.headers["Retry-After"] == "5"
    release.set()
    worker.join()
    assert results == [200]


def test_a_slow_image_times_out_and_keeps_its_slot_until_done(client, monkeypatch):
    monkeypatch.setattr(server, "TIMEOUT_SECONDS", 0.2)
    monkeypatch.setattr(server, "run_background_removal", lambda data, model: time.sleep(0.6) or png(5, 5))
    assert post(client).status_code == 503
    assert post(client).status_code == 429  # the first image still runs
    time.sleep(0.8)
    monkeypatch.setattr(server, "run_background_removal", lambda data, model: png(5, 5))
    assert post(client).status_code == 200


def test_errors_never_carry_exception_text(client, monkeypatch):
    def boom(data, model):
        raise RuntimeError("secret path /models/x.onnx")

    monkeypatch.setattr(server, "run_background_removal", boom)
    res = post(client)
    assert res.status_code == 500 and "secret" not in res.text


def test_no_cors(client):
    res = client.get("/v1/models", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in res.headers


def test_it_does_not_start_without_a_key_unless_told_to(monkeypatch):
    monkeypatch.setattr(server, "API_KEY", "")
    monkeypatch.setattr(server, "ALLOW_NO_KEY", False)
    with pytest.raises(RuntimeError, match="API_KEY"), TestClient(server.app):
        pass
    monkeypatch.setattr(server, "API_KEY", "k-123")
    with TestClient(server.app) as test_client:
        assert test_client.get("/health").status_code == 200


def test_a_chunked_body_over_the_limit_is_a_413(client, monkeypatch):
    monkeypatch.setattr(server, "MAX_BODY_BYTES", 1000)
    boundary = b"xyz"

    def body():
        yield b'--xyz\r\nContent-Disposition: form-data; name="image"; filename="a.png"\r\n\r\n'
        for _ in range(10):
            yield b"\0" * 500
        yield b"\r\n--xyz--\r\n"

    res = client.post(
        "/v1/background-removal",
        content=body(),
        headers={"Content-Type": "multipart/form-data; boundary=" + boundary.decode()},
    )
    assert res.status_code == 413 and res.json()["error"]["code"] == "too_large"


def test_a_busy_server_answers_before_reading_the_upload(client, monkeypatch):
    read = []
    monkeypatch.setattr(server, "_checked_image", lambda data: read.append(data))
    assert server._slots.acquire(blocking=False)
    try:
        res = post(client)
    finally:
        server._slots.release()
    assert res.status_code == 429 and read == []


def test_framework_errors_use_the_contract_shape(client):
    assert client.get("/openapi.json").json()["error"]["code"] == "not_found"
    assert client.get("/v1/background-removal").json()["error"]["code"] == "method_not_allowed"
    missing = client.post("/v1/background-removal", data={"model": "u2netp"})
    assert missing.status_code == 400 and missing.json()["error"]["code"] == "invalid_request"
