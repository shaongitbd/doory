"""Database lookups the document toolkit needs while it applies operations (`doc.ops.Resolver`)."""

from __future__ import annotations

import uuid
from typing import Any

from django.conf import settings
from django.db.models import Q
from mcp.server.mcpserver.exceptions import ToolError
from rest_framework.exceptions import APIException

from apps.apitokens.scopes import ASSETS_WRITE
from apps.assets.models import Asset
from apps.assets.services import create_asset
from apps.assets.uploads import clean_name
from apps.designs.doc.builders import primary_family
from apps.designs.doc.ops import ImageSource
from apps.elements.models import Element
from apps.fonts.models import FontFamily
from apps.gallery.models import Template

from . import context
from .tools.assets import import_url_asset


def _uuid(value: str | None) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


def _places(node: Any, asset_id: str) -> bool:
    if isinstance(node, dict):
        return node.get("assetId") == asset_id or any(_places(v, asset_id) for v in node.values())
    if isinstance(node, list):
        return any(_places(v, asset_id) for v in node)
    return False


def _in_published_template(asset: Asset) -> bool:
    """Whether a published template by the asset's owner places it (its pictures are shared with everyone
    who uses the template)."""
    templates = Template.objects.filter(is_published=True, created_by_id=asset.owner_id).only("document")
    return any(_places(t.document, str(asset.pk)) for t in templates.iterator())


def _copy_for(user, asset: Asset) -> Asset:
    """`user`'s copy of a template picture, made once."""
    existing = Asset.objects.filter(owner=user, meta__copied_from=str(asset.pk)).first()
    if existing is not None:
        return existing
    with asset.file.open("rb") as handle:
        data = handle.read()
    name = clean_name(asset.name or "Image")
    return create_asset(user, data, name=name, meta={"copied_from": str(asset.pk)})


class DjangoResolver:
    """Pictures come from the caller's own uploads or the published element catalogue; fonts from the
    catalogue plus the caller's uploaded fonts."""

    def __init__(self, user, *, allow_urls: bool | None = None, url_throttle=None) -> None:
        self.user = user
        self._urls: dict[str, ImageSource] = {}
        self._cutouts: dict[tuple, ImageSource] = {}
        self._sealed = False
        self.allow_urls = allow_urls  # None: when the MCP caller has `assets:write`
        self.url_throttle = url_throttle  # throttle class charged per new URL; None: `upload`

    def image(
        self, *, asset_id: str | None = None, element_id: str | None = None, url: str | None = None
    ) -> ImageSource:
        if url is not None:
            if url in self._urls:
                return self._urls[url]
            if self.allow_urls is False or not getattr(settings, "URL_IMAGE_UPLOADS", True):
                raise LookupError("URL image uploads are switched off on this server.")
            caller = context.current()
            allowed = self.allow_urls
            if allowed is None:
                allowed = caller is not None and caller.has(ASSETS_WRITE)
            if not allowed:
                raise LookupError(
                    f"Uploading from a URL needs the `{ASSETS_WRITE}` scope. "
                    "Create a token with it in Doory: Account settings > API tokens."
                )
            try:
                asset = import_url_asset(
                    self.user, url, rate_throttle=self.url_throttle() if self.url_throttle else None
                )
            except (ToolError, APIException) as exc:
                raise LookupError(str(getattr(exc, "detail", exc))) from exc
            source = ImageSource(
                asset.file.url,
                asset.width or 1,
                asset.height or 1,
                asset_id=str(asset.pk),
                name=asset.name or None,
            )
            self._urls[url] = source
            return source
        if asset_id is not None:
            asset = (
                Asset.objects.filter(pk=_uuid(asset_id), owner=self.user).first() if _uuid(asset_id) else None
            )
            if asset is None or asset.kind == Asset.Kind.AUDIO:
                raise LookupError(f"There is no picture {asset_id!r} in your uploads (see list_assets).")
            return ImageSource(
                asset.file.url,
                asset.width or 1,
                asset.height or 1,
                asset_id=str(asset.pk),
                name=asset.name or None,
            )
        element = (
            Element.objects.filter(pk=_uuid(element_id), is_published=True, pack__is_published=True).first()
            if _uuid(element_id)
            else None
        )
        if element is None:
            raise LookupError(f"There is no element {element_id!r} (see search_elements).")
        return ImageSource(element.svg.url, element.width or 100, element.height or 100, name=element.name)

    def remove_background(self, *, obj: dict, model: str | None = None) -> ImageSource:
        """The cut-out of `obj`'s picture. The AI call runs in `prepare_background_removal`, before the design
        is locked; here (under the lock) only what was prepared is handed out."""
        key = self._cutout_key(obj, model)
        if key in self._cutouts:
            return self._cutouts[key]
        if not self._sealed:
            return self.prepare_background_removal(obj=obj, model=model)
        raise LookupError(
            "This picture was added or changed in the same call: remove its background in a second "
            "edit_design call."
        )

    def prepare_background_removal(self, *, obj: dict, model: str | None = None) -> ImageSource:
        caller = context.current()
        if caller is None or not caller.has(ASSETS_WRITE):
            raise LookupError(
                f"Removing backgrounds needs the `{ASSETS_WRITE}` scope. "
                "Create a token with it in Doory: Account settings > API tokens."
            )
        from .tools.ai import choose_model, reserve_run, run_model

        key = self._cutout_key(obj, model)
        if key in self._cutouts:
            return self._cutouts[key]
        try:
            option = choose_model(self.user, model)
            asset, shared = self._source_asset(obj)
            reserve_run(self.user, option)  # throttles and quota before anything is copied or sent
            if shared:
                asset = _copy_for(self.user, asset)
            cutout = run_model(self.user, asset, option)
        except ToolError as exc:
            raise LookupError(str(exc)) from exc
        source = ImageSource(
            cutout.file.url,
            cutout.width or 1,
            cutout.height or 1,
            asset_id=str(cutout.pk),
            name=cutout.name or None,
        )
        self._cutouts[key] = source
        return source

    def seal(self, sealed: bool = True) -> None:
        """From now on (the design is locked) nothing slow runs: no AI calls. `False` opens it again, for an
        edit that falls back from a live room to the saved content and prepares that first."""
        self._sealed = sealed

    @staticmethod
    def _cutout_key(obj: dict, model: str | None) -> tuple:
        return (obj.get("id"), obj.get("assetId"), obj.get("src"), model)

    def _source_asset(self, obj: dict) -> tuple[Asset, bool]:
        """The upload behind `obj`, and whether it is shared: the caller's own, or a picture a published
        template places (copied into the caller's uploads before use). Nothing else, and never a file looked
        up by a path from the document."""
        uid = _uuid(obj.get("assetId"))
        asset = Asset.objects.filter(pk=uid).exclude(kind=Asset.Kind.AUDIO).first() if uid else None
        if asset is not None and asset.owner_id == self.user.pk:
            return asset, False
        if asset is not None and asset.kind == Asset.Kind.IMAGE and _in_published_template(asset):
            return asset, True
        raise LookupError(
            "Only pictures from your uploads or a template can have their background removed. Upload it "
            "first (upload_image_from_url), then replace_image."
        )

    def font_category(self, family: str) -> str | None:
        name = primary_family(family)
        return (
            FontFamily.objects.filter(Q(owner__isnull=True) | Q(owner=self.user), family__iexact=name)
            .values_list("category", flat=True)
            .first()
        )
