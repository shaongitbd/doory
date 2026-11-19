import json
import math

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .filenames import FILE_NAMES, STYLES
from .layout import MAX_BLEED_MM
from .services import DOCUMENT_FORMATS, MAX_LOOPS, PAGE_SECONDS, QUALITY_PRESETS, VIDEO_FORMATS

MAX_PAGES = 100
MAX_PAGE_BYTES = 5 * 1024 * 1024
MAX_TOTAL_BYTES = 40 * 1024 * 1024
MAX_DIMENSION_PX = 20_000
MAX_FONT_SPECS = 32
MAX_TITLE_LENGTH = 200
MAX_SIZES_BYTES = 16 * 1024
FONT_FAMILY_PATTERN = r"^[\w .\-]{1,100}$"
LANGUAGE_PATTERN = r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$"
SIZE_PATTERN = r"^\d+(?:\.\d+)?[xXwWhH]$"


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
    layout = serializers.ChoiceField(choices=["normal", "booklet", "book"], required=False, default="normal")
    signature_pages = serializers.IntegerField(min_value=4, max_value=32, required=False, default=4)
    binding = serializers.ChoiceField(choices=["left", "right"], required=False, default="left")
    print_sides = serializers.ChoiceField(choices=["both", "front", "back"], required=False, default="both")
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


@extend_schema_field(
    {
        "oneOf": [
            {"type": "integer", "minimum": 1, "maximum": 100},
            {"type": "string", "enum": list(QUALITY_PRESETS)},
        ]
    }
)
class QualityField(serializers.Field):
    """1 to 100, or a preset name (small, balanced, best, original)."""

    default_error_messages = {
        "invalid": "Give a whole number from 1 to 100, or one of " + ", ".join(QUALITY_PRESETS) + "."
    }

    def to_internal_value(self, data):
        if isinstance(data, str) and data.strip().lower() in QUALITY_PRESETS:
            return data.strip().lower()
        if isinstance(data, bool) or not isinstance(data, int | str):
            self.fail("invalid")
        try:
            value = int(data)
        except ValueError:
            self.fail("invalid")
        if not 1 <= value <= 100:
            self.fail("invalid")
        return value

    def to_representation(self, value):
        return value


@extend_schema_field(
    {"oneOf": [{"type": "string", "enum": ["full"]}, {"type": "integer", "minimum": 2, "maximum": 256}]}
)
class PngColorsField(serializers.Field):
    """`full` (None) or a palette of 2 to 256 colours."""

    default_error_messages = {"invalid": 'Give "full" or a whole number of colours from 2 to 256.'}

    def to_internal_value(self, data):
        if data == "full":
            return None
        if isinstance(data, str) and data.isdigit():  # a multipart form field
            data = int(data)
        if isinstance(data, bool) or not isinstance(data, int) or not 2 <= data <= 256:
            self.fail("invalid")
        return data

    def to_representation(self, value):
        return "full" if value is None else value


@extend_schema_field(
    {
        "oneOf": [
            {"type": "string", "enum": ["all"]},
            {
                "type": "array",
                "items": {"oneOf": [{"type": "integer", "minimum": 1}, {"type": "string"}]},
                "minItems": 1,
                "maxItems": MAX_PAGES,
            },
        ]
    }
)
class PagesField(serializers.Field):
    """`all`, or a list of pages by id or by number counting from 1."""

    default_error_messages = {"invalid": 'Give "all" or a list of page ids and page numbers counting from 1.'}

    def to_internal_value(self, data):
        if data == "all":
            return data
        if not isinstance(data, list) or not 0 < len(data) <= MAX_PAGES:
            self.fail("invalid")
        page = PageRefField()
        return [page.to_internal_value(item) for item in data]

    def to_representation(self, value):
        return value


@extend_schema_field(
    {"oneOf": [{"type": "boolean"}, {"type": "string", "enum": ["builtin", "tinypng", "kraken", "custom"]}]}
)
class OptimizeField(serializers.Field):
    """false, true (the server's default optimizer) or an optimizer's id; GET /api/v1/config/ lists those
    offered (`features.image_optimize`)."""

    default_error_messages = {"invalid": "Give true, false or the id of an image optimizer."}

    def to_internal_value(self, data):
        if isinstance(data, bool):
            return data
        if isinstance(data, str) and 0 < len(data.strip()) <= 40:
            text = data.strip().lower()
            return {"true": True, "false": False}.get(text, text)
        self.fail("invalid")

    def to_representation(self, value):
        return value


