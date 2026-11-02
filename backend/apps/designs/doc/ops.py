"""Edits to a `DoryDocument` as a list of typed operations, applied all or nothing.

The operation models double as the JSON schema agents see (the MCP `edit_design` tool), so their field
descriptions are written for them. `apply_ops` is a pure function: anything that needs the database (the size
of an uploaded image, a font's category) comes from the `Resolver` the caller passes in.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter
from pydantic import ValidationError as PydanticValidationError

from . import builders, groups
from .builders import Page
from .fields import KIND_TYPES, FieldTag, TextFit, duplicate_keys, read_fit
from .kinds import contains_image_grid, object_kind

MAX_OPS = 200
MAX_PAGES = 100  # the default; callers pass the server's `MAX_DESIGN_PAGES`
MAX_TEXT_LENGTH = 20_000
COLOR_PATTERN = r"^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s]+\)|[a-zA-Z]{3,30}|transparent)$"

Color = Annotated[str, StringConstraints(pattern=COLOR_PATTERN, max_length=64)]
ObjectId = Annotated[str, StringConstraints(min_length=1, max_length=64)]
Coordinate = Annotated[float, Field(ge=-100_000, le=100_000)]
Length = Annotated[float, Field(gt=0, le=100_000)]

# The raw properties `update_object.props` may set, each with the type its value must have. Anything else
# (`src`, `clipPath`, `objects`, `fill`, ...) is refused: those go through typed fields, or not at all, so
# props cannot bypass the resolver's asset allowlist or the typed checks.
_Number = Annotated[float, Field(ge=-100_000, le=100_000)]
PROPS: dict[str, TypeAdapter] = {
    **{
        key: TypeAdapter(_Number) for key in ("charSpacing", "skewX", "skewY", "rx", "ry", "strokeDashOffset")
    },
    "lineHeight": TypeAdapter(Annotated[float, Field(gt=0, le=10)]),  # the same range as the typed field
    **{
        key: TypeAdapter(bool)
        for key in ("flipX", "flipY", "underline", "linethrough", "overline", "strokeUniform")
    },
    **{key: TypeAdapter(Color) for key in ("textBackgroundColor", "backgroundColor")},
    "fontStyle": TypeAdapter(Literal["normal", "italic", "oblique"]),
    "strokeLineCap": TypeAdapter(Literal["butt", "round", "square"]),
    "strokeLineJoin": TypeAdapter(Literal["miter", "round", "bevel"]),
    "strokeDashArray": TypeAdapter(
        Annotated[list[Annotated[float, Field(ge=0, le=1000)]], Field(max_length=8)]  # as the typed `dash`
    ),
}
# Props that change how text lays out, so its box height has to be estimated again.
TEXT_LAYOUT_PROPS = frozenset({"charSpacing", "lineHeight", "fontStyle"})
PageRef = Annotated[
    str | int | None,
    Field(description="The page: its id, or its number counting from 1. Defaults to the first page."),
]

POSITION_HELP = "Top-left corner of the object's box in page pixels (before rotation). Default: centred."


class EditError(ValueError):
    """An operation that cannot be applied; `index` is its position in the list."""

    def __init__(self, index: int, message: str) -> None:
        super().__init__(f"Operation {index + 1}: {message}")
        self.index = index


class _Op(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Add(_Op):
    page: PageRef = None
    id: ObjectId | None = Field(
        None, description="Optional id for the new object, so later operations in this call can refer to it."
    )
    name: Annotated[str, StringConstraints(max_length=120)] | None = Field(None, description="Layer name.")
    index: int | None = Field(None, ge=0, description="Stacking position (0 = bottom). Default: on top.")


class _Effect(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ShadowEffect(_Effect):
    color: Color = "#00000066"
    blur: Annotated[float, Field(ge=0, le=500)] = 12
    offset_x: Annotated[float, Field(ge=-1000, le=1000)] = 4
    offset_y: Annotated[float, Field(ge=-1000, le=1000)] = 6


class OutlineEffect(_Effect):
    color: Color = "#000000"
    width: Annotated[float, Field(gt=0, le=200)] = 2


class GlowEffect(_Effect):
    color: Color = "#7a64e0"
    blur: Annotated[float, Field(ge=0, le=500)] = 18


class HighlightEffect(_Effect):
    color: Color = "#fde047"


class Effects(_Effect):
    """Text takes every effect; shapes only `shadow`. A glow replaces the shadow when both are set."""

    shadow: ShadowEffect | None = None
    outline: OutlineEffect | None = Field(None, description="A stroke around the letters.")
    glow: GlowEffect | None = None
    highlight: HighlightEffect | None = Field(None, description="A marker-style colour behind the text.")

    def document(self) -> dict:
        """The editor's `ObjectEffects` (camelCase, `background` for the highlight)."""
        out: dict = {}
        if self.shadow:
            s = self.shadow
            out["shadow"] = {"color": s.color, "blur": s.blur, "offsetX": s.offset_x, "offsetY": s.offset_y}
        if self.outline:
            out["outline"] = {"color": self.outline.color, "width": self.outline.width}
        if self.glow:
            out["glow"] = {"color": self.glow.color, "blur": self.glow.blur}
        if self.highlight:
            out["background"] = {"color": self.highlight.color}
        return out


