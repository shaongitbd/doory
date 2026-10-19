"""SVG sanitiser and inspector.

User- and staff-supplied SVG is rendered inside the editor and inside server-side Chromium, so it must
be treated as hostile. `sanitize_svg` parses with defusedxml (no DTD / entities / XXE), keeps only an
allow-list of elements and attributes, drops every script/animation/foreign-content vector, and only
permits *internal* (`#id`) references or small raster `data:` images. Anything it cannot prove safe is
removed, never repaired. Hyperlinks (`<a>`) are opt-in (`allow_links`): they only keep an `http:`, `https:` or
`mailto:` address.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

from defusedxml import ElementTree as SafeET
from defusedxml.common import DefusedXmlException

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)

MAX_BYTES = 5 * 1024 * 1024
MAX_NODES = 50_000
MAX_DEPTH = 64
MAX_EXPANDED_NODES = 1_000_000  # what the drawing has once every <use> is replaced by what it points to
MAX_USE_DEPTH = 200

MAX_LINK_LENGTH = 2048
LINK_SCHEMES = frozenset({"http", "https", "mailto"})

ALLOWED_ELEMENTS = {
    "svg",
    "g",
    "defs",
    "symbol",
    "use",
    "title",
    "desc",
    "metadata",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "textPath",
    "linearGradient",
    "radialGradient",
    "stop",
    "pattern",
    "clipPath",
    "mask",
    "marker",
    "image",
    "style",
    "filter",
    "feBlend",
    "feColorMatrix",
    "feComponentTransfer",
    "feComposite",
    "feConvolveMatrix",
    "feDiffuseLighting",
    "feDisplacementMap",
    "feDropShadow",
    "feFlood",
    "feFuncA",
    "feFuncB",
    "feFuncG",
    "feFuncR",
    "feGaussianBlur",
    "feMerge",
    "feMergeNode",
    "feMorphology",
    "feOffset",
    "feSpecularLighting",
    "feTile",
    "feTurbulence",
    "feDistantLight",
    "fePointLight",
    "feSpotLight",
}

# Presentation + geometry attributes. `on*`, `href`-like and `style` are handled separately.
ALLOWED_ATTRIBUTES = {
    "id",
    "class",
    "x",
    "y",
    "x1",
    "x2",
    "y1",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "width",
    "height",
    "d",
    "points",
    "transform",
    "viewBox",
    "preserveAspectRatio",
    "version",
    "xmlns",
    "fill",
    "fill-opacity",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-dasharray",
    "stroke-dashoffset",
    "opacity",
    "clip-path",
    "clip-rule",
    "mask",
    "filter",
    "marker-start",
    "marker-mid",
    "marker-end",
    "offset",
    "stop-color",
    "stop-opacity",
    "gradientUnits",
    "gradientTransform",
    "spreadMethod",
    "fx",
    "fy",
    "fr",
    "patternUnits",
    "patternContentUnits",
    "patternTransform",
    "clipPathUnits",
    "maskUnits",
    "maskContentUnits",
    "markerWidth",
    "markerHeight",
    "markerUnits",
    "refX",
    "refY",
    "orient",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "text-anchor",
    "dominant-baseline",
    "letter-spacing",
    "word-spacing",
    "text-decoration",
    "dx",
    "dy",
    "rotate",
    "textLength",
    "lengthAdjust",
    "startOffset",
    "method",
    "spacing",
    "display",
    "visibility",
    "overflow",
    "color",
    "mix-blend-mode",
    "isolation",
    "vector-effect",
    "shape-rendering",
    "image-rendering",
    "color-interpolation-filters",
    "in",
    "in2",
    "result",
    "mode",
    "type",
    "values",
    "stdDeviation",
    "flood-color",
    "flood-opacity",
    "operator",
    "k1",
    "k2",
    "k3",
    "k4",
    "scale",
    "xChannelSelector",
    "yChannelSelector",
    "baseFrequency",
    "numOctaves",
    "seed",
    "stitchTiles",
    "order",
    "kernelMatrix",
    "divisor",
    "bias",
    "targetX",
    "targetY",
    "edgeMode",
    "radius",
    "slope",
    "intercept",
    "amplitude",
    "exponent",
    "tableValues",
    "azimuth",
    "elevation",
    "z",
    "pointsAtX",
    "pointsAtY",
    "pointsAtZ",
    "specularExponent",
    "surfaceScale",
    "diffuseConstant",
    "specularConstant",
    "lighting-color",
    "limitingConeAngle",
    "filterUnits",
    "primitiveUnits",
    "xml:space",
    "xml:lang",
    "role",
    "aria-label",
    "aria-hidden",
    "focusable",
}
_HREF_ATTRS = {"href", f"{{{XLINK_NS}}}href"}
_SAFE_DATA_URI = re.compile(r"^data:image/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$", re.I)
_URL_REF = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I | re.S)
_DANGEROUS_CSS = re.compile(
    r"@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding|@namespace|<\s*/?\s*script"
    r"|image-set|cross-fade|\bsrc\s*\(",
    re.I,
)
_CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
_CSS_ESCAPE = re.compile(r"\\(?:([0-9a-fA-F]{1,6})[ \t\r\n\f]?|(.))", re.S)


class SvgError(ValueError):
    """Raised when the input is not a usable SVG document."""


@dataclass(frozen=True)
class SvgInfo:
    width: float
    height: float


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _is_svg_ns(tag: str) -> bool:
    return tag.startswith(f"{{{SVG_NS}}}") or "}" not in tag


def _unescape_css(css: str) -> str:
    """The text a CSS parser reads: comments dropped and escapes resolved (`u\\72l(` is `url(`).

    Browsers decode escapes inside identifiers, function names and at-keywords, so a filter that looks for
    `url(` or `@import` in the raw text can be walked around with a backslash.
    """

    def resolve(match: re.Match[str]) -> str:
        if match.group(1) is None:
            return match.group(2)
        code = int(match.group(1), 16)
        return chr(code) if 0 < code <= 0x10FFFF and not 0xD800 <= code <= 0xDFFF else "\ufffd"

    return _CSS_ESCAPE.sub(resolve, _CSS_COMMENT.sub("", css))


def _css_is_safe(css: str) -> bool:
    css = _unescape_css(css)
    if _DANGEROUS_CSS.search(css):
        return False
    for match in _URL_REF.finditer(css):
        target = match.group(2).strip()
        if not target.startswith("#") and not _SAFE_DATA_URI.match(target):
            return False
    return True


def safe_link(value: str) -> str | None:
    """`value` when it is an absolute `http:`, `https:` or `mailto:` address, else None.

    Everything else is refused: `javascript:`, `data:`, `file:` and every other scheme, relative and
    scheme-relative references, addresses with credentials (`https://trusted.example@evil.example`) and any
    address containing whitespace or control characters (browsers drop some of them, which can hide a scheme).
    """
    link = value.strip()
    if not link or len(link) > MAX_LINK_LENGTH or any(c.isspace() or not c.isprintable() for c in link):
        return None
    try:
        parts = urlsplit(link)
        parts.port  # noqa: B018 - raises ValueError on a malformed port
    except ValueError:
        return None
    scheme = parts.scheme.lower()
    if scheme not in LINK_SCHEMES:
        return None
    if scheme == "mailto":
        return link if parts.path and not parts.netloc else None
    if not parts.hostname or parts.username is not None or parts.password is not None:
        return None
    return link


def _clean_attr_value(value: str) -> bool:
    low = value.strip().lower()
    return "javascript:" not in low and "vbscript:" not in low and "<script" not in low


def _sanitize_element(el: ET.Element, depth: int, counter: list[int], allow_links: bool) -> bool:
    """Sanitise `el` in place. Returns False when the element itself must be removed."""
    counter[0] += 1
    if counter[0] > MAX_NODES or depth > MAX_DEPTH:
        raise SvgError("SVG is too complex.")
    tag = el.tag
    if not isinstance(tag, str) or not _is_svg_ns(tag):
        return False
    name = _local(tag)
    if name not in ALLOWED_ELEMENTS and not (allow_links and name == "a"):
        return False

    if name == "style":
        css = el.text or ""
        if not _css_is_safe(css):
            return False

    for attr in list(el.attrib):
        value = el.attrib[attr]
        local = _local(attr)
        if attr in _HREF_ATTRS:
            v = value.strip()
            if v.startswith("#") or (name == "image" and _SAFE_DATA_URI.match(v)):
                continue
            link = safe_link(v) if name == "a" and allow_links else None
            if link is not None:
                el.attrib[attr] = link
                continue
            del el.attrib[attr]
        elif attr == "style":
            if not _css_is_safe(value):
                del el.attrib[attr]
        elif attr.lower().startswith("on") or attr.startswith("{"):
            if attr.startswith("{http://www.w3.org/XML/1998/namespace}"):
                xml_attr = "xml:" + local
                if xml_attr in ALLOWED_ATTRIBUTES:
                    del el.attrib[attr]
                    el.attrib[xml_attr] = value
                    continue
            del el.attrib[attr]
        elif attr not in ALLOWED_ATTRIBUTES or not _clean_attr_value(value):
            del el.attrib[attr]
        else:
            # Presentation attributes may carry url(...) paint servers / filters / clip paths.
            if ("(" in value or "\\" in value) and not _css_is_safe(value):
                del el.attrib[attr]

    for child in list(el):
        if not _sanitize_element(child, depth + 1, counter, allow_links):
            el.remove(child)
    return True


def _expanded_size(
    element: ET.Element, by_id: dict[str, ET.Element], memo: dict[int, int], active: set[int]
) -> int:
    """Nodes in `element` once its `<use>` descendants are replaced by their targets (an upper bound)."""
    key = id(element)
    if key in memo:
        return memo[key]
    if key in active or len(active) > MAX_USE_DEPTH:
        raise SvgError("SVG is too complex.")
    active.add(key)
    total = 1 + sum(_expanded_size(child, by_id, memo, active) for child in element)
    if _local(element.tag) == "use":
        href = element.get("href") or element.get(f"{{{XLINK_NS}}}href") or ""
        target = by_id.get(href[1:]) if href.startswith("#") else None
        if target is not None:
            total += _expanded_size(target, by_id, memo, active)
    active.discard(key)
    if total > MAX_EXPANDED_NODES:
        raise SvgError("SVG is too complex.")
    memo[key] = total
    return total


def _check_expansion(root: ET.Element) -> None:
    """Refuse a drawing that is small but draws exponentially much: `<use>` chains, each used ten times."""
    by_id: dict[str, ET.Element] = {}
    for element in root.iter():
        name = element.get("id")
        if name and name not in by_id:
            by_id[name] = element
    try:
        _expanded_size(root, by_id, {}, set())
    except RecursionError as exc:
        raise SvgError("SVG is too complex.") from exc


def sanitize_svg(data: bytes, *, allow_links: bool = False) -> bytes:
    """Return a sanitised copy of `data`, or raise `SvgError` if it is not a safe, valid SVG.

    With `allow_links`, `<a>` elements stay and keep an `href` / `xlink:href` that passes `safe_link`;
    without it they are removed with their content, as before.
    """
    if not isinstance(data, (bytes, bytearray)) or not data:
        raise SvgError("Empty SVG.")
    if len(data) > MAX_BYTES:
        raise SvgError("SVG is too large.")
    try:
        root = SafeET.fromstring(bytes(data), forbid_dtd=True, forbid_entities=True, forbid_external=True)
    except (DefusedXmlException, ET.ParseError, ValueError, UnicodeDecodeError) as exc:
        raise SvgError("Invalid or unsafe SVG.") from exc
    if _local(root.tag) != "svg" or not _is_svg_ns(root.tag):
        raise SvgError("Not an SVG document.")
    if not _sanitize_element(root, 0, [0], allow_links):
        raise SvgError("Not an SVG document.")
    _check_expansion(root)
    return ET.tostring(root, encoding="utf-8", xml_declaration=False)


_LENGTH = re.compile(r"^\s*([0-9]*\.?[0-9]+)\s*(px|pt|mm|cm|in|pc|em|%)?\s*$", re.I)
_UNIT_PX = {
    "px": 1.0,
    "pt": 96 / 72,
    "pc": 16.0,
    "mm": 96 / 25.4,
    "cm": 96 / 2.54,
    "in": 96.0,
    "em": 16.0,
    None: 1.0,
}


def _to_px(value: str | None) -> float | None:
    if not value:
        return None
    m = _LENGTH.match(value)
    if not m or (m.group(2) or "").lower() == "%":
        return None
    return float(m.group(1)) * _UNIT_PX[(m.group(2) or "").lower() or None]


def svg_info(sanitized: bytes) -> SvgInfo:
    """Intrinsic size of an (already sanitised) SVG from width/height or viewBox; falls back to 300x150."""
    root = SafeET.fromstring(sanitized, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    w, h = _to_px(root.get("width")), _to_px(root.get("height"))
    vb = (root.get("viewBox") or "").replace(",", " ").split()
    if len(vb) == 4:
        try:
            vbw, vbh = float(vb[2]), float(vb[3])
            if vbw > 0 and vbh > 0:
                if w and not h:
                    h = w * vbh / vbw
                elif h and not w:
                    w = h * vbw / vbh
                elif not w and not h:
                    w, h = vbw, vbh
        except ValueError:
            pass
    return SvgInfo(width=round(w or 300, 2), height=round(h or 150, 2))


def _viewbox_size(value: str | None) -> tuple[float, float] | None:
    parts = (value or "").replace(",", " ").split()
    if len(parts) != 4:
        return None
    try:
        width, height = float(parts[2]), float(parts[3])
    except ValueError:
        return None
    return (width, height) if width > 0 and height > 0 else None


def with_intrinsic_size(sanitized: bytes, width: int, height: int) -> bytes:
    """`sanitized` with its root `width`/`height` set to `width` x `height` px. A browser draws an SVG at its
    own root size, and one without an absolute size at a default 300x150 (cut to that window when it has no
    `viewBox`), so this makes the drawn size the one Doory stores. A root without a `viewBox` gets one for
    its original size, so the drawing scales to the new size instead of being cut."""
    root = SafeET.fromstring(sanitized, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    if _viewbox_size(root.get("viewBox")) is None:
        info = svg_info(sanitized)
        root.set("viewBox", f"0 0 {info.width:g} {info.height:g}")
    root.set("width", str(width))
    root.set("height", str(height))
    return ET.tostring(root, encoding="utf-8", xml_declaration=False)


_COLOR = re.compile(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b")


def svg_colors(sanitized: bytes) -> list[str]:
    """Distinct hex colours used in fill/stroke/stop-color attributes (normalised to #rrggbb, lower-case)."""
    root = SafeET.fromstring(sanitized, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    found: dict[str, None] = {}
    for el in root.iter():
        for key in ("fill", "stroke", "stop-color"):
            for hex_ in _COLOR.findall(el.get(key, "")):
                h = hex_.lower()
                if len(h) == 4:
                    h = "#" + "".join(c * 2 for c in h[1:])
                found[h] = None
    return list(found)
