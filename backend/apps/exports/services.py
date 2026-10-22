"""The export pipelines.

* PDF: sanitise every page SVG the browser sent, build one HTML document, print it.
* Image: draw pages of a saved design on the server with the editor's own engine (the frontend's headless
  render page), one at a time, then convert each PNG to the requested format; several pages go into a ZIP.
* SVG and PDF of a saved design: the render page makes all pages at once (SVG files, the print server's SVG
  pages, or pictures of the pages); PDF pages then go through the PDF pipeline above, as the editor's do.
* Video of a saved design: the render page makes the MP4, WebM or GIF with the editor's video pipeline.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import math
import re
import zipfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Any

from django.conf import settings
from django.db.models.functions import Lower
from PIL import Image, UnidentifiedImageError, features

from apps.core.svg import SvgError, sanitize_svg
from apps.designs.edits import current_document
from apps.fonts.models import FontFamily
from apps.fonts.serializers import FontFamilySerializer, with_variants
from apps.fonts.usage import font_names_in_document, uploaded_fonts_used_by

from . import optimizers
from .exceptions import (
    ExportDisabled,
    ExportFailed,
    ExportUnavailable,
    ImageExportDisabled,
    InvalidExport,
    PayloadTooLarge,
    VideoExportDisabled,
)
from .filenames import document_filename, export_filename, page_filename, unique_names
from .fonts import load_fonts
from .layout import MAX_BLEED_MM, PX_PER_MM, PageGeometry, build_document_html, prepare_page_svg
from .layout import fmt as svg_number
from .pdfmeta import finalize_pdf
from .renderer import (
    RenderedPage,
    RenderResult,
    allowed_origins,
    render_image,
    render_pages,
    render_pdf,
    render_slot,
    render_video,
)

logger = logging.getLogger("doory.exports")


@dataclass(frozen=True)
class ExportRequest:
    pages: Sequence[bytes]
    width: float
    height: float
    sizes: Sequence[tuple[float, float]] | None = None  # trim size per page; None: `width` x `height`
    bleed_mm: float = 0.0
    crop_marks: bool = False
    title: str = ""
    lang: str = "en"
    fonts: Sequence[dict] = ()
    owner: object = None  # the account asking; it may have one render at a time

    def page_sizes(self) -> list[tuple[float, float]]:
        """The trim size of every page, in px."""
        if self.sizes is None:
            return [(self.width, self.height)] * len(self.pages)
        return list(self.sizes)


def sanitize_pages(pages: Sequence[bytes]) -> list[bytes]:
    """Every page goes through the shared SVG sanitiser; one unusable page rejects the whole request."""
    clean: list[bytes] = []
    for number, data in enumerate(pages, start=1):
        try:
            clean.append(sanitize_svg(data, allow_links=True))
        except SvgError:
            raise InvalidExport("invalid_svg", f"Page {number} is not a valid, safe SVG.")
    return clean


def export_pdf(request: ExportRequest) -> RenderResult:
    """Run the whole pipeline; the browser part holds one render slot (`ExportBusy` when none is free)."""
    sizes = request.page_sizes()
    if len(sizes) != len(request.pages):
        raise InvalidExport("invalid_sizes", "Give exactly one size per page.")
    geometries = [
        PageGeometry.create(width, height, request.bleed_mm, request.crop_marks) for width, height in sizes
    ]
    with render_slot(request.owner):
        sanitized = sanitize_pages(request.pages)
        result = _print(
            [prepare_page_svg(svg, geometry) for svg, geometry in zip(sanitized, geometries, strict=True)],
            geometries,
            title=request.title,
            lang=request.lang,
            fonts=request.fonts,
        )
    return _finished(result, geometries, title=request.title, lang=request.lang)


def _print(
    svgs: list[str], geometries: list[PageGeometry], *, title: str, lang: str, fonts: Sequence[dict]
) -> RenderResult:
    """Print pages already sized to their artwork box (`prepare_page_svg`) with the `fonts` embedded."""
    document = build_document_html(svgs, geometries, title, load_fonts(fonts, allowed_origins()), lang)
    return render_pdf(document, width_px=geometries[0].page_width, height_px=geometries[0].page_height)


def _finished(result: RenderResult, geometries: list[PageGeometry], *, title: str, lang: str) -> RenderResult:
    pdf = finalize_pdf(result.pdf, geometries, title=title, lang=lang)
    logger.info(
        "PDF export: %d page(s), %d byte(s), %d blocked request(s)",
        len(geometries),
        len(pdf),
        result.blocked_total,
    )
    return replace(result, data=pdf)


# ---- image export ------------------------------------------------------------------------------

IMAGE_FORMATS = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "avif": "image/avif"}
FORMAT_ALIASES = {"jpeg": "jpg"}
AUTO = "auto"  # every format this server makes; the smallest file wins
ZIP_MIME = "application/zip"
MIN_SCALE, MAX_SCALE = 0.1, 4.0
QUALITY_PRESETS = {"small": 65, "balanced": 82, "best": 95, "original": 100}
# AVIF is slow to encode: above this many pixels it uses speed 6 instead of 4 (much faster, a little bigger).
AVIF_FAST_PIXELS = 8_000_000
_SIZE = re.compile(r"^\s*(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>[xwh])\s*$", re.IGNORECASE)
_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
_PNG_METADATA = frozenset({b"tEXt", b"zTXt", b"iTXt", b"tIME", b"eXIf"})  # left out by `strip_metadata`
_PNG_PROFILE = frozenset({b"iCCP"})  # left out by `srgb`


@dataclass(frozen=True)
class ImageResult:
    data: bytes
    format: str  # png, jpg, webp or avif
    mime: str
    width: int
    height: int
    page_id: str
    page_index: int
    placeholders: int = 0
    missing_fonts: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    blocked_total: int = 0
    # What the download name is made of (`filenames.page_filename`): the page's own size, the design's page
    # count and its size preset.
    page_width: float = 0
    page_height: float = 0
    page_count: int = 1
    preset: str = ""
    bytes_before: int = 0  # the PNG as drawn, before it was converted
    # How the file was made: format, quality (after a `max_bytes` search), scale and the other options, and
    # for `auto` the size of every format it compared.
    options_used: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ImageBundle:
    """What `export_images` made: the file of one page, or a ZIP of several."""

    data: bytes
    format: str  # the image format, or "zip"
    mime: str
    filename: str
    images: tuple[ImageResult, ...]  # one per page, in order
    filenames: tuple[str, ...]  # the name of each page's file (inside the ZIP); a PDF's own name
    options: dict[str, Any] = field(default_factory=dict)  # SVG and PDF: how the file was made

    @property
    def placeholders(self) -> int:
        return sum(image.placeholders for image in self.images)

    @property
    def warnings(self) -> tuple[str, ...]:
        if len(self.images) == 1:
            return self.images[0].warnings
        return tuple(
            f"Page {image.page_index + 1}: {text}" for image in self.images for text in image.warnings
        )


@dataclass(frozen=True)
class Encoding:
    """How the drawn PNG becomes the file (`export_image`'s options, checked)."""

    format: str  # one of IMAGE_FORMATS, or AUTO
    quality: int = 90
    transparent: bool = False
    max_bytes: int | None = None
    png_colors: int | None = None
    strip_metadata: bool = True
    srgb: bool = True
    progressive: bool = False


@dataclass(frozen=True)
class Converted:
    data: bytes
    format: str
    options: dict[str, Any]
    warnings: tuple[str, ...] = ()


def image_formats() -> tuple[str, ...]:
    """The formats this server makes: AVIF needs a Pillow built with libavif."""
    return tuple(fmt for fmt in IMAGE_FORMATS if fmt != "avif" or features.check("avif"))


def avif_speed(width: int, height: int) -> int:
    return 6 if width * height > AVIF_FAST_PIXELS else 4


def parse_size(size: str, width: float, height: float) -> float:
    """The scale a `size` means for a page of `width` x `height`: "2x" (a scale), "1080w" (that many pixels
    wide) or "1350h" (that many pixels high)."""
    match = _SIZE.match(size) if isinstance(size, str) else None
    if match is None or (match["unit"].lower() != "x" and not float(match["value"]).is_integer()):
        raise InvalidExport("invalid_size", 'The size must look like "2x", "1080w" or "1350h".')
    value, unit = float(match["value"]), match["unit"].lower()
    scale = value if unit == "x" else value / (width if unit == "w" else height)
    if not MIN_SCALE <= scale <= MAX_SCALE:
        side = height if unit == "h" else width
        raise InvalidExport(
            "invalid_size",
            f"{size.strip()} is {scale:.2f}x this page; the size must be between {MIN_SCALE:g}x and "
            f"{MAX_SCALE:g}x ({round(side * MIN_SCALE)} to {round(side * MAX_SCALE)} px "
            f"{'high' if unit == 'h' else 'wide'}).",
        )
    return scale


def _quality(quality: int | str) -> int:
    if isinstance(quality, str) and quality.strip().lower() in QUALITY_PRESETS:
        return QUALITY_PRESETS[quality.strip().lower()]
    if isinstance(quality, bool) or not isinstance(quality, int) or not 1 <= quality <= 100:
        raise InvalidExport(
            "invalid_quality",
            "The quality must be a whole number from 1 to 100, or one of " + ", ".join(QUALITY_PRESETS) + ".",
        )
    return quality


def _whole(value, low: int, high: int | None = None) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, int)
        and value >= low
        and (high is None or value <= high)
    )


