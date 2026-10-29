"""Which options a user may pick for a task: the in-browser model ("On this device"), operator providers
(`.env` and admin) the user is in the audience of, and the user's own servers when `AI_USER_PROVIDERS` lets
them have any.

An option's id is `device`, or `<provider id>:<model name>` (the model name may be empty: the server's
default). Ids never carry URLs or secrets.
"""

from __future__ import annotations

import hashlib
import logging
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from django.conf import settings
from django.core.cache import cache
from django.db.models import Q

from apps.core.mlmodels.availability import background_removal_model, best_installed

from . import env, transport
from .env import EnvProvider
from .errors import AIProviderError
from .models import Audience, Provider
from .secrets import SecretUnreadable
from .serializers import USER_PROVIDER_MAX_TIMEOUT
from .styles import Connection, RemoteModel, get_style
from .styles.base import ConfigError
from .tasks import TASKS

DEVICE = "device"
USER_PROVIDER_MODES = ("off", "staff", "everyone")
ENV_MODELS_SECONDS = 600  # a Doory-compatible `.env` provider's model list is fetched again after this
ENV_MODELS_RETRY_SECONDS = 60  # … or after this when fetching it failed
LIST_MODELS_TIMEOUT = 10.0

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Option:
    id: str
    label: str
    task: str
    kind: Literal["device", "server"]
    provider_id: str  # empty for the device
    provider_name: str
    owner: Literal["device", "operator", "user"]
    sends_offsite: bool = False
    remote_name: str = ""
    daily_quota: int = 0
    #: Changes whenever the provider's settings do (part of the result cache key).
    version: str = ""
    provider: Provider | EnvProvider | None = field(default=None, compare=False, repr=False)

    def public(self) -> dict[str, Any]:
        """What clients see: never URLs, secrets or quotas of others."""
        return {
            "id": self.id,
            "label": self.label,
            "task": self.task,
            "kind": self.kind,
            "provider_name": self.provider_name,
            "owner": self.owner,
            "sends_offsite": self.sends_offsite,
        }


def user_providers_mode() -> str:
    mode = str(getattr(settings, "AI_USER_PROVIDERS", "off")).strip().lower()
    return mode if mode in USER_PROVIDER_MODES else "off"


def user_providers_allowed(user) -> bool:
    if not settings.AI_PROVIDERS_ENABLED or not getattr(user, "is_authenticated", False):
        return False
    mode = user_providers_mode()
    return mode == "everyone" or (mode == "staff" and user.is_staff)


def device_available(task: str) -> bool:
    if task == "background-removal":
        return background_removal_model() is not None
    if task == "upscale":  # the editor's own resampler, with no model to install
        return True
    return best_installed(task) is not None


def _device(task: str) -> Option:
    return Option(
        id=DEVICE,
        label="On this device",
        task=task,
        kind="device",
        provider_id="",
        provider_name="",
        owner="device",
    )


# -- connections ---------------------------------------------------------------------------------------------


def connection(provider: Provider | EnvProvider) -> Connection:
    """How to reach `provider`. Raises AIProviderError when its settings or secret cannot be used."""
    try:
        style = get_style(provider.style)
        config = provider.config if isinstance(provider, EnvProvider) else style.config(provider.style_config)
        secret = provider.secret()
    except ConfigError as exc:
        raise AIProviderError("bad_response", "The provider is not configured correctly.") from exc
    except SecretUnreadable as exc:
        raise AIProviderError(
            "secret_unreadable", "The provider's key can no longer be read; enter it again."
        ) from exc
    timeout = float(provider.timeout_seconds)
    if not provider.is_operator:
        timeout = min(timeout, float(USER_PROVIDER_MAX_TIMEOUT))
    max_image_bytes = min(
        provider.max_image_bytes or settings.AI_MAX_IMAGE_BYTES,
        settings.AI_MAX_IMAGE_BYTES,
    )
    return Connection(
        ref=str(provider.id),
        name=provider.name,
        base_url=provider.base_url,
        style=style.name,
        config=config,
        auth_header=provider.auth_header,
        auth_value=secret,
        timeout=timeout,
        max_image_bytes=max_image_bytes,
        policy=transport.operator_policy() if provider.is_operator else transport.user_policy(),
    )


