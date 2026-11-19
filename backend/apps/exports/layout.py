"""Page geometry and the in-memory HTML document that Chromium prints."""

from __future__ import annotations

import base64
import html
import math
import re
from collections.abc import Sequence
from dataclasses import dataclass
from xml.etree import ElementTree as ET

from defusedxml import ElementTree as SafeET

from apps.core.svg import svg_info

PX_PER_MM = 96 / 25.4
MAX_BLEED_MM = 10  # the most bleed an export may ask for (the editor's `printGeometry.ts` says the same)
_FAMILY_UNSAFE = re.compile(r"[^\w .\-]")
MARK_GAP_MM = 1.0  # between the bleed edge and the start of a crop mark
MARK_LENGTH_MM = 5.0
MARK_STROKE_PX = 0.5
# Chromium rounds the size of a printed page to whole PDF points and then down to 1/300 inch, which can make
# the page up to 0.74 pt smaller than asked and would crop the artwork. The sheet is therefore requested one
# point (4/3 px) larger than the page, the section on it keeps the exact size, and `pdfmeta` cuts the
# MediaBox back to the exact size afterwards.
SHEET_ALLOWANCE_PX = 4 / 3


def _valid_view_box(value: str | None) -> bool:
    parts = (value or "").replace(",", " ").split()
    if len(parts) != 4:
        return False
    try:
        numbers = [float(part) for part in parts]
    except ValueError:
        return False
    return all(math.isfinite(number) for number in numbers) and numbers[2] > 0 and numbers[3] > 0


def fmt(value: float) -> str:
    return f"{value:.4f}".rstrip("0").rstrip(".") or "0"


@dataclass(frozen=True)
class PageGeometry:
    """Sizes in CSS px. The artwork box is the trim box plus bleed; the slug only exists with crop marks."""

    width: float
    height: float
    bleed: float = 0.0
    slug: float = 0.0

    @classmethod
    def create(
        cls, width: float, height: float, bleed_mm: float = 0.0, crop_marks: bool = False
    ) -> PageGeometry:
        slug = (MARK_GAP_MM + MARK_LENGTH_MM) * PX_PER_MM if crop_marks else 0.0
        return cls(width, height, bleed_mm * PX_PER_MM, slug)

    @property
    def margin(self) -> float:
        return self.bleed + self.slug

    @property
    def page_width(self) -> float:
        return self.width + 2 * self.margin

    @property
    def page_height(self) -> float:
        return self.height + 2 * self.margin

    @property
    def sheet_width(self) -> float:
        return self.page_width + SHEET_ALLOWANCE_PX

    @property
    def sheet_height(self) -> float:
        return self.page_height + SHEET_ALLOWANCE_PX

    @property
    def art_width(self) -> float:
        return self.width + 2 * self.bleed

    @property
    def art_height(self) -> float:
        return self.height + 2 * self.bleed

    @property
    def has_marks(self) -> bool:
        return self.slug > 0


@dataclass(frozen=True)
class EmbeddedFont:
    family: str
    weight: int
    style: str
    mime: str
    data: bytes