def _encoding(
    format: str,
    quality: int | str,
    *,
    transparent: bool,
    max_bytes: int | None,
    png_colors: int | None,
    strip_metadata: bool,
    srgb: bool,
    progressive: bool,
) -> Encoding:
    """The checked `Encoding` of an export's options; InvalidExport for one that is out of range."""
    fmt = FORMAT_ALIASES.get(str(format).lower(), str(format).lower())
    if fmt not in (*IMAGE_FORMATS, AUTO):
        raise InvalidExport("invalid_format", "The format must be png, jpg, webp, avif or auto.")
    if fmt != AUTO and fmt not in image_formats():
        raise InvalidExport("format_unavailable", f"This server can't make {fmt.upper()} images.")
    quality = _quality(quality)
    if max_bytes is not None and not _whole(max_bytes, 1):
        raise InvalidExport("invalid_max_bytes", "max_bytes must be a whole number of bytes, 1 or more.")
    if png_colors is not None and not _whole(png_colors, 2, 256):
        raise InvalidExport("invalid_png_colors", "png_colors must be a whole number from 2 to 256.")
    return Encoding(
        format=fmt,
        quality=quality,
        transparent=bool(transparent) and fmt != "jpg",
        max_bytes=max_bytes,
        png_colors=png_colors,
        strip_metadata=bool(strip_metadata),
        srgb=bool(srgb),
        progressive=bool(progressive),
    )


def page_index(page: int | str | None) -> int | str | None:
    """A page as the API and MCP name it (its id, or its number counting from 1) as `export_image` takes it
    (its id, or its 0-based index)."""
    if isinstance(page, int) and not isinstance(page, bool):
        if page < 1:
            raise InvalidExport("page_not_found", "Pages are numbered from 1.")
        return page - 1
    return page


def _pick_page(document: dict, page: int | str | None) -> tuple[dict, int]:
    pages = document.get("pages") if isinstance(document, dict) else None
    if not isinstance(pages, list) or not pages:
        raise InvalidExport("invalid_document", "The design has no pages.")
    if page is None:
        index = 0
    elif isinstance(page, int) and not isinstance(page, bool):
        index = page
    elif isinstance(page, str):
        index = next((i for i, p in enumerate(pages) if isinstance(p, dict) and p.get("id") == page), -1)
    else:
        index = -1
    if not 0 <= index < len(pages) or not isinstance(pages[index], dict):
        raise InvalidExport("page_not_found", f"The design has no page {page!r}.")
    return pages[index], index


def _preset_id(document: dict) -> str:
    meta = document.get("meta")
    preset = meta.get("presetId") if isinstance(meta, dict) else None
    return preset if isinstance(preset, str) else ""


def _page_size(document: dict, page: dict) -> tuple[float, float]:
    """`pageSize` of the editor: the page's own size, else the design's."""
    try:
        width = float(page.get("width") or document.get("width") or 0)
        height = float(page.get("height") or document.get("height") or 0)
    except (TypeError, ValueError):
        width = height = 0
    if not (width > 0 and height > 0):
        raise InvalidExport("invalid_document", "The page has no size.")
    return width, height


def font_manifest(page: dict | Sequence[dict], owner) -> list[dict[str, Any]]:
    """The font families `page` (or several pages) names, in the fonts API's shape: the owner's uploaded ones
    (which win, as in the editor) and the catalogue's."""
    single = {"pages": [page] if isinstance(page, dict) else list(page)}
    uploaded = uploaded_fonts_used_by(single, owner)
    taken = {family.family.casefold() for family in uploaded}
    wanted = [name.casefold() for name in font_names_in_document(single) if name.casefold() not in taken]
    catalogue = (
        list(
            FontFamily.objects.filter(owner__isnull=True, is_published=True)
            .annotate(folded=Lower("family"))
            .filter(folded__in=wanted)
            .prefetch_related(with_variants())
            .order_by("family", "id")
        )
        if wanted
        else []
    )
    return json.loads(json.dumps(FontFamilySerializer([*uploaded, *catalogue], many=True).data))


