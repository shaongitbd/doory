"""Queue: for servers that take a job and answer when it is done, such as image generation APIs. Doory sends
the prompt as JSON, checks the job's status until it is finished, reads the result and downloads the picture
from the link in it.

* `POST {base}{path}` (default `/v1/queue/{model}`), JSON `{"prompt": …}` with `extra_fields` and the task's
  options → `{"request_id": …}`, and optionally `status_url` and `response_url`
* `GET` the job's `status_url` (else `{base}{status_path}`, default `/v1/queue/{model}/requests/{id}/status`)
  → `{"status": …}`: `IN_QUEUE` or `IN_PROGRESS` while the job runs, `COMPLETED` when it is done;
  `error` set when it failed
* `GET` the job's `response_url` (else `{base}{result_path}`, default `/v1/queue/{model}/requests/{id}`) →
  JSON with a link to the picture (or a base64 image) at `response_path` (default `images.0.url`)

The job's own links are used only when they are on the provider's server. The submit carries an
`Idempotency-Key`, so the one retry after a dropped connection never starts a second job. The picture's link
may be on another host (a file store): it is downloaded under the provider's network policy, without the
provider's key or headers, and never from an IP address on a private network. The whole job shares the
provider's timeout.
"""

from __future__ import annotations

import json
import re
import time
import uuid
from collections.abc import Mapping
from dataclasses import replace
from typing import Any
from urllib.parse import quote

from django.conf import settings

from .. import transport
from ..errors import AIProviderError
from ..results import SourceImage, from_image
from ..tasks import Task
from .base import (
    ApiStyle,
    Connection,
    OutgoingRequest,
    Send,
    _walk,
    expect_ok,
    image_from_json,
    load_json,
)

POLL_SECONDS = 1.0  # the first wait between two status checks; each wait is longer, up to MAX_POLL_SECONDS
MAX_POLL_SECONDS = 5.0
MAX_STATUS_BYTES = 64 * 1024  # the job and status answers (the result may carry a base64 image)
WAITING = ("IN_QUEUE", "IN_PROGRESS")
_JOB_ID = re.compile(r"^[A-Za-z0-9_.:\-]{1,200}$")


def _fill(template: str, task: Task, model: str, job: str = "") -> str:
    for name, value in (("task", task.id), ("model", model), ("id", job)):
        template = template.replace("{" + name + "}", quote(value, safe=""))
    return template


def _job_url(connection: Connection, job: dict[str, Any], key: str, template: str) -> str:
    """The job's own link `key` when it is on the provider's server, else `template` under the base URL."""
    link = job.get(key)
    base = connection.base_url.rstrip("/") + "/"
    if (
        isinstance(link, str)
        and link.startswith(base)
        and len(link) <= transport.MAX_URL_LENGTH
        and "#" not in link
        and not transport._UNSAFE_URL_CHARS.search(link)
    ):
        return link
    return connection.url(template)


def _timeout() -> AIProviderError:
    return AIProviderError("timeout", "The server took too long to answer.")


def _failed() -> AIProviderError:
    return AIProviderError("bad_response", "The server could not make the image.")