Curve = Annotated[float, Field(ge=-builders.CURVE_MAX, le=builders.CURVE_MAX)]
CURVE_HELP = "Bend the text into an arc: negative arches up, positive curves down, 0 = straight. Try ±150."
EFFECTS_HELP = "Replaces the object's effects; {} removes them."


class AddText(_Add):
    """Add a text box. The text wraps inside `width`; its height follows from the text."""

    op: Literal["add_text"]
    text: Annotated[str, StringConstraints(min_length=1, max_length=MAX_TEXT_LENGTH)]
    preset: builders.TextPreset = Field("body", description="Starting style; explicit fields override it.")
    x: Coordinate | None = Field(None, description=POSITION_HELP)
    y: Coordinate | None = None
    width: Length | None = Field(None, description="Width the text wraps at. Default: depends on the preset.")
    font_family: Annotated[str, StringConstraints(min_length=1, max_length=120)] | None = Field(
        None, description="A family from search_fonts, e.g. 'Playfair Display'."
    )
    font_size: Annotated[float, Field(gt=0, le=2000)] | None = None
    font_weight: Annotated[int, Field(ge=100, le=900)] | None = None
    color: Color | None = None
    align: builders.TextAlign = "center"
    line_height: Annotated[float, Field(gt=0, le=10)] | None = None
    effects: Effects | None = None
    curve: Curve | None = Field(None, description=CURVE_HELP)


class AddShape(_Add):
    """Add a basic shape."""

    op: Literal["add_shape"]
    shape: builders.ShapeKind = Field(description="`path` = a catalogue shape, named in `path_shape`.")
    path_shape: builders.PathShapeId | None = Field(None, description="With shape `path`.")
    x: Coordinate | None = Field(None, description=POSITION_HELP)
    y: Coordinate | None = None
    width: Length | None = None
    height: Length | None = None
    fill: Color | None = None
    stroke: Color | None = None
    stroke_width: Annotated[float, Field(ge=0, le=1000)] = 0
    corner_radius: Annotated[float, Field(ge=0, le=100_000)] = Field(0, description="rect only.")
    sides: Annotated[int, Field(ge=3, le=12)] = Field(6, description="polygon only.")
    star_tips: Annotated[int, Field(ge=3, le=24)] = Field(5, description="star only.")
    inner_ratio: Annotated[float, Field(ge=0.1, le=0.95)] = Field(0.45, description="star only.")
    shadow: ShadowEffect | None = None


class AddLine(_Add):
    """Add a straight line or arrow from (x1, y1) to (x2, y2)."""

    op: Literal["add_line"]
    x1: Coordinate
    y1: Coordinate
    x2: Coordinate
    y2: Coordinate
    color: Color = builders.TEXT_COLOR
    width: Annotated[float, Field(gt=0, le=1000)] = Field(6, description="Stroke width.")
    arrow_start: builders.ArrowHead = "none"
    arrow_end: builders.ArrowHead = "none"
    dash: list[Annotated[float, Field(ge=0, le=1000)]] | None = Field(None, max_length=8)


MaskRadius = Annotated[float, Field(ge=0, le=0.5)]
MASK_HELP = "Crop the picture to a shape (uploaded pictures only)."
RADIUS_HELP = "Corner radius of the `rounded` mask, as a fraction of the shorter side (default 0.18)."


class AddImage(_Add):
    """Add a picture: one of your uploads (`asset_id`) or a catalogue graphic (`element_id`). It is scaled
    to fit inside width x height with its proportions kept."""

    op: Literal["add_image"]
    asset_id: str | None = Field(None, description="From list_assets or import_stock_photo.")
    element_id: str | None = Field(None, description="From search_elements.")
    x: Coordinate | None = Field(None, description=POSITION_HELP)
    y: Coordinate | None = None
    width: Length | None = None
    height: Length | None = None
    mask: builders.MaskShape | None = Field(None, description=MASK_HELP)
    mask_radius: MaskRadius | None = Field(None, description=RADIUS_HELP)


FocalPoint = Annotated[
    tuple[Annotated[float, Field(ge=0, le=1)], Annotated[float, Field(ge=0, le=1)]],
    Field(
        description="Point of the picture to keep in the frame's centre, [x, y] from [0, 0] (top-left) "
        "to [1, 1] (bottom-right)."
    ),
]


class ReplaceImage(_Op):
    """Put a new picture into an existing image or photo placeholder, keeping its frame, crop shape, filters,
    effects and template field tag. The picture is scaled to cover the frame, centred on `focal`."""

    op: Literal["replace_image"]
    object_id: ObjectId
    asset_id: str | None = Field(None, description="From list_assets or import_stock_photo.")
    element_id: str | None = Field(None, description="From search_elements.")
    url: Annotated[str, StringConstraints(min_length=8, max_length=2048)] | None = Field(
        None, description="A public https link to an image (uploaded into your assets; needs `assets:write`)."
    )
    focal: FocalPoint = (0.5, 0.5)


