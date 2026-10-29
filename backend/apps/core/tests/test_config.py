from __future__ import annotations

import json

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

URL = "/api/v1/config/"


@pytest.fixture
def api() -> APIClient:
    return APIClient()


def features(api) -> dict[str, bool]:
    return api.get(URL).json()["features"]


def api_schema() -> dict:
    return APIClient().get("/api/v1/schema/", {"format": "json"}).json()


def test_config_is_public_and_has_the_documented_shape(api):
    res = api.get(URL)
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {
        "google_client_id",
        "oidc_button_label",
        "oidc_button_icon",
        "features",
        "limits",
        "assets",
        "exports",
        "ai",
    }
    assert set(body["features"]) == {
        "stock_photos",
        "server_pdf",
        "google_login",
        "oidc_login",
        "email_verification",
        "background_removal",
        "realtime",
        "mcp",
        "ai_providers",
        "image_optimize",
    }
    assert set(body["ai"]) == {"user_providers", "offsite_notice", "background_removal", "upscale"}
    assert body["exports"] == {"filename_style": "simple", "filename_timestamp": False}
    assert set(body["limits"]) == {
        "max_upload_bytes",
        "max_pages",
        "max_document_bytes",
        "realtime_max_participants",
        "bulk_fill_max_rows",
    }


def test_config_works_for_signed_in_users_too(api, user):
    api.force_login(user)
    assert api.get(URL).status_code == 200


def test_config_is_cacheable_for_a_minute(api):
    assert api.get(URL)["Cache-Control"] == "public, max-age=60"


def test_config_is_read_only(api):
    assert api.post(URL, {}, format="json").status_code == 405


def test_limits_mirror_settings(api, settings):
    settings.MAX_UPLOAD_BYTES = 123
    settings.MAX_DESIGN_DOCUMENT_BYTES = 456
    settings.MAX_DESIGN_PAGES = 7
    settings.BULK_FILL_MAX_ROWS = 50
    assert api.get(URL).json()["limits"] == {
        "max_upload_bytes": 123,
        "max_pages": 7,
        "max_document_bytes": 456,
        "realtime_max_participants": 25,
        "bulk_fill_max_rows": 50,
    }


def test_default_limits_match_the_documented_contract(api):
    limits = api.get(URL).json()["limits"]
    assert limits["max_pages"] == 100
    assert limits["max_upload_bytes"] == 25 * 1024 * 1024


def test_google_flag_follows_the_client_id(api, settings):
    settings.GOOGLE_CLIENT_ID = "abc.apps.googleusercontent.com"
    body = api.get(URL).json()
    assert body["google_client_id"] == "abc.apps.googleusercontent.com"
    assert body["features"]["google_login"] is True
    settings.GOOGLE_CLIENT_ID = ""
    body = api.get(URL).json()
    assert body["google_client_id"] == ""
    assert body["features"]["google_login"] is False


@pytest.mark.parametrize(
    ("unsplash", "pexels", "pixabay", "expected"),
    [
        ("", "", "", False),
        ("key", "", "", True),
        ("", "key", "", True),
        ("", "", "key", True),
        ("a", "b", "c", True),
    ],
)
def test_stock_photos_flag_needs_a_provider_key(api, settings, unsplash, pexels, pixabay, expected):
    settings.UNSPLASH_ACCESS_KEY = unsplash
    settings.PEXELS_API_KEY = pexels
    settings.PIXABAY_API_KEY = pixabay
    assert features(api)["stock_photos"] is expected


def test_stock_photos_flag_follows_stock_providers(api, settings):
    settings.PIXABAY_API_KEY = "key"
    settings.STOCK_PROVIDERS = ["unsplash", "pexels"]
    assert features(api)["stock_photos"] is False


@pytest.mark.parametrize("enabled", [True, False])
def test_server_pdf_flag(api, settings, enabled):
    settings.SERVER_PDF_ENABLED = enabled
    assert features(api)["server_pdf"] is enabled


@pytest.mark.parametrize(
    ("backend", "expected"),
    [
        ("django.core.mail.backends.console.EmailBackend", False),
        ("django.core.mail.backends.locmem.EmailBackend", False),
        ("django.core.mail.backends.dummy.EmailBackend", False),
        ("django.core.mail.backends.filebased.EmailBackend", False),
        ("django.core.mail.backends.smtp.EmailBackend", True),
    ],
)
def test_email_verification_flag_needs_a_real_mail_backend(api, settings, backend, expected):
    settings.EMAIL_BACKEND = backend
    assert features(api)["email_verification"] is expected


def test_config_does_not_leak_secrets(api, settings):
    settings.UNSPLASH_ACCESS_KEY = "super-secret-unsplash"
    settings.PEXELS_API_KEY = "super-secret-pexels"
    settings.PIXABAY_API_KEY = "super-secret-pixabay"
    body = api.get(URL).content.decode()
    assert "super-secret" not in body and settings.SECRET_KEY not in body


def test_health_endpoint_checks_the_database(api):
    assert api.get("/api/v1/health/").json() == {"status": "ok"}