def _convert(png: bytes, encoding: Encoding) -> Converted:
    """PNG as drawn (or with fewer colours); JPG flattened on white (no alpha); WebP and AVIF with alpha only
    for a transparent export. `auto` makes every format that fits and keeps the smallest file."""
    image, info = None, {}
    if encoding.format != "png" or encoding.png_colors:  # a PNG as drawn is not decoded at all
        with Image.open(io.BytesIO(png)) as source:
            image, info = source.convert("RGBA"), dict(source.info)
        image.info = {}  # metadata goes in only on request (`_metadata`)
    if encoding.format != AUTO:
        return _convert_to(png, image, info, encoding)
    formats = [fmt for fmt in image_formats() if not (fmt == "jpg" and encoding.transparent)]
    tried = [_convert_to(png, image, info, replace(encoding, format=fmt)) for fmt in formats]
    best = min(tried, key=lambda converted: len(converted.data))
    return replace(best, options=best.options | {"compared": {c.format: len(c.data) for c in tried}})


def _convert_to(png: bytes, image: Image.Image | None, info: dict, encoding: Encoding) -> Converted:
    fmt = encoding.format
    if fmt == "png":
        return _to_png(png, image, info, encoding)
    if fmt == "jpg" or not encoding.transparent:
        flat = Image.new("RGBA", image.size, (255, 255, 255, 255))
        flat.alpha_composite(image)
        image = flat.convert("RGB")
    extra = _metadata(info, encoding)
    options: dict[str, Any] = {"format": fmt}
    if fmt == "jpg":
        options["progressive"] = encoding.progressive
        extra |= {"optimize": True, "progressive": encoding.progressive}
    elif fmt == "webp":
        extra["method"] = 4
    else:
        options["speed"] = extra["speed"] = avif_speed(*image.size)
    kind = {"jpg": "JPEG", "webp": "WEBP", "avif": "AVIF"}[fmt]

    def encode(quality: int) -> bytes:
        out = io.BytesIO()
        image.save(out, kind, quality=quality, **extra)
        return out.getvalue()

    data, quality = encode(encoding.quality), encoding.quality
    warnings: tuple[str, ...] = ()
    if encoding.max_bytes is not None and len(data) > encoding.max_bytes:
        data, quality = _fit(encode, encoding.quality, encoding.max_bytes, data)
        if len(data) > encoding.max_bytes:
            warnings = (
                f"Even at quality {quality} the {fmt.upper()} is {len(data)} bytes, more than max_bytes "
                f"({encoding.max_bytes}); use a smaller size.",
            )
    return Converted(data, fmt, options | {"quality": quality}, warnings)


def _fit(encode, quality: int, max_bytes: int, first: bytes) -> tuple[bytes, int]:
    """The highest quality below `quality` whose file is at most `max_bytes` (a binary search, at most seven
    encodes), else the smallest file tried."""
    fitting, smallest = None, (first, quality)
    low, high = 1, quality - 1
    while low <= high:
        middle = (low + high) // 2
        data = encode(middle)
        if len(data) <= max_bytes:
            fitting, low = (data, middle), middle + 1
        else:
            high = middle - 1
            if len(data) < len(smallest[0]):
                smallest = (data, middle)
    return fitting or smallest


def _optimized(
    converted: Converted,
    optimizer: optimizers.Optimizer | None,
    encoding: Encoding,
    *,
    source: bytes,
    width: int,
    height: int,
) -> Converted:
    """`converted` made smaller by `optimizer` (None: as it is). The options say which optimizer ran and how
    large the file was before; a `max_bytes` warning goes when the optimized file fits after all."""
    if optimizer is None:
        return converted
    result = optimizers.optimize(
        optimizer,
        optimizers.Job(
            converted.data,
            converted.format,
            width,
            height,
            quality=converted.options.get("quality"),
            strip_metadata=encoding.strip_metadata,
            srgb=encoding.srgb,
            progressive=encoding.progressive,
            source=source,
        ),
    )
    fits = encoding.max_bytes is not None and len(result.data) <= encoding.max_bytes
    return Converted(
        result.data,
        converted.format,
        converted.options
        | {
            "optimizer": result.optimizer or None,
            "optimized": result.optimized,
            "bytes_before_optimizing": result.bytes_before,
        },
        (() if fits else converted.warnings) + result.warnings,
    )


def _to_png(png: bytes, image: Image.Image | None, info: dict, encoding: Encoding) -> Converted:
    """The PNG as drawn, without the chunks `strip_metadata` and `srgb` leave out; with `png_colors`, a
    palette PNG instead when that is smaller (never bigger than the PNG as drawn)."""
    data = _strip_png(png, encoding)
    options: dict[str, Any] = {"format": "png", "png_colors": None}
    if encoding.png_colors:
        method = (
            Image.Quantize.LIBIMAGEQUANT
            if features.check_feature("libimagequant")
            else Image.Quantize.FASTOCTREE
        )
        source = image if encoding.transparent else image.convert("RGB")
        out = io.BytesIO()
        source.quantize(colors=encoding.png_colors, method=method).save(
            out, "PNG", optimize=True, **_metadata(info, encoding)
        )
        if len(out.getvalue()) < len(data):
            data, options["png_colors"] = out.getvalue(), encoding.png_colors
    warnings: tuple[str, ...] = ()
    if encoding.max_bytes is not None and len(data) > encoding.max_bytes:
        warnings = (
            f"The PNG is {len(data)} bytes, more than max_bytes ({encoding.max_bytes}); a PNG has no quality "
            "to lower. Use png_colors, a smaller size or another format.",
        )
    return Converted(data, "png", options, warnings)


def _metadata(info: dict, encoding: Encoding) -> dict[str, Any]:
    """What the drawn PNG carried and the export keeps: its colour profile without `srgb`, its Exif data
    without `strip_metadata`."""
    extra = {}
    if not encoding.srgb and info.get("icc_profile"):
        extra["icc_profile"] = info["icc_profile"]
    if not encoding.strip_metadata and info.get("exif"):
        extra["exif"] = info["exif"]
    return extra


def _strip_png(png: bytes, encoding: Encoding) -> bytes:
    """`png` without its text, time and Exif chunks (`strip_metadata`) and its ICC profile (`srgb`); the same
    bytes when it has none, or when it can't be read chunk by chunk."""
    drop = (_PNG_METADATA if encoding.strip_metadata else frozenset()) | (
        _PNG_PROFILE if encoding.srgb else frozenset()
    )
    if not drop or not png.startswith(_PNG_SIGNATURE):
        return png
    kept, at = [_PNG_SIGNATURE], len(_PNG_SIGNATURE)
    while at + 12 <= len(png):
        end = at + 12 + int.from_bytes(png[at : at + 4], "big")
        if png[at + 4 : at + 8] not in drop:
            kept.append(png[at:end])
        at = end
    return b"".join(kept) if at == len(png) else png


