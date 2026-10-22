"""Turning a checked clip into a stored asset: right away when rewrapping is enough, else in the background.

A web-ready clip (see `video.VideoInfo.web_ready`) is rewrapped, given its stills and stored within the
request: a second or two. Anything else is registered at once with `status=processing`, holding its source
size against the owner's quota (a clip that fails stops counting), and converted by a small pool of threads
in this process (`VIDEO_MAX_CONCURRENCY`). The editor polls the asset until it turns `ready` or `failed`.

There is no job queue to survive a restart: a conversion that dies with its process is noticed by its age
(`fail_stale`, called when the owner lists or opens their uploads, and by `manage.py sweep_video_jobs`) and
marked failed, so the upload never spins forever.
"""

from __future__ import annotations

import logging
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files import File
from django.core.files.base import ContentFile
from django.db import connections, transaction
from django.db.models import Sum
from django.utils import timezone

from . import video
from .exceptions import InvalidFile, QuotaExceeded, ServerBusy
from .models import Asset
from .storage import delete_files

logger = logging.getLogger(__name__)

STALE_GRACE_SECONDS = 5 * 60
INTERRUPTED = "The conversion was interrupted. Upload the video again."
FAILED = "The video could not be converted."
QUOTA = "Your storage quota is full. Delete some uploads to free up space."


@dataclass(frozen=True)
class Converted:
    clip: Path
    info: video.VideoInfo
    stills: video.Stills
    audio: Path | None


def convert(source: Path, info: video.VideoInfo) -> Converted:
    """Make the web-ready MP4 next to `source`, then its stills and its sound."""
    target = source.parent / "clip.mp4"
    result = video.normalize(source, target, info)
    stills = video.make_stills(target, result)
    audio = source.parent / "audio.m4a"
    has_audio = result.has_audio and video.extract_audio(target, audio)
    return Converted(target, result, stills, audio if has_audio else None)


class Duplicate(Exception):
    """The owner already has a clip from the same source (another request made it first)."""

    def __init__(self, asset: Asset):
        super().__init__()
        self.asset = asset


def _claim(asset: Asset, same: dict | None) -> None:
    """Under the owner's lock: refuse a clip the owner already has from the same source (`same`: filters on
    the asset, say its stock provider and id), and remove their failed attempts at it, which this replaces."""
    if not same:
        return
    rows = Asset.objects.filter(owner=asset.owner_id, kind=Asset.Kind.VIDEO, **same).exclude(pk=asset.pk)
    existing = rows.exclude(status=Asset.Status.FAILED).first()
    if existing is not None:
        raise Duplicate(existing)
    rows.delete()


def _used_by_others(owner, asset_id) -> int:
    rows = Asset.objects.filter(owner=owner).exclude(pk=asset_id)
    return rows.aggregate(total=Sum("size"))["total"] or 0


def _save_files(asset: Asset, converted: Converted) -> list[str]:
    """Store the clip and its derived files on `asset` (not saved yet). Returns the stored names."""
    stored: list[str] = []
    try:
        with converted.clip.open("rb") as handle:
            asset.file.save(f"{asset.id}.mp4", File(handle), save=False)
        stored.append(asset.file.name)
        asset.poster.save(f"{asset.id}.webp", ContentFile(converted.stills.poster), save=False)
        stored.append(asset.poster.name)
        asset.thumbnail.save(f"{asset.id}.webp", ContentFile(converted.stills.thumbnail), save=False)
        stored.append(asset.thumbnail.name)
        if converted.stills.filmstrip:
            asset.filmstrip.save(f"{asset.id}.webp", ContentFile(converted.stills.filmstrip), save=False)
            stored.append(asset.filmstrip.name)
        if converted.audio:
            with converted.audio.open("rb") as handle:
                asset.audio.save(f"{asset.id}.m4a", File(handle), save=False)
            stored.append(asset.audio.name)
    except Exception:
        delete_files(asset.file.storage, stored)
        raise
    return stored


def _describe(asset: Asset, converted: Converted, stored_size: int) -> None:
    info = converted.info
    meta = dict(asset.meta or {})
    meta["video"] = {**info.as_meta(), "strip": converted.stills.strip}
    asset.width, asset.height = info.width, info.height
    asset.size = stored_size
    asset.mime = video.MP4_MIME
    asset.meta = meta
    asset.status = Asset.Status.READY
    asset.error = ""


def _stored_size(converted: Converted) -> int:
    size = converted.clip.stat().st_size + len(converted.stills.poster) + len(converted.stills.thumbnail)
    size += len(converted.stills.filmstrip or b"")
    return size + (converted.audio.stat().st_size if converted.audio else 0)