def sender(conn: Connection, *, timeout: float | None = None):
    """A `Send` for the styles: one request under the provider's network policy and timeout."""

    def send(request, max_bytes: int) -> transport.HttpResponse:
        try:
            return transport.send(
                request.method,
                request.url,
                policy=conn.policy,
                headers=request.headers,
                body=request.body,
                max_bytes=max_bytes,
                timeout=timeout or conn.timeout,
            )
        except transport.TransportError as exc:
            raise AIProviderError(exc.code, exc.message) from exc

    return send


def list_remote_models(provider: Provider | EnvProvider) -> list[RemoteModel]:
    conn = connection(provider)
    models = get_style(conn.style).list_models(
        conn, sender(conn, timeout=min(conn.timeout, LIST_MODELS_TIMEOUT))
    )
    return [
        RemoteModel(
            remote_name=re.sub(r"[\x00-\x1f\x7f-\x9f]", "", m.remote_name).strip(),
            label=re.sub(r"[\x00-\x1f\x7f-\x9f]", "", m.label).strip(),
            tasks=m.tasks,
        )
        for m in models
    ]


# -- options -------------------------------------------------------------------------------------------------


def _env_version(provider: EnvProvider) -> str:
    raw = f"{provider.base_url}|{provider.style}|{sorted(provider.style_config.items())}"
    return hashlib.sha256(raw.encode()).hexdigest()[:12]


def env_models(
    provider: EnvProvider, *, allow_network: bool = True
) -> list[tuple[str, str, tuple[str, ...]]]:
    """(remote name, label, tasks) of an `.env` provider: as configured, or the list a Doory-compatible server
    reports (cached), or the server's default model."""
    if provider.models:
        return [(name, label, ()) for name, label in provider.models]
    if not get_style(provider.style).can_list_models:
        return [("", "", ())]
    key = f"ai:env-models:{provider.id}:{_env_version(provider)}"
    cached = cache.get(key)
    if cached is None:
        if not allow_network:
            return [("", "", ())]
        lock_key = f"{key}:lock"
        if not cache.add(lock_key, 1, timeout=15):
            return [("", "", ())]
        try:
            cached = [(m.remote_name, m.label, m.tasks) for m in list_remote_models(provider)]
            cache.set(key, cached, ENV_MODELS_SECONDS)
        except AIProviderError as exc:
            logger.warning(
                "Listing the models of AI provider %s failed: %s (%s)", provider.id, exc.code, exc.message
            )
            cached = []
            cache.set(key, cached, ENV_MODELS_RETRY_SECONDS)
        finally:
            cache.delete(lock_key)
    return cached or [("", "", ())]


def _env_options(task: str, *, allow_network: bool = True) -> list[Option]:
    options = []
    for provider in env.env_providers():
        if task not in provider.tasks:
            continue
        for name, label, tasks in env_models(provider, allow_network=allow_network):
            if tasks and task not in tasks:
                continue
            options.append(
                Option(
                    id=f"{provider.id}:{name}",
                    label=label or name or provider.name,
                    task=task,
                    kind="server",
                    provider_id=provider.id,
                    provider_name=provider.name,
                    owner="operator",
                    sends_offsite=provider.sends_offsite,
                    remote_name=name,
                    daily_quota=provider.daily_quota,
                    version=_env_version(provider),
                    provider=provider,
                )
            )
    return options


def _db_options(providers, task: str) -> list[Option]:
    options = []
    for provider in providers:
        if task not in (provider.tasks or []):
            continue
        rows = [m for m in provider.models.all() if m.task == task]
        models = [(m.remote_name, m.label) for m in rows if m.enabled] if rows else [("", "")]
        for name, label in models:
            options.append(
                Option(
                    id=f"{provider.id}:{name}",
                    label=label or name or provider.name,
                    task=task,
                    kind="server",
                    provider_id=str(provider.id),
                    provider_name=provider.name,
                    owner="operator" if provider.is_operator else "user",
                    sends_offsite=provider.sends_offsite,
                    remote_name=name,
                    daily_quota=provider.daily_quota if provider.is_operator else 0,
                    version=str(provider.updated_at.timestamp()),
                    provider=provider,
                )
            )
    return options