class RemoveBackground(_Op):
    """Remove the background of an image in the design, replacing it in place with a transparent cut-out."""

    op: Literal["remove_background"]
    object_id: ObjectId
    model: str | None = Field(
        None,
        description="A server model from list_ai_models; omitted: its `server_default`.",
    )


class AddQrCode(_Add):
    """Add a QR code that encodes `text` (usually a URL)."""

    op: Literal["add_qr_code"]
    text: Annotated[str, StringConstraints(min_length=1, max_length=builders.QR_MAX_TEXT)]
    x: Coordinate | None = Field(None, description=POSITION_HELP)
    y: Coordinate | None = None
    size: Length | None = None
    color: Color = "#000000"
    background: Color = "#ffffff"


class UpdateObject(_Op):
    """Change an object. Only the fields you send change."""

    op: Literal["update_object"]
    object_id: ObjectId
    x: Coordinate | None = Field(None, description="New top-left corner of the box (before rotation).")
    y: Coordinate | None = None
    width: Length | None = Field(None, description="New box width; pictures keep their proportions.")
    height: Length | None = Field(None, description="New box height (not for text: it follows the text).")
    angle: Annotated[float, Field(ge=-360, le=360)] | None = None
    opacity: Annotated[float, Field(ge=0, le=1)] | None = None
    text: Annotated[str, StringConstraints(min_length=1, max_length=MAX_TEXT_LENGTH)] | None = None
    color: Color | None = Field(None, description="Text colour, shape fill or line colour.")
    stroke: Color | None = None
    stroke_width: Annotated[float, Field(ge=0, le=1000)] | None = None
    font_family: Annotated[str, StringConstraints(min_length=1, max_length=120)] | None = None
    font_size: Annotated[float, Field(gt=0, le=2000)] | None = None
    font_weight: Annotated[int, Field(ge=100, le=900)] | None = None
    align: builders.TextAlign | None = None
    effects: Effects | None = Field(None, description=EFFECTS_HELP + " Shapes take only a shadow.")
    curve: Curve | None = Field(None, description="Text only. " + CURVE_HELP)
    mask: builders.MaskShape | Literal["none"] | None = Field(
        None, description=MASK_HELP + " `none` removes it."
    )
    mask_radius: MaskRadius | None = Field(None, description=RADIUS_HELP)
    name: Annotated[str, StringConstraints(max_length=120)] | None = None
    locked: bool | None = None
    visible: bool | None = None
    field: FieldTag | Literal["none"] | None = Field(
        None,
        description="Tag the object as a template field (text boxes: text, pictures and placeholders: image, "
        "shapes: color), so it can be found with list_fields and filled with data. `none` removes the tag.",
    )
    fit: TextFit | Literal["none"] | None = Field(
        None,
        description="Text only. Shrink the font size down to `min_font_size` (default: half the font size) "
        "so the text fits inside the box's fixed height. `none` turns it off.",
    )
    props: dict[str, Any] | None = Field(
        None,
        description="Advanced: raw document properties to set (Fabric.js names, e.g. {'charSpacing': 200}). "
        f"Only these are accepted: {', '.join(sorted(PROPS))}. A null value removes the property.",
    )


class DeleteObjects(_Op):
    """Delete objects."""

    op: Literal["delete_objects"]
    object_ids: list[ObjectId] = Field(min_length=1, max_length=500)


class ArrangeObject(_Op):
    """Move an object up or down the stack of its page."""

    op: Literal["arrange_object"]
    object_id: ObjectId
    to: Literal["front", "back", "forward", "backward"]


class GroupObjects(_Op):
    """Group objects of one page so they move and scale together. The group takes the place of the lowest."""

    op: Literal["group_objects"]
    object_ids: list[ObjectId] = Field(min_length=2, max_length=200)
    id: ObjectId | None = Field(None, description="Optional id for the new group.")
    name: Annotated[str, StringConstraints(max_length=120)] | None = Field(None, description="Layer name.")


class Ungroup(_Op):
    """Break a group up: its objects go back on the page, where they appear, in its place in the stack."""

    op: Literal["ungroup"]
    object_id: ObjectId


class AddPage(_Op):
    """Add a blank page."""

    op: Literal["add_page"]
    after: PageRef = Field(None, description="The page to add it after. Default: at the end.")
    id: ObjectId | None = Field(None, description="Optional id for the new page.")
    background_color: Color = "#ffffff"
    width: Annotated[int, Field(ge=1, le=20_000)] | None = Field(
        None, description="Default: the design size."
    )
    height: Annotated[int, Field(ge=1, le=20_000)] | None = None


class DeletePage(_Op):
    """Delete a page (a design always keeps at least one)."""

    op: Literal["delete_page"]
    page: str | int