def test_api_serves_json_even_when_a_browser_asks_for_html(api):
    res = api.get(URL, HTTP_ACCEPT="text/html,application/xhtml+xml,*/*;q=0.8")
    assert res.status_code == 200
    assert res["Content-Type"] == "application/json"


# ---- background removal ---------------------------------------------------------------------------------------


@pytest.fixture
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    return tmp_path / "media"


def install_default_model():
    """Stand in for the shipped model with a sparse file of the pinned size: `/config/` only checks the size
    (the hash is verified when `sync_models` installs the file, see test_mlmodels_install.py)."""
    from apps.core.mlmodels.install import model_path
    from apps.core.mlmodels.manifest import load_manifest

    spec = load_manifest().defaults()[0]
    path = model_path(spec)
    path.parent.mkdir(parents=True)
    with path.open("wb") as handle:
        handle.truncate(spec.bytes)
    return spec


def test_background_removal_is_off_until_a_model_is_installed(api, media):
    body = api.get(URL).json()
    assert body["features"]["background_removal"] is False
    assert body["assets"] == {"background_removal_model": None}


def test_an_installed_model_is_advertised_with_its_url_and_input_spec(api, media):
    spec = install_default_model()
    body = api.get(URL).json()
    assert body["features"]["background_removal"] is True
    model = body["assets"]["background_removal_model"]
    assert model["id"] == spec.id and model["url"] == f"/media/models/{spec.id}/{spec.stored_name}"
    assert model["bytes"] == spec.bytes and model["sha256"] == spec.sha256
    assert model["input"]["size"] == 320 and model["input"]["rescale"] == "max" and model["output"] == "1959"


def test_background_removal_can_be_disabled_by_settings(api, media, settings):
    install_default_model()
    settings.BACKGROUND_REMOVAL_ENABLED = False
    body = api.get(URL).json()
    assert body["features"]["background_removal"] is False
    assert body["assets"]["background_removal_model"] is None


def test_the_model_description_leaks_no_server_paths(api, media):
    install_default_model()
    text = api.get(URL).content.decode()
    assert str(media) not in text and "/tmp" not in text


def test_the_openapi_schema_documents_the_new_config_fields():
    schema = api_schema()
    config = schema["components"]["schemas"]["AppConfig"]["properties"]
    assert "assets" in config
    assert "background_removal" in schema["components"]["schemas"]["AppConfigFeatures"]["properties"]


def test_realtime_is_advertised_when_enabled_and_a_channel_layer_exists(api, settings):
    body = api.get(URL).json()
    assert body["features"]["realtime"] is True
    assert body["limits"]["realtime_max_participants"] == 25
    settings.REALTIME_MAX_CONNECTIONS_PER_DESIGN = 8
    assert api.get(URL).json()["limits"]["realtime_max_participants"] == 8


def test_realtime_is_off_when_switched_off_or_without_a_channel_layer(api, settings):
    settings.REALTIME_ENABLED = False
    assert api.get(URL).json()["features"]["realtime"] is False
    settings.REALTIME_ENABLED = True
    settings.CHANNEL_LAYERS = {}
    assert api.get(URL).json()["features"]["realtime"] is False


def test_the_mcp_flag_follows_the_setting(api, settings):
    settings.MCP_ENABLED = False
    assert api.get(URL).json()["features"]["mcp"] is False
    settings.MCP_ENABLED = True
    assert api.get(URL).json()["features"]["mcp"] is True


def test_image_optimize_lists_the_formats_and_the_optimizers_people_may_pick(api, settings, monkeypatch):
    from apps.exports.optimizers import builtin

    monkeypatch.setattr(builtin, "cjpeg", lambda: None)
    monkeypatch.setattr(builtin, "oxipng", lambda: "/usr/local/bin/oxipng")
    settings.IMAGE_OPTIMIZERS = ["custom", "builtin", "tinypng", "kraken"]
    settings.IMAGE_OPTIMIZER_CUSTOM_URL = "https://optimizer.example/v1"
    settings.IMAGE_OPTIMIZER_CUSTOM_NAME = "In-house"
    settings.TINYPNG_API_KEY = "a-key-that-must-not-leak"
    body = api.get(URL).json()["features"]["image_optimize"]
    assert {"png", "jpg", "webp"} <= set(body["formats"])
    assert body["optimizers"] == [
        {
            "id": "custom",
            "name": "In-house",
            "formats": ["png", "jpg", "webp", "avif"],
            "sends_offsite": True,
        },
        {"id": "builtin", "name": "Built-in", "formats": ["png"], "sends_offsite": False},
        {
            "id": "tinypng",
            "name": "TinyPNG",
            "formats": ["png", "jpg", "webp", "avif"],
            "sends_offsite": True,
        },
    ]
    assert body["default"] == "builtin"
    assert "a-key-that-must-not-leak" not in json.dumps(api.get(URL).json())


def test_image_optimize_without_optimizers(api, settings):
    settings.IMAGE_OPTIMIZERS = []
    body = api.get(URL).json()["features"]["image_optimize"]
    assert body["optimizers"] == [] and body["default"] is None
