"""Text-to-image through the queue style: a job sent with a prompt, its status checked until it is done, the
picture downloaded from the link in the result, and the API, settings and `.env` providers around it."""

from __future__ import annotations

import base64
import json
from io import BytesIO

import pytest
from PIL import Image
from rest_framework.test import APIClient

from apps.ai import catalog, env, services
from apps.ai.errors import AIProviderError
from apps.ai.models import AICall
from apps.ai.serializers import ProviderSerializer
from apps.ai.styles import ConfigError, get_style
from apps.ai.styles import queue as queue_style
from apps.ai.tasks import TASKS
from apps.ai.transport import HttpResponse
from apps.assets import remote

from .conftest import make_provider
from .fakes import QUEUE_KEY, QueueServer, json_answer, png
from .test_services import env_provider

pytestmark = pytest.mark.django_db

TASK = "text-to-image"
MODEL = "gpt-image-2"
PROMPT = "A red fox in the snow"
BASE = f"/v1/queue/{MODEL}"


@pytest.fixture(autouse=True)
def _quick_status_checks(monkeypatch):
    monkeypatch.setattr(queue_style, "POLL_SECONDS", 0.01)


@pytest.fixture
def localhost(monkeypatch, settings):
    """The picture's link names `localhost`, another host than the server's 127.0.0.1, here on a private
    network the operator allows."""
    settings.AI_ALLOWED_PRIVATE_HOSTS = ["localhost"]
    monkeypatch.setattr(remote, "resolve", lambda host: ["127.0.0.1"])


@pytest.fixture
def server(fake):
    return QueueServer(fake, MODEL)


@pytest.fixture
def provider(fake):
    provider = make_provider(
        fake.url,
        "queue",
        name="Queue server",
        tasks=[TASK],
        style_config={"extra_fields": {"image_size": "square_hd", "quality": "low"}},
        auth_header="Authorization",
        secret=f"Key {QUEUE_KEY}",
    )
    provider.models.create(task=TASK, remote_name=MODEL, label="GPT Image 2")
    return provider


def opened(asset) -> Image.Image:
    with asset.file.open("rb") as handle:
        return Image.open(BytesIO(handle.read())).copy()


def test_a_prompt_becomes_a_new_image_asset(fake, server, provider, user, localhost):
    result = services.run(user, TASK, None, f"{provider.id}:{MODEL}", prompt=PROMPT)
    assert result.owner == user and result.mime == "image/png"
    assert opened(result).size == (48, 32)  # the server's size: nothing to match
    assert result.name == f"{PROMPT} (created)"
    assert result.meta["ai"]["prompt"] == PROMPT and result.meta["ai"]["task"] == TASK
    assert [(r.method, r.path.split("?")[0]) for r in fake.requests] == [
        ("POST", BASE),
        ("GET", f"{BASE}/requests/job-1/status"),
        ("GET", f"{BASE}/requests/job-1/status"),
        ("GET", f"{BASE}/requests/job-1"),
        ("GET", "/files/job-1.png"),
    ]
    submit = fake.requests[0]
    assert submit.json == {"image_size": "square_hd", "quality": "low", "prompt": PROMPT}
    assert submit.headers["authorization"] == f"Key {QUEUE_KEY}" and submit.headers["idempotency-key"]
    call = AICall.objects.get()
    assert (call.task, call.status, call.model) == (TASK, "ok", MODEL)
    assert call.bytes_in == len(submit.body) and call.bytes_out > 0


def test_the_download_never_carries_the_providers_key(fake, server, provider, user, localhost):
    services.run(user, TASK, None, f"{provider.id}:{MODEL}", prompt=PROMPT)
    download = fake.requests[-1]
    assert download.headers["host"] == f"localhost:{fake.httpd.server_address[1]}"
    assert "authorization" not in download.headers and QUEUE_KEY not in json.dumps(download.headers)
    assert all(r.headers.get("authorization") == f"Key {QUEUE_KEY}" for r in fake.requests[:-1])


def test_a_link_to_an_ip_address_on_a_private_network_is_refused(fake, provider, user):
    # The operator typed 127.0.0.1; the server's answer did not.
    QueueServer(fake, MODEL, link_host="127.0.0.1")
    with pytest.raises(AIProviderError) as caught:
        services.run(user, TASK, None, f"{provider.id}:{MODEL}", prompt=PROMPT)
    assert caught.value.code == "refused_address"
    assert "/files/job-1.png" not in [r.path.split("?")[0] for r in fake.requests]


def test_the_same_prompt_twice_returns_the_cached_result(fake, server, provider, user, localhost):
    first = services.run(user, TASK, None, f"{provider.id}:{MODEL}", prompt=PROMPT)
    second = services.run(user, TASK, None, f"{provider.id}:{MODEL}", prompt=PROMPT)
    assert first.pk == second.pk and [r.method for r in fake.requests].count("POST") == 1
    services.run(user, TASK, None, f"{provider.id}:{MODEL}", prompt="A blue fox in the snow")
    assert [r.method for r in fake.requests].count("POST") == 2