def _drawing_warnings(placeholders: int, missing_fonts: Sequence[str]) -> list[str]:
    warnings = []
    if placeholders:
        warnings.append(
            f"{placeholders} object(s) could not be loaded (usually a picture) and are drawn as grey boxes."
        )
    if missing_fonts:
        warnings.append("Drawn in a fallback font: " + ", ".join(missing_fonts) + ".")
    return warnings


def export_image(
    design,
    *,
    page: int | str | None = None,
    format: str = "png",
    quality: int | str = 90,
    scale: float = 1,
    transparent: bool = False,
    size: str | None = None,
    max_bytes: int | None = None,
    png_colors: int | None = None,
    strip_metadata: bool = True,
    srgb: bool = True,
    progressive: bool = False,
    optimize: bool | str = False,
) -> ImageResult:
    """Draw one page of `design` (its live editor state when it is open, else the saved document) as PNG, JPG,
    WebP or AVIF, or `auto`: the smallest of those. `page` is an index or a page id (default: the first page);
    `transparent` leaves the page background out (not for JPG).

    `size` ("2x", "1080w", "1350h") replaces `scale`. `quality` is 1-100 or a preset (small, balanced, best,
    original); with `max_bytes`, JPG, WebP and AVIF are made at the highest quality up to `quality` that fits.
    `png_colors` (2-256) makes a palette PNG when that is smaller. `strip_metadata` and `srgb` leave the drawn
    PNG's metadata and colour profile out; `progressive` is for JPG. `optimize` makes the file smaller
    afterwards: True (the server's default optimizer) or an optimizer's id (`apps.exports.optimizers`). Raises
    `InvalidExport`, `PayloadTooLarge` and the `Export*` exceptions."""
    if not settings.SERVER_IMAGE_EXPORT_ENABLED:
        raise ImageExportDisabled
    if not settings.EXPORT_RENDER_PAGE_URL:
        raise ExportUnavailable
    encoding = _encoding(
        format,
        quality,
        transparent=transparent,
        max_bytes=max_bytes,
        png_colors=png_colors,
        strip_metadata=strip_metadata,
        srgb=srgb,
        progressive=progressive,
    )
    optimizer = optimizers.choose(optimize)
    if size is None:
        try:
            scale = float(scale)
        except (TypeError, ValueError):
            scale = 0.0
        if not MIN_SCALE <= scale <= MAX_SCALE:
            raise InvalidExport(
                "invalid_scale", f"The scale must be between {MIN_SCALE:g} and {MAX_SCALE:g}."
            )
    transparent = encoding.transparent

    document = current_document(design)
    if len(json.dumps(document, separators=(",", ":"))) > settings.EXPORT_IMAGE_MAX_DOCUMENT_BYTES:
        raise PayloadTooLarge("The design is too large to export as an image on the server.")
    page_obj, index = _pick_page(document, page)
    width, height = _page_size(document, page_obj)
    if size is not None:
        scale = parse_size(size, width, height)
    if round(width * scale) * round(height * scale) > settings.EXPORT_IMAGE_MAX_PIXELS:
        raise InvalidExport(
            "too_large",
            f"{round(width * scale)} x {round(height * scale)} px is more than this server exports "
            f"({settings.EXPORT_IMAGE_MAX_PIXELS} pixels); use a smaller scale.",
        )
    payload = {
        "document": document,
        "page": index,
        "multiplier": scale,
        "transparent": transparent,
        "fonts": font_manifest(page_obj, design.owner),
    }
    with render_slot(design.owner_id):
        result = render_image(payload, render_url=settings.EXPORT_RENDER_PAGE_URL)
    try:
        converted = _convert(result.data, encoding)
    except (OSError, ValueError) as exc:
        logger.error("Image export: the render page sent an unreadable PNG (%s)", exc)
        raise ExportFailed from exc
    converted = _optimized(
        converted, optimizer, encoding, source=result.data, width=result.width, height=result.height
    )
    warnings = _drawing_warnings(result.placeholders, result.missing_fonts)
    warnings.extend(converted.warnings)
    data = converted.data
    logger.info(
        "Image export: design=%s page=%d %s %dx%d, %d byte(s) (drawn: %d), %d placeholder(s), "
        "%d blocked request(s)",
        design.pk,
        result.page_index,
        converted.format,
        result.width,
        result.height,
        len(data),
        len(result.data),
        result.placeholders,
        result.blocked_total,
    )
    return ImageResult(
        data=data,
        format=converted.format,
        mime=IMAGE_FORMATS[converted.format],
        width=result.width,
        height=result.height,
        page_id=result.page_id,
        page_index=result.page_index,
        placeholders=result.placeholders,
        missing_fonts=result.missing_fonts,
        warnings=tuple(warnings),
        blocked_total=result.blocked_total,
        page_width=width,
        page_height=height,
        page_count=len(document["pages"]),
        preset=_preset_id(document) or design.preset,
        bytes_before=len(result.data),
        options_used={
            **converted.options,
            "scale": scale,
            "transparent": transparent,
            "strip_metadata": encoding.strip_metadata,
            "srgb": encoding.srgb,
            **({"max_bytes": max_bytes} if max_bytes is not None else {}),
        },
    )


@dataclass(frozen=True)
class OptimizedImage:
    """What `optimize_image` made of a PNG the browser drew."""

    data: bytes
    format: str
    mime: str
    width: int
    height: int
    bytes_in: int  # the PNG that was sent
    bytes_before_optimizing: int  # the converted file, before the optimizer
    optimizer: str  # the optimizer asked ("" for none)
    optimized: bool  # whether its smaller file was kept
    warnings: tuple[str, ...] = ()
    options_used: dict[str, Any] = field(default_factory=dict)


