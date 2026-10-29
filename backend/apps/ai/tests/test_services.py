"""`services.run`: permissions, quotas, the result cache, the call log, `.env` providers and a second task."""

from __future__ import annotations

import base64
import logging
from io import BytesIO

import pytest
from PIL import Image, ImageOps

from apps.ai import catalog, env, results, services
from apps.ai.catalog import device_available as real_device_available
from apps.ai.errors import AIProviderError, ModelNotAvailable, QuotaReached, RunsOnDevice, UnsupportedAsset
from apps.ai.models import AICall, Audience
from apps.ai.results import SourceImage, from_image
from apps.ai.tasks import TASKS, InvalidOptions
from apps.assets.models import Asset
from apps.assets.services import create_asset
from apps.assets.tests.helpers import SAFE_SVG

from .conftest import make_provider
from .fakes import Y_KEY, image_answer, json_answer, png

pytestmark = pytest.mark.django_db

TASK = "background-removal"


@pytest.fixture
def x(fake):
    """An operator provider in the Provider X style."""
    return make_provider(fake.url, "multipart", name="Server X", style_config={"path": "/api/remove"})


def test_every_call_is_logged_without_image_data_or_secrets(fake, user, photo, caplog):
    provider = make_provider(
        fake.url,
        "multipart",
        style_config={"path": "/v1/remove-background", "file_field": "image_file"},
        auth_header="X-Api-Key",
        secret=Y_KEY,
    )
    with caplog.at_level(logging.DEBUG):
        services.run(user, TASK, photo, f"{provider.id}:")
    call = AICall.objects.get()
    assert (call.user, call.provider, call.provider_ref, call.task, call.status) == (
        user,
        provider,
        str(provider.id),
        TASK,
        "ok",
    )
    assert call.bytes_in > 0 and call.bytes_out > 0 and call.duration_ms >= 0
    logged = caplog.text + repr([vars(r) for r in caplog.records])
    assert Y_KEY not in logged and fake.url not in logged
    assert "status=ok" in caplog.text


def test_a_failed_call_is_logged_with_its_code(fake, user, photo, x):
    fake.routes[("POST", "/api/remove")] = lambda request: (500, {}, b"")
    with pytest.raises(AIProviderError):
        services.run(user, TASK, photo, f"{x.id}:")
    assert AICall.objects.get().status == "error" and AICall.objects.get().error_code == "bad_response"


def test_an_image_too_large_for_the_provider_is_refused_before_sending(fake, user, photo, x):
    x.max_image_bytes = 10
    x.save()
    with pytest.raises(AIProviderError) as caught:
        services.run(user, TASK, photo, f"{x.id}:")
    assert caught.value.code == "too_large" and fake.requests == []
    assert AICall.objects.get().status == "refused"


def test_the_same_call_twice_returns_the_cached_result_without_a_request(fake, user, photo, x):
    first = services.run(user, TASK, photo, f"{x.id}:")
    second = services.run(user, TASK, photo, f"{x.id}:")
    assert first.pk == second.pk and len(fake.requests) == 1
    assert AICall.objects.count() == 1  # a cached result is not a call


def test_the_cache_is_per_user_and_skips_deleted_results(fake, user, other, photo, x):
    first = services.run(user, TASK, photo, f"{x.id}:")
    first.delete()
    again = services.run(user, TASK, photo, f"{x.id}:")
    assert again.pk != first.pk and len(fake.requests) == 2
    theirs = create_asset(other, photo.file.open("rb").read(), name="photo.png")
    assert services.run(other, TASK, theirs, f"{x.id}:").owner == other


def test_changing_the_provider_invalidates_the_cache(fake, user, photo, x):
    services.run(user, TASK, photo, f"{x.id}:")
    x.timeout_seconds = 30
    x.save()
    services.run(user, TASK, photo, f"{x.id}:")
    assert len(fake.requests) == 2


def test_the_daily_quota_answers_429(fake, user, other, photo, x):
    x.daily_quota = 2
    x.save()
    services.run(user, TASK, photo, f"{x.id}:")
    second = create_asset(user, png(Image.new("RGB", (30, 30), "blue")), name="b.png")
    services.run(user, TASK, second, f"{x.id}:")
    third = create_asset(user, png(Image.new("RGB", (30, 30), "green")), name="c.png")
    with pytest.raises(QuotaReached) as caught:
        services.run(user, TASK, third, f"{x.id}:")
    assert 0 < caught.value.wait <= 86400
    assert AICall.objects.filter(status="refused", error_code="ai_quota").count() == 1
    assert services.run(user, TASK, photo, f"{x.id}:")  # cached results stay available
    theirs = create_asset(other, png(Image.new("RGB", (30, 30), "green")), name="c.png")
    assert services.run(other, TASK, theirs, f"{x.id}:")  # the quota is per user


