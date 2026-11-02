"""The server-side document toolkit (apps.designs.doc): builders, operations, geometry and summaries."""

from __future__ import annotations

import pytest
from django.conf import settings
from pydantic import TypeAdapter, ValidationError

from apps.designs.doc import builders, contract, groups
from apps.designs.doc.builders import Page
from apps.designs.doc.kinds import object_kind
from apps.designs.doc.ops import EditError, ImageSource, Operation, apply_ops, box, place
from apps.designs.doc.summary import summarize_document
from apps.designs.validators import validate_document

from .helpers import make_doc

OPS = TypeAdapter(list[Operation])
PAGE = Page(800, 600)


def image_grid(object_id: str = "grid") -> dict:
    return {
        "id": object_id,
        "type": "group",
        "left": 100,
        "top": 100,
        "width": 240,
        "height": 120,
        "scaleX": 1,
        "scaleY": 1,
        "imageGrid": {
            "version": 1,
            "layoutId": "two-columns",
            "gap": 8,
            "cells": [
                {"gridCellId": "cell-1", "x": 0, "y": 0, "width": 0.5, "height": 1},
                {"gridCellId": "cell-2", "x": 0.5, "y": 0, "width": 0.5, "height": 1},
            ],
        },
        "objects": [
            {
                "id": f"{object_id}-empty",
                "type": "rect",
                "gridCellId": "cell-1",
                "left": -60,
                "top": 0,
                "width": 116,
                "height": 120,
            },
            {
                "id": f"{object_id}-photo",
                "type": "image",
                "gridCellId": "cell-2",
                "src": "/media/assets/u/grid-photo.png",
                "left": 60,
                "top": 0,
                "width": 116,
                "height": 120,
            },
        ],
    }


class Resolver:
    def __init__(self):
        self.images = {
            "asset-1": ImageSource("/media/assets/u/asset-1.png", 400, 200, asset_id="asset-1", name="Logo"),
            "asset-square": ImageSource(
                "/media/assets/u/square.png", 400, 400, asset_id="asset-square", name="Square"
            ),
            "elem-1": ImageSource("/media/elements/star.svg", 100, 200, name="Star"),
            "https://img.example/hero.jpg": ImageSource(
                "/media/assets/u/hero.jpg", 600, 300, asset_id="asset-url", name="hero.jpg"
            ),
        }

    def image(self, *, asset_id=None, element_id=None, url=None):
        key = asset_id or element_id or url
        if key not in self.images:
            raise LookupError(f"There is no picture {key}.")
        return self.images[key]

    def remove_background(self, *, obj, model=None):
        if obj.get("id") == "bad-bg":
            raise LookupError("Background removal failed: provider unreachable.")
        return ImageSource("/media/assets/u/cutout.png", 400, 200, asset_id="asset-cutout", name="Cutout")

    def font_category(self, family):
        return {"Playfair Display": "serif"}.get(family)


def run(document, *ops):
    return apply_ops(document, OPS.validate_python(list(ops)), Resolver())


def valid(document):
    validate_document(document, max_bytes=settings.MAX_DESIGN_DOCUMENT_BYTES)
    return document


# ---------------------------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------------------------


def test_text_presets_scale_with_the_page_like_the_editor():
    heading = builders.build_text(PAGE, text="Hello world", preset="heading")
    # createTextbox(page 800 x 600, heading): width 72 % of the page, 36 px x textScale(600 / 559) → 39.
    assert heading["width"] == 576
    assert heading["fontSize"] == 39
    assert heading["fontWeight"] == 700
    assert heading["height"] == pytest.approx(44.07)  # one line: 39 x 1.13
    assert (heading["left"], heading["top"]) == (400, 300)  # centred by default


def test_text_height_counts_wrapped_lines():
    one = builders.build_text(PAGE, text="Hi", width=300, font_size=20)
    many = builders.build_text(PAGE, text="word " * 60, width=300, font_size=20)
    assert many["height"] > one["height"] * 5
    assert builders.estimate_text_lines("a\nb\nc", 1000, 20) == 3
    assert builders.estimate_text_lines("x" * 200, 100, 20) > 10  # an unbreakable word still wraps


def test_fonts_become_stacks_with_a_generic_fallback():
    assert builders.font_stack("Playfair Display", "serif") == '"Playfair Display", serif'
    assert builders.font_stack('"Caveat", cursive', "handwriting") == '"Caveat", cursive'
    assert builders.font_stack("Inter") == '"Inter", sans-serif'


def test_polygon_points_match_the_editor():
    # The editor's createPolygon(at, 100, 6) and createStar(at, 100, 5, 0.45).
    assert builders.regular_polygon_points(6) == [
        {"x": 50, "y": 0},
        {"x": 100, "y": 25},
        {"x": 100, "y": 75},
        {"x": 50, "y": 100},
        {"x": 0, "y": 75},
        {"x": 0, "y": 25},
    ]
    assert builders.star_points(5, 0.45)[1] == {"x": 63.906, "y": 35.154}


def test_lines_run_between_their_end_points():
    line = builders.build_line(x1=100, y1=100, x2=100, y2=300)
    assert (line["left"], line["top"], line["width"], line["angle"]) == (100, 200, 200, 90)