def test_a_failed_job_is_a_clean_error_without_its_details(fake, server, provider, user):
    fake.routes[("GET", f"{BASE}/requests/job-1/status")] = lambda request: json_answer(
        {"status": "COMPLETED", "error": {"code": "content_policy", "message": "Refused: secret internals."}}
    )
    with pytest.raises(AIProviderError) as caught:
        services.run(user, TASK, None, f"{provider.id}:{MODEL}", prompt=PROMPT)
    assert caught.value.code == "bad_response" and "internals" not in caught.value.message
    assert f"{BASE}/requests/job-1" not in [r.path for r in fake.requests]  # no result asked for
    assert AICall.objects.get().status == "error"


def test_a_job_still_running_at_the_timeout_is_a_timeout(fake, provider, user):
    QueueServer(fake, MODEL, statuses=("IN_PROGRESS",))
    provider.timeout_seconds = 1
    provider.save()
    with pytest.raises(AIProviderError) as caught:
        services.run(user, TASK, None, f"{provider.id}:{MODEL}", prompt=PROMPT)
    assert caught.value.code == "timeout" and AICall.objects.get().status == "timeout"


@pytest.mark.parametrize(
    "answer, code",
    [
        (json_answer({"status": "IN_QUEUE"}), "bad_response"),  # no job id
        (json_answer({"request_id": "../../admin"}), "bad_response"),
        (json_answer({"error": {"code": "unauthorized", "message": "Bad key."}}, 401), "auth_failed"),
        (json_answer({"error": {"code": "insufficient_balance", "message": "Top up."}}, 402), "bad_response"),
        (json_answer({"error": {"code": "rate_limited", "message": "Slow down."}}, 429), "busy"),
        (json_answer({"error": {"code": "model_unavailable", "message": "Down."}}, 503), "bad_response"),
    ],
)
def test_bad_job_answers_are_clean_errors(fake, server, provider, user, answer, code):
    fake.routes[("POST", BASE)] = lambda request: answer
    with pytest.raises(AIProviderError) as caught:
        services.run(user, TASK, None, f"{provider.id}:{MODEL}", prompt=PROMPT)
    assert caught.value.code == code and len(fake.requests) == 1


@pytest.mark.parametrize(
    "answer",
    [
        json_answer({"images": []}),
        json_answer({"images": [{"url": "ftp://files.example/x.png"}]}),
        json_answer({"error": {"code": "not_ready", "message": "Not done."}}, 400),
    ],
)
def test_bad_results_are_clean_errors(fake, server, provider, user, answer):
    fake.routes[("GET", f"{BASE}/requests/job-1")] = lambda request: answer
    with pytest.raises(AIProviderError) as caught:
        services.run(user, TASK, None, f"{provider.id}:{MODEL}", prompt=PROMPT)
    assert caught.value.code == "bad_response"


def test_a_dropped_submit_is_sent_again_with_the_same_key(fake, provider):
    picture = base64.b64encode(png(Image.new("RGB", (20, 10), "green"))).decode()
    sent = []

    def send(request, max_bytes, time_left=None):
        sent.append(request)
        if len(sent) == 1:
            raise AIProviderError("unreachable", "The server cannot be reached.")
        if request.method == "POST":
            body = {"request_id": "job-1", "status": "IN_QUEUE"}
        elif request.url.endswith("/status"):
            body = {"status": "COMPLETED", "error": None}
        else:
            body = {"images": [{"url": f"data:image/png;base64,{picture}"}]}
        return HttpResponse(200, {"content-type": "application/json"}, json.dumps(body).encode())

    conn = catalog.connection(provider)
    result, _, _ = get_style("queue").run(
        conn, TASKS[TASK], MODEL, None, {}, prompt=PROMPT, send=send, limit=1024 * 1024
    )
    assert Image.open(BytesIO(result)).size == (20, 10)
    assert [r.method for r in sent] == ["POST", "POST", "GET", "GET"]
    assert sent[0].headers["Idempotency-Key"] == sent[1].headers["Idempotency-Key"]


def test_testing_a_queue_provider_sends_the_sample_prompt(fake, server, provider, user, localhost):
    result = services.test_provider(user, provider)
    assert result.ok is True and result.task == TASK and result.preview.startswith("data:image/png;base64,")
    assert fake.requests[0].json["prompt"] == services.SAMPLE_PROMPT


# -- the API -------------------------------------------------------------------------------------------------


