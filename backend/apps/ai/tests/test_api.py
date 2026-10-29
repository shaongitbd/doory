"""The REST API under /api/v1/ai/ and the `ai` part of /api/v1/config/."""

from __future__ import annotations

import json

import pytest
import yaml
from rest_framework.test import APIClient

from apps.ai import catalog, transport
from apps.ai.models import AICall, Audience, Provider
from apps.assets.services import create_asset
from apps.assets.tests.helpers import image_bytes

from .conftest import client_for, make_provider
from .fakes import Y_KEY

pytestmark = pytest.mark.django_db

TASK = "background-removal"
SECRET = "Bearer sk-very-secret-value-789"


@pytest.fixture
def x(fake):
    return make_provider(fake.url, "multipart", name="Server X", style_config={"path": "/api/remove"})


@pytest.fixture
def byos(settings):
    """Users may add their own servers."""
    settings.AI_USER_PROVIDERS = "everyone"


@pytest.fixture
def public_fake(monkeypatch, fake):
    """Let user providers reach the local fake server, as if it were on the internet."""
    monkeypatch.setattr(
        transport, "user_policy", lambda: transport.Policy("user", allow_http=True, private_literals=True)
    )
    return fake


def ids(response) -> list[str]:
    assert response.status_code == 200, response.content
    return [option["id"] for option in response.json()]


# -- GET /ai/models/ -----------------------------------------------------------------------------------------


def test_models_need_a_signed_in_user():
    assert APIClient().get("/api/v1/ai/models/").status_code == 401


def test_models_lists_what_the_user_may_use_device_first(api, x, monkeypatch):
    monkeypatch.setattr(catalog, "device_available", lambda task: True)
    body = api.get("/api/v1/ai/models/", {"task": TASK}).json()
    assert body == [
        {
            "id": "device",
            "label": "On this device",
            "task": TASK,
            "kind": "device",
            "provider_name": "",
            "owner": "device",
            "sends_offsite": False,
        },
        {
            "id": f"{x.id}:",
            "label": "Server X",
            "task": TASK,
            "kind": "server",
            "provider_name": "Server X",
            "owner": "operator",
            "sends_offsite": False,
        },
    ]


def test_models_never_show_urls_or_secrets(api, fake):
    make_provider(fake.url, "multipart", secret=SECRET, auth_header="Authorization", sends_offsite=True)
    text = api.get("/api/v1/ai/models/").content.decode()
    assert fake.url not in text and "sk-very-secret" not in text and "127.0.0.1" not in text
    assert '"sends_offsite":true' in text.replace(" ", "")


def test_audiences(fake, user, staff, other):
    everyone = make_provider(fake.url, name="everyone")
    staff_only = make_provider(fake.url, name="staff", audience=Audience.STAFF)
    chosen = make_provider(fake.url, name="chosen", audience=Audience.USERS)
    chosen.allowed_users.add(user)
    make_provider(fake.url, name="off", enabled=False)
    assert ids(client_for(user).get("/api/v1/ai/models/")) == [f"{chosen.id}:", f"{everyone.id}:"]
    assert ids(client_for(other).get("/api/v1/ai/models/")) == [f"{everyone.id}:"]
    assert ids(client_for(staff).get("/api/v1/ai/models/")) == [f"{everyone.id}:", f"{staff_only.id}:"]


def test_models_respect_the_switches(api, x, settings):
    assert api.get("/api/v1/ai/models/", {"task": "nope"}).status_code == 404
    settings.AI_PROVIDERS_ENABLED = False
    assert ids(api.get("/api/v1/ai/models/")) == []


def test_enabled_models_become_options_with_their_labels(api, x):
    x.models.create(task=TASK, remote_name="fast", label="Fast", sort_order=1)
    x.models.create(task=TASK, remote_name="best", label="Best", sort_order=0)
    x.models.create(task=TASK, remote_name="old", enabled=False)
    body = api.get("/api/v1/ai/models/").json()
    assert [(o["id"], o["label"]) for o in body] == [(f"{x.id}:best", "Best"), (f"{x.id}:fast", "Fast")]