def test_images_fit_their_box_and_keep_their_proportions():
    image = builders.build_image(
        PAGE, src="/media/a.png", natural_width=400, natural_height=200, width=100, height=100
    )
    assert box(image) == {"x": 350, "y": 275, "width": 100, "height": 50}
    assert image["width"] == 400 and image["scaleX"] == image["scaleY"] == 0.25


def test_cover_fit_crops_to_the_frame_around_the_focal_point():
    # 400 x 400 image into a 200 x 100 frame: scale = 0.5, visible slice is 400 x 200.
    centred = builders.cover_fit((200, 100), 400, 400)
    assert centred == {"cropX": 0, "cropY": 100, "width": 400, "height": 200, "scaleX": 0.5, "scaleY": 0.5}
    top = builders.cover_fit({"width": 200, "height": 100}, 400, 400, focal=(0.5, 0.0))
    assert top["cropY"] == 0 and top["height"] == 200
    bottom = builders.cover_fit(Page(200, 100), 400, 400, focal=(0.5, 1.0))
    assert bottom["cropY"] == 200 and bottom["height"] == 200
    # 600 x 200 image into a 100 x 100 frame: scale = 0.5, visible slice is 200 x 200, 400 px horizontal slack.
    right = builders.cover_fit((100, 100), 600, 200, focal=(0.75, 0.5))
    assert right == {"cropX": 300, "cropY": 0, "width": 200, "height": 200, "scaleX": 0.5, "scaleY": 0.5}


def test_every_builder_makes_a_document_the_server_accepts():
    objects = [case["object"] for case in contract.build_fixture()]
    valid(make_doc(width=800, height=600, objects=objects))
    assert [object_kind(obj) for obj in objects] == [case["kind"] for case in contract.build_fixture()]


def test_the_frontend_fixture_is_up_to_date():
    if not contract.FIXTURE.exists():
        pytest.skip("the frontend sources are not part of this checkout")
    assert contract.FIXTURE.read_text() == contract.render_fixture(), (
        "Regenerate it: python -m apps.designs.doc.contract > " + str(contract.FIXTURE)
    )


# ---------------------------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------------------------


def test_box_and_place_respect_the_origin():
    left_top = {"left": 10, "top": 20, "width": 100, "height": 50}
    centred = {
        "left": 60,
        "top": 45,
        "width": 50,
        "height": 25,
        "scaleX": 2,
        "scaleY": 2,
        "originX": "center",
        "originY": "center",
    }
    assert box(left_top) == box(centred) == {"x": 10, "y": 20, "width": 100, "height": 50}
    place(centred, 0, 0)
    assert (centred["left"], centred["top"]) == (50, 25)


# ---------------------------------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------------------------------


def test_adding_objects_returns_their_ids_and_boxes():
    document = make_doc()
    outcome = run(
        document,
        {"op": "add_text", "text": "Title", "preset": "heading", "x": 40, "y": 30, "id": "title"},
        {
            "op": "add_shape",
            "shape": "rect",
            "x": 0,
            "y": 0,
            "width": 800,
            "height": 100,
            "fill": "#ffcc00",
            "index": 0,
        },
        {"op": "add_image", "asset_id": "asset-1", "width": 200},
        {"op": "add_qr_code", "text": "https://example.com", "size": 120, "x": 660, "y": 460},
        {"op": "add_line", "x1": 40, "y1": 120, "x2": 760, "y2": 120, "arrow_end": "triangle"},
    )
    objects = outcome.document["pages"][0]["objects"]
    assert [object_kind(obj) for obj in objects] == ["shape", "text", "image", "qr", "line"]
    assert outcome.results[0]["object_id"] == "title"
    assert outcome.results[0]["box"]["x"] == 40 and outcome.results[0]["box"]["y"] == 30
    assert outcome.results[2]["box"]["width"] == 200 and outcome.results[2]["box"]["height"] == 100
    assert objects[2]["assetId"] == "asset-1" and objects[2]["name"] == "Logo"
    assert document["pages"][0]["objects"] == []  # the input is never changed
    valid(outcome.document)


def test_fonts_get_their_catalogue_category():
    outcome = run(make_doc(), {"op": "add_text", "text": "Hi", "font_family": "Playfair Display"})
    assert outcome.document["pages"][0]["objects"][0]["fontFamily"] == '"Playfair Display", serif'


def test_updating_an_object_changes_only_what_was_sent():
    document = run(
        make_doc(), {"op": "add_text", "text": "Old", "x": 100, "y": 100, "width": 300, "id": "t"}
    ).document
    before = dict(document["pages"][0]["objects"][0])
    outcome = run(document, {"op": "update_object", "object_id": "t", "text": "New text", "color": "#112233"})
    after = outcome.document["pages"][0]["objects"][0]
    assert after["text"] == "New text" and after["fill"] == "#112233"
    assert after["fontFamily"] == before["fontFamily"] and after["width"] == before["width"]
    assert box(after)["x"] == pytest.approx(100)


