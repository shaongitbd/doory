"""Pictures and sounds: the caller's uploads, stock photos and Freesound sounds (when there is a key)."""

from __future__ import annotations

from typing import Annotated, Any, Literal
from urllib.parse import unquote, urlsplit, urlunsplit

from django.conf import settings
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from apps.apitokens.scopes import ASSETS_WRITE, DESIGNS_READ
from apps.assets import audio_stock, credits, remote, stock
from apps.assets.audio import looks_like_audio
from apps.assets.models import Asset
from apps.assets.services import create_asset
from apps.assets.throttling import StockRateThrottle, UploadRateThrottle
from apps.assets.uploads import clean_name
from apps.designs.edits import read_current

from ..context import current
from ..registry import throttle, tool


def _bare(url: str) -> str:
    """`url` without its query and fragment: they can hold a signature or token that must not be kept."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def _asset(asset: Asset) -> dict[str, Any]:
    out = {
        "asset_id": str(asset.pk),
        "name": asset.name,
        "kind": asset.kind,
        "width": asset.width,
        "height": asset.height,
        "url": asset.file.url,
    }
    attribution = (asset.meta or {}).get("attribution")
    if attribution:
        out["attribution"] = attribution
    return out


@tool(scope=DESIGNS_READ, title="List uploads", read_only=True)
def list_assets(
    query: Annotated[str | None, Field(description="Words in the name.", max_length=100)] = None,
    limit: Annotated[int, Field(ge=1, le=100)] = 30,
) -> dict[str, Any]:
    """Your uploaded pictures, newest first. Place one with edit_design:
    {"op": "add_image", "asset_id": …}."""
    assets = Asset.objects.filter(owner=current().user).exclude(kind=Asset.Kind.AUDIO)
    if query and query.strip():
        assets = assets.filter(name__icontains=query.strip())
    return {"assets": [_asset(a) for a in assets.order_by("-created_at")[:limit]]}


@tool(scope=DESIGNS_READ, title="Search stock photos", read_only=True)
def search_stock_photos(
    query: Annotated[str, Field(min_length=1, max_length=100)],
    provider: Literal["unsplash", "pexels", "pixabay"] | None = None,
    page: Annotated[int, Field(ge=1, le=stock.MAX_PAGE)] = 1,
    per_page: Annotated[int, Field(ge=1, le=30)] = 12,
) -> dict[str, Any]:
    """Search free stock photos. Use import_stock_photo to add one to your uploads before placing it."""
    throttle(StockRateThrottle())
    return stock.search(provider, query, page, per_page)


@tool(scope=ASSETS_WRITE, title="Import a stock photo")
def import_stock_photo(
    provider: Literal["unsplash", "pexels", "pixabay"],
    photo_id: Annotated[
        str, Field(min_length=1, max_length=64, description="`id` from search_stock_photos.")
    ],
    remove_background: Annotated[
        bool,
        Field(description="Remove the photo's background immediately upon import (uses an AI server model)."),
    ] = False,
    model: Annotated[
        str | None,
        Field(description="A server model from list_ai_models; omitted: its `server_default`."),
    ] = None,
) -> dict[str, Any]:
    """Copy a stock photo into your uploads (once; importing it again returns the same asset). With
    remove_background, the transparent cut-out is returned instead (a second upload), with the `model`."""
    user = current().user
    option = _reserve_cutout(user, model) if remove_background else None
    throttle(UploadRateThrottle())
    asset, _ = stock.import_photo(user, provider, photo_id)
    return _with_cutout(user, asset, option)


def _reserve_cutout(user, model: str | None):
    """Pick the AI model and take its throttles and quota before anything is imported."""
    from .ai import choose_model, reserve_run

    option = choose_model(user, model)
    reserve_run(user, option)
    return option


def _with_cutout(user, asset: Asset, option) -> dict[str, Any]:
    if option is None:
        return _asset(asset)
    from .ai import model_info, run_model

    try:
        cutout = run_model(user, asset, option)
    except ToolError as exc:
        raise ToolError(
            f"{exc} The original picture was kept in your uploads as asset_id {asset.pk}: retry with "
            "remove_asset_background instead of importing it again."
        ) from exc
    return {**_asset(cutout), "model": model_info(option), "original_asset_id": str(asset.pk)}


def import_url_asset(user, url: str, name: str | None = None, rate_throttle=None) -> Asset:
    if not settings.URL_IMAGE_UPLOADS:
        raise ToolError("Uploading from a URL is switched off on this server.")
    throttle(rate_throttle or UploadRateThrottle(), user)
    try:
        data = remote.fetch_image(url, max_bytes=settings.MAX_UPLOAD_BYTES)
    except remote.RemoteImageError as exc:
        raise ToolError(f"{exc} Nothing was uploaded.") from exc
    if looks_like_audio(data):
        raise ToolError("That URL is not an image. Nothing was uploaded.")
    fallback = unquote(urlsplit(url).path.rsplit("/", 1)[-1]) or "Image"  # the path only, never the query
    return create_asset(user, data, name=clean_name(name or fallback), meta={"source_url": _bare(url)})


@tool(scope=ASSETS_WRITE, title="Upload an image from a URL")
def upload_image_from_url(
    url: Annotated[str, Field(min_length=8, max_length=2048, description="A public https link to an image.")],
    name: Annotated[str | None, Field(max_length=120)] = None,
    remove_background: Annotated[
        bool,
        Field(description="Remove the image's background upon upload (uses an AI server model)."),
    ] = False,
    model: Annotated[
        str | None,
        Field(description="A server model from list_ai_models; omitted: its `server_default`."),
    ] = None,
) -> dict[str, Any]:
    """Copy an image from a public https URL into your uploads; it is checked like any upload. Only use
    images the user has the right to use. With remove_background, the transparent cut-out is returned instead
    (a second upload), with the `model` used."""
    user = current().user
    option = _reserve_cutout(user, model) if remove_background else None
    return _with_cutout(user, import_url_asset(user, url, name), option)


@tool(scope=DESIGNS_READ, title="Search sounds", read_only=True)
def search_audio(
    query: Annotated[str, Field(max_length=100, description="Words to search; may be empty.")] = "",
    type: Literal["all", "music", "effects", "ambience"] = "all",
    length: Literal["any", "short", "medium", "long", "extended"] = "any",
    sort: Literal["relevance", "rating", "downloads", "newest", "shortest"] = "relevance",
    page: Annotated[int, Field(ge=1, le=audio_stock.MAX_PAGE)] = 1,
    per_page: Annotated[int, Field(ge=1, le=30)] = 12,
) -> dict[str, Any]:
    """Search free sounds on Freesound (music, sound effects, ambience), when the server has a key. Only
    the licences the server allows are returned (CC0 by default). A result with `credit_required: true`
    (CC BY) must be credited wherever the design is published; get_design_credits gives the text. Use
    import_audio to add one to your uploads."""
    throttle(StockRateThrottle())
    return audio_stock.search(query, type, "", length, sort, page, per_page)


@tool(scope=ASSETS_WRITE, title="Import a sound", idempotent=True)
def import_audio(
    sound_id: Annotated[str, Field(min_length=1, max_length=12, description="`id` from search_audio.")],
) -> dict[str, Any]:
    """Copy a Freesound sound into your audio uploads (once; importing it again returns the same asset). The
    answer includes its `credit`."""
    throttle(UploadRateThrottle())
    asset, _ = audio_stock.import_sound(current().user, sound_id)
    return {**_asset(asset), "credit": audio_stock.credit_of(asset)}


@tool(scope=DESIGNS_READ, title="Get a design's credits", read_only=True)
def get_design_credits(
    design_id: Annotated[str, Field(description="A design id from list_designs.")],
) -> dict[str, Any]:
    """The credits a design owes for the sounds it uses. `credits_text` lists the ones that must be
    credited (CC BY), one line each, ready to paste into a post's caption or a video description; it is
    empty when nothing needs credit."""
    from .designs import _design

    design = _design(design_id)
    document, _ = read_current(design)
    return credits.design_credits(document, design.owner)