def operator_providers(user=None):
    """Enabled operator providers `user` is in the audience of (`None`: providers for everyone only)."""
    queryset = Provider.objects.filter(owner__isnull=True, enabled=True).prefetch_related("models")
    if user is None:
        return queryset.filter(audience=Audience.EVERYONE)
    audience = Q(audience=Audience.EVERYONE) | Q(audience=Audience.USERS, allowed_users=user)
    if user.is_staff:
        audience |= Q(audience=Audience.STAFF)
    return queryset.filter(audience).distinct()


def own_providers(user):
    return Provider.objects.filter(owner=user, enabled=True).prefetch_related("models")


def _tasks(task: str | None) -> list[str]:
    if task is None:
        return list(TASKS)
    return [task] if task in TASKS else []


def options(user, task: str | None = None) -> list[Option]:
    """Everything `user` may pick, device first, then operator providers, then the user's own."""
    result: list[Option] = []
    for task_id in _tasks(task):
        if device_available(task_id):
            result.append(_device(task_id))
        if not settings.AI_PROVIDERS_ENABLED:
            continue
        result += _env_options(task_id)
        result += _db_options(operator_providers(user), task_id)
        if user_providers_allowed(user):
            result += _db_options(own_providers(user), task_id)
    return result


def public_options(task: str) -> list[Option]:
    """The options every signed-in user has (for the public `/config/`)."""
    result = [_device(task)] if device_available(task) else []
    if settings.AI_PROVIDERS_ENABLED:
        result += _env_options(task, allow_network=False)
        result += _db_options(operator_providers(None), task)
    return result


def find(user, task: str, option_id: str) -> Option | None:
    """The option `option_id` for `task` if `user` may use it. Only the named provider is looked at."""
    if task not in TASKS:
        return None
    if option_id == DEVICE:
        return _device(task) if device_available(task) else None
    if not settings.AI_PROVIDERS_ENABLED:
        return None
    provider_id, colon, _ = option_id.partition(":")
    if not colon:
        return None
    if provider_id.startswith("env-"):
        candidates = [o for o in _env_options(task) if o.provider_id == provider_id]
    else:
        try:
            pk = uuid.UUID(provider_id)
        except ValueError:
            return None
        candidates = _db_options(operator_providers(user).filter(pk=pk), task)
        if not candidates and user_providers_allowed(user):
            candidates = _db_options(own_providers(user).filter(pk=pk), task)
    return next((o for o in candidates if o.id == option_id), None)


def default_option(task: str, available: list[Option]) -> str | None:
    """The configured default for `task` when it is available, else the first option."""
    wanted = settings.AI_TASK_DEFAULTS.get(task, DEVICE)
    ids = [o.id for o in available]
    if wanted in ids:
        return wanted
    return ids[0] if ids else None


def has_server_options() -> bool:
    """Whether any server option can exist (for the `features.ai_providers` flag)."""
    if not settings.AI_PROVIDERS_ENABLED:
        return False
    return (
        bool(env.env_providers())
        or Provider.objects.filter(owner__isnull=True, enabled=True).exists()
        or user_providers_mode() != "off"
    )


def ai_config() -> dict[str, Any]:
    """The `ai` part of the public `/config/`: per task (`background-removal` → `background_removal`), the
    options every signed-in user has and the default."""
    config: dict[str, Any] = {
        "user_providers": user_providers_mode(),
        "offsite_notice": str(getattr(settings, "AI_OFFSITE_NOTICE", "")).strip(),
    }
    for task in TASKS:
        available = public_options(task)
        config[task.replace("-", "_")] = {
            "default": default_option(task, available),
            "models": [option.public() for option in available],
        }
    return config