def test_moving_and_resizing():
    document = run(
        make_doc(),
        {"op": "add_shape", "shape": "ellipse", "x": 0, "y": 0, "width": 100, "height": 100, "id": "e"},
        {"op": "add_image", "asset_id": "asset-1", "x": 0, "y": 0, "width": 400, "id": "img"},
    ).document
    outcome = run(
        document,
        {"op": "update_object", "object_id": "e", "x": 10, "y": 20, "width": 300},
        {"op": "update_object", "object_id": "img", "height": 50},
    )
    ellipse, image = outcome.document["pages"][0]["objects"]
    assert box(ellipse) == {"x": 10, "y": 20, "width": 300, "height": 100}
    assert ellipse["rx"] == 150
    assert box(image)["width"] == 100 and box(image)["height"] == 50  # proportions kept
    assert box(image)["x"] == 150  # resized around its centre (it was 0 → 400 wide)


def test_raw_props_can_be_set_and_removed():
    document = run(make_doc(), {"op": "add_text", "text": "Hi", "id": "t"}).document
    document["pages"][0]["objects"][0]["underline"] = True
    outcome = run(
        document,
        {
            "op": "update_object",
            "object_id": "t",
            "props": {"charSpacing": 200, "underline": None, "fontStyle": "italic", "flipX": True},
        },
    )
    obj = outcome.document["pages"][0]["objects"][0]
    assert obj["charSpacing"] == 200 and obj["fontStyle"] == "italic" and obj["flipX"] is True
    assert "underline" not in obj


@pytest.mark.parametrize(
    "props",
    [
        {"type": "rect"},
        {"id": "other"},
        {"src": "https://evil.example/x.png"},
        {"clipPath": {"type": "rect"}},
        {"objects": []},
        {"fill": "url(https://evil.example/x.svg)"},
        {"splitByGrapheme": None},
    ],
)
def test_props_outside_the_allowlist_are_refused(props):
    document = run(make_doc(), {"op": "add_image", "asset_id": "asset-1", "id": "i"}).document
    with pytest.raises(EditError, match="cannot be set through props"):
        run(document, {"op": "update_object", "object_id": "i", "props": props})


@pytest.mark.parametrize(
    "props",
    [
        {"charSpacing": "200"},
        {"charSpacing": True},
        {"flipX": 1},
        {"fontStyle": "bold"},
        {"textBackgroundColor": "url(javascript:alert(1))"},
        {"strokeDashArray": [1, -2]},
        {"strokeDashArray": [1] * 9},  # the typed `dash` takes at most 8
        {"lineHeight": 0},
        {"lineHeight": 11},  # the typed `line_height` allows 0 to 10
        {"lineHeight": -100_000},
    ],
)
def test_allowed_props_are_type_checked(props):
    document = run(make_doc(), {"op": "add_text", "text": "Hi", "id": "t"}).document
    with pytest.raises(EditError, match="Invalid value"):
        run(document, {"op": "update_object", "object_id": "t", "props": props})


def test_a_text_box_keeps_its_height_when_nothing_about_its_layout_changes():
    document = run(make_doc(), {"op": "add_text", "text": "Hi", "id": "t"}).document
    document["pages"][0]["objects"][0]["height"] = 300  # as measured by the editor
    outcome = run(document, {"op": "update_object", "object_id": "t", "opacity": 0.5, "color": "#ff0000"})
    assert outcome.document["pages"][0]["objects"][0]["height"] == 300
    outcome = run(document, {"op": "update_object", "object_id": "t", "x": 10, "props": {"flipX": True}})
    assert outcome.document["pages"][0]["objects"][0]["height"] == 300
    outcome = run(document, {"op": "update_object", "object_id": "t", "text": "Hello there"})
    assert outcome.document["pages"][0]["objects"][0]["height"] < 300  # re-estimated for the new text


def test_text_effects_and_curves_are_stored_like_the_editor_stores_them():
    document = run(
        make_doc(),
        {
            "op": "add_text",
            "text": "Sale",
            "id": "t",
            "curve": -150,
            "effects": {"outline": {"color": "#ff0000", "width": 3}, "highlight": {}, "shadow": {"blur": 4}},
        },
        {"op": "add_shape", "shape": "rect", "id": "r", "shadow": {"color": "#000000"}},
    ).document
    text, rect = document["pages"][0]["objects"]
    assert text["curveAmount"] == -150
    assert text["effects"] == {
        "shadow": {"color": "#00000066", "blur": 4, "offsetX": 4, "offsetY": 6},
        "outline": {"color": "#ff0000", "width": 3},
        "background": {"color": "#fde047"},
    }
    assert (text["stroke"], text["strokeWidth"], text["paintFirst"]) == ("#ff0000", 3, "stroke")
    assert text["textBackgroundColor"] == "#fde047"
    assert rect["effects"] == {"shadow": {"color": "#000000", "blur": 12, "offsetX": 4, "offsetY": 6}}
    valid(document)
    summary = summarize_document(document)["pages"][0]["objects"]
    assert summary[0]["curve"] == -150
    assert summary[0]["effects"] == ["highlight", "outline", "shadow"]

    cleared = run(
        document,
        {"op": "update_object", "object_id": "t", "effects": {}, "curve": 0},
        {"op": "update_object", "object_id": "r", "effects": {"shadow": {"blur": 20}}},
    ).document
    text, rect = cleared["pages"][0]["objects"]
    assert not {"effects", "curveAmount", "textBackgroundColor", "shadow"} & set(text)
    assert text["stroke"] is None and text["strokeWidth"] == 0  # the outline does not linger
    assert rect["effects"]["shadow"]["blur"] == 20