def prepare_page_svg(sanitized: bytes, geometry: PageGeometry) -> str:
    """Size an already sanitised SVG to the artwork box.

    Without bleed the artwork is fitted inside the box; with bleed it is scaled to cover the bleed box so
    edge colours and imagery extend past the trim line.
    """
    root = SafeET.fromstring(sanitized, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    if not _valid_view_box(root.get("viewBox")):
        if root.get("width") and root.get("height"):
            info = svg_info(sanitized)
            root.set("viewBox", f"0 0 {fmt(info.width)} {fmt(info.height)}")
        else:
            root.set("viewBox", f"0 0 {fmt(geometry.width)} {fmt(geometry.height)}")
    root.attrib.pop("x", None)
    root.attrib.pop("y", None)
    root.set("width", fmt(geometry.art_width))
    root.set("height", fmt(geometry.art_height))
    root.set("preserveAspectRatio", "xMidYMid slice" if geometry.bleed else "xMidYMid meet")
    return ET.tostring(root, encoding="unicode")


def crop_marks_svg(geometry: PageGeometry) -> str:
    """Eight hairlines around the trim box, drawn in the slug so they never overprint the artwork."""
    inner = geometry.bleed + MARK_GAP_MM * PX_PER_MM
    outer = inner + MARK_LENGTH_MM * PX_PER_MM
    left, top = geometry.margin, geometry.margin
    right, bottom = left + geometry.width, top + geometry.height
    segments: list[str] = []
    for cx, sx in ((left, -1), (right, 1)):
        for cy, sy in ((top, -1), (bottom, 1)):
            segments.append(f"M{fmt(cx + sx * inner)} {fmt(cy)}L{fmt(cx + sx * outer)} {fmt(cy)}")
            segments.append(f"M{fmt(cx)} {fmt(cy + sy * inner)}L{fmt(cx)} {fmt(cy + sy * outer)}")
    width, height = fmt(geometry.page_width), fmt(geometry.page_height)
    path = f'<path d="{"".join(segments)}" fill="none" stroke="#000" stroke-width="{fmt(MARK_STROKE_PX)}"/>'
    return (
        f'<svg class="marks" xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">{path}</svg>'
    )


def font_face_css(fonts: list[EmbeddedFont]) -> str:
    rules = []
    for font in fonts:
        family = _FAMILY_UNSAFE.sub("", font.family)
        payload = base64.b64encode(font.data).decode("ascii")
        rules.append(
            f'@font-face{{font-family:"{family}";font-weight:{int(font.weight)};font-style:{font.style};'
            f'src:url("data:{font.mime};base64,{payload}")}}'
        )
    return "".join(rules)


def _page_css(geometry: PageGeometry, selector: str, page_name: str | None) -> str:
    named = f"page:{page_name};" if page_name else ""
    return (
        f"{selector}{{{named}width:{fmt(geometry.page_width)}px;height:{fmt(geometry.page_height)}px}}"
        f"{selector} .art{{left:{fmt(geometry.slug)}px;top:{fmt(geometry.slug)}px;"
        f"width:{fmt(geometry.art_width)}px;height:{fmt(geometry.art_height)}px}}"
    )


def build_document_html(
    svgs: list[str],
    geometry: PageGeometry | Sequence[PageGeometry],
    title: str = "",
    fonts: list[EmbeddedFont] | None = None,
    lang: str = "en",
) -> str:
    """One HTML document, one fixed-size `<section>` per page.

    `geometry` is the geometry every page shares, or one geometry per page (pages of a design may differ in
    size). The first page's size becomes the default `@page`; every other distinct size gets a *named* page
    (`@page p1{size:...}`) that its sections select with the `page` property, so Chromium starts a new PDF
    page with its own size where the name changes. The `@page` sizes are the page sizes plus
    `SHEET_ALLOWANCE_PX` (see there); the sections have the exact page size.

    Each page's SVG lives in its own declarative shadow root, so ids, classes and `<style>` rules of
    different pages can never collide. Scripts are not needed: the parser attaches the shadow roots.
    """
    geometries = [geometry] * len(svgs) if isinstance(geometry, PageGeometry) else list(geometry)
    if len(geometries) != len(svgs):
        raise ValueError("Pass one geometry for all pages or exactly one per page.")
    first = geometry if isinstance(geometry, PageGeometry) else (geometries[0] if geometries else None)
    if first is None:
        raise ValueError("A document needs at least one page geometry.")
    names: dict[PageGeometry, str] = {}
    for item in geometries:
        names.setdefault(item, f"p{len(names)}")
    named = len(names) > 1
    page_css = (
        f"@page{{size:{fmt(first.sheet_width)}px {fmt(first.sheet_height)}px;margin:0}}"
        "html,body{margin:0;padding:0;background:#fff}"
        ".page{position:relative;overflow:hidden;break-after:page;break-inside:avoid}"
        ".page:last-child{break-after:auto}"
        ".art{position:absolute;overflow:hidden}"
        ".marks{position:absolute;left:0;top:0;display:block}"
    )
    for item, name in names.items():
        if named:
            page_css += f"@page {name}{{size:{fmt(item.sheet_width)}px {fmt(item.sheet_height)}px;margin:0}}"
        page_css += _page_css(item, f".{name}", name if named else None)
    marks = {item: crop_marks_svg(item) for item in names if item.has_marks}
    sections = "".join(
        f'<section class="page {names[item]}"><div class="art"><template shadowrootmode="open">'
        f"<style>:host{{display:block}}svg{{display:block}}</style>{svg}</template></div>"
        f"{marks.get(item, '')}</section>"
        for svg, item in zip(svgs, geometries, strict=True)
    )
    return (
        f'<!doctype html><html lang="{html.escape(lang)}"><head><meta charset="utf-8">'
        f"<title>{html.escape(title)}</title>"
        f"<style>{font_face_css(fonts or [])}{page_css}</style></head><body>{sections}</body></html>"
    )


def build_imposed_html(svgs, sides, leaf_width: float, leaf_height: float, title, fonts, lang):
    """Each printer spread has two isolated SVG leaves and one PDF sheet side."""
    from .imposition import folded_sheet

    sheet_width, sheet_height, offset_x, offset_y = folded_sheet(leaf_width, leaf_height)
    sheet = PageGeometry.create(sheet_width, sheet_height)
    css = (
        f"@page{{size:{fmt(sheet.sheet_width)}px {fmt(sheet.sheet_height)}px;margin:0}}"
        "html,body{margin:0;padding:0;background:#fff}"
        f".page{{position:relative;width:{fmt(sheet.page_width)}px;height:{fmt(sheet.page_height)}px;"
        "break-after:page;break-inside:avoid;overflow:hidden}"
        ".page:last-child{break-after:auto}"
        f".leaf{{position:absolute;top:{fmt(offset_y)}px;width:{fmt(leaf_width)}px;"
        f"height:{fmt(leaf_height)}px}}"
    )
    pages = []
    for side in sides:
        leaves = []
        for index, x in ((side.left, offset_x), (side.right, offset_x + leaf_width)):
            if index is not None:
                leaves.append(
                    f'<div class="leaf" style="left:{fmt(x)}px"><template shadowrootmode="open">'
                    f"<style>:host{{display:block}}svg{{display:block}}</style>{svgs[index]}</template></div>"
                )
        pages.append(f'<section class="page">{"".join(leaves)}</section>')
    document = (
        f'<!doctype html><html lang="{html.escape(lang)}"><head><meta charset="utf-8">'
        f"<title>{html.escape(title)}</title><style>{font_face_css(fonts)}{css}</style></head>"
        f"<body>{''.join(pages)}</body></html>"
    )
    return document, [sheet] * len(sides)