class QueueStyle(ApiStyle):
    name = "queue"
    label = "Queue"
    help = (
        'For text-to-image. Settings: path (default "/v1/queue/{model}"), status_path and result_path (used '
        "when the job's answer has no status_url or response_url on the same server; may contain {model} and "
        '{id}), prompt_field (default "prompt"), model_field (default empty: the model is in the path), '
        "options_field, extra_fields (the model's settings, e.g. {\"image_size\": \"square_hd\"}), "
        "extra_headers, response_path (the picture's link in the result, default \"images.0.url\")."
    )
    keys = frozenset(
        {
            "path",
            "status_path",
            "result_path",
            "prompt_field",
            "model_field",
            "options_field",
            "extra_fields",
            "extra_headers",
            "response_path",
        }
    )
    fixed = {
        "path": "/v1/queue/{model}",
        "status_path": "/v1/queue/{model}/requests/{id}/status",
        "result_path": "/v1/queue/{model}/requests/{id}",
        "body": "json",
        "model_field": "",
        "response": "image",
        "response_format": "json",
        "response_path": "images.0.url",
    }
    inputs = frozenset({"prompt"})

    def run(
        self,
        connection: Connection,
        task: Task,
        model: str,
        image: SourceImage | None,
        options: Mapping[str, Any],
        *,
        prompt: str,
        send: Send,
        limit: int,
    ) -> tuple[bytes, int, int]:
        config = connection.config
        deadline = time.monotonic() + connection.timeout
        headers = {**config.extra_headers, **connection.auth_headers(), "Accept": "application/json"}
        body = json.dumps({**self.fields(connection, model, options), config.prompt_field: prompt}).encode()
        submit = OutgoingRequest(
            "POST",
            connection.url(_fill(config.path, task, model)),
            {**headers, "Content-Type": "application/json", "Idempotency-Key": uuid.uuid4().hex},
            body,
        )
        counts = [0, 0]  # bytes sent, bytes received

        def ask(request: OutgoingRequest, max_bytes: int) -> transport.HttpResponse:
            left = deadline - time.monotonic()
            if left <= 0:
                raise _timeout()
            counts[0] += len(request.body)
            response = send(request, max_bytes, left)
            counts[1] += len(response.body)
            expect_ok(response)
            return response

        try:
            job = load_json(ask(submit, MAX_STATUS_BYTES))
        except AIProviderError as exc:
            if exc.code != "unreachable":
                raise
            # The same key: the server never starts a second job.
            job = load_json(ask(submit, MAX_STATUS_BYTES))
        job_id = job.get("request_id") if isinstance(job, dict) else None
        if not isinstance(job_id, str) or not _JOB_ID.match(job_id):
            raise AIProviderError("bad_response", "The server's answer has no job id.")

        status_url = _job_url(connection, job, "status_url", _fill(config.status_path, task, model, job_id))
        wait = POLL_SECONDS
        while True:
            state = load_json(ask(OutgoingRequest("GET", status_url, headers, b""), MAX_STATUS_BYTES))
            if not isinstance(state, dict) or state.get("error"):
                raise _failed()
            if state.get("status") == "COMPLETED":
                break
            if state.get("status") not in WAITING:
                raise AIProviderError("bad_response", "The server's job ended without a result.")
            time.sleep(max(0.0, min(wait, deadline - time.monotonic())))
            wait = min(wait * 1.5, MAX_POLL_SECONDS)

        result_url = _job_url(connection, job, "response_url", _fill(config.result_path, task, model, job_id))
        result = ask(OutgoingRequest("GET", result_url, headers, b""), limit)
        answer = load_json(result)
        if isinstance(answer, dict) and answer.get("error"):
            raise _failed()
        link = _walk(answer, config.response_path)
        if isinstance(link, str) and link.startswith("data:"):
            data = image_from_json(result, config.response_path)
        elif isinstance(link, str) and link.startswith(("https://", "http://")):
            left = deadline - time.monotonic()
            if left <= 0:
                raise _timeout()
            data = download(connection, link, left).body
            counts[1] += len(data)
        else:
            raise AIProviderError(
                "bad_response", f"The server's {config.response_path} is not a link to an image."
            )
        return from_image(task, image, data), counts[0], counts[1]


def download(connection: Connection, url: str, time_left: float) -> transport.HttpResponse:
    """The picture at `url`, a link from the server's answer: under the provider's network policy but never an
    IP address on a private network (only an address the operator typed may be one), and with no key or
    headers of the provider."""
    policy = replace(connection.policy, private_literals=False)
    try:
        response = transport.send(
            "GET",
            url,
            policy=policy,
            headers={"Accept": "image/png, image/*;q=0.9"},
            max_bytes=settings.AI_MAX_IMAGE_BYTES,
            timeout=time_left,
        )
    except transport.TransportError as exc:
        raise AIProviderError(exc.code, exc.message) from exc
    expect_ok(response)
    return response
