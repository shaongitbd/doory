"""Read-only tools for what designs are made from: templates, catalogue graphics and fonts."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from apps.apitokens.scopes import DESIGNS_READ
from apps.elements.filters import ElementFilter
from apps.elements.views import ElementListView
from apps.fonts.filters import FontFilter
from apps.fonts.views import PublicFontList
from apps.gallery.filters import TemplateFilter
from apps.gallery.views import TemplateListView

from ..registry import tool

Limit = Annotated[int, Field(ge=1, le=50)]


def _filtered(filterset, data: dict, queryset, limit: int):
    found = filterset(
        data={key: value for key, value in data.items() if value not in (None, "")}, queryset=queryset
    )
    if not found.is_valid():
        raise ToolError("; ".join(f"{key}: {', '.join(errors)}" for key, errors in found.errors.items()))
    return list(found.qs[:limit])


@tool(scope=DESIGNS_READ, title="List templates", read_only=True)
def list_templates(
    query: Annotated[
        str | None, Field(description="Words in the title, description or tags.", max_length=100)
    ] = None,
    category: Annotated[str | None, Field(description="A category slug.", max_length=60)] = None,
    orientation: Literal["square", "portrait", "landscape"] | None = None,
    limit: Limit = 20,
) -> dict[str, Any]:
    """Find templates to start a design from (create_design with `template` = the slug)."""
    rows = _filtered(
        TemplateFilter,
        {"q": query, "category": category, "orientation": orientation},
        TemplateListView().get_queryset(),
        limit,
    )
    return {
        "templates": [
            {
                "slug": t.slug,
                "title": t.title,
                "category": t.category.slug if t.category else None,
                "width": t.width,
                "height": t.height,
                "pages": t.page_count,
                "tags": t.tags,
                "thumbnail_url": t.thumbnail.url if t.thumbnail else None,
            }
            for t in rows
        ]
    }


@tool(scope=DESIGNS_READ, title="Search elements", read_only=True)
def search_elements(
    query: Annotated[str, Field(min_length=1, max_length=100, description="e.g. 'arrow', 'leaf', 'star'.")],
    kind: Literal["icon", "illustration", "sticker", "shape", "line", "frame", "graphic"] | None = None,
    limit: Limit = 20,
) -> dict[str, Any]:
    """Search the graphics catalogue (icons, illustrations, stickers, shapes…). Add one to a design with
    edit_design: {"op": "add_image", "element_id": …}."""
    rows = _filtered(ElementFilter, {"q": query, "kind": kind}, ElementListView().get_queryset(), limit)
    return {
        "elements": [
            {
                "id": str(e.pk),
                "name": e.name,
                "kind": e.kind,
                "pack": e.pack.name,
                "width": e.width,
                "height": e.height,
                "colors": e.colors,
                "svg_url": e.svg.url,
            }
            for e in rows
        ]
    }


@tool(scope=DESIGNS_READ, title="Search fonts", read_only=True)
def search_fonts(
    query: Annotated[str | None, Field(max_length=100)] = None,
    category: Literal["sans-serif", "serif", "display", "handwriting", "monospace"] | None = None,
    limit: Limit = 20,
) -> dict[str, Any]:
    """Search installed fonts, most popular first. Use a `family` and one of its `weights` in
    edit_design's `font_family` and `font_weight` fields."""
    rows = _filtered(FontFilter, {"q": query, "category": category}, PublicFontList().get_queryset(), limit)
    return {
        "fonts": [
            {
                "family": f.family,
                "category": f.category,
                "weights": sorted({v.weight for v in f.variants.all()}),
                "italic": any(v.style == "italic" for v in f.variants.all()),
            }
            for f in rows
        ]
    }