def test_the_api_creates_an_image_from_a_prompt(api, fake, server, provider, localhost):
    body = {"prompt": PROMPT, "model": f"{provider.id}:{MODEL}"}
    response = api.post(f"/api/v1/ai/{TASK}/", body, format="json")
    assert response.status_code == 201, response.content
    assert response.json()["name"] == f"{PROMPT} (created)" and response.json()["mime"] == "image/png"


@pytest.mark.parametrize(
    "path, body",
    [
        (f"/api/v1/ai/{TASK}/", {}),  # no prompt
        (f"/api/v1/ai/{TASK}/", {"prompt": "   "}),
        (f"/api/v1/ai/{TASK}/", {"prompt": "x" * 2001}),
        ("/api/v1/ai/background-removal/", {"prompt": PROMPT}),  # an image task needs its image
    ],
)
def test_bad_prompt_requests_are_refused_before_any_call(api, fake, provider, path, body):
    response = api.post(path, {"model": f"{provider.id}:{MODEL}", **body}, format="json")
    assert response.status_code == 400 and response.json()["error"]["code"] == "validation_error"
    assert fake.requests == []


def test_config_lists_the_text_to_image_options(fake, provider):
    body = APIClient().get("/api/v1/config/").json()
    assert body["ai"]["text_to_image"]["default"] == f"{provider.id}:{MODEL}"
    assert [o["id"] for o in body["ai"]["text_to_image"]["models"]] == [f"{provider.id}:{MODEL}"]
    assert body["ai"]["background_removal"]["models"] == []


# -- settings ------------------------------------------------------------------------------------------------


def test_queue_style_settings_and_their_defaults():
    config = get_style("queue").config({})
    assert (config.path, config.status_path, config.result_path) == (
        "/v1/queue/{model}",
        "/v1/queue/{model}/requests/{id}/status",
        "/v1/queue/{model}/requests/{id}",
    )
    assert (config.prompt_field, config.model_field, config.response_path) == ("prompt", "", "images.0.url")
    custom = get_style("queue").config({"status_path": "/jobs/{id}", "prompt_field": "text"})
    assert (custom.status_path, custom.prompt_field) == ("/jobs/{id}", "text")
    with pytest.raises(ConfigError, match="start with /"):
        get_style("queue").config({"status_path": "jobs/{id}"})
    with pytest.raises(ConfigError, match="no setting status_path"):
        get_style("custom").config({"status_path": "/jobs/{id}"})


def test_each_style_runs_only_the_tasks_it_can_send():
    get_style("queue").check_tasks([TASK])
    get_style("multipart").check_tasks(["background-removal", "not-a-task"])
    with pytest.raises(ConfigError, match="cannot run background-removal"):
        get_style("queue").check_tasks(["background-removal"])
    with pytest.raises(ConfigError, match="cannot run text-to-image"):
        get_style("multipart").check_tasks([TASK])


def test_a_provider_whose_style_cannot_run_the_task_is_refused_when_called(fake, user):
    provider = make_provider(fake.url, "multipart", tasks=[TASK], style_config={"path": "/api/remove"})
    with pytest.raises(AIProviderError) as caught:
        services.run(user, TASK, None, f"{provider.id}:", prompt=PROMPT)
    assert caught.value.code == "not_supported" and fake.requests == []
    assert AICall.objects.get().status == "refused"


def test_a_users_server_must_be_able_to_run_its_tasks():
    data = {"name": "Mine", "base_url": "https://ai.example.com", "style": "queue"}
    refused = ProviderSerializer(data={**data, "tasks": ["background-removal"]})
    assert not refused.is_valid() and "tasks" in refused.errors
    assert ProviderSerializer(data={**data, "tasks": [TASK]}).is_valid()


def test_env_queue_providers(fake, user, settings):
    from apps.ai.checks import check_ai_settings

    settings.AI_ENV_PROVIDERS = [
        env_provider(
            fake,
            STYLE="queue",
            STYLE_CONFIG='{"extra_fields": {"quality": "low"}}',
            TASKS=TASK,
            MODELS=f"{MODEL}:GPT Image 2",
            AUTH_HEADER="Authorization",
            AUTH_VALUE=f"Key {QUEUE_KEY}",
        ),
        env_provider(fake, 2, TASKS=TASK),  # multipart
        env_provider(fake, 3, STYLE="queue", STYLE_CONFIG=""),  # background removal, the default task
    ]
    assert [o.id for o in catalog.options(user, TASK)] == [f"env-1:{MODEL}"]
    warnings = [w.msg for w in check_ai_settings(None) if w.id == "ai.W002"]
    assert len(warnings) == 2
    assert "AI_PROVIDER_2_TASKS" in warnings[0] and "cannot run text-to-image" in warnings[0]
    assert "AI_PROVIDER_3_TASKS" in warnings[1] and "cannot run background-removal" in warnings[1]