class MovePage(_Op):
    """Move a page to another position."""

    op: Literal["move_page"]
    page: str | int
    to_number: int = Field(ge=1, description="New position, counting from 1.")


class GradientStop(BaseModel):
    model_config = ConfigDict(extra="forbid")
    offset: float = Field(ge=0, le=1)
    color: Color


class SetBackground(_Op):
    """Set a page background: a colour, a gradient or a picture (exactly one)."""

    op: Literal["set_background"]
    page: PageRef = None
    color: Color | None = None
    gradient: list[GradientStop] | None = Field(None, min_length=2, max_length=10)
    gradient_kind: Literal["linear", "radial"] = "linear"
    gradient_angle: Annotated[float, Field(ge=0, le=360)] = 180
    asset_id: str | None = Field(None, description="An upload to use as the background picture.")
    fit: Literal["cover", "contain", "tile"] = "cover"


class SetNotes(_Op):
    """Set a page's speaker notes."""

    op: Literal["set_notes"]
    page: PageRef = None
    notes: Annotated[str, StringConstraints(max_length=5_000)]


Operation = Annotated[
    AddText
    | AddShape
    | AddLine
    | AddImage
    | ReplaceImage
    | RemoveBackground
    | AddQrCode
    | UpdateObject
    | DeleteObjects
    | ArrangeObject
    | GroupObjects
    | Ungroup
    | AddPage
    | DeletePage
    | MovePage
    | SetBackground
    | SetNotes,
    Field(discriminator="op"),
]


# ---------------------------------------------------------------------------------------------
# Applying
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class ImageSource:
    src: str
    width: float
    height: float
    asset_id: str | None = None
    name: str | None = None


class Resolver(Protocol):
    def image(
        self, *, asset_id: str | None = None, element_id: str | None = None, url: str | None = None
    ) -> ImageSource:
        """The picture to place; raises `LookupError` with a message for the agent when there is none."""

    def remove_background(self, *, obj: dict, model: str | None = None) -> ImageSource:
        """The picture of `obj` without its background; raises `LookupError` with a message for the agent."""

    def seal(self, sealed: bool = True) -> None:
        """Optional. Called once the design is locked: from then on, lookups must not do slow work (network,
        AI). Called with `False` when an edit falls back from a live room to the saved content."""

    def font_category(self, family: str) -> str | None:
        """The catalogue category of a font family (serif, display…), None when it is unknown."""


@dataclass
class EditOutcome:
    document: dict
    results: list[dict] = field(default_factory=list)


_ID = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