def test_effects_and_curves_only_go_where_the_editor_supports_them():
    document = run(
        make_doc(),
        {"op": "add_shape", "shape": "rect", "id": "r"},
        {"op": "add_image", "asset_id": "asset-1", "id": "img"},
    ).document
    for op, message in (
        ({"object_id": "r", "effects": {"glow": {}}}, "only take a shadow"),
        ({"object_id": "img", "effects": {"shadow": {}}}, "Only text and shapes"),
        ({"object_id": "r", "curve": 100}, "Only text can be curved"),
    ):
        with pytest.raises(EditError, match=message):
            run(document, {"op": "update_object", **op})
    with pytest.raises(ValidationError):
        OPS.validate_python([{"op": "add_text", "text": "x", "curve": 401}])


def test_catalogue_shapes_can_be_added_and_resized():
    document = run(
        make_doc(),
        {"op": "add_shape", "shape": "path", "path_shape": "heart", "x": 0, "y": 0, "width": 184, "id": "h"},
    ).document
    heart = document["pages"][0]["objects"][0]
    assert heart["type"] == "path" and heart["shapeId"] == "heart" and heart["path"][0] == ["M", 50, 90]
    assert box(heart) == {"x": 0, "y": 0, "width": 184, "height": pytest.approx(166)}  # proportions kept
    valid(document)
    assert summarize_document(document)["pages"][0]["objects"][0]["shape"] == "heart"
    stretched = run(document, {"op": "update_object", "object_id": "h", "height": 50}).document
    assert box(stretched["pages"][0]["objects"][0])["height"] == pytest.approx(50)
    for op in ({"shape": "path"}, {"shape": "rect", "path_shape": "heart"}):
        with pytest.raises(EditError, match="path_shape"):
            run(make_doc(), {"op": "add_shape", **op})
    with pytest.raises(ValidationError):
        OPS.validate_python([{"op": "add_shape", "shape": "path", "path_shape": "unicorn"}])


def test_pictures_can_be_masked_and_unmasked():
    document = run(
        make_doc(),
        {"op": "add_image", "asset_id": "asset-1", "id": "img", "mask": "rounded", "mask_radius": 0.3},
    ).document
    image = document["pages"][0]["objects"][0]
    assert (image["maskShape"], image["maskRadius"]) == ("rounded", 0.3)
    assert summarize_document(document)["pages"][0]["objects"][0]["mask"] == "rounded"
    hearted = run(document, {"op": "update_object", "object_id": "img", "mask": "heart"}).document
    image = hearted["pages"][0]["objects"][0]
    assert image["maskShape"] == "heart" and "maskRadius" not in image
    image["clipPath"] = {"type": "path"}  # as an editor-saved picture might carry
    plain = run(hearted, {"op": "update_object", "object_id": "img", "mask": "none"}).document
    assert not {"maskShape", "clipPath"} & set(plain["pages"][0]["objects"][0])
    text = run(make_doc(), {"op": "add_text", "text": "Hi", "id": "t"}).document
    with pytest.raises(EditError, match="can be masked"):
        run(text, {"op": "update_object", "object_id": "t", "mask": "circle"})


def test_replace_image_keeps_frame_mask_filters_effects_and_field_on_plain_and_masked_images():
    document = run(
        make_doc(),
        {
            "op": "add_image",
            "asset_id": "asset-1",
            "id": "img",
            "x": 50,
            "y": 60,
            "width": 200,
            "name": "Hero banner",
            "mask": "rounded",
            "mask_radius": 0.25,
        },
        {
            "op": "update_object",
            "object_id": "img",
            "angle": 15,
            "locked": True,
            "field": {"key": "hero", "type": "image", "label": "Hero"},
        },
    ).document
    img = document["pages"][0]["objects"][0]
    img["filters"] = [{"type": "brightness", "value": 0.2}]
    img["effects"] = {"shadow": {"color": "#00000066", "blur": 10, "offsetX": 2, "offsetY": 4}}
    img["link"] = {"url": "https://example.com"}
    img["animation"] = {"enter": {"preset": "fade", "duration": 500}}
    img["clipPath"] = {"type": "rect"}

    outcome = run(
        document,
        {"op": "replace_image", "object_id": "img", "asset_id": "asset-square", "focal": [0.5, 0.25]},
    )
    replaced = outcome.document["pages"][0]["objects"][0]
    # Frame stayed 200 x 100 at (50, 60); 400 x 400 square image was cropped to 400 x 200 around fy = 0.25.
    assert outcome.results[0] == {
        "op": "replace_image",
        "object_id": "img",
        "box": {"x": 50, "y": 60, "width": 200, "height": 100},
    }
    assert replaced["src"] == "/media/assets/u/square.png" and replaced["assetId"] == "asset-square"
    assert (replaced["cropX"], replaced["cropY"], replaced["width"], replaced["height"]) == (0, 50, 400, 200)
    assert replaced["scaleX"] == replaced["scaleY"] == 0.5
    assert replaced["angle"] == 15 and replaced["locked"] is True and replaced["name"] == "Hero banner"
    assert (replaced["maskShape"], replaced["maskRadius"]) == ("rounded", 0.25)
    assert "clipPath" not in replaced
    assert replaced["filters"] == [{"type": "brightness", "value": 0.2}]
    assert replaced["effects"]["shadow"]["blur"] == 10
    assert replaced["field"] == {"key": "hero", "type": "image", "label": "Hero"}
    assert replaced["link"] == {"url": "https://example.com"}
    assert replaced["animation"] == {"enter": {"preset": "fade", "duration": 500}}
    valid(outcome.document)

    # Replacing with a catalogue graphic (element_id) clears assetId; replacing with a URL sets assetId.
    elem_doc = run(
        outcome.document, {"op": "replace_image", "object_id": "img", "element_id": "elem-1"}
    ).document
    elem_obj = elem_doc["pages"][0]["objects"][0]
    assert elem_obj["src"] == "/media/elements/star.svg" and "assetId" not in elem_obj
    url_doc = run(
        elem_doc, {"op": "replace_image", "object_id": "img", "url": "https://img.example/hero.jpg"}
    ).document
    url_obj = url_doc["pages"][0]["objects"][0]
    assert url_obj["src"] == "/media/assets/u/hero.jpg" and url_obj["assetId"] == "asset-url"


