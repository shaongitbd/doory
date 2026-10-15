"""The PDF export pipeline: sanitise every page, build one HTML document, print it."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, replace

from apps.core.svg import SvgError, sanitize_svg
from apps.designs.validators import MAX_DIMENSION

from .exceptions import InvalidExport
from .fonts import load_fonts
from .layout import PageGeometry, build_document_html, prepare_page_svg
from .pdfmeta import finalize_pdf
from .renderer import RenderResult, allowed_origins, render_pdf, render_slot

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


def _validate_page_sizes(sizes: list[tuple[float, float]]) -> None:
    for i, (width, height) in enumerate(sizes, start=1):
        if width < 1 or height < 1 or width > MAX_DIMENSION or height > MAX_DIMENSION:
            raise InvalidExport(
                "invalid_sizes",
                f"Page {i} dimensions must be between 1 and {MAX_DIMENSION} px.",
            )


def export_pdf(request: ExportRequest) -> RenderResult:
    """Run the whole pipeline; the browser part holds one render slot (`ExportBusy` when none is free)."""
    sizes = request.page_sizes()
    if len(sizes) != len(request.pages):
        raise InvalidExport("invalid_sizes", "Give exactly one size per page.")
    _validate_page_sizes(sizes)
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
    return replace(result, pdf=pdf)
