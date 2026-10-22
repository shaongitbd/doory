"""`POST /api/v1/exports/optimize/`: a page the browser drew (PNG), converted and optimized for a download."""

import io
import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image, PngImagePlugin
from rest_framework.throttling import ScopedRateThrottle

from apps.exports import optimizers, services
from apps.exports.exceptions import ExportBusy
from apps.exports.renderer import render_slot

from .helpers import FakeOptimizer

URL = "/api/v1/exports/optimize/"


def drawn(size=(120, 80), fmt="PNG") -> bytes:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    image.paste((30, 120, 220, 255), (0, 0, size[0] // 2, size[1]))
    image.paste((250, 200, 40, 255), (size[0] // 2, 0, size[0], size[1] // 2))
    out = io.BytesIO()
    image.save(out, fmt) if fmt == "PNG" else image.convert("RGB").save(out, fmt)
    return out.getvalue()


def upload(data: bytes, name="page.png") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, data, content_type="image/png")


@pytest.fixture
def optimizer(monkeypatch) -> FakeOptimizer:
    fake = FakeOptimizer()
    monkeypatch.setitem(optimizers.OPTIMIZERS, "builtin", fake)
    return fake


def test_the_png_comes_back_converted_and_optimized(client, optimizer):
    response = client.post(URL, {"file": upload(drawn()), "format": "webp", "quality": "balanced"})
    assert response.status_code == 200
    assert response["Content-Type"] == "image/webp"
    image = Image.open(io.BytesIO(response.content))
    assert (image.format, image.size) == ("WEBP", (120, 80))
    assert response["X-Doory-Format"] == "webp"
    assert (response["X-Doory-Width"], response["X-Doory-Height"]) == ("120", "80")
    assert response["X-Doory-Quality"] == "82"
    assert response["X-Doory-Optimizer"] == "builtin" and response["X-Doory-Optimized"] == "true"
    assert int(response["X-Doory-Bytes-Before"]) > len(response.content)
    assert json.loads(response["X-Doory-Warnings"]) == []
    assert response["Cache-Control"] == "no-store" and response["X-Content-Type-Options"] == "nosniff"
    (job,) = optimizer.jobs
    assert (job.format, job.quality, job.source) == ("webp", 82, drawn())


def test_without_optimizing_it_only_converts(client, optimizer):
    response = client.post(URL, {"file": upload(drawn()), "format": "jpg", "optimize": "false"})
    assert response.status_code == 200 and response["Content-Type"] == "image/jpeg"
    assert response["X-Doory-Optimizer"] == "" and response["X-Doory-Optimized"] == "false"
    assert int(response["X-Doory-Bytes-Before"]) == len(response.content)
    assert optimizer.jobs == []


def test_the_png_options_apply(client, optimizer):
    response = client.post(
        URL, {"file": upload(drawn()), "png_colors": "16", "transparent": "true", "optimize": "builtin"}
    )
    assert response.status_code == 200 and response["Content-Type"] == "image/png"
    assert "X-Doory-Quality" not in response
    assert optimizer.jobs[0].format == "png"


def test_a_failing_optimizer_still_sends_the_converted_file(client, monkeypatch):
    monkeypatch.setitem(optimizers.OPTIMIZERS, "builtin", FakeOptimizer(name="Built-in", fail=True))
    response = client.post(URL, {"file": upload(drawn()), "format": "webp"})
    assert response.status_code == 200 and response["Content-Type"] == "image/webp"
    assert response["X-Doory-Optimized"] == "false"
    assert int(response["X-Doory-Bytes-Before"]) == len(response.content)
    assert json.loads(response["X-Doory-Warnings"]) == [
        "Built-in could not optimize the file (the service answered 503); it is not optimized."
    ]


def test_without_any_optimizer_it_converts_with_a_note(client, settings):
    settings.IMAGE_OPTIMIZERS = []
    response = client.post(URL, {"file": upload(drawn()), "format": "webp"})
    assert response.status_code == 200
    assert json.loads(response["X-Doory-Warnings"]) == [
        "No image optimizer is set up on this server; the file is not optimized."
    ]


def test_signing_in_is_required(anon):
    assert anon.post(URL, {"file": upload(drawn())}).status_code in (401, 403)


@pytest.mark.parametrize(
    ("body", "code"),
    [
        ({}, "invalid"),
        ({"file": upload(b"not an image")}, "invalid_image"),
        ({"file": upload(drawn(fmt="JPEG"), "page.jpg")}, "invalid_image"),
        ({"file": upload(drawn()[:200])}, "invalid_image"),
        ({"file": upload(drawn()), "format": "gif"}, "invalid_choice"),
        ({"file": upload(drawn()), "quality": "0"}, "invalid"),
        ({"file": upload(drawn()), "optimize": "tinypng"}, "optimizer_unavailable"),
    ],
    ids=["no file", "not an image", "not a png", "truncated", "format", "quality", "optimizer"],
)
def test_bad_requests_are_refused(client, optimizer, body, code):
    response = client.post(URL, body)
    assert response.status_code == 400, response.content
    assert code in json.dumps(response.json())


def test_an_image_with_too_many_pixels_is_refused(client, settings, optimizer):
    settings.EXPORT_IMAGE_MAX_PIXELS = 120 * 80 - 1
    response = client.post(URL, {"file": upload(drawn())})
    assert response.status_code == 400 and response.json()["error"]["code"] == "too_large"
    assert optimizer.jobs == []


def test_a_decompression_bomb_is_refused(client, monkeypatch, optimizer):
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 100)  # anything over twice this is a bomb to Pillow
    response = client.post(URL, {"file": upload(drawn())})
    assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_image"


def test_a_file_over_the_size_limit_is_refused(client, settings, optimizer):
    settings.IMAGE_OPTIMIZER_MAX_BYTES = 100
    response = client.post(URL, {"file": upload(drawn())})
    assert response.status_code == 413
    assert optimizer.jobs == []


def test_the_optimize_rate_limit_applies(client, monkeypatch, optimizer):
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "optimize", "1/min")
    assert client.post(URL, {"file": upload(drawn())}).status_code == 200
    assert client.post(URL, {"file": upload(drawn())}).status_code == 429


def test_a_busy_account_gets_a_busy_answer(client, user, optimizer):
    with render_slot(user.pk):
        response = client.post(URL, {"file": upload(drawn())})
    assert response.status_code == 503 and response.json()["error"]["code"] == "export_busy"


@pytest.mark.parametrize("fmt", ["png", "webp"])
def test_the_png_is_decoded_once_while_holding_the_render_slot(monkeypatch, fmt):
    decodes = []
    load = PngImagePlugin.PngImageFile.load

    def watched(image):
        if image.tile:  # pixels still to decode
            try:
                with render_slot("me"):
                    decodes.append("outside the slot")
            except ExportBusy:
                decodes.append("in the slot")
        return load(image)

    monkeypatch.setattr(PngImagePlugin.PngImageFile, "load", watched)
    result = services.optimize_image(drawn(), format=fmt, optimize=False, owner="me")
    assert result.format == fmt and decodes == ["in the slot"]
