"""The export pipelines.

* PDF: sanitise every page SVG the browser sent, build one HTML document, print it.
* Image: draw one page of a saved design on the server with the editor's own engine (the frontend's headless
  render page), then convert the PNG to the requested format.
"""

from __future__ import annotations

import io
import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Any

from django.conf import settings
from django.db.models.functions import Lower
from PIL import Image

from apps.core.svg import SvgError, sanitize_svg
from apps.designs.edits import current_document
from apps.fonts.models import FontFamily
from apps.fonts.serializers import FontFamilySerializer, with_variants
from apps.fonts.usage import font_names_in_document, uploaded_fonts_used_by

from .exceptions import ExportFailed, ExportUnavailable, ImageExportDisabled, InvalidExport, PayloadTooLarge
from .fonts import load_fonts
from .layout import PageGeometry, build_document_html, prepare_page_svg
from .pdfmeta import finalize_pdf
from .renderer import RenderResult, allowed_origins, render_image, render_pdf, render_slot

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
        fonts = load_fonts(request.fonts, allowed_origins())
        document = build_document_html(
            [prepare_page_svg(svg, geometry) for svg, geometry in zip(sanitized, geometries, strict=True)],
            geometries,
            request.title,
            fonts,
            request.lang,
        )
        result = render_pdf(document, width_px=geometries[0].page_width, height_px=geometries[0].page_height)
    pdf = finalize_pdf(result.pdf, geometries, title=request.title, lang=request.lang)
    logger.info(
        "PDF export: %d page(s), %d byte(s), %d blocked request(s)",
        len(sanitized),
        len(pdf),
        result.blocked_total,
    )
    return replace(result, data=pdf)


# ---- image export ------------------------------------------------------------------------------

IMAGE_FORMATS = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}
FORMAT_ALIASES = {"jpeg": "jpg"}
MIN_SCALE, MAX_SCALE = 0.1, 4.0


@dataclass(frozen=True)
class ImageResult:
    data: bytes
    format: str  # png, jpg or webp
    mime: str
    width: int
    height: int
    page_id: str
    page_index: int
    placeholders: int = 0
    missing_fonts: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    blocked_total: int = 0


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


def font_manifest(page: dict, owner) -> list[dict[str, Any]]:
    """The font families `page` names, in the fonts API's shape: the owner's uploaded ones (which win, as in
    the editor) and the catalogue's."""
    single = {"pages": [page]}
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


def _convert(png: bytes, fmt: str, quality: int, transparent: bool) -> bytes:
    """PNG as drawn; JPG flattened on white (no alpha); WebP with alpha only for a transparent export."""
    if fmt == "png":
        return png
    with Image.open(io.BytesIO(png)) as source:
        image = source.convert("RGBA")
    if fmt == "jpg" or not transparent:
        flat = Image.new("RGBA", image.size, (255, 255, 255, 255))
        flat.alpha_composite(image)
        image = flat.convert("RGB")
    out = io.BytesIO()
    if fmt == "jpg":
        image.save(out, "JPEG", quality=quality, optimize=True)
    else:
        image.save(out, "WEBP", quality=quality, method=4)
    return out.getvalue()


def export_image(
    design,
    *,
    page: int | str | None = None,
    format: str = "png",
    quality: int = 90,
    scale: float = 1,
    transparent: bool = False,
) -> ImageResult:
    """Draw one page of `design` (its live editor state when it is open, else the saved document) as PNG, JPG
    or WebP. `page` is an index or a page id (default: the first page); `transparent` leaves the page
    background out (not for JPG). Raises `InvalidExport`, `PayloadTooLarge` and the `Export*` exceptions."""
    if not settings.SERVER_IMAGE_EXPORT_ENABLED:
        raise ImageExportDisabled
    if not settings.EXPORT_RENDER_PAGE_URL:
        raise ExportUnavailable
    fmt = FORMAT_ALIASES.get(str(format).lower(), str(format).lower())
    if fmt not in IMAGE_FORMATS:
        raise InvalidExport("invalid_format", "The format must be png, jpg or webp.")
    if isinstance(quality, bool) or not isinstance(quality, int) or not 1 <= quality <= 100:
        raise InvalidExport("invalid_quality", "The quality must be a whole number from 1 to 100.")
    try:
        scale = float(scale)
    except (TypeError, ValueError):
        scale = 0.0
    if not MIN_SCALE <= scale <= MAX_SCALE:
        raise InvalidExport("invalid_scale", f"The scale must be between {MIN_SCALE:g} and {MAX_SCALE:g}.")
    transparent = bool(transparent) and fmt != "jpg"

    document = current_document(design)
    if len(json.dumps(document, separators=(",", ":"))) > settings.EXPORT_IMAGE_MAX_DOCUMENT_BYTES:
        raise PayloadTooLarge("The design is too large to export as an image on the server.")
    page_obj, index = _pick_page(document, page)
    width, height = _page_size(document, page_obj)
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
        data = _convert(result.data, fmt, quality, transparent)
    except (OSError, ValueError) as exc:
        logger.error("Image export: the render page sent an unreadable PNG (%s)", exc)
        raise ExportFailed from exc
    warnings = []
    if result.placeholders:
        warnings.append(
            f"{result.placeholders} object(s) could not be loaded (usually a picture) and are drawn as "
            "grey boxes."
        )
    if result.missing_fonts:
        warnings.append("Drawn in a fallback font: " + ", ".join(result.missing_fonts) + ".")
    logger.info(
        "Image export: design=%s page=%d %s %dx%d, %d byte(s), %d placeholder(s), %d blocked request(s)",
        design.pk,
        result.page_index,
        fmt,
        result.width,
        result.height,
        len(data),
        result.placeholders,
        result.blocked_total,
    )
    return ImageResult(
        data=data,
        format=fmt,
        mime=IMAGE_FORMATS[fmt],
        width=result.width,
        height=result.height,
        page_id=result.page_id,
        page_index=result.page_index,
        placeholders=result.placeholders,
        missing_fonts=result.missing_fonts,
        warnings=tuple(warnings),
        blocked_total=result.blocked_total,
    )