def test_options_users_may_not_use_are_not_found(fake, user, other, photo, x, settings):
    with pytest.raises(ModelNotAvailable):
        services.run(user, TASK, photo, "nonsense")
    with pytest.raises(ModelNotAvailable):
        services.run(user, TASK, photo, "not-a-uuid:")
    with pytest.raises(ModelNotAvailable):
        services.run(user, "erase-object", photo, f"{x.id}:")
    x.audience = Audience.STAFF
    x.save()
    with pytest.raises(ModelNotAvailable):
        services.run(user, TASK, photo, f"{x.id}:")
    settings.AI_USER_PROVIDERS = "everyone"
    mine = make_provider(fake.url, "multipart", owner=other, style_config={"path": "/api/remove"})
    with pytest.raises(ModelNotAvailable):  # somebody else's server
        services.run(user, TASK, photo, f"{mine.id}:")
    assert fake.requests == []


def test_the_device_option_is_not_run_on_the_server(user, photo, monkeypatch):
    monkeypatch.setattr(catalog, "device_available", lambda task: True)
    with pytest.raises(RunsOnDevice):
        services.run(user, TASK, photo, "device")


def test_only_raster_images_are_sent(fake, user, x):
    svg = create_asset(user, SAFE_SVG, name="logo.svg")
    with pytest.raises(UnsupportedAsset):
        services.run(user, TASK, svg, f"{x.id}:")


def test_exif_orientation_is_respected(fake, user, x):
    from apps.assets.tests.helpers import jpeg_with_exif

    rotated = create_asset(user, jpeg_with_exif(orientation=6, size=(40, 20)), name="photo.png")
    assert (rotated.width, rotated.height) == (20, 40)
    result = services.run(user, TASK, rotated, f"{x.id}:")
    assert (result.width, result.height) == (20, 40)


def test_a_failing_storage_quota_still_logs_the_call(fake, user, photo, x, settings):
    from apps.assets.exceptions import QuotaExceeded

    settings.USER_STORAGE_QUOTA_BYTES = photo.size + 10
    with pytest.raises(QuotaExceeded):
        services.run(user, TASK, photo, f"{x.id}:")
    assert AICall.objects.get().error_code == "quota_exceeded"


# -- .env providers ------------------------------------------------------------------------------------------


def env_provider(fake, n=1, **values):
    return {
        "index": n,
        "URL": fake.url if fake else "",
        "STYLE": "multipart",
        "STYLE_CONFIG": '{"path": "/api/remove"}',
        "TASKS": "",
        "MODELS": "",
        "AUTH_HEADER": "",
        "AUTH_VALUE": "",
        "LABEL": "",
        "SENDS_OFFSITE": "",
        "TIMEOUT_SECONDS": "",
        "MAX_IMAGE_BYTES": "",
        "DAILY_QUOTA": "",
        **values,
    }


def test_env_providers_are_parsed_and_run(fake, user, photo, settings):
    settings.AI_ENV_PROVIDERS = [
        env_provider(fake, MODELS="fast:Fast,org/model:v2:Best", LABEL="Model server", DAILY_QUOTA="5")
    ]
    [provider] = env.env_providers()
    assert provider.id == "env-1" and provider.models == (("fast", "Fast"), ("org/model:v2", "Best"))
    assert provider.daily_quota == 5 and provider.name == "Model server"
    options = catalog.options(user, TASK)
    assert [(o.id, o.label, o.provider_name) for o in options] == [
        ("env-1:fast", "Fast", "Model server"),
        ("env-1:org/model:v2", "Best", "Model server"),
    ]
    result = services.run(user, TASK, photo, "env-1:org/model:v2")
    assert result.meta["ai"]["provider"] == "Model server"
    assert fake.requests[-1].form["model"] == (None, b"org/model:v2")
    assert AICall.objects.get().provider_ref == "env-1" and AICall.objects.get().provider is None


