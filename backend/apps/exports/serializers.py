import json
import math

from rest_framework import serializers

MAX_PAGES = 100
MAX_PAGE_BYTES = 5 * 1024 * 1024
MAX_TOTAL_BYTES = 40 * 1024 * 1024
MAX_DIMENSION_PX = 20_000
MAX_BLEED_MM = 10
MAX_FONT_SPECS = 32
MAX_TITLE_LENGTH = 200
MAX_SIZES_BYTES = 16 * 1024
FONT_FAMILY_PATTERN = r"^[\w .\-]{1,100}$"
LANGUAGE_PATTERN = r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$"


class FiniteFloatField(serializers.FloatField):
    """`FloatField` that also rejects NaN (which slips through min/max validators)."""

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if not math.isfinite(value):
            self.fail("invalid")
        return value


class FontSpecSerializer(serializers.Serializer):
    family = serializers.RegexField(FONT_FAMILY_PATTERN)
    url = serializers.CharField(max_length=500)
    weight = serializers.IntegerField(min_value=1, max_value=1000, required=False, default=400)
    style = serializers.ChoiceField(choices=["normal", "italic"], required=False, default="normal")


class PageSizeSerializer(serializers.Serializer):
    width = FiniteFloatField(min_value=1, max_value=MAX_DIMENSION_PX)
    height = FiniteFloatField(min_value=1, max_value=MAX_DIMENSION_PX)


class PdfExportSerializer(serializers.Serializer):
    """Scalar fields of the multipart request; the `pages` files are checked by `validate_page_files`.

    The view passes `context={"page_count": n}` so `sizes` can be checked against the uploaded pages.
    """

    width = FiniteFloatField(min_value=1, max_value=MAX_DIMENSION_PX)
    height = FiniteFloatField(min_value=1, max_value=MAX_DIMENSION_PX)
    sizes = serializers.CharField(max_length=MAX_SIZES_BYTES, required=False, allow_blank=True, default=None)
    bleed_mm = FiniteFloatField(min_value=0, max_value=MAX_BLEED_MM, required=False, default=0)
    crop_marks = serializers.BooleanField(required=False, default=False)
    title = serializers.CharField(max_length=MAX_TITLE_LENGTH, required=False, allow_blank=True, default="")
    lang = serializers.RegexField(LANGUAGE_PATTERN, required=False, default="en")
    fonts = serializers.CharField(max_length=64 * 1024, required=False, allow_blank=True, default="")

    def validate_sizes(self, value: str | None) -> list[tuple[float, float]] | None:
        """One `(width, height)` per page; None when absent (every page then uses `width` x `height`)."""
        if value is None or not value.strip():
            return None
        try:
            parsed = json.loads(value)
        except (ValueError, RecursionError):
            raise serializers.ValidationError("sizes must be a JSON array.")
        if not isinstance(parsed, list):
            raise serializers.ValidationError("sizes must be a JSON array.")
        expected = self.context.get("page_count")
        if expected is not None and len(parsed) != expected:
            raise serializers.ValidationError(
                f"sizes must list exactly one size per page ({expected}), got {len(parsed)}."
            )
        entries = PageSizeSerializer(data=parsed, many=True)
        entries.is_valid(raise_exception=True)
        return [(entry["width"], entry["height"]) for entry in entries.validated_data]

    def validate_fonts(self, value: str) -> list[dict]:
        if not value.strip():
            return []
        try:
            parsed = json.loads(value)
        except (ValueError, RecursionError):
            raise serializers.ValidationError("fonts must be a JSON array.")
        if not isinstance(parsed, list) or len(parsed) > MAX_FONT_SPECS:
            raise serializers.ValidationError(
                f"fonts must be a JSON array of at most {MAX_FONT_SPECS} entries."
            )
        specs = FontSpecSerializer(data=parsed, many=True)
        specs.is_valid(raise_exception=True)
        return [dict(spec) for spec in specs.validated_data]


class PdfExportDocumentation(PdfExportSerializer):
    """OpenAPI description of the multipart body."""

    pages = serializers.ListField(child=serializers.FileField(), min_length=1, max_length=MAX_PAGES)


def validate_page_files(files: list) -> None:
    """Count and size limits for the uploaded SVG pages (content is judged later by the sanitiser)."""
    if not files:
        raise serializers.ValidationError({"pages": ["Upload at least one SVG page."]})
    if len(files) > MAX_PAGES:
        raise serializers.ValidationError({"pages": [f"At most {MAX_PAGES} pages can be exported at once."]})
    if any(file.size == 0 for file in files):
        raise serializers.ValidationError({"pages": ["A page file is empty."]})
    if any(file.size > MAX_PAGE_BYTES for file in files):
        raise serializers.ValidationError(
            {"pages": [f"Each page must be at most {MAX_PAGE_BYTES // (1024 * 1024)} MB."]}
        )
    if sum(file.size for file in files) > MAX_TOTAL_BYTES:
        raise serializers.ValidationError(
            {"pages": [f"The pages must total at most {MAX_TOTAL_BYTES // (1024 * 1024)} MB."]}
        )


class PageRefField(serializers.Field):
    """A page by its id or by its number counting from 1 (as the MCP tools name pages)."""

    default_error_messages = {"invalid": "Give a page id or a page number counting from 1."}

    def to_internal_value(self, data):
        if isinstance(data, bool):
            self.fail("invalid")
        if isinstance(data, int):
            if data < 1:
                self.fail("invalid")
            return data
        if isinstance(data, str) and 0 < len(data.strip()) <= 100:
            return data.strip()
        self.fail("invalid")

    def to_representation(self, value):
        return value


class ImageExportSerializer(serializers.Serializer):
    page = PageRefField(required=False, default=None, allow_null=True)
    format = serializers.ChoiceField(choices=["png", "jpg", "jpeg", "webp"], default="png")
    quality = serializers.IntegerField(min_value=1, max_value=100, default=90)
    scale = FiniteFloatField(min_value=0.1, max_value=4, default=1)
    transparent = serializers.BooleanField(default=False)