@extend_schema_field(
    {
        "oneOf": [
            {"type": "string", "enum": ["design"]},
            {"type": "integer", "enum": [240, 360, 480, 720, 1080, 2160]},
        ]
    }
)
class ResolutionField(serializers.Field):
    """Video: `design` (the first page's size) or the shorter side of the frame in px."""

    default_error_messages = {
        "invalid": 'Give "design" or the shorter side of the frame in px (720, 1080 ...).'
    }

    def to_internal_value(self, data):
        if data == "design":
            return data
        if isinstance(data, str) and data.isdigit():  # a form field
            data = int(data)
        if isinstance(data, bool) or not isinstance(data, int):
            self.fail("invalid")
        return data

    def to_representation(self, value):
        return value


class ImageExportSerializer(serializers.Serializer):
    page = PageRefField(required=False, default=None, allow_null=True)
    pages = PagesField(required=False, default=None, allow_null=True)
    format = serializers.ChoiceField(
        choices=["png", "jpg", "jpeg", "webp", "avif", "auto", *DOCUMENT_FORMATS, *VIDEO_FORMATS],
        default="png",
    )
    quality = QualityField(default=90)
    max_bytes = serializers.IntegerField(min_value=1, required=False, default=None, allow_null=True)
    scale = FiniteFloatField(min_value=0.1, max_value=4, default=1)
    size = serializers.RegexField(SIZE_PATTERN, max_length=20, required=False, default=None, allow_null=True)
    transparent = serializers.BooleanField(default=False)
    png_colors = PngColorsField(default=None, allow_null=True)
    strip_metadata = serializers.BooleanField(default=True)
    srgb = serializers.BooleanField(default=True)
    progressive = serializers.BooleanField(default=False)
    file_names = serializers.ChoiceField(choices=list(FILE_NAMES), required=False)
    filename_style = serializers.ChoiceField(choices=list(STYLES), required=False)
    filename_timestamp = serializers.BooleanField(required=False)
    optimize = OptimizeField(default=False)
    bleed_mm = FiniteFloatField(min_value=0, max_value=MAX_BLEED_MM, default=0)
    crop_marks = serializers.BooleanField(default=False)
    layout = serializers.ChoiceField(choices=["normal", "booklet", "book"], default="normal")
    signature_pages = serializers.IntegerField(min_value=4, max_value=32, default=4)
    binding = serializers.ChoiceField(choices=["left", "right"], default="left")
    print_sides = serializers.ChoiceField(choices=["both", "front", "back"], default="both")
    cmyk = serializers.BooleanField(default=False)
    # Video (mp4, webm, gif); `pages` defaults to all of them.
    resolution = ResolutionField(required=False, default=None, allow_null=True)
    fps = serializers.IntegerField(min_value=1, max_value=60, required=False, default=None, allow_null=True)
    fit = serializers.ChoiceField(choices=["fit", "fill"], default="fit")
    sound = serializers.BooleanField(default=True)
    loop = serializers.IntegerField(min_value=0, max_value=MAX_LOOPS, default=0)
    dither = serializers.BooleanField(default=True)
    page_seconds = FiniteFloatField(
        min_value=PAGE_SECONDS[0], max_value=PAGE_SECONDS[1], required=False, default=None, allow_null=True
    )


class ImageOptimizeSerializer(serializers.Serializer):
    """The fields of `POST /api/v1/exports/optimize/` next to the `file` (a PNG)."""

    format = serializers.ChoiceField(choices=["png", "jpg", "jpeg", "webp", "avif", "auto"], default="png")
    quality = QualityField(default=90)
    max_bytes = serializers.IntegerField(min_value=1, required=False, default=None, allow_null=True)
    transparent = serializers.BooleanField(default=False)
    png_colors = PngColorsField(default=None, allow_null=True)
    strip_metadata = serializers.BooleanField(default=True)
    srgb = serializers.BooleanField(default=True)
    progressive = serializers.BooleanField(default=False)
    optimize = OptimizeField(default=True)


class ImageOptimizeDocumentation(ImageOptimizeSerializer):
    """OpenAPI description of the multipart body."""

    file = serializers.FileField(help_text="The image the browser drew, as a PNG.")