def test_replace_image_fills_placeholders_and_updates_slots_with_rotation_and_focal_point():
    document = make_doc(
        objects=[
            {
                **builders.build_shape(PAGE, shape="ellipse", x=100, y=150, width=200, height=100),
                "id": "ph-oval",
                "isPlaceholder": True,
                "name": "Image placeholder",
                "angle": 90,
                "field": {"key": "avatar", "type": "image"},
            },
            {
                **builders.build_shape(
                    PAGE, shape="rect", x=400, y=100, width=100, height=100, corner_radius=20
                ),
                "id": "ph-rounded",
                "isPlaceholder": True,
            },
        ]
    )
    # 400 x 400 square image into a 200 x 100 oval tilted 90 deg, focal at top (fy = 0):
    # scale = 0.5, dy = +50 in local frame, which at 90 deg rotates to dx = -50 in page coordinates.
    outcome = run(
        document,
        {"op": "replace_image", "object_id": "ph-oval", "asset_id": "asset-square", "focal": [0.5, 0.0]},
        {"op": "replace_image", "object_id": "ph-rounded", "asset_id": "asset-1"},
    )
    oval, rounded = outcome.document["pages"][0]["objects"]
    assert object_kind(oval) == "image" and "isPlaceholder" not in oval and "fill" not in oval
    assert oval["slot"] == {"cx": 200, "cy": 200, "width": 200, "height": 100, "angle": 90, "mask": "circle"}
    assert (oval["left"], oval["top"], oval["angle"]) == (150, 200, 90)
    assert (oval["width"], oval["height"], oval["scaleX"], oval["scaleY"]) == (400, 400, 0.5, 0.5)
    assert oval["name"] == "Square"  # default "Image placeholder" name took the asset's name
    assert oval["field"] == {"key": "avatar", "type": "image"}
    assert outcome.results[0]["box"] == {"x": 100, "y": 150, "width": 200, "height": 100}

    # Replacing a slot picture again keeps the original slot frame intact.
    again = run(
        outcome.document,
        {"op": "replace_image", "object_id": "ph-oval", "asset_id": "asset-1", "focal": [0.5, 0.5]},
    ).document["pages"][0]["objects"][0]
    assert again["slot"] == oval["slot"]
    assert (again["left"], again["top"], again["scaleX"]) == (200, 200, 0.5)

    assert rounded["slot"]["mask"] == "rounded" and rounded["slot"]["radius"] == 0.2
    valid(outcome.document)


def test_replace_image_refuses_non_images_and_ambiguous_sources():
    document = run(
        make_doc(),
        {"op": "add_shape", "shape": "rect", "id": "r"},
        {"op": "add_image", "asset_id": "asset-1", "id": "img"},
    ).document
    with pytest.raises(EditError, match="Only pictures and photo placeholders"):
        run(document, {"op": "replace_image", "object_id": "r", "asset_id": "asset-1"})
    for bad in (
        {"op": "replace_image", "object_id": "img"},
        {"op": "replace_image", "object_id": "img", "asset_id": "asset-1", "element_id": "elem-1"},
        {
            "op": "replace_image",
            "object_id": "img",
            "asset_id": "asset-1",
            "url": "https://img.example/hero.jpg",
        },
    ):
        with pytest.raises(EditError, match="exactly one of asset_id, element_id and url"):
            run(document, bad)
    with pytest.raises(ValidationError):
        OPS.validate_python(
            [{"op": "replace_image", "object_id": "img", "asset_id": "asset-1", "focal": [1.5, 0]}]
        )


def test_image_grids_have_a_semantic_kind_and_summary():
    grid = image_grid()
    assert object_kind(grid) == "image-grid"
    document = valid(make_doc(objects=[grid]))
    summary = summarize_document(document)["pages"][0]["objects"][0]
    assert summary == {
        "id": "grid",
        "kind": "image-grid",
        "x": 100,
        "y": 100,
        "width": 240,
        "height": 120,
        "layout": "two-columns",
        "gap": 8,
        "cells": 2,
        "filled_cells": ["cell-2"],
    }

    malformed = image_grid("malformed")
    malformed["imageGrid"]["cells"][1]["x"] = 0.25  # overlaps cell 1
    assert object_kind(malformed) == "group"

    oversized_coordinate = image_grid("oversized-coordinate")
    oversized_coordinate["imageGrid"]["cells"][0]["x"] = 10**1_000
    assert object_kind(oversized_coordinate) == "group"

    oversized_gap = image_grid("oversized-gap")
    oversized_gap["imageGrid"]["gap"] = 10**1_000
    oversized_summary = summarize_document(valid(make_doc(objects=[oversized_gap])))["pages"][0]["objects"][0]
    assert oversized_summary["kind"] == "image-grid"
    assert oversized_summary["gap"] == 8


