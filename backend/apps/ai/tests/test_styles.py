"""Every API style end to end through `services.run` against the fake provider server, plus the style settings
and the safety checks on what comes back."""

from __future__ import annotations

import base64
import json
import zlib
from io import BytesIO

import pytest
from PIL import Image

from apps.ai import catalog, services
from apps.ai.errors import AIProviderError
from apps.ai.results import SourceImage, from_image, from_mask
from apps.ai.styles import ConfigError, get_style
from apps.ai.tasks import TASKS
from apps.assets.services import create_asset
from apps.assets.tests.helpers import image_bytes

from .conftest import make_provider
from .fakes import Y_KEY, Z_TOKEN, cutout, image_answer, json_answer, mask, png

pytestmark = pytest.mark.django_db

TASK = "background-removal"


def opened(asset) -> Image.Image:
    with asset.file.open("rb") as handle:
        return Image.open(BytesIO(handle.read())).copy()


def assert_cut_out(result, source) -> None:
    image = opened(result)
    assert result.owner_id == source.owner_id and result.pk != source.pk
    assert (image.mode, image.size) == ("RGBA", (source.width, source.height))
    assert image.getpixel((1, 1))[3] == 0  # left half removed
    assert image.getpixel((source.width - 2, 1))[3] == 255  # right half kept
    assert result.name == "photo.png (no background)"
    assert result.meta["ai"]["source_asset"] == str(source.pk)


def test_provider_x_multipart_to_png(fake, user, photo):
    provider = make_provider(fake.url, "multipart", style_config={"path": "/api/remove"})
    provider.models.create(task=TASK, remote_name="general-model", label="Best")
    result = services.run(user, TASK, photo, f"{provider.id}:general-model")
    assert_cut_out(result, photo)
    sent = fake.requests[-1]
    assert sent.form["model"] == (None, b"general-model")
    assert sent.form["file"][0] == "image.png" and sent.form["file"][1][:8] == b"\x89PNG\r\n\x1a\n"


def test_provider_y_multipart_with_an_api_key_header(fake, user, photo):
    provider = make_provider(
        fake.url,
        "multipart",
        style_config={
            "path": "/v1/remove-background",
            "file_field": "image_file",
            "extra_fields": {"size": "auto"},
        },
        auth_header="X-Api-Key",
        secret=Y_KEY,
    )
    assert_cut_out(services.run(user, TASK, photo, f"{provider.id}:"), photo)
    sent = fake.requests[-1]
    assert sent.headers["x-api-key"] == Y_KEY and sent.form["size"] == (None, b"auto")
    assert "model" not in sent.form  # the default model: nothing sent


def test_provider_y_with_a_wrong_key_is_an_auth_error(fake, user, photo):
    provider = make_provider(
        fake.url,
        "multipart",
        style_config={"path": "/v1/remove-background", "file_field": "image_file"},
        auth_header="X-Api-Key",
        secret="wrong",
    )
    with pytest.raises(AIProviderError) as caught:
        services.run(user, TASK, photo, f"{provider.id}:")
    assert caught.value.code == "auth_failed" and "wrong" not in caught.value.message


def test_provider_z_json_base64_with_a_bearer_token(fake, user, photo):
    provider = make_provider(
        fake.url,
        "json",
        style_config={"path": "/v1/segment", "response_path": "data.result_b64", "model_field": ""},
        auth_header="Authorization",
        secret=f"Bearer {Z_TOKEN}",
    )
    assert_cut_out(services.run(user, TASK, photo, f"{provider.id}:"), photo)
    sent = fake.requests[-1]
    assert sent.headers["authorization"] == f"Bearer {Z_TOKEN}"
    assert set(sent.json) == {"image"} and base64.b64decode(sent.json["image"])[:4] == b"\x89PNG"


def test_mask_style_applies_a_mask_of_any_size(fake, user, photo):
    provider = make_provider(fake.url, "mask", style_config={"path": "/mask"})
    assert_cut_out(services.run(user, TASK, photo, f"{provider.id}:"), photo)


