import re
from typing import Any

from django.conf import settings
from rest_framework import serializers

from . import secrets, transport
from .models import Provider, ProviderModel, Style
from .styles import ConfigError, get_style
from .styles.base import check_header_name
from .tasks import TASKS

MAX_SECRET_LENGTH = 4096
MAX_MODELS_PER_PROVIDER = 50
USER_PROVIDER_MAX_TIMEOUT = 60


class OptionSerializer(serializers.Serializer):
    id = serializers.CharField(help_text="`device`, or `<provider id>:<model name>`.")
    label = serializers.CharField()
    task = serializers.CharField()
    kind = serializers.ChoiceField(choices=["device", "server"])
    provider_name = serializers.CharField()
    owner = serializers.ChoiceField(choices=["device", "operator", "user"])
    sends_offsite = serializers.BooleanField(help_text="The image leaves this installation.")


class TaskOptionsSerializer(serializers.Serializer):
    default = serializers.CharField(allow_null=True)
    models = OptionSerializer(many=True)


class TaskRequestSerializer(serializers.Serializer):
    asset_id = serializers.UUIDField()
    model = serializers.CharField(max_length=300, help_text="An option id from GET /api/v1/ai/models/.")
    options = serializers.DictField(
        required=False,
        default=dict,
        help_text='Task options: {"scale": 2 or 4} for upscale, none for background-removal.',
    )


class SanitizedCharField(serializers.CharField):
    """CharField that strips ASCII/Unicode control characters, newlines, and null bytes before validation."""

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", data).strip()
        return super().to_internal_value(data)


class ProviderModelSerializer(serializers.ModelSerializer):
    remote_name = SanitizedCharField(required=False, allow_blank=True, max_length=200)
    label = SanitizedCharField(required=False, allow_blank=True, max_length=80)

    class Meta:
        model = ProviderModel
        fields = ["id", "task", "remote_name", "label", "enabled", "sort_order"]
        read_only_fields = ["id"]

    def validate_task(self, value: str) -> str:
        if value not in TASKS:
            raise serializers.ValidationError("Unknown task.")
        return value