def test_a_grid_child_with_an_odd_cell_id_does_not_break_the_summary():
    grid = image_grid()
    grid["objects"][0]["gridCellId"] = ["cell-1"]
    summary = summarize_document(make_doc(objects=[grid]))["pages"][0]["objects"][0]
    assert summary["filled_cells"] == ["cell-2"]


def test_image_grids_cannot_be_grouped_or_ungrouped():
    shape = builders.build_shape(PAGE, shape="rect", width=100, height=80)
    shape["id"] = "shape"
    document = make_doc(
        objects=[
            image_grid(),
            shape,
        ]
    )
    with pytest.raises(EditError, match="Image grids cannot be grouped"):
        run(document, {"op": "group_objects", "object_ids": ["grid", "shape"]})
    with pytest.raises(EditError, match="Image grids cannot be ungrouped"):
        run(document, {"op": "ungroup", "object_id": "grid"})
    with pytest.raises(EditError, match="only be resized in the editor"):
        run(document, {"op": "update_object", "object_id": "grid", "width": 320})

    moved = run(document, {"op": "update_object", "object_id": "grid", "x": 250, "angle": 15}).document
    grid = moved["pages"][0]["objects"][0]
    assert box(grid)["x"] == 250 and grid["angle"] == 15


def test_objects_can_be_grouped_and_ungrouped_where_they_are():
    document = run(
        make_doc(),
        {"op": "add_shape", "shape": "rect", "id": "a", "x": 100, "y": 100, "width": 100, "height": 50},
        {"op": "add_text", "text": "Between", "id": "between"},
        {"op": "add_shape", "shape": "ellipse", "id": "b", "x": 300, "y": 200, "width": 80, "height": 80},
    ).document
    before = {obj["id"]: box(obj) for obj in document["pages"][0]["objects"]}
    outcome = run(document, {"op": "group_objects", "object_ids": ["b", "a"], "id": "g", "name": "Logo"})
    objects = outcome.document["pages"][0]["objects"]
    assert [obj["id"] for obj in objects] == ["g", "between"]  # the group takes the lowest child's place
    group = objects[0]
    assert [child["id"] for child in group["objects"]] == ["a", "b"]  # stacking order kept
    assert box(group) == {"x": 100, "y": 100, "width": 280, "height": 180}
    valid(outcome.document)
    summary = summarize_document(outcome.document)["pages"][0]["objects"][0]
    assert summary["kind"] == "group" and summary["child_ids"] == ["a", "b"]
    for op in (
        {"op": "update_object", "object_id": "a", "opacity": 0.5},
        {"op": "delete_objects", "object_ids": ["b"]},
    ):
        with pytest.raises(EditError, match="inside the group 'g': ungroup it first"):
            run(outcome.document, op)

    ungrouped = run(outcome.document, {"op": "ungroup", "object_id": "g"}).document
    objects = ungrouped["pages"][0]["objects"]
    assert [obj["id"] for obj in objects] == ["a", "b", "between"]
    for obj in objects:
        assert box(obj) == pytest.approx(before[obj["id"]])


def test_group_bounds_match_fabric():
    # Measured in the editor: `new Group([rect, text])` of these two is 373.8013 x 183.4063 around
    # (313.5994, 218.4019). The text has no strokeWidth, so Fabric's default of 1 counts.
    rect = {
        "type": "rect", "originX": "center", "originY": "center", "left": 200, "top": 200, "width": 100,
        "height": 100, "angle": 30, "strokeWidth": 10, "strokeUniform": True,
    }  # fmt: skip
    text = {
        "type": "textbox", "originX": "center", "originY": "center", "left": 400, "top": 300, "width": 200,
        "height": 19.21, "strokeUniform": True,
    }  # fmt: skip
    group = groups.group([rect, text], "g")
    assert (group["left"], group["top"]) == pytest.approx((313.5994, 218.4019), abs=1e-4)
    assert (group["width"], group["height"]) == pytest.approx((373.8013, 183.4063), abs=1e-4)
    assert (rect["left"], rect["top"]) == pytest.approx((-113.5994, -18.4019), abs=1e-4)