def test_doory_style_lists_models_and_runs_them(fake, user, photo):
    provider = make_provider(fake.url, "doory")
    models = services.load_models(provider)
    assert [(m.remote_name, m.label, m.enabled) for m in models] == [
        ("general-fast", "Fast", True),
        ("general-best", "Best", True),
    ]  # the upscaler is for another task
    assert_cut_out(services.run(user, TASK, photo, f"{provider.id}:general-fast"), photo)
    assert fake.requests[-1].path == "/v1/background-removal"
    assert fake.requests[-1].form["model"] == (None, b"general-fast")
    # general-best answers in JSON with a data: URL
    assert_cut_out(services.run(user, TASK, photo, f"{provider.id}:general-best"), photo)


def test_loading_models_again_keeps_the_choices_made(fake, user):
    provider = make_provider(fake.url, "doory")
    services.load_models(provider)
    provider.models.filter(remote_name="general-fast").update(label="Quick", enabled=False)
    services.load_models(provider)
    fast = provider.models.get(remote_name="general-fast")
    assert (fast.label, fast.enabled, provider.models.count()) == ("Quick", False, 2)


def test_doory_style_sends_options_as_json(fake, user, photo, register_task):
    register_task(
        "test-options",
        options_schema={"properties": {"strength": {"type": "integer", "minimum": 1, "maximum": 3}}},
    )
    fake.routes[("POST", "/v1/test-options")] = lambda request: image_answer(cutout(request.form["image"][1]))
    provider = make_provider(fake.url, "doory", tasks=["test-options"])
    services.run(user, "test-options", photo, f"{provider.id}:", {"strength": 2})
    assert json.loads(fake.requests[-1].form["options"][1]) == {"strength": 2}


def test_custom_style_put_with_base64_field_and_path_placeholders(fake, user, photo):
    fake.routes[("PUT", "/tasks/background-removal/m%2F1")] = lambda request: json_answer(
        {"out": [{"png": base64.b64encode(cutout(base64.b64decode(request.form["img"][1]))).decode()}]}
    )
    provider = make_provider(
        fake.url,
        "custom",
        style_config={
            "method": "PUT",
            "path": "/tasks/{task}/{model}",
            "send_as": "base64",
            "file_field": "img",
            "model_field": "",
            "extra_headers": {"X-Client": "doory"},
            "response": "json:out.0.png",
        },
    )
    provider.models.create(task=TASK, remote_name="m/1")
    assert_cut_out(services.run(user, TASK, photo, f"{provider.id}:m/1"), photo)
    assert fake.requests[-1].headers["x-client"] == "doory"


def test_custom_style_mask_in_json(fake, user, photo):
    fake.routes[("POST", "/seg")] = lambda request: json_answer(
        {"mask": base64.b64encode(mask(b"", (64, 32))).decode()}
    )
    provider = make_provider(
        fake.url, "custom", style_config={"path": "/seg", "body": "json", "response": "json-mask:mask"}
    )
    assert_cut_out(services.run(user, TASK, photo, f"{provider.id}:"), photo)


def test_json_style_can_send_the_image_as_a_data_url(fake, user, photo):
    provider = make_provider(
        fake.url,
        "json",
        tasks=["upscale"],
        style_config={
            "path": "/v1/images/generations",
            "send_as": "data-url",
            "file_field": "image_url",
            "extra_fields": {"model": "up-1", "response_format": "b64_json"},
            "model_field": "",
            "response_path": "data.0.b64_json",
        },
    )
    result = services.run(user, "upscale", photo, f"{provider.id}:")
    sent = fake.requests[-1].json
    assert set(sent) == {"image_url", "model", "response_format"}
    prefix, _, encoded = sent["image_url"].partition(",")
    assert prefix == "data:image/png;base64" and base64.b64decode(encoded)[:4] == b"\x89PNG"
    assert (result.width, result.height) == (192, 96)  # no scale asked: the provider's own size is kept


def test_custom_style_sends_a_data_url_in_a_multipart_field(fake, user, photo):
    fake.routes[("POST", "/up")] = lambda request: image_answer(
        cutout(base64.b64decode(request.form["image"][1].decode().partition(",")[2]))
    )
    provider = make_provider(
        fake.url, "custom", style_config={"path": "/up", "send_as": "data-url", "file_field": "image"}
    )
    assert_cut_out(services.run(user, TASK, photo, f"{provider.id}:"), photo)
    assert fake.requests[-1].form["image"][0] is None  # a text field, not a file


