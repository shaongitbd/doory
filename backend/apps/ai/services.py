"""Running a task through a provider: `run` turns a user's asset into a new asset (for background removal, the
same image with a transparent background; for upscale, a larger one), with permissions, quotas, a result cache
and a log of every call.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import time
from contextlib import contextmanager, nullcontext, suppress
from dataclasses import dataclass
from io import BytesIO
from typing import Any, TypeVar

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from PIL import Image, ImageDraw

from apps.assets.models import Asset
from apps.assets.services import create_asset
from apps.assets.uploads import clean_name
from apps.core.images import LARGE_DECODE_WAIT_SECONDS

from . import catalog, quotas
from .catalog import Option
from .env import EnvProvider
from .errors import AIProviderError, ModelNotAvailable, QuotaReached, RunsOnDevice, UnsupportedAsset
from .models import AICall, Provider, ProviderModel
from .results import SourceImage, decode_source, fits
from .serializers import USER_PROVIDER_MAX_TIMEOUT
from .styles import Connection, get_style
from .tasks import TASKS, Task, result_size, validate_options

SENT_AS_IS = ("image/png", "image/jpeg", "image/webp")
PREVIEW_SIDE = 256
JSON_OVERHEAD = 64 * 1024
MAX_IN_FLIGHT_PER_USER = 1
# Longer than any call can last: the longest user timeout, waiting for a decode slot for the source and for
# the result, and a margin.
IN_FLIGHT_TIMEOUT = int(USER_PROVIDER_MAX_TIMEOUT + 2 * LARGE_DECODE_WAIT_SECONDS) + 10

logger = logging.getLogger(__name__)
E = TypeVar("E", bound=Exception)


@dataclass
class Outcome:
    png: bytes
    bytes_in: int
    bytes_out: int


def answer_limit(conn: Connection) -> int:
    """The largest answer read from the provider: the server-wide image limit (not the provider's limit for
    what is sent: a cut-out PNG is often several times larger than the JPEG it came from), plus room for
    base64 when the style may answer with JSON."""
    limit = settings.AI_MAX_IMAGE_BYTES
    if conn.config.response_format == "json" or conn.config.response == "auto":
        limit = limit * 4 // 3
    return limit + JSON_OVERHEAD


@contextmanager
def track_in_flight(user, max_in_flight: int = MAX_IN_FLIGHT_PER_USER, timeout: int = IN_FLIGHT_TIMEOUT):
    """Ensure at most `max_in_flight` concurrent calls for `user`."""
    if not user or not getattr(user, "is_authenticated", False):
        yield
        return
    key = f"ai:in_flight:{user.pk}"
    added = cache.add(key, 1, timeout)
    if not added:
        try:
            current = cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout)
            current = 1
        if current > max_in_flight:
            with suppress(ValueError):
                cache.decr(key)
            raise refused(
                AIProviderError("busy", "Another AI task is already in progress. Try again shortly.")
            )
    try:
        yield
    finally:
        try:
            val = cache.decr(key)
            if val <= 0:
                cache.delete(key)
        except ValueError:
            cache.delete(key)


def call(conn: Connection, task: Task, model: str, source: SourceImage, options: dict[str, Any]) -> Outcome:
    """One request to the provider and its result as PNG, or WebP when too large for an upload
    (AIProviderError otherwise)."""
    if len(source.data) > conn.max_image_bytes:
        raise refused(AIProviderError("too_large", "The image is too large for this option."))
    size = result_size(task, source.width, source.height, options)
    if size is not None and not fits(*size):
        raise refused(AIProviderError("too_large", "The result would be too large. Choose a smaller scale."))
    style = get_style(conn.style)
    request = style.build(conn, task, model, source, options)
    response = catalog.sender(conn)(request, answer_limit(conn))
    png = style.parse(conn, task, response, source, options)
    return Outcome(png=png, bytes_in=len(request.body), bytes_out=len(response.body))


def refused(error: E) -> E:
    """Mark `error` as raised before anything reached the provider (logged as refused, not counted)."""
    error.refused = True
    return error


def _status(error: Exception | None) -> str:
    if error is None:
        return AICall.Status.OK
    code = getattr(error, "code", "")
    if code == "timeout":
        return AICall.Status.TIMEOUT
    if code in ("refused_address", "secret_unreadable") or getattr(error, "refused", False):
        return AICall.Status.REFUSED
    return AICall.Status.ERROR


def log_call(
    user,
    provider: Provider | EnvProvider | None,
    provider_ref: str,
    provider_name: str,
    task: str,
    model: str,
    *,
    error: Exception | None,
    started: float,
    outcome: Outcome | None = None,
) -> AICall:
    status = _status(error)
    duration = int((time.monotonic() - started) * 1000)
    code = (getattr(error, "code", "") or getattr(error, "default_code", "")) if error else ""
    clean_model = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", model)[:200].strip()
    entry = AICall.objects.create(
        user=user,
        provider=provider if isinstance(provider, Provider) else None,
        provider_ref=provider_ref,
        provider_name=provider_name[:80],
        model=clean_model,
        task=task,
        status=status,
        error_code=str(code)[:32],
        duration_ms=duration,
        bytes_in=outcome.bytes_in if outcome else 0,
        bytes_out=outcome.bytes_out if outcome else 0,
    )
    logger.info(
        "AI call: task=%s provider=%s model=%s status=%s code=%s duration_ms=%d user=%s",
        task,
        provider_ref,
        clean_model,
        status,
        code or "-",
        duration,
        getattr(user, "pk", None),
    )
    return entry


def _log(user, option: Option, **kwargs) -> AICall:
    return log_call(
        user,
        option.provider,
        option.provider_id,
        option.provider_name,
        option.task,
        option.remote_name,
        **kwargs,
    )


def read_source(asset: Asset, limit: int) -> SourceImage:
    """The asset's image as sent to a provider: PNG, JPEG and WebP as stored, other formats as PNG."""
    if asset.kind != Asset.Kind.IMAGE:
        raise UnsupportedAsset()
    with asset.file.open("rb") as handle:
        data = handle.read(limit + 1)
    if len(data) > limit:
        raise refused(AIProviderError("too_large", "The image is too large for this option."))
    source = SourceImage(data=data, mime=asset.mime, width=asset.width, height=asset.height)
    if asset.mime in SENT_AS_IS:
        return source
    image = decode_source(source)
    out = BytesIO()
    image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB").save(
        out, "PNG"
    )
    return SourceImage(data=out.getvalue(), mime="image/png", width=image.width, height=image.height)


