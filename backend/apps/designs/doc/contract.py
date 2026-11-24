"""The cases the frontend checks the builders against (`backendBuilders.test.ts`).

Each case is an object built here, the kind the editor must recognise it as and, where the editor has a
factory that makes the same object, the factory call. The frontend loads every object through the real
engine and checks it survives unchanged and, for factory cases, comes out exactly like the editor's own.

Regenerate the fixture after changing a builder:

    python -m apps.designs.doc.contract > ../frontend/src/editor/engine/fixtures/backend-builders.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import cast

from . import builders, groups, ops
from .builders import Page

FIXTURE = Path(__file__).resolve().parents[4] / "frontend/src/editor/engine/fixtures/backend-builders.json"
PAGE = Page(800, 600)


def _cases() -> list[dict]:
    return [
        {
            "name": "heading text",
            "kind": "text",
            "factory": {"fn": "createTextbox", "opts": {"text": "Hello world", "preset": "heading"}},
            "object": builders.build_text(PAGE, text="Hello world", preset="heading"),
        },
        {
            "name": "styled body text",
            "kind": "text",
            "factory": {
                "fn": "createTextbox",
                "opts": {
                    "text": "Summer sale on everything",
                    "preset": "body",
                    "width": 300,
                    "fontFamily": '"Playfair Display", serif',
                    "fontSize": 28,
                    "fontWeight": 600,
                    "fill": "#ff0000",
                    "textAlign": "left",
                },
            },
            "object": builders.build_text(
                PAGE,
                text="Summer sale on everything",
                x=250,
                width=300,
                font_family="Playfair Display",
                font_category="serif",
                font_size=28,
                font_weight=600,
                color="#ff0000",
                align="left",
            ),
            # The factory centres on the page; this one only fixes x, so its top is the estimate's.
            "ignore": ["top"],
        },
        {
            "name": "rounded rectangle",
            "kind": "shape",
            "factory": {"fn": "createRect", "size": 120, "radius": 12},
            "object": builders.build_shape(PAGE, shape="rect", width=120, height=120, corner_radius=12),
        },
        {
            "name": "circle",
            "kind": "shape",
            "factory": {"fn": "createEllipse", "size": 90},
            "object": builders.build_shape(PAGE, shape="ellipse", width=90, height=90),
        },
        {
            "name": "triangle",
            "kind": "shape",
            "factory": {"fn": "createTriangle", "size": 80},
            "object": builders.build_shape(PAGE, shape="triangle", width=80),
        },
        {
            "name": "hexagon",
            "kind": "shape",
            "factory": {"fn": "createPolygon", "size": 100, "sides": 6},
            "object": builders.build_shape(PAGE, shape="polygon", width=100, height=100, sides=6),
        },
        {
            "name": "star",
            "kind": "shape",
            "factory": {"fn": "createStar", "size": 150, "points": 7, "innerRatio": 0.4},
            "object": builders.build_shape(
                PAGE, shape="star", width=150, height=150, star_tips=7, inner_ratio=0.4
            ),
        },
        {
            "name": "stretched octagon with a border",
            "kind": "shape",
            "object": builders.build_shape(
                PAGE,
                shape="polygon",
                x=10,
                y=20,
                width=300,
                height=120,
                sides=8,
                stroke="#000000",
                stroke_width=4,
            ),
        },
        {
            "name": "arrow",
            "kind": "line",
            "factory": {"fn": "createLine", "opts": {"length": 200, "arrowEnd": "triangle"}},
            "object": builders.build_line(x1=300, y1=300, x2=500, y2=300, arrow_end="triangle"),
        },
        {
            "name": "dashed diagonal line",
            "kind": "line",
            "object": builders.build_line(x1=0, y1=0, x2=300, y2=400, color="#3366ff", width=3, dash=[12, 6]),
        },
        {
            "name": "image",
            "kind": "image",
            # The test's image stub decodes every picture as 10 x 10 pixels.
            "factory": {"fn": "createImage", "src": "/media/assets/a/b.png", "fit": 100},
            "object": builders.build_image(
                PAGE, src="/media/assets/a/b.png", natural_width=10, natural_height=10, width=100, height=100
            ),
        },
        {
            "name": "uploaded photo",
            "kind": "image",
            "object": builders.build_image(
                PAGE,
                src="https://cdn.example.com/photo.jpg",
                natural_width=10,
                natural_height=10,
                x=0,
                y=0,
                width=800,
                asset_id="0b5e7a46-6f1e-4cf0-9f0e-6b3cf7f1d001",
                name="Beach",
            ),
        },
        {
            "name": "photo cropped to a heart",
            "kind": "image",
            "object": _masked(
                builders.build_image(
                    PAGE,
                    src="/media/assets/a/b.png",
                    natural_width=10,
                    natural_height=10,
                    width=100,
                    height=100,
                ),
                "heart",
            ),
            "expect": {"clipPath": True},
        },
        {
            "name": "photo with rounded corners",
            "kind": "image",
            "object": _masked(
                builders.build_image(
                    PAGE,
                    src="/media/assets/a/b.png",
                    natural_width=10,
                    natural_height=10,
                    width=100,
                    height=100,
                ),
                "rounded",
                0.3,
            ),
            "expect": {"clipPath": True},
        },
        {
            "name": "replaced masked photo",
            "kind": "image",
            "object": builders.replace_image(
                _masked(
                    builders.build_image(
                        PAGE,
                        src="/media/assets/a/old.png",
                        natural_width=20,
                        natural_height=10,
                        width=200,
                        height=100,
                    ),
                    "rounded",
                    0.2,
                ),
                src="/media/assets/a/new.png",
                natural_width=10,
                natural_height=10,
                asset_id="0b5e7a46-6f1e-4cf0-9f0e-6b3cf7f1d002",
                name="Portrait",
                focal=(0.5, 0.2),
            ),
            "expect": {"clipPath": True},
        },
        {
            "name": "photo filling a placeholder slot",
            "kind": "image",
            "object": builders.replace_image(
                {
                    **builders.build_shape(PAGE, shape="rect", width=200, height=100),
                    "isPlaceholder": True,
                    "maskShape": "circle",
                    "name": "Image placeholder",
                },
                src="/media/assets/a/new.png",
                natural_width=10,
                natural_height=10,
                asset_id="0b5e7a46-6f1e-4cf0-9f0e-6b3cf7f1d002",
                name="Portrait",
                focal=(0.5, 0.2),
            ),
            "expect": {"clipPath": True},
        },
        {
            "name": "qr code",
            "kind": "qr",
            "object": builders.build_qr(PAGE, text="https://doory.example/menu", size=200),
        },
        *(
            {
                "name": f"{shape_id} shape",
                "kind": "shape",
                "factory": {
                    "fn": "createPathShape",
                    "shapeId": shape_id,
                    "size": builders.default_shape_size(PAGE),
                },
                "object": builders.build_shape(PAGE, shape="path", path_shape=shape_id),
            }
            for shape_id in builders.PATH_SHAPES
        ),
        {
            "name": "stretched heart with a border",
            "kind": "shape",
            "object": builders.build_shape(
                PAGE,
                shape="path",
                path_shape="heart",
                x=10,
                y=20,
                width=300,
                height=120,
                stroke="#000",
                stroke_width=4,
            ),
        },
        {
            "name": "group of a rotated rectangle with a border and a circle",
            "kind": "group",
            "factory": {"fn": "createGroup", "children": [_RECT_FACTORY, _CIRCLE_FACTORY]},
            "object": groups.group([_rect(), _circle()], "group"),
        },
        {
            "name": "rotated, scaled group, ungrouped",
            "kind": "group",
            "object": _transformed_group(),
            "ungrouped": groups.ungroup(_transformed_group()),
        },
        {
            "name": "text with effects",
            "kind": "text",
            "object": _with_effects(
                builders.build_text(PAGE, text="Glow up", preset="heading"),
                {
                    "glow": {"color": "#7a64e0", "blur": 18},
                    "outline": {"color": "#ff0000", "width": 3},
                    "background": {"color": "#fde047"},
                },
                text=True,
            ),
            # What the editor must have drawn once the object is loaded.
            "expect": {"shadow": True, "stroke": "#ff0000", "textBackgroundColor": "#fde047"},
        },
        {
            "name": "curved text",
            "kind": "text",
            "object": _curved(builders.build_text(PAGE, text="Curved", preset="heading"), -150),
            "expect": {"path": True},
        },
        {
            "name": "shrink-to-fit short text",
            "kind": "text",
            "object": _fitted(
                builders.build_text(PAGE, text="Short headline", preset="heading", width=400),
                {"mode": "shrink"},
            ),
        },
        {
            "name": "shrink-to-fit long text",
            "kind": "text",
            "object": _fitted(
                builders.build_text(PAGE, text="Title", preset="heading", width=360, font_size=60),
                {"mode": "shrink", "minFontSize": 24},
                text="Summer Music Festival Live",
            ),
        },
        {
            "name": "shrink-to-fit overflowing text",
            "kind": "text",
            "object": _fitted(
                builders.build_text(PAGE, text="Title", preset="heading", width=240),
                {"mode": "shrink", "minFontSize": 24},
                text="Registration for the annual neighbourhood summer block party is open all week",
            ),
        },
        {
            "name": "shape with a shadow",
            "kind": "shape",
            "object": _with_effects(
                builders.build_shape(PAGE, shape="rect", width=120, height=80),
                {"shadow": {"color": "#00000066", "blur": 12, "offsetX": 4, "offsetY": 6}},
                text=False,
            ),
            "expect": {"shadow": True},
        },
        {
            "name": "stroked quadratic path placed inside a padded view box",
            "kind": "shape",
            "object": _vector(
                name="Ribbon arch",
                view_box=[-20, -10, 100, 80],
                x=120,
                y=130,
                width=200,
                paths=[
                    {
                        "name": "Ribbon arch",
                        "commands": [["M", -10, 50], ["Q", 10, 10, 30, 50]],
                        "fill": None,
                        "stroke": "#0c4a6e",
                        "stroke_width": 3,
                    }
                ],
            ),
            # At 2x the quadratic's centerline spans (140, 210) to (220, 250); the stroke adds 3 px per side.
            "vectorPaths": [
                {
                    "name": "Ribbon arch",
                    "move": [140, 250],
                    "bounds": {"left": 137, "top": 207, "width": 86, "height": 46},
                    "fill": None,
                    "stroke": "#0c4a6e",
                    "strokeWidth": 6,
                    "fillRule": "nonzero",
                }
            ],
        },
        {
            "name": "layered vector paths keep their colors, order and shared view box",
            "kind": "group",
            "object": _vector(
                name="Two-color mark",
                view_box=[10, -20, 100, 100],
                x=350,
                y=100,
                width=200,
                paths=[
                    {
                        "name": "Amber base",
                        "commands": [["M", 20, 0], ["L", 60, 0], ["L", 60, 40], ["L", 20, 40], ["Z"]],
                        "fill": "#f59e0b",
                    },
                    {
                        "name": "Blue crest",
                        "commands": [
                            ["M", 40, 10],
                            ["C", 50, -30, 80, -30, 90, 10],
                            ["L", 90, 30],
                            ["L", 40, 30],
                            ["Z"],
                        ],
                        "fill": "#2563eb",
                        "fill_rule": "evenodd",
                    },
                ],
            ),
            # The cubic reaches y=-20 halfway through, at the top of the shared view box.
            "vectorPaths": [
                {
                    "name": "Amber base",
                    "move": [370, 140],
                    "bounds": {"left": 370, "top": 140, "width": 80, "height": 80},
                    "fill": "#f59e0b",
                    "stroke": None,
                    "strokeWidth": 0,
                    "fillRule": "nonzero",
                },
                {
                    "name": "Blue crest",
                    "move": [410, 160],
                    "bounds": {"left": 410, "top": 100, "width": 100, "height": 100},
                    "fill": "#2563eb",
                    "stroke": None,
                    "strokeWidth": 0,
                    "fillRule": "evenodd",
                },
            ],
        },
    ]


_RECT_FACTORY = {
    "fn": "createRect",
    "size": 120,
    "radius": 12,
    "set": {"left": 250, "top": 200, "angle": 30, "stroke": "#000000", "strokeWidth": 6},
}
_CIRCLE_FACTORY = {"fn": "createEllipse", "size": 90, "set": {"left": 500, "top": 380}}


def _rect() -> dict:
    obj = builders.build_shape(PAGE, shape="rect", width=120, height=120, corner_radius=12)
    obj.update(_RECT_FACTORY["set"], id="child-rect")
    return obj


def _circle() -> dict:
    obj = builders.build_shape(PAGE, shape="ellipse", width=90, height=90)
    obj.update(_CIRCLE_FACTORY["set"], id="child-circle")
    return obj


def _transformed_group() -> dict:
    grouped = groups.group([_rect(), _circle()], "group")
    grouped.update(angle=45, scaleX=1.5, scaleY=1.5)
    return grouped


def _vector(**fields) -> dict:
    doc = {"width": PAGE.width, "height": PAGE.height, "pages": [{"id": "fixture-page", "objects": []}]}
    operation = ops.AddVector.model_validate({"op": "add_vector", **fields})
    # A vector edit only uses inline geometry, so there are no resources for a resolver to look up.
    obj = ops.apply_ops(doc, [operation], cast(ops.Resolver, None)).document["pages"][0]["objects"][0]
    if obj["type"] == "group":
        for index, child in enumerate(obj["objects"], start=1):
            child["id"] = f"vector-path-{index}"
    return obj


def _with_effects(obj: dict, effects: dict, *, text: bool) -> dict:
    builders.apply_effects(obj, effects, text=text)
    return obj


def _masked(obj: dict, shape: str, radius: float | None = None) -> dict:
    builders.apply_mask(obj, shape, radius)
    return obj


def _curved(obj: dict, amount: float) -> dict:
    builders.apply_curve(obj, amount)
    return obj


def _fitted(obj: dict, fit: dict, *, text: str | None = None) -> dict:
    builders.apply_fit(obj, fit)
    if text is not None:
        obj["text"] = text
        builders.apply_fit(obj, fit)
    return obj


def build_fixture() -> list[dict]:
    """The cases with stable ids (builders make random ones)."""
    cases = _cases()
    for number, case in enumerate(cases, start=1):
        case["object"]["id"] = f"case-{number}"
    return cases


def render_fixture() -> str:
    return json.dumps(build_fixture(), indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    sys.stdout.write(render_fixture())
