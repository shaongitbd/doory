"""Operator providers from the environment (`AI_PROVIDER_1_URL` … `AI_PROVIDER_9_URL`).

They are never written to the database: each becomes a frozen in-memory provider with the id `env-<n>`, merged
into the catalogue with the providers made in the admin. A provider whose settings are invalid is left out and
reported by `manage.py check` (warning `ai.W002`).

```env
AI_PROVIDER_1_URL=http://model-server:7000
AI_PROVIDER_1_STYLE=multipart            # doory | multipart | json | mask | custom | queue
AI_PROVIDER_1_STYLE_CONFIG={"path": "/api/remove"}
AI_PROVIDER_1_TASKS=background-removal
AI_PROVIDER_1_MODELS=fast-model:Fast,best-model:Best   # empty: the server's default (doory style: its list)
AI_PROVIDER_1_AUTH_HEADER=X-Api-Key
AI_PROVIDER_1_AUTH_VALUE=…
```
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

from . import transport
from .models import MAX_TIMEOUT_SECONDS
from .styles import ConfigError, StyleConfig, get_style
from .styles.base import check_header_name
from .tasks import TASKS

_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"", "0", "false", "no", "off"}


@dataclass(frozen=True)
class EnvProvider:
    id: str
    index: int
    name: str
    base_url: str
    style: str
    style_config: dict[str, Any]
    config: StyleConfig
    tasks: tuple[str, ...]
    models: tuple[tuple[str, str], ...]  # (remote name, label); empty: the server's default or list
    auth_header: str
    auth_value: str = field(repr=False)
    sends_offsite: bool
    timeout_seconds: int
    max_image_bytes: int
    daily_quota: int

    is_operator = True

    @property
    def has_secret(self) -> bool:
        return bool(self.auth_value)

    def secret(self) -> str:
        return self.auth_value


def _bool(value: str, name: str) -> bool:
    text = value.strip().lower()
    if text in _TRUE:
        return True
    if text in _FALSE:
        return False
    raise ConfigError(f"{name} must be true or false.")


def _int(value: str, name: str, default: int, *, low: int, high: int) -> int:
    if not value.strip():
        return default
    try:
        number = int(value)
    except ValueError:
        raise ConfigError(f"{name} must be a whole number.") from None
    if not low <= number <= high:
        raise ConfigError(f"{name} must be between {low} and {high}.")
    return number


def parse_models(value: str) -> tuple[tuple[str, str], ...]:
    """`"fast:Fast,best:Best"` → (("fast", "Fast"), ("best", "Best")); the label follows the last colon."""
    models = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        name, colon, label = item.rpartition(":")
        if not colon:
            name, label = item, ""
        models.append((name.strip()[:200], label.strip()[:80]))
    return tuple(dict.fromkeys(models))


def parse(raw: dict[str, Any]) -> EnvProvider:
    """One provider from its `AI_PROVIDER_<n>_*` values, or ConfigError."""
    n = raw["index"]
    prefix = f"AI_PROVIDER_{n}_"
    url = raw.get("URL", "").strip().rstrip("/")
    try:
        transport.check_url(url, transport.operator_policy(), resolve_hosts=False)
    except transport.TransportError as exc:
        raise ConfigError(f"{prefix}URL: {exc.message}") from None
    if "?" in url or "#" in url:
        raise ConfigError(f"{prefix}URL may not have a query or fragment.")
    style_name = raw.get("STYLE", "").strip() or "doory"
    style = get_style(style_name)
    try:
        style_config = json.loads(raw.get("STYLE_CONFIG") or "{}")
    except ValueError:
        raise ConfigError(f"{prefix}STYLE_CONFIG is not valid JSON.") from None
    try:
        config = style.config(style_config)
    except ConfigError as exc:
        raise ConfigError(f"{prefix}STYLE_CONFIG: {exc}") from None
    tasks = tuple(t.strip() for t in (raw.get("TASKS") or "background-removal").split(",") if t.strip())
    unknown = [t for t in tasks if t not in TASKS]
    if unknown or not tasks:
        raise ConfigError(f"{prefix}TASKS: unknown task {unknown[0] if unknown else '(none)'}.")
    try:
        style.check_tasks(tasks)
    except ConfigError as exc:
        raise ConfigError(f"{prefix}TASKS: {exc}") from None
    header = raw.get("AUTH_HEADER", "").strip()
    if header:
        try:
            check_header_name(header, f"{prefix}AUTH_HEADER")
        except ConfigError as exc:
            raise ConfigError(str(exc)) from None
    value = raw.get("AUTH_VALUE", "")
    if "\r" in value or "\n" in value:
        raise ConfigError(f"{prefix}AUTH_VALUE contains a line break.")
    return EnvProvider(
        id=f"env-{n}",
        index=n,
        name=(raw.get("LABEL") or "").strip()[:80] or f"Server {n}",
        base_url=url,
        style=style.name,
        style_config=style_config,
        config=config,
        tasks=tasks,
        models=parse_models(raw.get("MODELS", "")),
        auth_header=header,
        auth_value=value.strip(),
        sends_offsite=_bool(raw.get("SENDS_OFFSITE", ""), f"{prefix}SENDS_OFFSITE"),
        timeout_seconds=_int(
            raw.get("TIMEOUT_SECONDS", ""),
            f"{prefix}TIMEOUT_SECONDS",
            settings.AI_DEFAULT_TIMEOUT_SECONDS,
            low=1,
            high=MAX_TIMEOUT_SECONDS,
        ),
        max_image_bytes=_int(
            raw.get("MAX_IMAGE_BYTES", ""), f"{prefix}MAX_IMAGE_BYTES", 0, low=0, high=2**31
        ),
        daily_quota=_int(raw.get("DAILY_QUOTA", ""), f"{prefix}DAILY_QUOTA", 0, low=0, high=10**9),
    )


def load() -> tuple[list[EnvProvider], list[str]]:
    """(the valid providers, a message per invalid one)."""
    providers, errors = [], []
    for raw in getattr(settings, "AI_ENV_PROVIDERS", []):
        try:
            providers.append(parse(raw))
        except ConfigError as exc:
            errors.append(str(exc))
    return providers, errors


def env_providers() -> list[EnvProvider]:
    return load()[0]


def get(provider_id: str) -> EnvProvider | None:
    return next((p for p in env_providers() if p.id == provider_id), None)