def optimize_image(
    png: bytes,
    *,
    format: str = "png",
    quality: int | str = 90,
    transparent: bool = False,
    max_bytes: int | None = None,
    png_colors: int | None = None,
    strip_metadata: bool = True,
    srgb: bool = True,
    progressive: bool = False,
    optimize: bool | str = True,
    owner: object = None,
) -> OptimizedImage:
    """Convert a PNG the browser drew as `export_image` converts the PNG the server drew (same options), then
    optimize it. For browser downloads: AVIF, WebP where the browser can't make it, and the optimizers. The
    image must be a PNG of at most `EXPORT_IMAGE_MAX_PIXELS` (Pillow's decompression-bomb limit stays on);
    one conversion holds a render slot of `owner`. Raises `InvalidExport` and `ExportBusy`."""
    encoding = _encoding(
        format,
        quality,
        transparent=transparent,
        max_bytes=max_bytes,
        png_colors=png_colors,
        strip_metadata=strip_metadata,
        srgb=srgb,
        progressive=progressive,
    )
    optimizer = optimizers.choose(optimize)
    unreadable = InvalidExport("invalid_image", "The file is not a readable PNG image.")
    try:
        with Image.open(io.BytesIO(png)) as image:
            if image.format != "PNG":
                raise InvalidExport("invalid_image", "Send the image as a PNG.")
            width, height = image.size
            if width * height > settings.EXPORT_IMAGE_MAX_PIXELS:
                raise InvalidExport(
                    "too_large",
                    f"{width} x {height} px is more than this server converts "
                    f"({settings.EXPORT_IMAGE_MAX_PIXELS} pixels).",
                )
            image.load()  # a truncated or broken file fails here, not halfway through an optimizer
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError) as exc:
        raise unreadable from exc
    with render_slot(owner):
        try:
            converted = _convert(png, encoding)
        except (OSError, ValueError) as exc:
            raise unreadable from exc
        converted = _optimized(converted, optimizer, encoding, source=png, width=width, height=height)
    options = converted.options
    logger.info(
        "Image optimize: %s %dx%d, %d byte(s) in, %d out, optimizer=%s",
        converted.format,
        width,
        height,
        len(png),
        len(converted.data),
        options.get("optimizer"),
    )
    return OptimizedImage(
        data=converted.data,
        format=converted.format,
        mime=IMAGE_FORMATS[converted.format],
        width=width,
        height=height,
        bytes_in=len(png),
        bytes_before_optimizing=options.get("bytes_before_optimizing", len(converted.data)),
        optimizer=options.get("optimizer") or "",
        optimized=bool(options.get("optimized")),
        warnings=converted.warnings,
        options_used={
            **options,
            "transparent": encoding.transparent,
            "strip_metadata": encoding.strip_metadata,
            "srgb": encoding.srgb,
        },
    )


def pick_pages(design, pages: str | Sequence[int | str | None] | None) -> list[int]:
    """The 0-based indexes of `pages` in the design as it is now: "all", or indexes and page ids as
    `export_image` takes them (None: the first page). Repeats are dropped; more than `EXPORT_IMAGE_MAX_PAGES`
    pages are refused."""
    return _page_indexes(current_document(design), pages)


def _page_indexes(
    document: dict,
    pages: str | Sequence[int | str | None] | None,
    limit: int | None = None,
) -> list[int]:
    """See `pick_pages`; `limit` replaces `EXPORT_IMAGE_MAX_PAGES` (a video is bounded by its length)."""
    if pages is None:
        pages = [None]
    if isinstance(pages, str) and pages.strip().lower() == "all":
        _pick_page(document, None)  # refuses a design without pages
        indexes = list(range(len(document["pages"])))
    elif isinstance(pages, list | tuple) and pages:
        indexes = list(dict.fromkeys(_pick_page(document, page)[1] for page in pages))
    else:
        raise InvalidExport("invalid_pages", 'Give "all" or a list of pages.')
    limit = settings.EXPORT_IMAGE_MAX_PAGES if limit is None else limit
    if len(indexes) > limit:
        raise InvalidExport(
            "too_many_pages",
            f"This server exports at most {limit} pages at once, not {len(indexes)}.",
        )
    return indexes


def export_images(
    design,
    *,
    pages: str | Sequence[int | str | None] | None = None,
    filename_style: str | None = None,
    unix: int | None = None,
    charge: Callable[[int], None] | None = None,
    bleed_mm: float = 0,
    crop_marks: bool = False,
    cmyk: bool = False,
    **options: Any,
) -> ImageBundle:
    """Draw `pages` (see `pick_pages`) of `design` with `export_image` and its `options`, one render at a
    time, and pack them into a ZIP; a single page comes back as its own file. Before anything is drawn,
    `charge` is called with the number of pages after the first (to count them against a rate limit). The
    files are named by `filenames.page_filename` in `filename_style` (default `EXPORT_FILENAME_STYLE`), the
    ZIP after the design's title.

    The formats svg, pdf and pdf-print go to `export_document` with `bleed_mm` and `crop_marks` (which
    images leave out); the image options are not used for them. `cmyk` is refused for every format. The
    formats mp4, webm and gif go to `export_video` with its own options (`resolution`, `fps`, `fit`,
    `sound`, `loop`, `dither`, `page_seconds`; `quality` as a preset); the other image options are not used
    for them."""
    fmt = str(options.get("format", "png")).lower()
    bleed, marks = _print_options(bleed_mm, crop_marks, cmyk)
    video_options = {key: options.pop(key) for key in VIDEO_OPTIONS if key in options}
    if fmt in VIDEO_FORMATS:
        return export_video(
            design,
            format=fmt,
            pages=pages,
            quality=options.get("quality", "balanced"),
            filename_style=filename_style,
            unix=unix,
            charge=charge,
            **video_options,
        )
    if fmt in DOCUMENT_FORMATS:
        return export_document(
            design,
            format=fmt,
            pages=pages,
            bleed_mm=bleed,
            crop_marks=marks,
            filename_style=filename_style,
            unix=unix,
            charge=charge,
        )
    indexes = pick_pages(design, pages)
    if charge is not None and len(indexes) > 1:
        charge(len(indexes) - 1)
    style = filename_style or settings.EXPORT_FILENAME_STYLE
    images = tuple(export_image(design, page=index, **options) for index in indexes)
    return _bundle(design, images, style=style, unix=unix)


def _bundle(design, images: tuple[ImageResult, ...], *, style: str, unix: int | None) -> ImageBundle:
    """One page as its own file, several in a ZIP named after the design (no two files of the same name)."""
    names = unique_names([page_filename(design.title, image, style=style, unix=unix) for image in images])
    if len(images) == 1:
        return ImageBundle(images[0].data, images[0].format, images[0].mime, names[0], images, names)
    out = io.BytesIO()
    made = datetime.now().timetuple()[:6]
    with zipfile.ZipFile(out, "w") as archive:
        for name, image in zip(names, images, strict=True):
            entry = zipfile.ZipInfo(name, date_time=made)
            # PNG, JPG, WebP and AVIF are compressed already; SVG is text.
            entry.compress_type = zipfile.ZIP_DEFLATED if image.format == "svg" else zipfile.ZIP_STORED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, image.data)
    return ImageBundle(out.getvalue(), "zip", ZIP_MIME, export_filename(design.title, "zip"), images, names)


# ---- SVG and PDF of a saved design ---------------------------------------------------------------