def _cache_key(user, option: Option, digest: str, options: dict[str, Any]) -> str:
    options_hash = hashlib.sha256(json.dumps(options, sort_keys=True).encode()).hexdigest()[:16]
    raw = f"{option.task}|{option.id}|{option.version}|{digest}|{options_hash}"
    return f"ai:result:{user.pk}:{hashlib.sha256(raw.encode()).hexdigest()}"


def _result_name(asset: Asset, task: Task) -> str:
    suffix = f" ({task.result_suffix})"
    base = asset.name or "Image"
    return clean_name(base[: 255 - len(suffix)] + suffix)


def run(user, task_id: str, asset: Asset, model_id: str, options: Any = None) -> Asset:
    """A new asset of `user` made from `asset` by the option `model_id` of task `task_id`."""
    task = TASKS.get(task_id)
    if task is None:
        raise ModelNotAvailable()
    options = validate_options(task, options)
    option = catalog.find(user, task_id, model_id)
    if option is None:
        raise ModelNotAvailable()
    if option.kind == "device":
        raise RunsOnDevice()
    if asset.owner_id != user.pk:
        raise UnsupportedAsset()
    provider = option.provider
    assert provider is not None
    started = time.monotonic()
    try:
        conn = catalog.connection(provider)
        source = read_source(asset, conn.max_image_bytes)
    except AIProviderError as exc:
        _log(user, option, error=refused(exc), started=started)
        raise

    digest = hashlib.sha256(source.data).hexdigest()
    key = _cache_key(user, option, digest, options)
    cached_id = cache.get(key)
    if cached_id:
        cached = Asset.objects.filter(pk=cached_id, owner=user).first()
        if cached is not None:
            return cached

    try:
        quotas.check(user, option)
    except QuotaReached as exc:
        _log(user, option, error=refused(exc), started=started)
        raise
    in_flight = track_in_flight(user) if not provider.is_operator else nullcontext()
    try:
        with in_flight:
            outcome = call(conn, task, option.remote_name, source, options)
    except AIProviderError as exc:
        _log(user, option, error=exc, started=started)
        raise
    meta = {
        "ai": {
            "task": task_id,
            "option": option.id,
            "provider": option.provider_name,
            "model": option.remote_name,
            "source_asset": str(asset.pk),
        }
    }
    try:
        result = create_asset(user, outcome.png, name=_result_name(asset, task), meta=meta)
    except Exception as exc:
        _log(user, option, error=exc, started=started, outcome=outcome)
        raise
    _log(user, option, error=None, started=started, outcome=outcome)
    cache.set(key, str(result.pk), settings.AI_CACHE_SECONDS)
    return result