class _Editor:
    def __init__(self, document: dict, resolver: Resolver, max_pages: int) -> None:
        self.doc = copy.deepcopy(document)
        self.resolver = resolver
        self.max_pages = max_pages
        self.index = 0

    def fail(self, message: str) -> EditError:
        return EditError(self.index, message)

    # ---- lookups ------------------------------------------------------------------------------

    @property
    def pages(self) -> list[dict]:
        return self.doc["pages"]

    def page(self, ref: str | int | None) -> dict:
        if ref is None:
            return self.pages[0]
        if isinstance(ref, int):
            if 1 <= ref <= len(self.pages):
                return self.pages[ref - 1]
            raise self.fail(f"There is no page {ref}; the design has {len(self.pages)}.")
        for page in self.pages:
            if page.get("id") == ref:
                return page
        if ref.isascii() and ref.isdigit():  # not "²": `isdigit` accepts it, `int` does not
            return self.page(int(ref))
        raise self.fail(f"There is no page with id {ref!r}.")

    def page_size(self, page: dict) -> Page:
        return Page(
            int(page.get("width") or self.doc["width"]), int(page.get("height") or self.doc["height"])
        )

    def find(self, object_id: str) -> tuple[dict, int]:
        for page in self.pages:
            for position, obj in enumerate(page.get("objects", [])):
                if obj.get("id") == object_id:
                    return page, position
        group = self.group_of(object_id)
        if group is not None:
            raise self.fail(
                f"Object {object_id!r} is inside the group {group!r}: ungroup it first (`ungroup`), "
                "or change the whole group."
            )
        raise self.fail(f"There is no object with id {object_id!r}.")

    def group_of(self, object_id: str) -> str | None:
        """The id of the top-level group that holds `object_id`, at any depth; None if no group does."""

        def holds(objects: list) -> bool:
            return any(
                isinstance(child, dict)
                and (child.get("id") == object_id or holds(child.get("objects") or []))
                for child in objects
            )

        for page in self.pages:
            for obj in page.get("objects", []):
                if isinstance(obj, dict) and isinstance(obj.get("objects"), list) and holds(obj["objects"]):
                    return obj.get("id")
        return None

    def all_ids(self) -> set[str]:
        ids = {str(page.get("id")) for page in self.pages}

        def collect(objects: list) -> None:
            for obj in objects:
                if isinstance(obj, dict):
                    ids.add(str(obj.get("id")))
                    if isinstance(obj.get("objects"), list):
                        collect(obj["objects"])  # a group's children come back on ungroup

        for page in self.pages:
            collect(page.get("objects", []))
        return ids

    def own_id(self, wanted: str | None) -> str | None:
        if wanted is None:
            return None
        if not _ID.match(wanted):
            raise self.fail("An id may only hold letters, digits and . _ : - (at most 64).")
        if wanted in self.all_ids():
            raise self.fail(f"The id {wanted!r} is already used in this design.")
        return wanted

    # ---- operations ---------------------------------------------------------------------------

    def insert(self, op: _Add, obj: dict) -> dict:
        page = self.page(op.page)
        own = self.own_id(op.id)
        if own:
            obj["id"] = own
        if op.name:
            obj["name"] = op.name
        objects = page.setdefault("objects", [])
        objects.insert(len(objects) if op.index is None else min(op.index, len(objects)), obj)
        return {"object_id": obj["id"], "page_id": page["id"], "box": box(obj)}

    def add_text(self, op: AddText) -> dict:
        page = self.page(op.page)
        category = self.resolver.font_category(op.font_family) if op.font_family else None
        obj = builders.build_text(
            self.page_size(page),
            text=op.text,
            x=op.x,
            y=op.y,
            width=op.width,
            preset=op.preset,
            font_family=op.font_family,
            font_category=category,
            font_size=op.font_size,
            font_weight=op.font_weight,
            color=op.color,
            align=op.align,
            line_height=op.line_height,
        )
        if op.effects:
            builders.apply_effects(obj, op.effects.document(), text=True)
        if op.curve:
            builders.apply_curve(obj, op.curve)
        return self.insert(op, obj) | {"height_estimated": True}

    def add_shape(self, op: AddShape) -> dict:
        page = self.page(op.page)
        if (op.shape == "path") != (op.path_shape is not None):
            raise self.fail("Use shape `path` together with `path_shape` (e.g. heart, arrow-right).")
        obj = builders.build_shape(
            self.page_size(page),
            shape=op.shape,
            path_shape=op.path_shape,
            x=op.x,
            y=op.y,
            width=op.width,
            height=op.height,
            fill=op.fill,
            stroke=op.stroke,
            stroke_width=op.stroke_width,
            corner_radius=op.corner_radius,
            sides=op.sides,
            star_tips=op.star_tips,
            inner_ratio=op.inner_ratio,
        )
        if op.shadow:
            builders.apply_effects(obj, Effects(shadow=op.shadow).document(), text=False)
        return self.insert(op, obj)

    def add_line(self, op: AddLine) -> dict:
        obj = builders.build_line(
            x1=op.x1,
            y1=op.y1,
            x2=op.x2,
            y2=op.y2,
            color=op.color,
            width=op.width,
            arrow_start=op.arrow_start,
            arrow_end=op.arrow_end,
            dash=op.dash,
        )
        return self.insert(op, obj)

    def add_image(self, op: AddImage) -> dict:
        if (op.asset_id is None) == (op.element_id is None):
            raise self.fail("Send exactly one of asset_id and element_id.")
        page = self.page(op.page)
        try:
            source = self.resolver.image(asset_id=op.asset_id, element_id=op.element_id)
        except LookupError as exc:
            raise self.fail(str(exc)) from exc
        obj = builders.build_image(
            self.page_size(page),
            src=source.src,
            natural_width=source.width,
            natural_height=source.height,
            x=op.x,
            y=op.y,
            width=op.width,
            height=op.height,
            asset_id=source.asset_id,
            name=source.name,
        )
        if op.mask:
            if object_kind(obj) != "image":
                raise self.fail("Only uploaded pictures can be masked, not catalogue graphics.")
            builders.apply_mask(obj, op.mask, op.mask_radius)
        return self.insert(op, obj)

    def replace_image(self, op: ReplaceImage) -> dict:
        chosen = [op.asset_id is not None, op.element_id is not None, op.url is not None]
        if sum(chosen) != 1:
            raise self.fail("Send exactly one of asset_id, element_id and url.")
        page, position = self.find(op.object_id)
        obj = page["objects"][position]
        if object_kind(obj) not in ("image", "placeholder"):
            raise self.fail("Only pictures and photo placeholders can be replaced with a picture.")
        try:
            source = self.resolver.image(asset_id=op.asset_id, element_id=op.element_id, url=op.url)
        except LookupError as exc:
            raise self.fail(str(exc)) from exc
        builders.replace_image(
            obj,
            src=source.src,
            natural_width=source.width,
            natural_height=source.height,
            asset_id=source.asset_id,
            name=source.name,
            focal=(op.focal[0], op.focal[1]),
        )
        return {"object_id": obj["id"], "box": box(obj)}

    def remove_background(self, op: RemoveBackground) -> dict:
        page, position = self.find(op.object_id)
        obj = page["objects"][position]
        if object_kind(obj) not in ("image", "placeholder"):
            raise self.fail("Only pictures can have their background removed.")
        try:
            source = self.resolver.remove_background(obj=obj, model=op.model)
        except LookupError as exc:
            raise self.fail(str(exc)) from exc
        # The cut-out has the picture's pixel size, so the frame, crop and mask stay as they are.
        obj["src"] = source.src
        if source.asset_id:
            obj["assetId"] = source.asset_id
        return {"object_id": obj["id"], "box": box(obj)}

    def add_qr_code(self, op: AddQrCode) -> dict:
        page = self.page(op.page)
        obj = builders.build_qr(
            self.page_size(page),
            text=op.text,
            x=op.x,
            y=op.y,
            size=op.size,
            color=op.color,
            background=op.background,
        )
        return self.insert(op, obj)

    def update_object(self, op: UpdateObject) -> dict:
        page, position = self.find(op.object_id)
        obj = page["objects"][position]
        kind = object_kind(obj)
        if op.text is not None:
            if kind != "text":
                raise self.fail("Only text objects have text.")
            obj["text"] = op.text
            obj.pop("styles", None)  # per-character styles index into the old text
        for key, value in (
            ("angle", op.angle),
            ("opacity", op.opacity),
            ("name", op.name),
            ("locked", op.locked),
            ("visible", op.visible),
            ("textAlign", op.align),
            ("fontSize", op.font_size),
            ("fontWeight", op.font_weight),
        ):
            if value is not None:
                obj[key] = value
        if op.font_family is not None:
            obj["fontFamily"] = builders.font_stack(
                op.font_family, self.resolver.font_category(op.font_family)
            )
        if op.color is not None:
            obj["stroke" if kind == "line" else "fill"] = op.color
        if op.stroke is not None:
            obj["stroke"] = op.stroke
        if op.stroke_width is not None:
            obj["strokeWidth"] = op.stroke_width
        if op.effects is not None:
            if kind not in ("text", "shape"):
                raise self.fail("Only text and shapes have effects.")
            effects = op.effects.document()
            if kind == "shape" and set(effects) - {"shadow"}:
                raise self.fail("Shapes only take a shadow.")
            builders.apply_effects(obj, effects, text=kind == "text")
        if op.mask is not None or op.mask_radius is not None:
            if kind not in ("image", "placeholder"):
                raise self.fail("Only uploaded pictures and photo placeholders can be masked.")
            if obj.get("slot"):
                raise self.fail("This picture fills a photo frame; the frame decides its crop.")
            shape = obj.get("maskShape") if op.mask is None else (None if op.mask == "none" else op.mask)
            builders.apply_mask(obj, shape, op.mask_radius)
        if op.curve is not None:
            if kind != "text":
                raise self.fail("Only text can be curved.")
            builders.apply_curve(obj, op.curve)
        if op.fit is not None:
            if kind != "text":
                raise self.fail("Only text can shrink to fit.")
            builders.apply_fit(obj, None if op.fit == "none" else op.fit.document())
        if op.field is not None:
            self.set_field(obj, kind, op.field)
        if op.props:
            for key, value in op.props.items():
                adapter = PROPS.get(key)
                if adapter is None:
                    raise self.fail(f"`{key}` cannot be set through props.")
                if value is None:
                    obj.pop(key, None)
                    continue
                try:
                    obj[key] = adapter.validate_python(value, strict=True)
                except PydanticValidationError as exc:
                    raise self.fail(f"Invalid value for `{key}`: {exc.errors()[0]['msg']}.") from exc
        reflows = (
            op.text is not None
            or op.font_family is not None
            or op.font_size is not None
            or op.font_weight is not None
            or op.fit is not None
            or bool(TEXT_LAYOUT_PROPS & set(op.props or ()))
        )
        if kind == "text" and reflows:
            refit_text_height(obj)  # the text or its font changed: keep the box's centre
        self.resize(obj, kind, op)
        return {"object_id": obj["id"], "box": box(obj)}

    def set_field(self, obj: dict, kind: str, tag: FieldTag | Literal["none"]) -> None:
        if tag == "none":
            obj.pop("field", None)
            return
        if KIND_TYPES.get(kind) != tag.type:
            allowed = KIND_TYPES.get(kind)
            if allowed is None:
                raise self.fail(f"A {kind} can't be a template field.")
            raise self.fail(f"This {kind} can only be a {allowed} field.")
        obj["field"] = tag.document()
        if tag.key in duplicate_keys(self.doc):
            raise self.fail(
                f"The field key `{tag.key}` is already used on this page or with another type; "
                "a key appears once per page and has one type."
            )

    def resize(self, obj: dict, kind: str, op: UpdateObject) -> None:
        """Apply x / y / width / height, keeping the box's other edges where they make sense."""
        before = box(obj)
        width, height = op.width, op.height
        if kind == "text" and height is not None:
            raise self.fail(
                "A text box's height follows from its text; change its width or font size instead."
            )
        if kind == "image-grid" and (width is not None or height is not None):
            raise self.fail("Image grids can only be resized in the editor.")
        if width is not None or height is not None:
            scale_x = abs(float(obj.get("scaleX", 1) or 1))
            scale_y = abs(float(obj.get("scaleY", 1) or 1))
            if kind in ("image", "qr", "element", "group", "unknown") or obj.get("type") in (
                "polygon",
                "path",
            ):
                natural_w = float(obj.get("width") or 1)
                natural_h = float(obj.get("height") or 1)
                if kind in ("image", "qr", "element"):
                    target = min((width or float("inf")) / natural_w, (height or float("inf")) / natural_h)
                    obj["scaleX"] = obj["scaleY"] = round(target, 6)
                else:
                    if width is not None:
                        obj["scaleX"] = round(width / natural_w, 6)
                    if height is not None:
                        obj["scaleY"] = round(height / natural_h, 6)
            elif kind == "line":
                if width is not None:
                    obj["width"] = round(width / scale_x, 3)
            else:
                if width is not None:
                    obj["width"] = round(width / scale_x, 3)
                if height is not None:
                    obj["height"] = round(height / scale_y, 3)
                if obj.get("type") == "ellipse":
                    obj["rx"] = round(float(obj["width"]) / 2, 3)
                    obj["ry"] = round(float(obj.get("height", obj["width"])) / 2, 3)
                if kind == "text":
                    refit_text_height(obj)
        after = box(obj)
        x = op.x if op.x is not None else before["x"] + (before["width"] - after["width"]) / 2
        y = op.y if op.y is not None else before["y"] + (before["height"] - after["height"]) / 2
        if op.x is not None or op.y is not None or width is not None or height is not None:
            place(obj, x, y)

    def delete_objects(self, op: DeleteObjects) -> dict:
        doomed = set(op.object_ids)
        found: set[str] = set()
        for page in self.pages:
            kept = []
            for obj in page.get("objects", []):
                if obj.get("id") in doomed:
                    found.add(obj["id"])
                else:
                    kept.append(obj)
            page["objects"] = kept
        missing = sorted(doomed - found)
        if missing:
            self.find(missing[0])  # raises, naming the group when the object is inside one
        return {"deleted": sorted(found)}

    def arrange_object(self, op: ArrangeObject) -> dict:
        page, position = self.find(op.object_id)
        objects = page["objects"]
        obj = objects.pop(position)
        target = {
            "front": len(objects),
            "back": 0,
            "forward": min(position + 1, len(objects)),
            "backward": max(position - 1, 0),
        }[op.to]
        objects.insert(target, obj)
        return {"object_id": obj["id"], "index": target}

    def group_objects(self, op: GroupObjects) -> dict:
        wanted = list(dict.fromkeys(op.object_ids))
        if len(wanted) < 2:
            raise self.fail("Group at least two different objects.")
        page, _ = self.find(wanted[0])
        objects = page["objects"]
        positions = []
        for object_id in wanted:
            other_page, position = self.find(object_id)
            if other_page is not page:
                raise self.fail("Only objects on the same page can be grouped.")
            positions.append(position)
        positions.sort()
        children = [objects[position] for position in positions]  # keep their stacking order
        if any(contains_image_grid(child) for child in children):
            raise self.fail("Image grids cannot be grouped with other objects.")
        try:
            grouped = groups.group(children, self.own_id(op.id) or builders.new_id())
        except groups.GroupError as exc:
            raise self.fail(str(exc)) from exc
        if op.name:
            grouped["name"] = op.name
        for position in reversed(positions):
            del objects[position]
        objects.insert(positions[0], grouped)
        return {"object_id": grouped["id"], "page_id": page["id"], "box": box(grouped), "children": wanted}

    def ungroup(self, op: Ungroup) -> dict:
        page, position = self.find(op.object_id)
        obj = page["objects"][position]
        kind = object_kind(obj)
        if kind == "image-grid":
            raise self.fail("Image grids cannot be ungrouped.")
        if kind != "group":
            raise self.fail("That object is not a group.")
        try:
            children = groups.ungroup(obj)
        except groups.GroupError as exc:
            raise self.fail(str(exc)) from exc
        page["objects"][position : position + 1] = children
        return {"object_ids": [child.get("id") for child in children]}

    def add_page(self, op: AddPage) -> dict:
        if len(self.pages) >= self.max_pages:
            raise self.fail(f"A design can have at most {self.max_pages} pages.")
        page: dict = {
            "id": self.own_id(op.id) or builders.new_id(),
            "background": {"type": "solid", "color": op.background_color},
            "objects": [],
        }
        width = op.width if op.width is not None else self.doc["width"]
        height = op.height if op.height is not None else self.doc["height"]
        if (width, height) != (self.doc["width"], self.doc["height"]):
            # Like `pageSizes.ts`: a page only stores a size when it differs from the design's.
            page["width"], page["height"] = width, height
        at = len(self.pages) if op.after is None else self.pages.index(self.page(op.after)) + 1
        self.pages.insert(at, page)
        return {"page_id": page["id"], "page_number": at + 1}

    def delete_page(self, op: DeletePage) -> dict:
        page = self.page(op.page)
        if len(self.pages) == 1:
            raise self.fail("A design always keeps at least one page.")
        self.pages.remove(page)
        return {"deleted_page": page["id"]}

    def move_page(self, op: MovePage) -> dict:
        page = self.page(op.page)
        self.pages.remove(page)
        at = min(op.to_number, len(self.pages) + 1) - 1
        self.pages.insert(at, page)
        return {"page_id": page["id"], "page_number": at + 1}

    def set_background(self, op: SetBackground) -> dict:
        chosen = [op.color is not None, op.gradient is not None, op.asset_id is not None]
        if sum(chosen) != 1:
            raise self.fail("Send exactly one of color, gradient and asset_id.")
        page = self.page(op.page)
        if op.color is not None:
            background: dict = {"type": "solid", "color": op.color}
        elif op.gradient is not None:
            background = {
                "type": "gradient",
                "kind": op.gradient_kind,
                "angle": op.gradient_angle,
                "stops": [{"offset": stop.offset, "color": stop.color} for stop in op.gradient],
            }
        else:
            try:
                source = self.resolver.image(asset_id=op.asset_id, element_id=None)
            except LookupError as exc:
                raise self.fail(str(exc)) from exc
            background = {"type": "image", "src": source.src, "fit": op.fit}
        page["background"] = background
        return {"page_id": page["id"]}

    def set_notes(self, op: SetNotes) -> dict:
        page = self.page(op.page)
        if op.notes:
            page["notes"] = op.notes
        else:
            page.pop("notes", None)
        return {"page_id": page["id"]}


