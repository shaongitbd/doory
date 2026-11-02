"""A compact description of a design for agents: what is on each page, where, and in which style.

Whole documents can be megabytes of Fabric.js JSON; the summary keeps what an agent needs to place and change
things and drops rendering details.
"""

from __future__ import annotations

from typing import Any

from .builders import primary_family
from .fields import read_field, read_fit
from .kinds import finite_number, image_grid_spec, object_kind
from .ops import box

TEXT_PREVIEW = 500


def _background(background: Any) -> dict:
    if not isinstance(background, dict):
        return {"type": "solid", "color": "#ffffff"}
    kind = background.get("type")
    if kind == "solid":
        return {"type": "solid", "color": background.get("color")}
    if kind == "gradient":
        return {"type": "gradient", "colors": [s.get("color") for s in background.get("stops", [])]}
    if kind == "image":
        return {"type": "image", "src": background.get("src")}
    return {"type": str(kind)}


def summarize_object(obj: dict) -> dict:
    kind = object_kind(obj)
    out: dict = {"id": obj.get("id"), "kind": kind, **box(obj)}
    if obj.get("name"):
        out["name"] = obj["name"]
    if obj.get("angle"):
        out["angle"] = obj["angle"]
    if obj.get("opacity") not in (None, 1):
        out["opacity"] = obj["opacity"]
    if obj.get("locked"):
        out["locked"] = True
    tag = read_field(obj.get("field"))
    if tag:
        out["field"] = tag
    if obj.get("visible") is False:
        out["visible"] = False
    if kind == "text":
        text = str(obj.get("text", ""))
        out["text"] = text if len(text) <= TEXT_PREVIEW else text[:TEXT_PREVIEW] + "…"
        out["font"] = primary_family(str(obj.get("fontFamily", "")))
        out["font_size"] = obj.get("fontSize")
        if obj.get("fontWeight") not in (None, 400, "normal"):
            out["font_weight"] = obj["fontWeight"]
        out["color"] = obj.get("fill")
        out["align"] = obj.get("textAlign")
        if obj.get("curveAmount"):
            out["curve"] = obj["curveAmount"]
        fit = read_fit(obj.get("fit"))
        if fit:
            out["fit"] = fit
    elif kind == "shape":
        out["shape"] = obj.get("shapeId") or obj.get("shapeKind") or obj.get("type")
        out["fill"] = obj.get("fill")
        if obj.get("stroke"):
            out["stroke"] = obj["stroke"]
    elif kind == "line":
        out["color"] = obj.get("stroke")
        for key in ("arrowStart", "arrowEnd"):
            if obj.get(key) not in (None, "none"):
                out[key] = obj[key]
    elif kind in ("image", "element"):
        if obj.get("src"):
            out["src"] = obj["src"]
        if obj.get("assetId"):
            out["asset_id"] = obj["assetId"]
        if isinstance(obj.get("maskShape"), str):
            out["mask"] = obj["maskShape"]
    elif kind == "qr":
        out["qr_text"] = (obj.get("qr") or {}).get("text")
    elif kind == "image-grid":
        spec = image_grid_spec(obj)
        assert spec is not None
        gap = finite_number(spec.get("gap"))
        if gap is None:
            gap = 8
        gap = min(64, max(0, round(gap, 3)))
        cell_ids = {cell["gridCellId"] for cell in spec["cells"]}
        children = obj.get("objects") if isinstance(obj.get("objects"), list) else []
        out.update(
            {
                "layout": spec["layoutId"],
                "gap": gap,
                "cells": len(spec["cells"]),
                "filled_cells": [
                    child.get("gridCellId")
                    for child in children
                    if isinstance(child, dict)
                    and isinstance(child.get("gridCellId"), str)
                    and child["gridCellId"] in cell_ids
                    and object_kind(child) == "image"
                ],
            }
        )
    elif kind == "group":
        children = obj.get("objects") if isinstance(obj.get("objects"), list) else []
        out["children"] = len(children)
        # For reference only: operations address the group as a whole until it is ungrouped.
        out["child_ids"] = [child.get("id") for child in children if isinstance(child, dict)]
    if isinstance(obj.get("effects"), dict) and obj["effects"]:
        out["effects"] = sorted("highlight" if key == "background" else key for key in obj["effects"])
    return out


def summarize_document(document: dict) -> dict:
    """Pages in order, each with its size, background and objects (bottom to top)."""
    width, height = document.get("width"), document.get("height")
    pages = []
    for number, page in enumerate(document.get("pages", []), start=1):
        entry: dict = {
            "number": number,
            "id": page.get("id"),
            "width": page.get("width") or width,
            "height": page.get("height") or height,
            "background": _background(page.get("background")),
            "objects": [summarize_object(obj) for obj in page.get("objects", []) if isinstance(obj, dict)],
        }
        if page.get("name"):
            entry["name"] = page["name"]
        if page.get("notes"):
            entry["notes"] = page["notes"]
        pages.append(entry)
    return {"width": width, "height": height, "unit": document.get("unit", "px"), "pages": pages}