def test_a_doory_env_provider_without_models_lists_the_servers(fake, user, settings):
    settings.AI_ENV_PROVIDERS = [env_provider(fake, STYLE="doory", STYLE_CONFIG="")]
    assert [o.id for o in catalog.options(user, TASK)] == ["env-1:general-fast", "env-1:general-best"]
    catalog.options(user, TASK)
    assert [r.path for r in fake.requests] == ["/v1/models"]  # cached


def test_an_unreachable_doory_env_provider_offers_the_servers_default(user, settings):
    settings.AI_ENV_PROVIDERS = [
        {
            **env_provider(None, STYLE="doory", STYLE_CONFIG=""),
            "URL": "http://127.0.0.1:9",
            "TIMEOUT_SECONDS": "2",
        }
    ]
    assert [o.id for o in catalog.options(user, TASK)] == ["env-1:"]


@pytest.mark.parametrize(
    "values, message",
    [
        ({"URL": "ftp://x"}, "must start with http"),
        ({"STYLE": "magic"}, "Unknown API style"),
        ({"STYLE_CONFIG": "{"}, "not valid JSON"),
        ({"STYLE_CONFIG": '{"nope": 1}'}, "no setting nope"),
        ({"TASKS": "erase-object"}, "unknown task"),
        ({"AUTH_HEADER": "Bad Header"}, "not a valid HTTP header"),
        ({"SENDS_OFFSITE": "maybe"}, "true or false"),
        ({"TIMEOUT_SECONDS": "999"}, "between 1 and 300"),
    ],
)
def test_invalid_env_providers_are_reported_and_left_out(fake, settings, values, message):
    from apps.ai.checks import check_ai_settings

    settings.AI_ENV_PROVIDERS = [env_provider(fake, **values)]
    assert env.env_providers() == []
    warnings = [w for w in check_ai_settings(None) if w.id == "ai.W002"]
    assert len(warnings) == 1 and message in warnings[0].msg


def test_an_env_providers_secret_is_sent_but_never_shown(fake, user, photo, settings):
    settings.AI_ENV_PROVIDERS = [
        env_provider(
            fake,
            STYLE_CONFIG='{"path": "/v1/remove-background", "file_field": "image_file"}',
            AUTH_HEADER="X-Api-Key",
            AUTH_VALUE=Y_KEY,
        )
    ]
    [provider] = env.env_providers()
    assert Y_KEY not in repr(provider)
    services.run(user, TASK, photo, "env-1:")
    assert fake.requests[-1].headers["x-api-key"] == Y_KEY


# -- a second task -------------------------------------------------------------------------------------------


def invert(request):
    image = Image.open(BytesIO(request.form["file"][1])).convert("RGB")
    return image_answer(png(ImageOps.invert(image)))


def test_a_second_task_needs_no_change_to_providers_styles_or_services(fake, user, photo, register_task):
    register_task("test-invert", output="image", result_suffix="inverted")
    fake.routes[("POST", "/invert")] = invert
    provider = make_provider(fake.url, "multipart", tasks=["test-invert"], style_config={"path": "/invert"})
    assert [o.id for o in catalog.options(user, "test-invert")] == [f"{provider.id}:"]
    result = services.run(user, "test-invert", photo, f"{provider.id}:")
    assert result.name == "photo.png (inverted)" and result.meta["ai"]["task"] == "test-invert"
    with result.file.open("rb") as handle:
        assert Image.open(handle).convert("RGB").getpixel((0, 0)) == (55, 225, 195)  # (200, 30, 60) inverted
    with pytest.raises(ModelNotAvailable):  # the provider is not set up for background removal
        services.run(user, TASK, photo, f"{provider.id}:")


def test_results_are_regular_assets(fake, user, photo, x):
    result = services.run(user, TASK, photo, f"{x.id}:")
    stored = Asset.objects.get(pk=result.pk)
    assert (
        stored.mime == "image/png" and stored.thumbnail and stored.size == len(stored.file.open("rb").read())
    )


# -- upscale -------------------------------------------------------------------------------------------------

UPSCALE = "upscale"


@pytest.fixture
def hosted(fake):
    """A provider like a hosted upscaler: JSON with a data: URL in, base64 out, always three times larger."""
    return make_provider(
        fake.url,
        "json",
        name="Hosted",
        tasks=[UPSCALE],
        style_config={
            "path": "/v1/images/generations",
            "send_as": "data-url",
            "file_field": "image_url",
            "option_fields": {"scale": ""},
            "response_path": "data.0.b64_json",
        },
    )