SVG_MIME = "image/svg+xml"
PDF_MIME = "application/pdf"
# pdf: a picture of each page (the editor's PDF download); pdf-print: vector pages through the print server
# (the editor's print-quality PDF); svg: an SVG file per page (the editor's SVG download).
DOCUMENT_FORMATS = {"pdf": PDF_MIME, "pdf-print": PDF_MIME, "svg": SVG_MIME}
_PAGE_OUTPUT = {"svg": "svg", "pdf": "picture", "pdf-print": "print"}
PDF_DPI = 300  # the pictures of a `pdf`, as in the editor
PX_PER_INCH = 96
PDF_LANG = "en"


def _print_options(bleed_mm, crop_marks, cmyk) -> tuple[float, bool]:
    """The checked bleed and crop marks of a PDF; CMYK is refused (the print pipeline makes RGB files)."""
    if cmyk:
        raise InvalidExport(
            "cmyk_unavailable",
            "This server exports colours as RGB, as they look on screen; it has no CMYK conversion. Ask your "
            "printer whether they accept RGB files.",
        )
    try:
        bleed = float(bleed_mm or 0)
    except (TypeError, ValueError):
        bleed = -1.0
    if isinstance(bleed_mm, bool) or not (math.isfinite(bleed) and 0 <= bleed <= MAX_BLEED_MM):
        raise InvalidExport("invalid_bleed", f"bleed_mm must be between 0 and {MAX_BLEED_MM}.")
    return bleed, bool(crop_marks)


def _font_specs(files: Sequence[dict]) -> list[dict]:
    """The font files the render page listed for the print pages, as the print export takes them
    (`load_fonts` checks that each is a font in this server's media storage)."""
    specs = []
    for item in files:
        family, url, weight = item.get("family"), item.get("url"), item.get("weight")
        if not isinstance(family, str) or not isinstance(url, str) or not family.strip():
            continue
        specs.append(
            {
                "family": family[:100],
                "url": url,
                "weight": weight if _whole(weight, 1, 1000) else 400,
                "style": "italic" if item.get("style") == "italic" else "normal",
            }
        )
    return specs


def _picture_svg(page: RenderedPage, geometry: PageGeometry) -> str:
    """The artwork box of a page filled with its picture (a JPEG of the page and its bleed)."""
    try:
        with Image.open(io.BytesIO(page.data)) as image:
            if image.format != "JPEG":
                raise ExportFailed
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        logger.error("PDF export: the render page sent an unreadable picture (%s)", exc)
        raise ExportFailed from exc
    width, height = svg_number(geometry.art_width), svg_number(geometry.art_height)
    data = base64.b64encode(page.data).decode("ascii")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}"><image width="{width}" height="{height}" preserveAspectRatio="none" '
        f'href="data:image/jpeg;base64,{data}"/></svg>'
    )


def export_document(
    design,
    *,
    format: str,
    pages: str | Sequence[int | str | None] | None = None,
    bleed_mm: float = 0,
    crop_marks: bool = False,
    cmyk: bool = False,
    filename_style: str | None = None,
    unix: int | None = None,
    charge: Callable[[int], None] | None = None,
) -> ImageBundle:
    """`pages` (see `pick_pages`) of `design` as the editor's Download makes them: `svg` (one file per page,
    with its pictures and fonts inside; several in a ZIP), `pdf` (one PDF, a 300 dpi picture of each page) or
    `pdf-print` (one vector PDF through the print pipeline). PDFs take `bleed_mm` (0-10) and `crop_marks`;
    `cmyk` is refused. The render page makes every page in one browser, within `EXPORT_TIMEOUT_SECONDS` per
    page; a PDF is then printed within another. Both hold one render slot of the owner. `charge` is called
    with the number of pages after the first before anything is drawn. Raises `InvalidExport`,
    `PayloadTooLarge` and the `Export*` exceptions."""
    fmt_id = str(format).lower()
    if fmt_id not in DOCUMENT_FORMATS:
        raise InvalidExport("invalid_format", "The format must be " + ", ".join(DOCUMENT_FORMATS) + ".")
    bleed, marks = _print_options(bleed_mm, crop_marks, cmyk)
    if not settings.SERVER_IMAGE_EXPORT_ENABLED:
        raise ImageExportDisabled
    if fmt_id != "svg" and not settings.SERVER_PDF_ENABLED:
        raise ExportDisabled
    if not settings.EXPORT_RENDER_PAGE_URL:
        raise ExportUnavailable
    document = current_document(design)
    if len(json.dumps(document, separators=(",", ":"))) > settings.EXPORT_IMAGE_MAX_DOCUMENT_BYTES:
        raise PayloadTooLarge("The design is too large to export on the server.")
    indexes = _page_indexes(document, pages)
    chosen = [document["pages"][index] for index in indexes]
    sizes = [_page_size(document, page) for page in chosen]
    if charge is not None and len(indexes) > 1:
        charge(len(indexes) - 1)
    output = _PAGE_OUTPUT[fmt_id]
    payload: dict[str, Any] = {
        "document": document,
        "pages": indexes,
        "output": output,
        "fonts": font_manifest(chosen, design.owner),
    }
    if output != "svg":
        payload["bleed"] = bleed * PX_PER_MM
    if output == "picture":
        payload |= {"multiplier": PDF_DPI / PX_PER_INCH, "maxPixels": settings.EXPORT_IMAGE_MAX_PIXELS}
    geometries = [PageGeometry.create(width, height, bleed, marks) for width, height in sizes]
    with render_slot(design.owner_id):
        drawn = render_pages(
            payload,
            render_url=settings.EXPORT_RENDER_PAGE_URL,
            timeout=settings.EXPORT_TIMEOUT_SECONDS * len(indexes),
        )
        if [page.page_index for page in drawn.pages] != indexes:
            logger.error("Page export: the render page sent other pages than asked for")
            raise ExportFailed
        printed = None
        if output == "print":
            svgs = sanitize_pages([page.data for page in drawn.pages])
            printed = _print(
                [prepare_page_svg(svg, geometry) for svg, geometry in zip(svgs, geometries, strict=True)],
                geometries,
                title=design.title,
                lang=PDF_LANG,
                fonts=_font_specs(drawn.font_files),
            )
        elif output == "picture":
            printed = _print(
                [
                    _picture_svg(page, geometry)
                    for page, geometry in zip(drawn.pages, geometries, strict=True)
                ],
                geometries,
                title=design.title,
                lang=PDF_LANG,
                fonts=(),
            )
    preset = _preset_id(document) or design.preset
    images = []
    for page, geometry in zip(drawn.pages, geometries, strict=True):
        warnings = _drawing_warnings(page.placeholders, page.missing_fonts)
        options: dict[str, Any] = {"format": fmt_id}
        if output == "picture":
            options["dpi"] = round(page.pixel_width / geometry.art_width * PX_PER_INCH)
            if options["dpi"] < PDF_DPI - 1:
                warnings.append(
                    f"Drawn at {options['dpi']} dpi: at {PDF_DPI} dpi the page would have more than "
                    f"{settings.EXPORT_IMAGE_MAX_PIXELS} pixels."
                )
        data = page.data if output == "svg" else b""
        images.append(
            ImageResult(
                data=data,
                format="svg" if output == "svg" else "pdf",
                mime=DOCUMENT_FORMATS[fmt_id],
                width=round(page.width),
                height=round(page.height),
                page_id=page.page_id,
                page_index=page.page_index,
                placeholders=page.placeholders,
                missing_fonts=page.missing_fonts,
                warnings=tuple(warnings),
                blocked_total=drawn.blocked_total,
                page_width=page.width,
                page_height=page.height,
                page_count=len(document["pages"]),
                preset=preset,
                bytes_before=len(data),
                options_used=options,
            )
        )
    style = filename_style or settings.EXPORT_FILENAME_STYLE
    logger.info(
        "%s export: design=%s %d page(s), %d placeholder(s), %d blocked request(s)",
        fmt_id.upper(),
        design.pk,
        len(images),
        sum(image.placeholders for image in images),
        drawn.blocked_total,
    )
    if printed is None:
        return _bundle(design, tuple(images), style=style, unix=unix)
    result = _finished(printed, geometries, title=design.title, lang=PDF_LANG)
    name = document_filename(
        design.title,
        "pdf",
        images[0],
        style=style,
        unix=unix,
        suffix="print" if fmt_id == "pdf-print" else None,
    )
    options = {"format": fmt_id, "bleed_mm": bleed, "crop_marks": marks, "cmyk": False}
    if output == "picture":
        options["dpi"] = min(image.options_used["dpi"] for image in images)
    return ImageBundle(result.data, "pdf", PDF_MIME, name, tuple(images), (name,), options)


