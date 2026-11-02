"""Which kind of object a document entry is, decided like the editor does (`objects/builtinKinds.ts`)."""

from __future__ import annotations

import math

TEXT_TYPES = frozenset({"textbox", "itext", "i-text", "text"})
SHAPE_TYPES = frozenset({"rect", "ellipse", "circle", "triangle", "polygon", "polyline", "path"})
LINE_TYPES = frozenset({"doryline", "line"})
GROUP_TYPES = frozenset({"group", "activeselection"})
GRID_CELL_LIMIT = 24
GRID_ID_LIMIT = 64
GRID_EPSILON = 1e-6


def finite_number(value: object) -> float | None:
    """Return a finite float for a JSON number, or ``None`` when it cannot be represented."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        number = float(value)
    except (OverflowError, ValueError):
        return None
    return number if math.isfinite(number) else None


def image_grid_spec(obj: dict) -> dict | None:
    """Return valid semantic grid metadata, matching the editor's persisted-model checks."""
    if str(obj.get("type", "")).lower() != "group":
        return None
    spec = obj.get("imageGrid")
    if not isinstance(spec, dict) or isinstance(spec.get("version"), bool) or spec.get("version") != 1:
        return None
    layout_id = spec.get("layoutId")
    cells = spec.get("cells")
    if not isinstance(layout_id, str) or not 0 < len(layout_id) <= GRID_ID_LIMIT:
        return None
    if not isinstance(cells, list) or not 0 < len(cells) <= GRID_CELL_LIMIT:
        return None

    frames: list[tuple[str, float, float, float, float]] = []
    for cell in cells:
        if not isinstance(cell, dict):
            return None
        cell_id = cell.get("gridCellId")
        x, y, width, height = (finite_number(cell.get(key)) for key in ("x", "y", "width", "height"))
        if not isinstance(cell_id, str) or not 0 < len(cell_id) <= GRID_ID_LIMIT:
            return None
        if None in (x, y, width, height):
            return None
        assert x is not None and y is not None and width is not None and height is not None
        if x < 0 or y < 0 or width <= 0 or height <= 0:
            return None
        if x + width > 1 + GRID_EPSILON or y + height > 1 + GRID_EPSILON:
            return None
        frames.append((cell_id, x, y, width, height))

    if len({frame[0] for frame in frames}) != len(frames):
        return None
    for index, (_, x, y, width, height) in enumerate(frames):
        for _, other_x, other_y, other_width, other_height in frames[index + 1 :]:
            overlap_width = min(x + width, other_x + other_width) - max(x, other_x)
            overlap_height = min(y + height, other_y + other_height) - max(y, other_y)
            if overlap_width > GRID_EPSILON and overlap_height > GRID_EPSILON:
                return None
    return spec


def contains_image_grid(obj: dict) -> bool:
    """Whether this object is, or contains, a semantic image grid."""
    if image_grid_spec(obj) is not None:
        return True
    children = obj.get("objects")
    return isinstance(children, list) and any(
        isinstance(child, dict) and contains_image_grid(child) for child in children
    )


def object_kind(obj: dict) -> str:
    """qr, image-grid, placeholder, element, video, image, text, line, shape, group or unknown.

    A video clip is a picture (its poster) that also names the clip (`videoSrc`); it is never treated as a
    plain picture, so a picture tool can't swap its poster and leave the clip behind."""
    kind = str(obj.get("type", "")).lower()
    if obj.get("qr"):
        return "qr"
    if image_grid_spec(obj) is not None:
        return "image-grid"
    if obj.get("isPlaceholder") is True:
        return "placeholder"
    if isinstance(obj.get("elementId"), str):
        return "element"
    if kind == "image":
        return "video" if isinstance(obj.get("videoSrc"), str) else "image"
    if kind in TEXT_TYPES:
        return "text"
    if kind in LINE_TYPES:
        return "line"
    if kind in SHAPE_TYPES:
        return "shape"
    if kind in GROUP_TYPES:
        return "group"
    return "unknown"
