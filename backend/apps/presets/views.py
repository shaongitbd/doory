from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from django.views.decorators.cache import cache_control
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.designs.models import Design

from .importer import FORMAT_VERSION
from .models import SizeChoices, SizePreset, SizePresetGroup
from .validators import GROUP_SLUG, PRESET_SLUG


def _number(value: Decimal) -> int | float:
    return int(value) if value == value.to_integral_value() else float(value)


def _preset(preset: SizePreset) -> dict:
    return {
        "slug": preset.slug,
        "label": preset.label,
        "width": _number(preset.width),
        "height": _number(preset.height),
        "unit": preset.unit,
        "width_px": preset.width_px,
        "height_px": preset.height_px,
        "icon": preset.icon,
        "tags": preset.tags,
        "is_quick": preset.is_quick,
        "aliases": preset.aliases,
        "meta": preset.meta,
    }


def preset_tree() -> list[dict]:
    """The active groups, nested, with their active presets. Groups with nothing to offer are left out."""
    children = defaultdict(list)
    for group in SizePresetGroup.objects.filter(is_active=True).order_by("sort_order", "label", "slug"):
        children[group.parent_id].append(group)
    presets = defaultdict(list)
    for preset in SizePreset.objects.filter(is_active=True).order_by("sort_order", "label", "slug"):
        presets[preset.group_id].append(_preset(preset))

    def build(parent_id) -> list[dict]:
        nodes = []
        for group in children[parent_id]:
            node = {
                "slug": group.slug,
                "label": group.label,
                "icon": group.icon,
                "children": build(group.pk),
                "presets": presets[group.pk],
            }
            if node["children"] or node["presets"]:
                nodes.append(node)
        return nodes

    return build(None)


@extend_schema(
    responses={
        200: OpenApiResponse(
            OpenApiTypes.OBJECT,
            description=(
                "The size preset catalogue: `{version, groups: [{slug, label, icon, children: [...], "
                "presets: [{slug, label, width, height, unit, width_px, height_px, icon, tags, is_quick, "
                "aliases, meta}]}]}`. `width` and `height` are in `unit`; `width_px` and `height_px` are "
                "whole pixels at 96 dpi."
            ),
        )
    },
    tags=["system"],
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@cache_control(public=True, max_age=60)
def size_presets(request):
    """Public size preset catalogue (built-in and configured), nested in groups."""
    return Response({"version": FORMAT_VERSION, "groups": preset_tree()})


MAX_PINNED = 24
MAX_COLLAPSED = 20
MAX_RECENT = 8
# How many of the person's latest designs the recent sizes are read from.
RECENT_DESIGNS = 50


def _recent(user) -> list[str]:
    """The sizes of the person's latest designs, newest first, each once."""
    seen: list[str] = []
    designs = Design.objects.filter(owner=user, trashed_at__isnull=True).exclude(preset="")
    for slug in designs.order_by("-created_at").values_list("preset", flat=True)[:RECENT_DESIGNS]:
        if slug not in seen:
            seen.append(slug)
        if len(seen) == MAX_RECENT:
            break
    return seen


def _slugs(value, *, limit: int, pattern, field: str) -> list[str]:
    items = value if isinstance(value, list) else [None]
    if not all(isinstance(item, str) and pattern.fullmatch(item) for item in items):
        raise ValueError(f"`{field}` must be a list of slugs.")
    unique = list(dict.fromkeys(value))
    if len(unique) > limit:
        raise ValueError(f"`{field}` can hold at most {limit} items.")
    return unique


@extend_schema(
    request=OpenApiTypes.OBJECT,
    responses={
        200: OpenApiResponse(
            OpenApiTypes.OBJECT,
            description=(
                "The signed-in person's sizes: `{pinned, recent, collapsed}`. `pinned` is a list of preset "
                "slugs, or null while they have not chosen any (show the popular sizes instead). `recent` "
                "comes from their latest designs. PATCH `pinned` (a list, or null to go back to the "
                "popular sizes) and `collapsed` (the picker sections they folded)."
            ),
        )
    },
    tags=["system"],
)
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def my_sizes(request):
    """The sizes the signed-in person pinned, used recently and the picker sections they folded."""
    choices = SizeChoices.objects.filter(user=request.user).first()
    if request.method == "PATCH":
        data = request.data if isinstance(request.data, dict) else {}
        changes = {}
        try:
            if "pinned" in data:
                pinned = data["pinned"]
                if pinned is not None:
                    pinned = _slugs(pinned, limit=MAX_PINNED, pattern=PRESET_SLUG, field="pinned")
                changes["pinned"] = pinned
            if "collapsed" in data:
                changes["collapsed"] = _slugs(
                    data["collapsed"], limit=MAX_COLLAPSED, pattern=GROUP_SLUG, field="collapsed"
                )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        choices, _ = SizeChoices.objects.update_or_create(user=request.user, defaults=changes)
    return Response(
        {
            "pinned": choices.pinned if choices else None,
            "recent": _recent(request.user),
            "collapsed": choices.collapsed if choices else [],
        }
    )