@pytest.mark.parametrize("scale, size", [(2, (128, 64)), (4, (256, 128))])
def test_upscale_makes_the_result_the_size_asked_for(fake, user, photo, hosted, scale, size):
    result = services.run(user, UPSCALE, photo, f"{hosted.id}:", {"scale": scale})
    assert (result.width, result.height) == size  # the provider's 192 x 96, scaled
    assert result.name == "photo.png (upscaled)" and result.meta["ai"]["task"] == UPSCALE
    with result.file.open("rb") as handle:
        assert Image.open(handle).size == size
    assert "scale" not in fake.requests[-1].json  # left out by option_fields


@pytest.mark.parametrize("options", [{"scale": 3}, {"scale": "2"}, {"scale": True}, {"factor": 2}])
def test_upscale_options_are_checked_before_any_call(fake, user, photo, hosted, options):
    with pytest.raises(InvalidOptions):
        services.run(user, UPSCALE, photo, f"{hosted.id}:", options)
    assert fake.requests == []


def test_an_upscale_too_large_to_keep_is_refused_before_the_call(fake, user, photo, hosted, monkeypatch):
    monkeypatch.setattr(results, "MAX_DIMENSION", 200)
    with pytest.raises(AIProviderError) as caught:
        services.run(user, UPSCALE, photo, f"{hosted.id}:", {"scale": 4})
    assert caught.value.code == "too_large" and fake.requests == []
    assert AICall.objects.get().status == "refused"
    assert services.run(user, UPSCALE, photo, f"{hosted.id}:", {"scale": 2}).width == 128


def test_an_upscale_of_another_shape_is_refused(fake, user, photo, hosted):
    fake.routes[("POST", "/v1/images/generations")] = lambda request: json_answer(
        {"data": [{"b64_json": base64.b64encode(png(Image.new("RGB", (100, 100)))).decode()}]}
    )
    with pytest.raises(AIProviderError, match="shape"):
        services.run(user, UPSCALE, photo, f"{hosted.id}:", {"scale": 2})


def test_a_result_too_large_for_an_upload_as_png_is_kept_as_webp(user, settings):
    source = SourceImage(png(Image.new("RGB", (64, 32))), "image/png", 64, 32)
    answer = png(Image.radial_gradient("L").convert("RGB").resize((128, 64)))
    as_png = from_image(TASKS[UPSCALE], source, answer, {"scale": 2})
    assert as_png[:4] == b"\x89PNG"
    settings.MAX_UPLOAD_BYTES = len(as_png) - 1
    as_webp = from_image(TASKS[UPSCALE], source, answer, {"scale": 2})
    assert as_webp[:4] == b"RIFF" and as_webp[8:12] == b"WEBP"
    stored = create_asset(user, as_webp, name="big")
    assert (stored.mime, stored.width, stored.height) == ("image/webp", 128, 64)


def test_a_result_too_large_even_as_webp_is_refused(settings):
    source = SourceImage(png(Image.new("RGB", (64, 32))), "image/png", 64, 32)
    answer = png(Image.effect_noise((128, 64), 64).convert("RGB"))
    settings.MAX_UPLOAD_BYTES = 64
    with pytest.raises(AIProviderError) as caught:
        from_image(TASKS[UPSCALE], source, answer, {"scale": 2})
    assert caught.value.code == "too_large"


def test_a_same_size_result_too_large_for_an_upload_stays_png(settings):
    source = SourceImage(png(Image.new("RGB", (64, 32))), "image/png", 64, 32)
    answer = png(Image.radial_gradient("L").convert("RGBA").resize((64, 32)))
    settings.MAX_UPLOAD_BYTES = 64
    cut_out = from_image(TASKS["background-removal"], source, answer)
    assert cut_out[:4] == b"\x89PNG"


def test_upscale_is_offered_on_the_device_without_a_model(monkeypatch):
    monkeypatch.setattr(catalog, "device_available", real_device_available)
    monkeypatch.setattr(catalog, "best_installed", lambda task: None)
    assert catalog.device_available(UPSCALE) is True
    assert [o.id for o in catalog.public_options(UPSCALE)] == ["device"]
    assert catalog.ai_config()["upscale"]["default"] == "device"
