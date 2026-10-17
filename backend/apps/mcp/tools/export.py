"""See a design: render a page on the server with the editor's own engine and return it as an image."""

from __future__ import annotations

import base64
import json
from typing import Annotated, Any, Literal

from django.conf import settings
from mcp_types import ImageContent, TextContent
from pydantic import Field

from apps.apitokens.scopes import DESIGNS_READ
from apps.designs.doc.ops import PageRef
from apps.exports.delivery import store_image
from apps.exports.services import export_image, page_index
from apps.exports.throttling import ExportRateThrottle

from ..registry import throttle, tool
from .designs import DesignId, _design, editor_url


@tool(scope=DESIGNS_READ, title="Export a design as an image", read_only=True)
def export_design(
    design_id: DesignId,
    page: PageRef = None,
    format: Literal["png", "jpg", "webp"] = "png",
    quality: Annotated[int, Field(ge=1, le=100, description="JPG and WebP only.")] = 90,
    scale: Annotated[
        float, Field(ge=0.1, le=4, description="Output pixels per page pixel; below 1 for a quick look.")
    ] = 1.0,
    transparent: Annotated[bool, Field(description="Leave the page background out (not for JPG).")] = False,
    delivery: Annotated[
        Literal["inline", "url"],
        Field(
            description=(
                "inline: the image itself, to look at. url: a download link that expires after a few "
                "minutes, for large images or to hand on. Images too large to send inline become a link."
            )
        ),
    ] = "inline",
) -> list[ImageContent | TextContent]:
    """Render one page of a design as an image, exactly as the editor draws it, to check how it looks
    (after edit_design, for example). It shows the live state when the design is open in the editor."""
    throttle(ExportRateThrottle())
    design = _design(design_id)
    result = export_image(
        design,
        page=page_index(page),
        format=format,
        quality=quality,
        scale=scale,
        transparent=transparent,
    )
    info: dict[str, Any] = {
        "design_id": str(design.pk),
        "page": result.page_index + 1,
        "page_id": result.page_id,
        "format": result.format,
        "width": result.width,
        "height": result.height,
        "bytes": len(result.data),
        "editor_url": editor_url(design),
    }
    if result.warnings:
        info["warnings"] = list(result.warnings)
    if delivery == "inline" and len(result.data) > settings.MCP_EXPORT_INLINE_MAX_BYTES:
        info["note"] = (
            f"The image is larger than {settings.MCP_EXPORT_INLINE_MAX_BYTES} bytes, so it is sent as a "
            "link. Use a smaller scale, or jpg/webp, to get it inline."
        )
        delivery = "url"
    if delivery == "url":
        info["url"] = store_image(result.data, result.mime)
        info["expires_in_seconds"] = settings.MCP_EXPORT_URL_TTL_SECONDS
        return [TextContent(text=json.dumps(info))]
    return [
        ImageContent(data=base64.b64encode(result.data).decode("ascii"), mime_type=result.mime),
        TextContent(text=json.dumps(info)),
    ]