# ---- Video of a saved design ---------------------------------------------------------------------

VIDEO_FORMATS = {"mp4": "video/mp4", "webm": "video/webm", "gif": "image/gif"}
VIDEO_OPTIONS = ("resolution", "fps", "fit", "sound", "loop", "dither", "page_seconds")
# What each format offers, as the editor's video section (`engine/export/video/options.ts`): frame rates,
# the shorter side of the frame (`design`: the first page's size, its longer side at most `design_max`), and
# the defaults.
VIDEO_RULES: dict[str, dict[str, Any]] = {
    "mp4": {"fps": (24, 30, 60), "resolutions": ("design", 480, 720, 1080, 2160), "design_max": 1920},
    "webm": {"fps": (24, 30, 60), "resolutions": ("design", 480, 720, 1080, 2160), "design_max": 1920},
    "gif": {"fps": (5, 10, 15, 20), "resolutions": (240, 360, 480, 720), "design_max": 720},
}
VIDEO_DEFAULTS = {"mp4": ("design", 30), "webm": ("design", 30), "gif": (480, 15)}
VIDEO_QUALITIES = {"small": "small", "balanced": "balanced", "best": "high", "original": "high"}
PAGE_SECONDS = (1, 600)  # as the editor's page time
DEFAULT_PAGE_SECONDS = 5
SECONDS_PER_CALL = 10  # a video costs one more call or export for every started 10 s after the first
MAX_LOOPS = 65_535
# The pipeline's notes about the file, in words.
VIDEO_WARNINGS = {
    "audio-fallback": (
        "The sound is Opus, not AAC: this server's browser has no AAC encoder. Browsers, VLC and Android "
        "play it; some older Apple apps play this MP4 without sound."
    ),
    "no-audio": "The video has no sound: this server's browser could not encode it.",
    "video-fallback": (
        "The picture is not in the format's usual codec: this server's browser has no encoder for it."
    ),
}


def _video_quality(quality: int | str) -> str:
    """The video quality for an image `quality`: a preset by name, or a number (up to 70 small, up to 90
    balanced, above that high)."""
    if isinstance(quality, str) and quality.strip().lower() in VIDEO_QUALITIES:
        return VIDEO_QUALITIES[quality.strip().lower()]
    value = _quality(quality)
    return "small" if value <= 70 else "balanced" if value <= 90 else "high"


def _video_resolution(fmt: str, resolution, first: tuple[float, float]) -> str | int:
    rules = VIDEO_RULES[fmt]
    if resolution is None:
        resolution = VIDEO_DEFAULTS[fmt][0]
    if isinstance(resolution, str) and resolution.isdigit():
        resolution = int(resolution)
    if isinstance(resolution, bool) or resolution not in rules["resolutions"]:
        raise InvalidExport(
            "invalid_resolution",
            f"{fmt.upper()} resolutions are " + ", ".join(map(str, rules["resolutions"])) + ".",
        )
    limit = settings.EXPORT_VIDEO_MAX_RESOLUTION
    if resolution == "design":
        width, height = first
        short = min(width, height) * min(1, rules["design_max"] / max(width, height))
        if round(short) > limit:
            raise InvalidExport(
                "invalid_resolution",
                f"At the design's size this video would be {round(short)} px on its shorter side; this "
                f"server makes at most {limit}. Give a resolution of {limit} or less.",
            )
    elif resolution > limit:
        raise InvalidExport(
            "invalid_resolution", f"This server makes videos of at most {limit} px on the shorter side."
        )
    return resolution


def _video_fps(fmt: str, fps) -> int:
    allowed = VIDEO_RULES[fmt]["fps"]
    if fps is None:
        return VIDEO_DEFAULTS[fmt][1]
    if isinstance(fps, bool) or fps not in allowed:
        raise InvalidExport(
            "invalid_fps", f"{fmt.upper()} frame rates are " + ", ".join(map(str, allowed)) + "."
        )
    return int(fps)


def _page_seconds(page_seconds) -> float | None:
    if page_seconds is None:
        return None
    low, high = PAGE_SECONDS
    if (
        isinstance(page_seconds, bool)
        or not isinstance(page_seconds, int | float)
        or not (math.isfinite(page_seconds) and low <= page_seconds <= high)
    ):
        raise InvalidExport("invalid_page_seconds", f"page_seconds must be between {low} and {high}.")
    return page_seconds