def apply_ops(
    document: dict, ops: list[Any], resolver: Resolver, *, max_pages: int = MAX_PAGES
) -> EditOutcome:
    """Apply `ops` (validated `Operation` models) to a copy of `document`; raises `EditError` on the first
    operation that cannot be applied, leaving `document` untouched."""
    if len(ops) > MAX_OPS:
        raise EditError(MAX_OPS, f"At most {MAX_OPS} operations per call.")
    editor = _Editor(document, resolver, max_pages)
    outcome = EditOutcome(editor.doc)
    for index, op in enumerate(ops):
        editor.index = index
        handler = getattr(editor, op.op)
        outcome.results.append({"op": op.op, **handler(op)})
    return outcome


# ---------------------------------------------------------------------------------------------
# Geometry of document objects
# ---------------------------------------------------------------------------------------------


def _float(value: Any, default: float = 0.0) -> float:
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else default


def _origin_factor(origin: Any) -> float:
    return {"left": 0.0, "top": 0.0, "center": 0.5, "right": 1.0, "bottom": 1.0}.get(str(origin), 0.0)


def box(obj: dict) -> dict:
    """The object's unrotated box in page pixels: {x, y, width, height} (x, y = top-left corner)."""
    slot = obj.get("slot")
    if isinstance(slot, dict) and _float(slot.get("width")) > 0 and _float(slot.get("height")) > 0:
        w, h = _float(slot["width"]), _float(slot["height"])
        x = _float(slot.get("cx")) - w / 2
        y = _float(slot.get("cy")) - h / 2
        return {"x": round(x, 2), "y": round(y, 2), "width": round(w, 2), "height": round(h, 2)}
    width = _float(obj.get("width")) * abs(_float(obj.get("scaleX"), 1.0))
    height = _float(obj.get("height")) * abs(_float(obj.get("scaleY"), 1.0))
    left, top = _float(obj.get("left")), _float(obj.get("top"))
    x = left - width * _origin_factor(obj.get("originX", "left"))
    y = top - height * _origin_factor(obj.get("originY", "top"))
    return {"x": round(x, 2), "y": round(y, 2), "width": round(width, 2), "height": round(height, 2)}