def test_grouping_is_explained_when_it_cannot_be_done():
    document = run(
        make_doc(pages=2),
        {"op": "add_shape", "shape": "rect", "id": "a"},
        {"op": "add_shape", "shape": "rect", "id": "b", "page": 2},
        {"op": "add_shape", "shape": "rect", "id": "c"},
    ).document
    for op, message in (
        ({"op": "group_objects", "object_ids": ["a", "b"]}, "same page"),
        ({"op": "group_objects", "object_ids": ["a", "a"]}, "two different"),
        ({"op": "group_objects", "object_ids": ["a", "nope"]}, "no object"),
        ({"op": "ungroup", "object_id": "a"}, "not a group"),
        ({"op": "group_objects", "object_ids": ["a", "c"], "id": "c"}, "already used"),
    ):
        with pytest.raises(EditError, match=message):
            run(document, op)
    grouped = run(document, {"op": "group_objects", "object_ids": ["a", "c"], "id": "g"}).document
    grouped["pages"][0]["objects"][0]["scaleX"] = 2  # stretched in the editor
    with pytest.raises(EditError, match="stretched"):
        run(grouped, {"op": "ungroup", "object_id": "g"})
    with pytest.raises(EditError, match="already used"):
        run(grouped, {"op": "add_text", "text": "x", "id": "a"})  # children's ids stay taken


def test_text_height_cannot_be_set():
    document = run(make_doc(), {"op": "add_text", "text": "Hi", "id": "t"}).document
    with pytest.raises(EditError, match="follows from its text"):
        run(document, {"op": "update_object", "object_id": "t", "height": 10})


def test_shrink_to_fit_steps_font_size_down_without_growing_the_box():
    document = run(
        make_doc(),
        {"op": "add_text", "text": "Title", "preset": "heading", "width": 360, "font_size": 60, "id": "t"},
        {"op": "add_shape", "shape": "rect", "id": "r"},
    ).document
    box_height = document["pages"][0]["objects"][0]["height"]
    fitted = run(
        document,
        {"op": "update_object", "object_id": "t", "fit": {"mode": "shrink", "minFontSize": 24}},
        {"op": "update_object", "object_id": "t", "text": "Summer Music Festival Live"},
    ).document
    text = fitted["pages"][0]["objects"][0]
    assert text["height"] == box_height
    assert text["fontSize"] == 60
    assert text["fit"] == {"mode": "shrink", "minFontSize": 24}
    assert 24 <= text["fitFontSize"] < 60
    valid(fitted)
    summary = summarize_document(fitted)["pages"][0]["objects"][0]
    assert summary["fit"] == {"mode": "shrink", "minFontSize": 24}

    cleared = run(fitted, {"op": "update_object", "object_id": "t", "fit": "none"}).document
    unfitted = cleared["pages"][0]["objects"][0]
    assert "fit" not in unfitted and "fitFontSize" not in unfitted
    assert unfitted["height"] > box_height

    # Out-of-range stored fontSize is ignored by apply_fit / fit_font_size rather than spinning.
    huge = dict(document["pages"][0]["objects"][0], fontSize=200_000)
    builders.apply_fit(huge, {"mode": "shrink"})
    assert "fit" not in huge and "fitFontSize" not in huge
    assert builders.fit_font_size("x" * 1000, 100, 50, 200_000, min_font_size=4) == 4

    with pytest.raises(EditError, match="Only text can shrink to fit"):
        run(document, {"op": "update_object", "object_id": "r", "fit": {"mode": "shrink"}})


def test_arranging_and_deleting():
    document = run(
        make_doc(),
        {"op": "add_shape", "shape": "rect", "id": "a"},
        {"op": "add_shape", "shape": "rect", "id": "b"},
        {"op": "add_shape", "shape": "rect", "id": "c"},
    ).document
    ids = lambda doc: [o["id"] for o in doc["pages"][0]["objects"]]  # noqa: E731
    assert ids(run(document, {"op": "arrange_object", "object_id": "a", "to": "front"}).document) == [
        "b",
        "c",
        "a",
    ]
    assert ids(run(document, {"op": "arrange_object", "object_id": "c", "to": "back"}).document) == [
        "c",
        "a",
        "b",
    ]
    assert ids(run(document, {"op": "arrange_object", "object_id": "a", "to": "forward"}).document) == [
        "b",
        "a",
        "c",
    ]
    assert ids(run(document, {"op": "delete_objects", "object_ids": ["a", "c"]}).document) == ["b"]
    with pytest.raises(EditError, match="no object"):
        run(document, {"op": "delete_objects", "object_ids": ["a", "zzz"]})


def test_pages_can_be_added_moved_and_deleted():
    document = make_doc(pages=2)
    first, second = (page["id"] for page in document["pages"])
    outcome = run(
        document,
        {"op": "add_page", "after": 1, "id": "middle", "background_color": "#000000"},
        {"op": "add_page", "width": 1080, "height": 1920, "id": "story"},
        {"op": "move_page", "page": "story", "to_number": 1},
        {"op": "delete_page", "page": second},
        {"op": "add_text", "text": "On the story page", "page": 1},
    )
    pages = outcome.document["pages"]
    assert [page["id"] for page in pages] == ["story", first, "middle"]
    assert (pages[0]["width"], pages[0]["height"]) == (1080, 1920)
    assert "width" not in pages[2]  # same size as the design
    assert pages[0]["objects"][0]["left"] == 540  # centred on its own page size
    valid(outcome.document)


def test_the_last_page_cannot_be_deleted_and_bad_page_refs_are_explained():
    with pytest.raises(EditError, match="at least one page"):
        run(make_doc(), {"op": "delete_page", "page": 1})
    with pytest.raises(EditError, match="no page 3"):
        run(make_doc(pages=2), {"op": "add_text", "text": "x", "page": 3})
    with pytest.raises(EditError, match="no page with id"):
        run(make_doc(), {"op": "set_notes", "page": "nope", "notes": "x"})
    with pytest.raises(EditError, match="no page with id"):
        run(make_doc(), {"op": "set_notes", "page": "\u00b2", "notes": "x"})  # "²" passes isdigit()
    assert run(make_doc(pages=2), {"op": "set_notes", "page": "2", "notes": "x"}).document["pages"][1][
        "notes"
    ]