def hold_seconds(pages: Sequence[dict], page_seconds: float | None) -> float:
    """How long the pages are held in a video: `page_seconds`, or each page's own time (5 s without one). The
    video is a little longer (transitions and the time animations take to build a page up), which the render
    page adds and checks against the limit itself."""
    total = 0.0
    for page in pages:
        own = page.get("durationSec") if isinstance(page, dict) else None
        valid = isinstance(own, int | float) and not isinstance(own, bool)
        if page_seconds is not None:
            total += page_seconds
        elif valid and PAGE_SECONDS[0] <= own <= PAGE_SECONDS[1]:
            total += own
        else:
            total += DEFAULT_PAGE_SECONDS
    return total


def export_video(
    design,
    *,
    format: str,
    pages: str | Sequence[int | str | None] | None = "all",
    resolution: str | int | None = None,
    fps: int | None = None,
    quality: int | str = "balanced",
    fit: str = "fit",
    sound: bool = True,
    loop: int = 0,
    dither: bool = True,
    page_seconds: float | None = None,
    filename_style: str | None = None,
    unix: int | None = None,
    charge: Callable[[int], None] | None = None,
) -> ImageBundle:
    """`pages` of `design` (see `pick_pages`; default all) as the editor's video download makes them: an MP4
    (H.264), a WebM (VP9) or an animated GIF, one page after another with their animations and transitions,
    and the design's sound in MP4 and WebM (`sound`).

    `resolution` is the shorter side of the frame (or `design`), `fps` the frame rate, both as the editor
    offers them per format; `quality` a preset (small, balanced, best) or a number; `fit` shows the whole
    page (`fit`) or covers the frame (`fill`); `page_seconds` holds every page that long instead of its own
    time. GIF: `loop` plays it that many times (0: forever) and `dither` smooths gradients. The video is made
    within `EXPORT_VIDEO_TIMEOUT_SECONDS`, at most `EXPORT_VIDEO_MAX_SECONDS` long and
    `EXPORT_VIDEO_MAX_BYTES` large. Before anything is drawn, `charge` is called with one for every started
    10 s of the pages' time after the first. Raises `InvalidExport`, `PayloadTooLarge` and the `Export*`
    exceptions."""
    fmt_id = str(format).lower()
    if fmt_id not in VIDEO_FORMATS:
        raise InvalidExport("invalid_format", "The format must be " + ", ".join(VIDEO_FORMATS) + ".")
    if not settings.SERVER_IMAGE_EXPORT_ENABLED:
        raise ImageExportDisabled
    if not settings.SERVER_VIDEO_EXPORT_ENABLED:
        raise VideoExportDisabled
    if not settings.EXPORT_RENDER_PAGE_URL:
        raise ExportUnavailable
    level = _video_quality(quality)
    rate = _video_fps(fmt_id, fps)
    if fit not in ("fit", "fill"):
        raise InvalidExport("invalid_fit", "fit must be fit or fill.")
    if isinstance(loop, bool) or not isinstance(loop, int) or not 0 <= loop <= MAX_LOOPS:
        raise InvalidExport("invalid_loop", f"loop must be a whole number from 0 (forever) to {MAX_LOOPS}.")
    seconds = _page_seconds(page_seconds)
    document = current_document(design)
    if len(json.dumps(document, separators=(",", ":"))) > settings.EXPORT_IMAGE_MAX_DOCUMENT_BYTES:
        raise PayloadTooLarge("The design is too large to export on the server.")
    indexes = _page_indexes(document, pages, limit=len(document.get("pages") or []))
    chosen = [document["pages"][index] for index in indexes]
    first = _page_size(document, chosen[0])
    frame = _video_resolution(fmt_id, resolution, first)
    held = hold_seconds(chosen, seconds)
    longest = settings.EXPORT_VIDEO_MAX_SECONDS
    if held > longest:
        raise InvalidExport(
            "too_long", f"The video would last at least {held:g} s; this server makes at most {longest} s."
        )
    if charge is not None and held > SECONDS_PER_CALL:
        charge(math.ceil(held / SECONDS_PER_CALL) - 1)
    payload: dict[str, Any] = {
        "document": document,
        "pages": indexes,
        "format": fmt_id,
        "resolution": frame,
        "fps": rate,
        "quality": level,
        "fit": fit,
        "sound": bool(sound),
        "loops": loop,
        "dither": bool(dither),
        "pageSeconds": seconds,
        "maxMs": longest * 1000,
        "maxBytes": settings.EXPORT_VIDEO_MAX_BYTES,
        "fonts": font_manifest(chosen, design.owner),
    }
    with render_slot(design.owner_id):
        made = render_video(
            payload,
            render_url=settings.EXPORT_RENDER_PAGE_URL,
            timeout=settings.EXPORT_VIDEO_TIMEOUT_SECONDS,
            max_bytes=settings.EXPORT_VIDEO_MAX_BYTES,
        )
    if list(made.page_indexes) != indexes or made.mime != VIDEO_FORMATS[fmt_id]:
        logger.error("Video export: the render page made another video than asked for")
        raise ExportFailed
    warnings = _drawing_warnings(made.placeholders, made.missing_fonts)
    warnings.extend(VIDEO_WARNINGS[code] for code in made.warnings if code in VIDEO_WARNINGS)
    options: dict[str, Any] = {
        "format": fmt_id,
        "resolution": frame,
        "fps": made.fps,
        "quality": "best" if level == "high" else level,
        "fit": fit,
        **({"loop": loop, "dither": bool(dither)} if fmt_id == "gif" else {"sound": bool(sound)}),
        "page_seconds": seconds,
        "pages": [index + 1 for index in indexes],
        "duration_ms": made.duration_ms,
        "frames": made.frames,
        "video": made.video,
        "audio": made.audio,
    }
    video = ImageResult(
        data=made.data,
        format=fmt_id,
        mime=made.mime,
        width=made.width,
        height=made.height,
        page_id=made.page_ids[0] if made.page_ids else str(chosen[0].get("id", "")),
        page_index=indexes[0],
        placeholders=made.placeholders,
        missing_fonts=made.missing_fonts,
        warnings=tuple(warnings),
        blocked_total=made.blocked_total,
        page_width=first[0],
        page_height=first[1],
        page_count=len(document["pages"]),
        preset=_preset_id(document) or design.preset,
        bytes_before=len(made.data),
        options_used=options,
    )
    style = filename_style or settings.EXPORT_FILENAME_STYLE
    name = document_filename(design.title, fmt_id, video, style=style, unix=unix)
    logger.info(
        "Video export: design=%s %s %dx%d %d fps, %d ms, %d byte(s), %d page(s), %d placeholder(s), "
        "%d blocked request(s)",
        design.pk,
        fmt_id,
        made.width,
        made.height,
        made.fps,
        made.duration_ms,
        len(made.data),
        len(indexes),
        made.placeholders,
        made.blocked_total,
    )
    return ImageBundle(made.data, fmt_id, made.mime, name, (video,), (name,), options)