def place(obj: dict, x: float, y: float) -> None:
    """Move the object so its box's top-left corner is at (x, y), whatever its origin."""
    current = box(obj)
    dx, dy = x - current["x"], y - current["y"]
    obj["left"] = round(_float(obj.get("left")) + dx, 3)
    obj["top"] = round(_float(obj.get("top")) + dy, 3)
    slot = obj.get("slot")
    if isinstance(slot, dict):
        slot["cx"] = builders._num(_float(slot.get("cx")) + dx)
        slot["cy"] = builders._num(_float(slot.get("cy")) + dy)


def refit_text_height(obj: dict) -> None:
    """Re-estimate a textbox's height after its text, width or size changed, keeping its centre."""
    fit = read_fit(obj.get("fit"))
    if fit:
        builders.apply_fit(obj, fit)
        return
    size = _float(obj.get("fontSize"), 40.0)
    lines = builders.estimate_text_lines(
        str(obj.get("text", "")),
        _float(obj.get("width"), 200.0),
        size,
        int(_float(obj.get("fontWeight"), 400)),
    )
    before = box(obj)
    obj["height"] = round(builders.text_height(lines, size, _float(obj.get("lineHeight"), 1.16)), 3)
    after = box(obj)
    place(obj, before["x"], before["y"] + (before["height"] - after["height"]) / 2)