def store(asset: Asset, converted: Converted, *, new: bool, same: dict | None = None) -> Asset:
    """Store the files, then (under the owner's lock) check the quota and save the row.

    The files go up first so the owner's row is never locked while hundreds of megabytes travel to storage.
    A new clip made from a source the owner already has (`same`, see `_claim`) raises `Duplicate` instead.
    A background job (`new=False`) only updates a row that is still `processing`: a clip deleted, or given up
    on as interrupted (`fail_stale`), while it was being converted must not come back, and its files are
    removed again.
    """
    stored = _save_files(asset, converted)
    _describe(asset, converted, _stored_size(converted))
    try:
        with transaction.atomic():
            get_user_model().objects.select_for_update().get(pk=asset.owner_id)
            if new:
                _claim(asset, same)
            if _used_by_others(asset.owner_id, asset.pk) + asset.size > settings.USER_STORAGE_QUOTA_BYTES:
                raise QuotaExceeded()
            if new:
                asset.save()
            else:
                fields = ("file", "poster", "thumbnail", "filmstrip", "audio", "width", "height", "size")
                values = {name: getattr(asset, name) for name in fields}
                values.update(mime=asset.mime, meta=asset.meta, status=asset.status, error="")
                rows = Asset.objects.filter(pk=asset.pk, status=Asset.Status.PROCESSING)
                if not rows.update(**values, updated_at=timezone.now()):
                    delete_files(asset.file.storage, stored)
    except Exception:
        delete_files(asset.file.storage, stored)
        raise
    return asset


def reserve(asset: Asset, same: dict | None = None) -> Asset:
    """Register a clip that still has to be converted, holding its source size against the quota."""
    with transaction.atomic():
        get_user_model().objects.select_for_update().get(pk=asset.owner_id)
        _claim(asset, same)
        used = Asset.objects.filter(owner=asset.owner_id).aggregate(total=Sum("size"))["total"] or 0
        if used + asset.size > settings.USER_STORAGE_QUOTA_BYTES:
            raise QuotaExceeded()
        asset.status = Asset.Status.PROCESSING
        asset.save()
    return asset


def create_video_asset(
    owner,
    source: Path,
    info: video.VideoInfo,
    *,
    name: str,
    tags: list[str] | None = None,
    meta=None,
    same: dict | None = None,
) -> Asset:
    """Register the clip at `source` (inside its own work directory, which this takes over) for `owner`.

    Returns a `ready` asset when the clip only needed rewrapping, else a `processing` one whose conversion
    starts once the surrounding transaction commits. With `same`, raises `Duplicate` when the owner already
    has a clip from that source and replaces their failed attempts at it.
    """
    asset = Asset(
        owner=owner,
        kind=Asset.Kind.VIDEO,
        name=name,
        width=info.width,
        height=info.height,
        size=info.size,
        mime=video.MP4_MIME,
        tags=tags or [],
        meta={**(meta or {}), "video": info.as_meta()},
    )
    workdir = source.parent
    if not info.web_ready:
        try:
            reserve(asset, same)
        except Exception:
            shutil.rmtree(workdir, ignore_errors=True)
            raise
        transaction.on_commit(lambda: submit(asset.pk, source, info))
        return asset
    try:
        try:
            with video.slot():
                converted = convert(source, info)
        except video.VideoBusy as exc:
            raise ServerBusy() from exc
        except video.VideoError as exc:
            raise InvalidFile(str(exc)) from exc
        return store(asset, converted, new=True, same=same)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ---- background conversions --------------------------------------------------------------------

_pool_lock = threading.Lock()
_pool: ThreadPoolExecutor | None = None


def _executor() -> ThreadPoolExecutor:
    global _pool
    with _pool_lock:
        if _pool is None:
            workers = max(1, int(settings.VIDEO_MAX_CONCURRENCY))
            _pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="video-convert")
        return _pool


def submit(asset_id, source: Path, info: video.VideoInfo) -> None:
    _executor().submit(run, asset_id, source, info)


def _fail(asset_id, message: str) -> None:
    # A failed clip keeps no files, so it no longer counts against the quota.
    Asset.objects.filter(pk=asset_id, status=Asset.Status.PROCESSING).update(
        status=Asset.Status.FAILED, error=message[:255], size=0, updated_at=timezone.now()
    )


def _start(asset_id) -> bool:
    """Mark a conversion as started, so `fail_stale` counts its age from now rather than from the upload (it
    may have waited behind others). False when the clip was deleted or given up on while it waited."""
    rows = Asset.objects.filter(pk=asset_id, status=Asset.Status.PROCESSING)
    return bool(rows.update(updated_at=timezone.now()))


def run(asset_id, source: Path, info: video.VideoInfo) -> None:
    """Convert and store one clip; on any failure the asset says why instead of staying `processing`."""
    try:
        with video.slot(wait=None):
            if not _start(asset_id):
                return
            converted = convert(source, info)
        asset = Asset.objects.filter(pk=asset_id, status=Asset.Status.PROCESSING).first()
        if asset is not None:
            store(asset, converted, new=False)
    except QuotaExceeded:
        _fail(asset_id, QUOTA)
    except video.VideoError as exc:
        _fail(asset_id, str(exc) or FAILED)
    except Exception:
        logger.exception("Converting video asset %s failed.", asset_id)
        _fail(asset_id, FAILED)
    finally:
        shutil.rmtree(source.parent, ignore_errors=True)
        connections.close_all()  # this thread's own connections


def fail_stale(queryset=None) -> int:
    """Mark conversions that outlived any possible run (their process died) as failed."""
    limit = settings.VIDEO_TRANSCODE_TIMEOUT_SECONDS + video.STILLS_TIMEOUT_SECONDS * 2 + STALE_GRACE_SECONDS
    rows = Asset.objects.all() if queryset is None else queryset
    cutoff = timezone.now() - timedelta(seconds=limit)
    return rows.filter(status=Asset.Status.PROCESSING, updated_at__lt=cutoff).update(
        status=Asset.Status.FAILED, error=INTERRUPTED, size=0, updated_at=timezone.now()
    )