# -- POST /ai/{task}/ ----------------------------------------------------------------------------------------


def test_running_a_task_returns_the_new_asset(api, x, photo):
    response = api.post(
        f"/api/v1/ai/{TASK}/", {"asset_id": str(photo.pk), "model": f"{x.id}:"}, format="json"
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["name"] == "photo.png (no background)" and body["mime"] == "image/png"
    assert body["id"] != str(photo.pk)


def test_running_a_task_on_somebody_elses_asset_is_not_found(other_api, x, photo):
    response = other_api.post(
        f"/api/v1/ai/{TASK}/", {"asset_id": str(photo.pk), "model": f"{x.id}:"}, format="json"
    )
    assert response.status_code == 404


@pytest.mark.parametrize(
    "path, body, status, code",
    [
        ("/api/v1/ai/erase-object/", {"model": "x"}, 404, "unknown_task"),
        (f"/api/v1/ai/{TASK}/", {"model": "nope:"}, 404, "ai_model_not_found"),
        (f"/api/v1/ai/{TASK}/", {"model": "X", "options": {"a": 1}}, 400, "invalid_options"),
        (f"/api/v1/ai/{TASK}/", {}, 400, "validation_error"),
    ],
)
def test_bad_task_requests(api, x, photo, path, body, status, code):
    if body.get("model") == "X":
        body["model"] = f"{x.id}:"
    response = api.post(path, {"asset_id": str(photo.pk), **body}, format="json")
    assert response.status_code == status and response.json()["error"]["code"] == code


def test_provider_failures_are_clear_errors_without_details(api, fake, x, photo):
    fake.routes[("POST", "/api/remove")] = lambda request: (500, {}, b"Traceback: secret internals")
    response = api.post(
        f"/api/v1/ai/{TASK}/", {"asset_id": str(photo.pk), "model": f"{x.id}:"}, format="json"
    )
    assert response.status_code == 502
    error = response.json()["error"]
    assert error["code"] == "ai_bad_response" and "internals" not in error["message"]
    assert fake.url not in error["message"]


def test_a_timeout_is_a_504(api, fake, x, photo):
    import time

    fake.routes[("POST", "/api/remove")] = lambda request: (time.sleep(2), (200, {}, b""))[1]
    x.timeout_seconds = 1
    x.save()
    response = api.post(
        f"/api/v1/ai/{TASK}/", {"asset_id": str(photo.pk), "model": f"{x.id}:"}, format="json"
    )
    assert response.status_code == 504 and response.json()["error"]["code"] == "ai_timeout"
    assert AICall.objects.get().status == "timeout"


def test_the_quota_is_a_429_with_retry_after(api, x, user):
    x.daily_quota = 1
    x.save()
    first = create_asset(user, image_bytes(size=(20, 20)), name="a.png")
    second = create_asset(user, image_bytes(size=(30, 20)), name="b.png")
    assert (
        api.post(
            f"/api/v1/ai/{TASK}/", {"asset_id": str(first.pk), "model": f"{x.id}:"}, format="json"
        ).status_code
        == 201
    )
    response = api.post(
        f"/api/v1/ai/{TASK}/", {"asset_id": str(second.pk), "model": f"{x.id}:"}, format="json"
    )
    assert response.status_code == 429
    error = response.json()["error"]
    assert error["code"] == "ai_quota" and error["retry_after"] > 0 and "Retry-After" in response


def test_the_ai_rate_limit_applies(api, x, photo, monkeypatch):
    from apps.ai.throttling import AIRateThrottle

    monkeypatch.setattr(AIRateThrottle, "THROTTLE_RATES", {"ai": "1/min"})
    body = {"asset_id": str(photo.pk), "model": f"{x.id}:"}
    assert api.post(f"/api/v1/ai/{TASK}/", body, format="json").status_code == 201
    response = api.post(f"/api/v1/ai/{TASK}/", body, format="json")
    assert response.status_code == 429 and response.json()["error"]["code"] == "throttled"


def test_a_second_task_has_the_same_endpoint(api, fake, photo, register_task):
    from .test_services import invert

    register_task("test-invert", output="image", result_suffix="inverted")
    fake.routes[("POST", "/invert")] = invert
    provider = make_provider(fake.url, "multipart", tasks=["test-invert"], style_config={"path": "/invert"})
    assert ids(api.get("/api/v1/ai/models/", {"task": "test-invert"})) == [f"{provider.id}:"]
    response = api.post(
        "/api/v1/ai/test-invert/", {"asset_id": str(photo.pk), "model": f"{provider.id}:"}, format="json"
    )
    assert response.status_code == 201 and response.json()["name"] == "photo.png (inverted)"


def test_upscale_runs_on_the_same_endpoint_with_its_options(api, fake, photo):
    provider = make_provider(fake.url, "multipart", tasks=["upscale"], style_config={"path": "/upscale"})
    url, model = "/api/v1/ai/upscale/", f"{provider.id}:"
    body = {"asset_id": str(photo.pk), "model": model, "options": {"scale": 4}}
    response = api.post(url, body, format="json")
    assert response.status_code == 201
    assert (response.json()["width"], response.json()["height"]) == (256, 128)
    assert fake.requests[-1].form["scale"] == (None, b"4")
    refused = api.post(url, {**body, "options": {"scale": 8}}, format="json")
    assert refused.status_code == 400 and refused.json()["error"]["code"] == "invalid_options"
    assert len(fake.requests) == 1


# -- the contract --------------------------------------------------------------------------------------------


def test_the_doory_compatible_contract_is_served_to_anyone():
    response = APIClient().get("/api/v1/ai/contract.yaml")
    assert response.status_code == 200 and response["Content-Type"].startswith("application/yaml")
    contract = yaml.safe_load(b"".join(response.streaming_content))
    assert contract["openapi"].startswith("3.") and {"/v1/models", "/v1/{task}"} <= set(contract["paths"])


# -- the user's own providers --------------------------------------------------------------------------------


def create(api, **fields):
    body = {
        "name": "My server",
        "base_url": "https://ai.example.com",
        "style": "multipart",
        "style_config": {"path": "/api/remove"},
        "auth_header": "Authorization",
        "secret": SECRET,
        "tasks": [TASK],
        **fields,
    }
    return api.post("/api/v1/ai/providers/", body, format="json")


def test_user_providers_are_off_by_default(api):
    response = api.get("/api/v1/ai/providers/")
    assert response.status_code == 403 and response.json()["error"]["code"] == "ai_user_providers_disabled"
    assert create(api).status_code == 403


def test_staff_mode_lets_only_staff_add_servers(settings, api, staff):
    settings.AI_USER_PROVIDERS = "staff"
    assert api.get("/api/v1/ai/providers/").status_code == 403
    assert create(client_for(staff)).status_code == 201


def test_a_user_adds_a_server_and_its_secret_is_never_returned(byos, api, user):
    response = create(api)
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["has_secret"] is True and "secret" not in body and "secret_encrypted" not in body
    provider = Provider.objects.get(pk=body["id"])
    assert provider.owner == user and provider.secret() == SECRET
    for url in ("/api/v1/ai/providers/", f"/api/v1/ai/providers/{provider.pk}/", "/api/v1/ai/models/"):
        assert "sk-very-secret" not in api.get(url).content.decode()


def test_the_secret_is_kept_replaced_or_removed(byos, api):
    pk = create(api).json()["id"]
    api.patch(f"/api/v1/ai/providers/{pk}/", {"name": "Renamed"}, format="json")
    assert Provider.objects.get(pk=pk).secret() == SECRET
    api.patch(f"/api/v1/ai/providers/{pk}/", {"secret": "new"}, format="json")
    assert Provider.objects.get(pk=pk).secret() == "new"
    body = api.patch(f"/api/v1/ai/providers/{pk}/", {"secret": ""}, format="json").json()
    assert body["has_secret"] is False and not Provider.objects.get(pk=pk).has_secret


def test_changing_host_requires_secret_again(byos, api):
    pk = create(api, base_url="https://ai.example.com").json()["id"]
    # Same host with different path or query doesn't require secret again
    res_path = api.patch(
        f"/api/v1/ai/providers/{pk}/", {"base_url": "https://ai.example.com/v2"}, format="json"
    )
    assert res_path.status_code == 200
    assert Provider.objects.get(pk=pk).secret() == SECRET

    # Changing host without providing secret again is rejected
    res_host = api.patch(f"/api/v1/ai/providers/{pk}/", {"base_url": "https://attacker.com"}, format="json")
    assert res_host.status_code == 400
    assert (
        "Enter the key again when changing the server address."
        in res_host.json()["error"]["fields"]["secret"]
    )
    assert Provider.objects.get(pk=pk).secret() == SECRET

    # Changing host with a new secret is accepted
    res_with_key = api.patch(
        f"/api/v1/ai/providers/{pk}/",
        {"base_url": "https://attacker.com", "secret": "new-key"},
        format="json",
    )
    assert res_with_key.status_code == 200
    assert Provider.objects.get(pk=pk).secret() == "new-key"


@pytest.mark.parametrize(
    "new_url",
    ["https://other.example", "https://ai.example.com:8443", "http://ai.example.com"],
)
def test_moving_a_server_to_another_address_needs_the_key_again(byos, settings, api, new_url):
    settings.AI_USER_PROVIDERS_ALLOW_HTTP = True
    pk = create(api).json()["id"]
    res = api.patch(f"/api/v1/ai/providers/{pk}/", {"base_url": new_url}, format="json")
    assert res.status_code == 400
    assert "Enter the key again" in res.json()["error"]["fields"]["secret"][0]
    provider = Provider.objects.get(pk=pk)
    assert provider.base_url != new_url and provider.secret() == SECRET
    res = api.patch(f"/api/v1/ai/providers/{pk}/", {"base_url": new_url, "secret": ""}, format="json")
    assert res.status_code == 200 and res.json()["has_secret"] is False


def test_the_secret_stays_for_the_same_address_or_comes_with_the_new_one(byos, api):
    pk = create(api).json()["id"]
    api.patch(f"/api/v1/ai/providers/{pk}/", {"base_url": "https://AI.example.com:443/v2"}, format="json")
    assert Provider.objects.get(pk=pk).secret() == SECRET
    api.patch(
        f"/api/v1/ai/providers/{pk}/", {"base_url": "https://other.example", "secret": "fresh"}, format="json"
    )
    assert Provider.objects.get(pk=pk).secret() == "fresh"


def test_an_invalid_secrets_key_refuses_the_secret_instead_of_failing(byos, settings, api):
    settings.AI_SECRETS_KEY = "not-a-valid-fernet-key"
    response = create(api)
    assert response.status_code == 400 and "secrets key" in response.content.decode()


@pytest.mark.parametrize(
    "fields",
    [
        {"base_url": "http://ai.example.com"},
        {"base_url": "https://127.0.0.1:7000"},
        {"base_url": "https://169.254.169.254"},
        {"base_url": "https://[::1]"},
        {"base_url": "https://u:p@ai.example.com"},
        {"base_url": "https://ai.example.com?x=1"},
        {"style": "custom", "style_config": {"response": "xml:a"}},
        {"auth_header": "Host"},
        {"secret": "a\nb"},
        {"tasks": ["erase-object"]},
        {"tasks": []},
        {"timeout_seconds": 301},
    ],
)
def test_invalid_user_providers_are_refused(byos, api, fields):
    response = create(api, **fields)
    assert response.status_code == 400, response.content


def test_a_host_name_resolving_to_a_private_address_is_refused_when_called(
    byos, api, user, photo, monkeypatch
):
    from apps.assets import remote

    monkeypatch.setattr(remote, "resolve", lambda host: ["10.0.0.8"])
    pk = create(api, base_url="https://sneaky.example").json()["id"]
    result = api.post(f"/api/v1/ai/providers/{pk}/test/", {}, format="json").json()
    assert result["ok"] is False and result["error"]["code"] == "refused_address"
    response = api.post(f"/api/v1/ai/{TASK}/", {"asset_id": str(photo.pk), "model": f"{pk}:"}, format="json")
    assert response.status_code == 502 and response.json()["error"]["code"] == "ai_refused_address"
    assert AICall.objects.filter(status="refused").count() == 2


def test_a_user_can_only_have_so_many_servers(byos, api, settings):
    settings.AI_MAX_PROVIDERS_PER_USER = 1
    assert create(api).status_code == 201
    assert create(api).status_code == 409


def test_other_users_never_see_or_touch_a_users_server(byos, api, other_api):
    pk = create(api).json()["id"]
    assert other_api.get("/api/v1/ai/providers/").json() == []
    assert ids(other_api.get("/api/v1/ai/models/")) == []
    for method, path in [
        ("get", f"/api/v1/ai/providers/{pk}/"),
        ("patch", f"/api/v1/ai/providers/{pk}/"),
        ("delete", f"/api/v1/ai/providers/{pk}/"),
        ("put", f"/api/v1/ai/providers/{pk}/models/"),
        ("post", f"/api/v1/ai/providers/{pk}/load-models/"),
        ("post", f"/api/v1/ai/providers/{pk}/test/"),
    ]:
        assert getattr(other_api, method)(path, {}, format="json").status_code == 404, path
    assert Provider.objects.filter(pk=pk).exists()


def test_switching_user_providers_off_hides_them(byos, api, settings):
    pk = create(api).json()["id"]
    assert ids(api.get("/api/v1/ai/models/")) == [f"{pk}:"]
    settings.AI_USER_PROVIDERS = "off"
    assert ids(api.get("/api/v1/ai/models/")) == []


def test_a_user_loads_models_tests_and_uses_their_own_server(byos, api, public_fake, photo):
    fake = public_fake
    pk = create(api, base_url=fake.url, style="doory", style_config={}, secret="").json()["id"]
    body = api.post(f"/api/v1/ai/providers/{pk}/load-models/").json()
    assert [m["remote_name"] for m in body["models"]] == ["general-fast", "general-best"]
    body = api.put(
        f"/api/v1/ai/providers/{pk}/models/",
        {"models": [{"task": TASK, "remote_name": "general-best", "label": "My best"}]},
        format="json",
    ).json()
    assert [(m["remote_name"], m["label"]) for m in body["models"]] == [("general-best", "My best")]
    assert ids(api.get("/api/v1/ai/models/")) == [f"{pk}:general-best"]
    result = api.post(f"/api/v1/ai/providers/{pk}/test/", {}, format="json").json()
    assert result["ok"] is True and result["preview"].startswith("data:image/png;base64,")
    assert result["model"] == "general-best" and result["error"] is None
    response = api.post(
        f"/api/v1/ai/{TASK}/", {"asset_id": str(photo.pk), "model": f"{pk}:general-best"}, format="json"
    )
    assert response.status_code == 201


def test_load_models_needs_a_doory_compatible_server(byos, api):
    pk = create(api).json()["id"]
    response = api.post(f"/api/v1/ai/providers/{pk}/load-models/")
    assert response.status_code == 400 and response.json()["error"]["code"] == "ai_not_supported"


def test_a_failing_test_reports_why(byos, api, public_fake):
    pk = create(
        api,
        base_url=public_fake.url,
        style_config={"path": "/v1/remove-background", "file_field": "image_file"},
        auth_header="X-Api-Key",
        secret="wrong",
    ).json()["id"]
    result = api.post(f"/api/v1/ai/providers/{pk}/test/", {}, format="json").json()
    assert result == {
        "ok": False,
        "duration_ms": result["duration_ms"],
        "task": TASK,
        "model": "",
        "preview": "",
        "error": {"code": "auth_failed", "message": "The server refused the credentials."},
    }
    api.patch(f"/api/v1/ai/providers/{pk}/", {"secret": Y_KEY}, format="json")
    assert api.post(f"/api/v1/ai/providers/{pk}/test/", {}, format="json").json()["ok"] is True


def test_models_put_validates(byos, api):
    pk = create(api).json()["id"]
    twice = [{"task": TASK, "remote_name": "a"}, {"task": TASK, "remote_name": "a"}]
    assert api.put(f"/api/v1/ai/providers/{pk}/models/", {"models": twice}, format="json").status_code == 400
    unknown = [{"task": "erase-object", "remote_name": "a"}]
    assert (
        api.put(f"/api/v1/ai/providers/{pk}/models/", {"models": unknown}, format="json").status_code == 400
    )


def test_user_provider_limits_and_validation(byos, api, settings):
    # max_image_bytes exceeding limit is rejected
    assert create(api, max_image_bytes=settings.AI_MAX_IMAGE_BYTES + 1).status_code == 400

    # timeout_seconds exceeding 60 is rejected
    assert create(api, timeout_seconds=61).status_code == 400

    # Non-standard ports rejected
    assert create(api, base_url="https://ai.example.com:9200").status_code == 400

    # Non-Latin-1 auth header rejected
    assert create(api, auth_header="Auth-Header-é\u2019").status_code == 400

    # Non-Latin-1 secret rejected
    assert create(api, secret="secret-é\u2019").status_code == 400

    # Control chars in remote_name and label are stripped
    pk = create(api).json()["id"]
    res = api.put(
        f"/api/v1/ai/providers/{pk}/models/",
        {"models": [{"task": TASK, "remote_name": "model\r\n\x00-1", "label": "Label\n1"}]},
        format="json",
    )
    assert res.status_code == 200
    assert res.json()["models"][0]["remote_name"] == "model-1"
    assert res.json()["models"][0]["label"] == "Label1"


def test_in_flight_concurrency_limit_per_user(byos, api, public_fake, user):
    from django.core.cache import cache

    asset = create_asset(user, image_bytes("PNG"), name="test.png")
    pk = create(api, base_url=public_fake.url).json()["id"]
    api.put(
        f"/api/v1/ai/providers/{pk}/models/",
        {"models": [{"task": TASK, "remote_name": "general-fast"}]},
        format="json",
    )
    # Simulate a call already in-flight by holding the cache key
    cache.set(f"ai:in_flight:{user.pk}", 1, 60)
    response = api.post(
        f"/api/v1/ai/{TASK}/",
        {"asset_id": str(asset.pk), "model": f"{pk}:general-fast"},
        format="json",
    )
    assert response.status_code in (429, 503)
    assert response.json()["error"]["code"] == "ai_busy"
    cache.delete(f"ai:in_flight:{user.pk}")


# -- /config/ ------------------------------------------------------------------------------------------------


def test_config_keeps_its_keys_and_adds_the_ai_options(fake, monkeypatch, settings):
    monkeypatch.setattr(catalog, "device_available", lambda task: True)
    everyone = make_provider(fake.url, name="Everyone", secret=SECRET, auth_header="Authorization")
    make_provider(fake.url, name="Staff", audience=Audience.STAFF)
    settings.AI_TASK_DEFAULTS = {TASK: f"{everyone.id}:"}
    body = APIClient().get("/api/v1/config/").json()
    assert body["features"]["ai_providers"] is True
    assert body["ai"]["user_providers"] == "off"
    assert body["ai"]["background_removal"]["default"] == f"{everyone.id}:"
    assert [o["id"] for o in body["ai"]["background_removal"]["models"]] == ["device", f"{everyone.id}:"]
    assert "background_removal" in body["features"] and "background_removal_model" in body["assets"]
    text = json.dumps(body)
    assert "sk-very-secret" not in text and fake.url not in text


def test_config_without_providers(settings):
    body = APIClient().get("/api/v1/config/").json()
    assert body["features"]["ai_providers"] is False
    assert body["ai"]["background_removal"] == {"default": None, "models": []}
    settings.AI_USER_PROVIDERS = "everyone"
    assert APIClient().get("/api/v1/config/").json()["features"]["ai_providers"] is True


def test_config_carries_the_operators_offsite_notice(settings):
    assert APIClient().get("/api/v1/config/").json()["ai"]["offsite_notice"] == ""
    settings.AI_OFFSITE_NOTICE = "  Images go to our partner's servers in the EU.  "
    body = APIClient().get("/api/v1/config/").json()
    assert body["ai"]["offsite_notice"] == "Images go to our partner's servers in the EU."