class ProviderModelsSerializer(serializers.Serializer):
    models = ProviderModelSerializer(many=True)

    def validate_models(self, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if len(value) > MAX_MODELS_PER_PROVIDER:
            raise serializers.ValidationError(f"At most {MAX_MODELS_PER_PROVIDER} models.")
        keys = [(item["task"], item.get("remote_name", "")) for item in value]
        if len(keys) != len(set(keys)):
            raise serializers.ValidationError("Each model may be listed once per task.")
        return value


def validate_base_url(value: str, *, operator: bool) -> str:
    """The base URL's form, and for users that it does not name a private address (host names are checked
    after DNS on every call)."""
    value = value.strip()
    policy = transport.operator_policy() if operator else transport.user_policy()
    try:
        transport.check_url(value, policy, resolve_hosts=False)
    except transport.TransportError as exc:
        raise serializers.ValidationError(exc.message) from None
    if "?" in value or "#" in value:
        raise serializers.ValidationError("The server address may not have a query or fragment.")
    return value.rstrip("/")


class ProviderSerializer(serializers.ModelSerializer):
    """A user's own provider. The secret is write-only: it is never returned, only whether one is set."""

    name = SanitizedCharField(max_length=80)

    secret = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        max_length=MAX_SECRET_LENGTH,
        trim_whitespace=True,
        help_text="The value of the auth header (e.g. `Bearer …`). Omit to keep the stored one; "
        "empty to remove it. Changing the server's scheme, host or port while a secret is stored is refused "
        "unless a new one (or an empty one) is sent in the same request.",
    )
    has_secret = serializers.BooleanField(read_only=True)
    models = ProviderModelSerializer(many=True, read_only=True)
    style = serializers.ChoiceField(choices=Style.choices, default=Style.DOORY)
    tasks = serializers.ListField(
        child=serializers.ChoiceField(choices=[]), allow_empty=False, max_length=len(TASKS) or 1
    )

    class Meta:
        model = Provider
        fields = [
            "id",
            "name",
            "base_url",
            "style",
            "style_config",
            "auth_header",
            "secret",
            "has_secret",
            "tasks",
            "timeout_seconds",
            "max_image_bytes",
            "sends_offsite",
            "enabled",
            "sort_order",
            "models",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "has_secret", "models", "created_at", "updated_at"]
        extra_kwargs = {
            "timeout_seconds": {"min_value": 1, "max_value": USER_PROVIDER_MAX_TIMEOUT},
            "max_image_bytes": {"min_value": 0, "max_value": settings.AI_MAX_IMAGE_BYTES},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["tasks"].child.choices = list(TASKS)

    def validate_base_url(self, value: str) -> str:
        return validate_base_url(value, operator=False)

    def validate_max_image_bytes(self, value: int) -> int:
        if value > settings.AI_MAX_IMAGE_BYTES:
            raise serializers.ValidationError(
                f"max_image_bytes cannot exceed {settings.AI_MAX_IMAGE_BYTES} bytes."
            )
        return value

    def validate_auth_header(self, value: str) -> str:
        if not value:
            return value
        clean = value.strip()
        try:
            clean.encode("latin-1")
        except UnicodeEncodeError:
            raise serializers.ValidationError("The auth header must contain only Latin-1 characters.")
        try:
            return check_header_name(clean)
        except ConfigError as exc:
            raise serializers.ValidationError(str(exc)) from None

    def validate_secret(self, value: str) -> str:
        if "\r" in value or "\n" in value:
            raise serializers.ValidationError("The secret may not contain line breaks.")
        try:
            value.encode("latin-1")
        except UnicodeEncodeError:
            raise serializers.ValidationError("The secret must contain only Latin-1 characters.")
        if value and not secrets.can_encrypt():
            raise serializers.ValidationError(
                "Secrets cannot be stored: the server's secrets key is invalid."
            )
        return value

    def validate_tasks(self, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        style = attrs.get("style", getattr(self.instance, "style", Style.DOORY))
        style_config = attrs.get("style_config", getattr(self.instance, "style_config", {}))
        try:
            get_style(style).config(style_config)
        except ConfigError as exc:
            raise serializers.ValidationError({"style_config": [str(exc)]}) from None
        new_url = attrs.get("base_url")
        if (
            self.instance is not None
            and self.instance.has_secret
            and "secret" not in attrs
            and new_url
            and not self.instance.keeps_secret_for(new_url)
        ):
            # The stored key was entered for the old server: never send it to another one, and never drop it
            # silently either.
            raise serializers.ValidationError(
                {"secret": ["Enter the key again when changing the server address."]}
            )
        return attrs

    def save(self, **kwargs) -> Provider:
        secret = self.validated_data.pop("secret", None)
        provider = self.instance or Provider(**kwargs)
        new_url = self.validated_data.get("base_url")
        if secret is None and provider.pk and new_url and not provider.keeps_secret_for(new_url):
            secret = ""  # defence in depth: `validate` already refuses this
        for field, value in self.validated_data.items():
            setattr(provider, field, value)
        if secret is not None:
            provider.set_secret(secret)
        provider.save()
        self.instance = provider
        return provider


class ProviderTestRequestSerializer(serializers.Serializer):
    task = serializers.CharField(required=False, help_text="Default: the provider's first task.")
    model = serializers.CharField(
        required=False, allow_blank=True, max_length=200, help_text="Default: the first enabled model."
    )


class ProviderTestResultSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    duration_ms = serializers.IntegerField()
    task = serializers.CharField()
    model = serializers.CharField()
    preview = serializers.CharField(
        help_text="data: URL of the result (PNG, at most 256 px), when it worked."
    )
    error = serializers.DictField(allow_null=True, child=serializers.CharField())