# -- testing and model lists (admin and the user's own providers) -------------------------------------------


def sample_image() -> SourceImage:
    """A built-in test picture: a coloured disc on a light background."""
    image = Image.new("RGB", (PREVIEW_SIDE, PREVIEW_SIDE), (236, 240, 244))
    draw = ImageDraw.Draw(image)
    draw.ellipse((48, 48, 208, 208), fill=(220, 60, 70))
    draw.rectangle((104, 104, 152, 152), fill=(40, 90, 200))
    out = BytesIO()
    image.save(out, "PNG")
    return SourceImage(data=out.getvalue(), mime="image/png", width=PREVIEW_SIDE, height=PREVIEW_SIDE)


@dataclass
class TestResult:
    ok: bool
    duration_ms: int
    task: str
    model: str
    preview: str = ""  # data: URL of a PNG of at most PREVIEW_SIDE px
    error_code: str = ""
    error: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "duration_ms": self.duration_ms,
            "task": self.task,
            "model": self.model,
            "preview": self.preview,
            "error": {"code": self.error_code, "message": self.error} if not self.ok else None,
        }


def _preview(png: bytes) -> str:
    with Image.open(BytesIO(png)) as image:
        image.thumbnail((PREVIEW_SIDE, PREVIEW_SIDE))
        out = BytesIO()
        image.save(out, "PNG")
        data = out.getvalue()
        out.close()
    return "data:image/png;base64," + base64.b64encode(data).decode("ascii")


def first_model(provider: Provider | EnvProvider, task: str) -> str:
    if isinstance(provider, EnvProvider):
        models = catalog.env_models(provider)
        return next((name for name, _, tasks in models if not tasks or task in tasks), "")
    row = provider.models.filter(task=task, enabled=True).first()
    return row.remote_name if row else ""


def test_provider(
    user, provider: Provider | EnvProvider, *, task: str | None = None, model: str | None = None
) -> TestResult:
    """Send the sample picture to `provider` and report how it went (never raises for provider errors)."""
    task_id = task or (provider.tasks[0] if provider.tasks else "background-removal")
    task_obj = TASKS.get(task_id)
    model = first_model(provider, task_id) if model is None else model
    started = time.monotonic()
    ref = str(provider.id)
    if task_obj is None:
        return TestResult(False, 0, task_id, model, error_code="not_supported", error="Unknown task.")
    in_flight = track_in_flight(user) if not provider.is_operator else nullcontext()
    try:
        conn = catalog.connection(provider)
        with in_flight:
            outcome = call(conn, task_obj, model, sample_image(), {})
        preview = _preview(outcome.png)
    except AIProviderError as exc:
        entry = log_call(user, provider, ref, provider.name, task_id, model, error=exc, started=started)
        return TestResult(False, entry.duration_ms, task_id, model, error_code=exc.code, error=exc.message)
    entry = log_call(
        user, provider, ref, provider.name, task_id, model, error=None, started=started, outcome=outcome
    )
    return TestResult(True, entry.duration_ms, task_id, model, preview=preview)


def load_models(provider: Provider) -> list[ProviderModel]:
    """Fetch a Doory-compatible server's models and add the ones for the provider's tasks (labels and
    choices made before are kept). Returns all of the provider's models."""
    remote = catalog.list_remote_models(provider)
    with transaction.atomic():
        existing = {(m.task, m.remote_name) for m in provider.models.all()}
        order = provider.models.count()
        for item in remote:
            clean_remote_name = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", item.remote_name).strip()
            clean_label = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", item.label).strip()
            for task in provider.tasks:
                if item.tasks and task not in item.tasks:
                    continue
                if (task, clean_remote_name) in existing:
                    continue
                ProviderModel.objects.create(
                    provider=provider,
                    task=task,
                    remote_name=clean_remote_name,
                    label=clean_label,
                    sort_order=order,
                )
                existing.add((task, clean_remote_name))
                order += 1
    return list(provider.models.all())
