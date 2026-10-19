"""Upload pipeline: content sniffing, sanitising, quota and storage for user assets."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from xml.etree.ElementTree import ParseError

from defusedxml.common import DefusedXmlException
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Sum

from apps.core import svg
from apps.core.images import ImageBusy, ImageError, make_thumbnail, process_image_upload

from .audio import AudioError, looks_like_audio, parse_audio
from .exceptions import FileTooLarge, InvalidFile, QuotaExceeded, ServerBusy
from .models import Asset
from .storage import delete_files

MAX_SVG_DIMENSION = 12_000
_BOM = b"\xef\xbb\xbf"


@dataclass(frozen=True)
class PreparedFile:
    kind: str
    data: bytes
    mime: str
    ext: str
    width: int
    height: int
    thumbnail: bytes | None
    #: What the file says about itself (audio: codec, channels, rate, duration); merged into `Asset.meta`.
    meta: dict | None = None


def read_upload(uploaded_file) -> bytes:
    """Read an uploaded file into memory with a hard cap (`MAX_UPLOAD_BYTES`)."""
    limit = settings.MAX_UPLOAD_BYTES
    if uploaded_file.size is not None and uploaded_file.size > limit:
        raise FileTooLarge()
    data = uploaded_file.read(limit + 1)
    if len(data) > limit:
        raise FileTooLarge()
    return data


def _looks_like_markup(data: bytes) -> bool:
    head = data[:2048]
    if head.startswith(_BOM):
        head = head[len(_BOM) :]
    return head.lstrip().startswith(b"<")


def _svg_dimensions(width: float, height: float) -> tuple[int, int]:
    scale = min(1.0, MAX_SVG_DIMENSION / max(width, height, 1))
    return max(1, round(width * scale)), max(1, round(height * scale))


def _prepare_svg(data: bytes) -> PreparedFile:
    if len(data) > svg.MAX_BYTES:
        raise FileTooLarge("The SVG is too large.")
    try:
        clean = svg.sanitize_svg(data)
        info = svg.svg_info(clean)
        width, height = _svg_dimensions(info.width, info.height)
        clean = svg.with_intrinsic_size(clean, width, height)
    except (svg.SvgError, DefusedXmlException, ParseError) as exc:
        raise InvalidFile("The file is not a valid, safe SVG.") from exc
    return PreparedFile("svg", clean, "image/svg+xml", "svg", width, height, None)


def _prepare_raster(data: bytes) -> PreparedFile:
    try:
        processed = process_image_upload(BytesIO(data), max_bytes=settings.MAX_UPLOAD_BYTES)
    except ImageBusy as exc:
        raise ServerBusy() from exc
    except ImageError as exc:
        raise InvalidFile(str(exc)) from exc
    try:
        thumbnail: bytes | None = make_thumbnail(processed.data)
    except ImageError:
        thumbnail = None
    return PreparedFile(
        "image", processed.data, processed.mime, processed.ext, processed.width, processed.height, thumbnail
    )


def _prepare_audio(data: bytes) -> PreparedFile:
    try:
        info = parse_audio(data)
    except AudioError as exc:
        raise InvalidFile(f"The audio file could not be read. {exc}") from exc
    return PreparedFile("audio", data, info.mime, info.ext, 0, 0, None, {"audio": info.as_meta()})


def prepare_file(data: bytes) -> PreparedFile:
    """Decide the type from the content (never the filename) and return a safe, normalised copy."""
    if not data:
        raise InvalidFile("The file is empty.")
    if looks_like_audio(data):
        return _prepare_audio(data)
    return _prepare_svg(data) if _looks_like_markup(data) else _prepare_raster(data)


def storage_used(owner) -> int:
    return Asset.objects.filter(owner=owner).aggregate(total=Sum("size"))["total"] or 0


def create_asset(
    owner, data: bytes, *, name: str, tags: list[str] | None = None, meta: dict | None = None
) -> Asset:
    """Validate, store and register an uploaded file for `owner`; enforces the per-user storage quota."""
    prepared = prepare_file(data)
    asset = Asset(
        owner=owner,
        kind=prepared.kind,
        name=name,
        width=prepared.width,
        height=prepared.height,
        size=len(prepared.data),
        mime=prepared.mime,
        tags=tags or [],
        meta={**(prepared.meta or {}), **(meta or {})},
    )
    stored: list[str] = []
    try:
        with transaction.atomic():
            get_user_model().objects.select_for_update().get(pk=owner.pk)
            if storage_used(owner) + asset.size > settings.USER_STORAGE_QUOTA_BYTES:
                raise QuotaExceeded()
            asset.file.save(f"{asset.id}.{prepared.ext}", ContentFile(prepared.data), save=False)
            stored.append(asset.file.name)
            if prepared.thumbnail:
                asset.thumbnail.save(f"{asset.id}.webp", ContentFile(prepared.thumbnail), save=False)
                stored.append(asset.thumbnail.name)
            asset.save()
    except Exception:
        delete_files(asset.file.storage, stored)
        raise
    return asset