def test_option_fields_rename_task_options_or_leave_them_out(fake, user, photo):
    renamed = make_provider(
        fake.url,
        "multipart",
        tasks=["upscale"],
        style_config={"path": "/upscale", "option_fields": {"scale": "factor"}},
    )
    result = services.run(user, "upscale", photo, f"{renamed.id}:", {"scale": 4})
    form = fake.requests[-1].form
    assert form["factor"] == (None, b"4") and "scale" not in form
    assert (result.width, result.height) == (256, 128)
    left_out = make_provider(
        fake.url,
        "multipart",
        tasks=["upscale"],
        style_config={"path": "/upscale", "option_fields": {"scale": ""}},
    )
    result = services.run(user, "upscale", photo, f"{left_out.id}:", {"scale": 4})
    form = fake.requests[-1].form
    assert "scale" not in form and "factor" not in form
    # The server enlarged twice (its default); the result is scaled to the four times asked for.
    assert (result.width, result.height) == (256, 128)


def test_a_jpeg_source_is_sent_as_is_and_a_gif_as_png(fake, user):
    provider = make_provider(fake.url, "multipart", style_config={"path": "/api/remove"})
    jpeg = create_asset(user, image_bytes("JPEG", size=(40, 20)), name="photo.png")
    services.run(user, TASK, jpeg, f"{provider.id}:")
    assert fake.requests[-1].form["file"][0] == "image.jpg"
    gif = create_asset(user, image_bytes("GIF", size=(40, 20)), name="photo.png")
    services.run(user, TASK, gif, f"{provider.id}:")
    assert fake.requests[-1].form["file"][0] == "image.png"


# -- style settings ------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "style, config, message",
    [
        ("multipart", {"path": "api/remove"}, "start with /"),
        ("multipart", {"path": "//evil.example/x"}, "not allowed"),
        ("multipart", {"method": "PUT"}, "no setting method"),
        ("multipart", {"file_field": "a b"}, "file_field"),
        ("multipart", {"extra_headers": {"Host": "evil.example"}}, "set by Doory"),
        ("multipart", {"extra_headers": {"X-Ok": "a\r\nInjected: 1"}}, "line breaks"),
        ("multipart", {"extra_fields": {"a": {"nested": 1}}}, "text, a number"),
        ("json", {"response_path": "data..x"}, "dot path"),
        ("custom", {"response": "xml:a"}, "response must be"),
        ("custom", {"send_as": "url"}, "send_as"),
        ("json", {"send_as": "link"}, "send_as"),
        ("multipart", {"option_fields": ["scale"]}, "option_fields must be an object"),
        ("multipart", {"option_fields": {"scale": "a b"}}, "option_fields.scale"),
        ("json", {"file_field": "image_url", "option_fields": {"scale": "image_url"}}, "already in use"),
        ("json", {"option_fields": {"scale": "model"}}, "already in use"),
        ("json", {"extra_fields": {"factor": 2}, "option_fields": {"scale": "factor"}}, "already in use"),
        ("doory", {"option_fields": {"scale": "factor"}}, "no setting option_fields"),
        ("doory", {"path": "/x"}, "no setting path"),
        ("mask", [], "JSON object"),
    ],
)
def test_invalid_style_settings_are_refused(style, config, message):
    with pytest.raises(ConfigError, match=message):
        get_style(style).config(config)


def test_the_path_can_never_change_the_host(fake, user, photo):
    from apps.ai import catalog

    provider = make_provider(fake.url, "multipart", style_config={"path": "/api/remove"})
    conn = catalog.connection(provider)
    with pytest.raises(AIProviderError):
        conn.url("@evil.example/x")
    assert conn.url("/a") == f"{fake.url}/a"


def test_a_connection_never_shows_its_secret(fake):
    from apps.ai import catalog

    provider = make_provider(fake.url, "multipart", auth_header="X-Api-Key", secret="hush-123")
    conn = catalog.connection(provider)
    request = get_style("multipart").build(
        conn, TASKS[TASK], "", SourceImage(image_bytes(), "image/png", 64, 32), {}
    )
    assert "hush-123" not in repr(conn) and "hush-123" not in repr(request)


# -- what comes back -----------------------------------------------------------------------------------------


@pytest.fixture
def source() -> SourceImage:
    return SourceImage(image_bytes(size=(64, 32)), "image/png", 64, 32)


def rgba(size, alpha=128) -> bytes:
    return png(Image.new("RGBA", size, (10, 20, 30, alpha)))


