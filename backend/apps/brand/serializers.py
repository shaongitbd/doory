from django.db.models import Prefetch
from rest_framework import serializers

from apps.assets.models import Asset
from apps.assets.serializers import AssetSerializer
from apps.assets.uploads import strip_unsafe_chars

from .models import BrandKit

MAX_COLORS = 100
MAX_LOGOS = 20
MAX_KITS_PER_USER = 20
FONT_ROLES = ("heading", "subheading", "body")
HEX_COLOR = r"\A#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\Z"


def clean_label(value: str) -> str:
    return " ".join(strip_unsafe_chars(value).split())


class BrandColorSerializer(serializers.Serializer):
    id = serializers.RegexField(r"\A[A-Za-z0-9_-]+\Z", max_length=64, trim_whitespace=False)
    name = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    hex = serializers.RegexField(
        HEX_COLOR, max_length=7, trim_whitespace=False, error_messages={"invalid": "Use #rgb or #rrggbb."}
    )

    def validate_name(self, value: str) -> str:
        return clean_label(value)

    def validate_hex(self, value: str) -> str:
        return value.lower()


class BrandFontSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=FONT_ROLES)
    family = serializers.CharField(max_length=100)

    def validate_family(self, value: str) -> str:
        family = clean_label(value)
        if not family:
            raise serializers.ValidationError("The font family cannot be empty.")
        return family


def with_logos(queryset):
    return queryset.prefetch_related(Prefetch("logos", queryset=Asset.objects.order_by("created_at", "pk")))


class BrandKitSerializer(serializers.ModelSerializer):
    colors = BrandColorSerializer(many=True, max_length=MAX_COLORS, required=False)
    fonts = BrandFontSerializer(many=True, max_length=len(FONT_ROLES), required=False)
    logos = AssetSerializer(many=True, read_only=True)
    logo_ids = serializers.ListField(
        child=serializers.UUIDField(), max_length=MAX_LOGOS, write_only=True, required=False
    )

    class Meta:
        model = BrandKit
        fields = (
            "id",
            "name",
            "is_default",
            "colors",
            "fonts",
            "logos",
            "logo_ids",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "logos", "created_at", "updated_at")

    def validate_name(self, value: str) -> str:
        name = clean_label(value)
        if not name:
            raise serializers.ValidationError("The name cannot be empty.")
        return name

    def validate_colors(self, value: list[dict]) -> list[dict]:
        ids = [color["id"] for color in value]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Colour ids must be unique within a brand kit.")
        return [dict(color) for color in value]

    def validate_fonts(self, value: list[dict]) -> list[dict]:
        roles = [font["role"] for font in value]
        if len(roles) != len(set(roles)):
            raise serializers.ValidationError("Each font role can only be used once.")
        return [dict(font) for font in value]

    def validate_logo_ids(self, value: list) -> list:
        unique = list(dict.fromkeys(value))
        owned = set(
            Asset.objects.filter(owner=self.context["request"].user, pk__in=unique)
            .filter(kind__in=Asset.PICTURE_KINDS)
            .values_list("pk", flat=True)
        )
        if owned != set(unique):
            raise serializers.ValidationError("Every logo must be one of your own assets.")
        return unique