def test_the_page_limit_is_the_callers():
    document = make_doc(pages=2)
    ops = OPS.validate_python([{"op": "add_page"}])
    with pytest.raises(EditError, match="at most 2 pages"):
        apply_ops(document, ops, Resolver(), max_pages=2)
    assert len(apply_ops(document, ops, Resolver(), max_pages=3).document["pages"]) == 3


def test_backgrounds_and_notes():
    outcome = run(
        make_doc(pages=3),
        {"op": "set_background", "page": 1, "color": "#101010"},
        {
            "op": "set_background",
            "page": 2,
            "gradient": [{"offset": 0, "color": "#ff0000"}, {"offset": 1, "color": "#0000ff"}],
        },
        {"op": "set_background", "page": 3, "asset_id": "asset-1", "fit": "contain"},
        {"op": "set_notes", "notes": "Say hello"},
    )
    pages = outcome.document["pages"]
    assert pages[0]["background"] == {"type": "solid", "color": "#101010"}
    assert pages[1]["background"]["type"] == "gradient" and len(pages[1]["background"]["stops"]) == 2
    assert pages[2]["background"] == {"type": "image", "src": "/media/assets/u/asset-1.png", "fit": "contain"}
    assert pages[0]["notes"] == "Say hello"
    valid(outcome.document)
    with pytest.raises(EditError, match="exactly one"):
        run(make_doc(), {"op": "set_background", "color": "#fff", "asset_id": "asset-1"})


def test_ids_must_be_new_and_well_formed():
    document = run(make_doc(), {"op": "add_text", "text": "x", "id": "t"}).document
    with pytest.raises(EditError, match="already used"):
        run(document, {"op": "add_shape", "shape": "rect", "id": "t"})
    with pytest.raises(EditError, match="may only hold"):
        run(document, {"op": "add_shape", "shape": "rect", "id": "has space"})


def test_a_failing_operation_names_itself_and_nothing_is_applied():
    document = make_doc()
    with pytest.raises(EditError) as raised:
        run(document, {"op": "add_text", "text": "fine"}, {"op": "add_image", "asset_id": "missing"})
    assert (
        raised.value.index == 1 and "Operation 2" in str(raised.value) and "no picture" in str(raised.value)
    )
    assert document["pages"][0]["objects"] == []


def test_operation_inputs_are_validated():
    with pytest.raises(ValidationError):
        OPS.validate_python([{"op": "add_text", "text": "x", "color": "url(javascript:alert(1))"}])
    with pytest.raises(ValidationError):
        OPS.validate_python([{"op": "explode"}])
    with pytest.raises(ValidationError):
        OPS.validate_python([{"op": "add_shape", "shape": "rect", "unknown": 1}])


# ---------------------------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------------------------


def test_the_summary_lists_what_is_where():
    document = run(
        make_doc(width=800, height=600),
        {
            "op": "add_text",
            "text": "Hello",
            "preset": "heading",
            "x": 10,
            "y": 10,
            "font_family": "Playfair Display",
        },
        {"op": "add_shape", "shape": "star", "fill": "#ff0", "x": 0, "y": 0, "width": 50, "height": 50},
        {"op": "add_page", "background_color": "#000000"},
    ).document
    summary = summarize_document(document)
    assert [page["number"] for page in summary["pages"]] == [1, 2]
    text, star = summary["pages"][0]["objects"]
    assert text["kind"] == "text" and text["text"] == "Hello" and text["font"] == "Playfair Display"
    assert (text["x"], text["y"]) == (10, 10)
    assert star == {
        "id": star["id"],
        "kind": "shape",
        "x": 0,
        "y": 0,
        "width": 50,
        "height": 50,
        "shape": "star",
        "fill": "#ff0",
    }
    assert summary["pages"][1]["background"] == {"type": "solid", "color": "#000000"}


def test_remove_background_replaces_image_in_place_and_refuses_non_images():
    document = run(
        make_doc(),
        {"op": "add_image", "asset_id": "asset-1", "id": "hero", "x": 50, "y": 60, "width": 200},
        {"op": "add_text", "text": "Hello", "id": "text-1"},
    ).document

    outcome = run(document, {"op": "remove_background", "object_id": "hero"})
    assert outcome.results[0] == {
        "op": "remove_background",
        "object_id": "hero",
        "box": {"x": 50, "y": 60, "width": 200, "height": 100},
    }
    replaced = outcome.document["pages"][0]["objects"][0]
    assert replaced["src"] == "/media/assets/u/cutout.png"
    assert replaced["assetId"] == "asset-cutout"

    with pytest.raises(EditError, match="Only pictures can have their background removed"):
        run(document, {"op": "remove_background", "object_id": "text-1"})

    document["pages"][0]["objects"][0]["id"] = "bad-bg"
    with pytest.raises(EditError, match="provider unreachable"):
        run(document, {"op": "remove_background", "object_id": "bad-bg"})