def test_a_result_that_is_not_an_image_is_refused(source):
    with pytest.raises(AIProviderError) as caught:
        from_image(TASKS[TASK], source, b"<html>error</html>")
    assert caught.value.code == "not_image"


def test_a_result_without_transparency_is_refused_for_background_removal(source):
    with pytest.raises(AIProviderError, match="no transparency"):
        from_image(TASKS[TASK], source, image_bytes(size=(64, 32)))


def test_a_result_of_another_shape_is_refused_and_a_scaled_one_resized(source):
    with pytest.raises(AIProviderError, match="shape"):
        from_image(TASKS[TASK], source, rgba((64, 64)))
    assert Image.open(BytesIO(from_image(TASKS[TASK], source, rgba((128, 64))))).size == (64, 32)


def bomb_png(width: int, height: int) -> bytes:
    """A tiny PNG that claims to be huge (only its header is ever read)."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return len(data).to_bytes(4, "big") + kind + data + zlib.crc32(kind + data).to_bytes(4, "big")

    header = width.to_bytes(4, "big") + height.to_bytes(4, "big") + bytes([8, 0, 0, 0, 0])
    rows = zlib.compress(b"\0" * (width + 1) * 4)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", rows) + chunk(b"IEND", b"")


def test_a_decompression_bomb_is_refused(source):
    bomb = bomb_png(20_000, 20_000)  # a few kB claiming 400 megapixels
    with pytest.raises(AIProviderError, match="too large an image"):
        from_image(TASKS[TASK], source, bomb)
    with pytest.raises(AIProviderError):
        from_mask(TASKS[TASK], source, bomb)


def test_a_mask_with_its_own_transparency_uses_it(source):
    alpha_mask = Image.new("RGBA", (64, 32), (0, 0, 0, 255))
    alpha_mask.paste((0, 0, 0, 0), (0, 0, 32, 32))
    result = Image.open(BytesIO(from_mask(TASKS[TASK], source, png(alpha_mask))))
    assert result.getpixel((1, 1))[3] == 0 and result.getpixel((60, 1))[3] == 255


def test_a_huge_json_answer_is_cut_off(fake, user, photo, settings):
    settings.AI_MAX_IMAGE_BYTES = 50_000
    fake.routes[("POST", "/big")] = lambda request: json_answer({"image_b64": "A" * 200_000})
    provider = make_provider(fake.url, "json", style_config={"path": "/big"})
    with pytest.raises(AIProviderError) as caught:
        services.run(user, TASK, photo, f"{provider.id}:")
    assert caught.value.code == "too_large"


@pytest.mark.parametrize(
    "answer, code",
    [
        (json_answer({"other": 1}), "bad_response"),
        (json_answer({"image_b64": 42}), "bad_response"),
        (json_answer({"image_b64": "not base64!"}), "bad_response"),
        ((200, {"Content-Type": "application/json"}, b"[" * 100_000), "bad_response"),
        ((200, {"Content-Type": "application/json"}, b"{oops"), "bad_response"),
        (json_answer({"image_b64": base64.b64encode(b"not an image").decode()}), "not_image"),
        (json_answer({"error": "busy"}, 429), "busy"),
        (json_answer({"error": "big"}, 413), "too_large"),
        (json_answer({"error": "boom"}, 500), "bad_response"),
        (json_answer({"error": "nope"}, 404), "bad_response"),
    ],
)
def test_bad_json_answers_are_clean_errors(fake, user, photo, answer, code):
    fake.routes[("POST", "/run")] = lambda request: answer
    provider = make_provider(fake.url, "json", style_config={"path": "/run"})
    with pytest.raises(AIProviderError) as caught:
        services.run(user, TASK, photo, f"{provider.id}:")
    assert caught.value.code == code


def test_a_binary_style_answering_text_is_not_an_image(fake, user, photo):
    fake.routes[("POST", "/api/remove")] = lambda request: (200, {"Content-Type": "text/html"}, b"<p>hi</p>")
    provider = make_provider(fake.url, "multipart", style_config={"path": "/api/remove"})
    with pytest.raises(AIProviderError) as caught:
        services.run(user, TASK, photo, f"{provider.id}:")
    assert caught.value.code == "not_image"


@pytest.mark.parametrize(
    "config, error_part",
    [
        ({"extra_headers": {"Authorization": "Bearer 123"}}, "authentication header"),
        ({"extra_headers": {"X-API-KEY": "secret123"}}, "authentication header"),
        ({"extra_headers": {"token": "abc"}}, "authentication header"),
        ({"extra_fields": {"api_key": "val"}}, "authentication field"),
        ({"extra_fields": {"secret": "val"}}, "authentication field"),
        ({"option_fields": {"scale": "api_key"}}, "authentication field"),
        ({"path": "/v1/remove?key=secret123"}, "authentication parameter"),
        ({"path": "/v1/remove?token=abc"}, "authentication parameter"),
        ({"path": "/v1/remove?%6Bey=abc"}, "authentication parameter"),
        ({"extra_headers": {"X-Custom": "Bearer abc"}}, "carries credentials"),
        ({"extra_headers": {"X-Custom": "basic dXNlcjpwYXNz"}}, "carries credentials"),
        ({"extra_headers": {"X-Custom": "café\u2019"}}, "Latin-1"),
    ],
)
def test_secrets_and_invalid_chars_in_style_config_are_refused(config, error_part):
    style = get_style("custom")
    full_config = {"path": "/v1/remove", "response": "image", **config}
    with pytest.raises(ConfigError) as exc:
        style.config(full_config)
    assert error_part in str(exc.value)


def test_tiff_and_bmp_are_not_accepted(source):
    # BMP format is not in RESULT_FORMATS
    bmp = BytesIO()
    Image.new("RGB", (32, 32), (255, 0, 0)).save(bmp, "BMP")
    with pytest.raises(AIProviderError) as exc:
        from_image(TASKS[TASK], source, bmp.getvalue())
    assert exc.value.code == "not_image"


def test_image_busy_is_handled_as_busy_error(monkeypatch, source):
    from apps.ai import results
    from apps.core.images import ImageBusy

    def mock_probe(*args, **kwargs):
        raise ImageBusy("Server is busy")

    monkeypatch.setattr(results, "_probe", mock_probe)
    with pytest.raises(AIProviderError) as exc:
        results.decode(b"dummy")
    assert exc.value.code == "busy"
    assert getattr(exc.value, "refused", False) is True


def test_a_mask_and_its_source_share_one_decode_slot(monkeypatch, source):
    import threading

    from apps.core import images

    monkeypatch.setattr(images, "LARGE_IMAGE_PIXELS", 10)
    monkeypatch.setattr(images, "LARGE_DECODE_WAIT_SECONDS", 0.1)
    monkeypatch.setattr(images, "_large_decodes", threading.BoundedSemaphore(1))
    result = Image.open(BytesIO(from_mask(TASKS[TASK], source, png(Image.new("L", (64, 32), 255)))))
    assert result.size == (64, 32) and result.getpixel((1, 1))[3] == 255


def test_a_large_image_answered_as_json_is_accepted(fake, user, photo, settings):
    from apps.ai.services import answer_limit

    provider = make_provider(fake.url, "json", style_config={"path": "/big"})
    conn = catalog.connection(provider)
    assert answer_limit(conn) > settings.AI_MAX_IMAGE_BYTES * 4 // 3
    binary = catalog.connection(make_provider(fake.url, "multipart", style_config={"path": "/x"}))
    assert answer_limit(binary) < settings.AI_MAX_IMAGE_BYTES * 4 // 3


def test_results_may_be_larger_than_the_providers_source_limit(fake, user, settings):
    from apps.ai.services import answer_limit

    # The provider takes sources up to 1 kB, but its cut-out PNG may well be larger than the source.
    small = make_provider(fake.url, "multipart", style_config={"path": "/x"}, max_image_bytes=1024)
    assert answer_limit(catalog.connection(small)) >= settings.AI_MAX_IMAGE_BYTES


def test_json_made_of_many_small_containers_is_refused_before_parsing():
    from apps.ai.styles.base import MAX_JSON_CONTAINERS, load_json
    from apps.ai.transport import HttpResponse

    body = b"[" + b"{}," * MAX_JSON_CONTAINERS + b"{}]"
    with pytest.raises(AIProviderError) as caught:
        load_json(HttpResponse(status=200, headers={}, body=body))
    assert caught.value.code == "bad_response"
    answer = json.dumps({"image_b64": base64.b64encode(b"x" * 3000).decode()}).encode()
    assert load_json(HttpResponse(status=200, headers={}, body=answer))["image_b64"]
