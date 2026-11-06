"""Providers (remote servers Doory can call), the models they offer per task, and the log of every call.

A provider without an owner is an operator provider (admin); one with an owner is that user's own server.
Operator providers can also come from `.env` (`apps.ai.env`); those are never stored here.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import BaseModel

from . import secrets

MAX_TIMEOUT_SECONDS = 300


class Style(models.TextChoices):
    DOORY = "doory", "Doory-compatible"
    MULTIPART = "multipart", "Multipart → image"
    JSON = "json", "JSON → base64"
    MASK = "mask", "Mask"
    CUSTOM = "custom", "Custom"
    QUEUE = "queue", "Queue"


class Audience(models.TextChoices):
    EVERYONE = "everyone", "Every signed-in user"
    STAFF = "staff", "Staff only"
    USERS = "users", "Selected users"


def origin(url: str) -> tuple[str, str, int | None]:
    """Scheme, host and port of `url` (the port filled in for http and https)."""
    parts = urlsplit(url.strip())
    scheme = parts.scheme.lower()
    try:
        port = parts.port
    except ValueError:
        port = None
    return scheme, (parts.hostname or "").rstrip("."), port or {"http": 80, "https": 443}.get(scheme)


class Provider(BaseModel):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_providers",
        help_text="Empty for an operator provider; set for a user's own server.",
    )
    name = models.CharField(max_length=80)
    # Not a URLField: a model server next to Doory often has a single-label host name (http://model-server:7000).
    base_url = models.CharField(max_length=500, help_text="The server's address, e.g. https://ai.example.com")
    style = models.CharField(max_length=16, choices=Style.choices, default=Style.DOORY)
    style_config = models.JSONField(default=dict, blank=True)
    auth_header = models.CharField(
        max_length=64, blank=True, help_text="e.g. Authorization or X-Api-Key; empty: no authentication."
    )
    secret_encrypted = models.BinaryField(default=b"", blank=True, editable=False)
    tasks = models.JSONField(default=list, blank=True)
    timeout_seconds = models.PositiveSmallIntegerField(
        default=60, validators=[MinValueValidator(1), MaxValueValidator(MAX_TIMEOUT_SECONDS)]
    )
    max_image_bytes = models.PositiveIntegerField(
        default=0,
        help_text="Largest source image sent to this server; 0: the server-wide limit.",
    )
    sends_offsite = models.BooleanField(
        default=False, help_text="Images leave this installation (shown as a privacy notice in the editor)."
    )
    enabled = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    # Operator providers only.
    audience = models.CharField(max_length=16, choices=Audience.choices, default=Audience.EVERYONE)
    allowed_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="ai_providers_allowed"
    )
    daily_quota = models.PositiveIntegerField(default=0, help_text="Calls per user per day; 0: unlimited.")

    class Meta:
        ordering = ["sort_order", "name"]
        indexes = [models.Index(fields=["owner", "sort_order"])]

    def __str__(self):
        return self.name

    @property
    def is_operator(self) -> bool:
        return self.owner_id is None

    @property
    def has_secret(self) -> bool:
        return bool(self.secret_encrypted)

    def set_secret(self, value: str) -> None:
        """Store `value` encrypted; an empty value removes the secret."""
        self.secret_encrypted = secrets.encrypt(value) if value else b""

    def keeps_secret_for(self, new_base_url: str) -> bool:
        """Whether the stored secret may stay when the address becomes `new_base_url`: only when the scheme,
        host and port are unchanged, so a saved key is never sent to a server it was not entered for."""
        return origin(self.base_url) == origin(new_base_url)

    def secret(self) -> str:
        return secrets.decrypt(bytes(self.secret_encrypted)) if self.secret_encrypted else ""


class ProviderModel(BaseModel):
    """One option a provider offers for a task. `remote_name` is what is sent as the model (may be empty:
    the server's default)."""

    provider = models.ForeignKey(Provider, on_delete=models.CASCADE, related_name="models")
    task = models.CharField(max_length=64)
    remote_name = models.CharField(max_length=200, blank=True)
    label = models.CharField(max_length=80, blank=True, help_text="Shown to users, e.g. Fast or Best.")
    enabled = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "label", "remote_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "task", "remote_name"], name="ai_unique_provider_model"
            )
        ]

    def __str__(self):
        return self.label or self.remote_name or "Default"


class AICall(BaseModel):
    """One call to a provider, for quotas and troubleshooting. Never holds image data or secrets."""

    class Status(models.TextChoices):
        OK = "ok", "OK"
        ERROR = "error", "Error"
        TIMEOUT = "timeout", "Timeout"
        REFUSED = "refused", "Refused"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_calls")
    provider = models.ForeignKey(Provider, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    #: The provider's id as the catalogue knows it: a UUID, or `env-1` … for providers from `.env`.
    provider_ref = models.CharField(max_length=64)
    provider_name = models.CharField(max_length=80, blank=True)
    model = models.CharField(max_length=200, blank=True)
    task = models.CharField(max_length=64)
    status = models.CharField(max_length=8, choices=Status.choices)
    error_code = models.CharField(max_length=32, blank=True)
    duration_ms = models.PositiveIntegerField(default=0)
    bytes_in = models.PositiveBigIntegerField(default=0, help_text="Bytes sent to the provider.")
    bytes_out = models.PositiveBigIntegerField(default=0, help_text="Bytes received from the provider.")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "AI call"
        indexes = [models.Index(fields=["user", "provider_ref", "created_at"])]

    def __str__(self):
        return f"{self.task} via {self.provider_name or self.provider_ref} ({self.status})"


class UserProvider(Provider):
    """Users' own providers, listed separately in the admin for support (read only)."""

    class Meta:
        proxy = True
        verbose_name = "user provider"
