"""Portable project backups shared by browser-local projects and the MCP server."""

from __future__ import annotations

import contextlib
import copy
import json
import re
import shutil
import unicodedata
import uuid
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from io import BytesIO
from tempfile import SpooledTemporaryFile
from typing import BinaryIO

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.exceptions import APIException

from apps.assets.models import Asset
from apps.assets.services import create_asset
from apps.assets.uploads import clean_name

from . import services
from .edits import current_document
from .models import Design, Folder
from .serializers import TitleField
from .validators import validate_document

FORMAT = "doory-project"
FORMAT_VERSION = 1
MIME = "application/vnd.doory.project+zip"
MANIFEST = "project.json"
THUMBNAIL = "thumbnail"
MAX_PROJECT_BYTES = 512 * 1024 * 1024
MAX_EXPANDED_BYTES = 1024 * 1024 * 1024
MAX_ENTRIES = 5002
MAX_MANIFEST_BYTES = 10 * 1024 * 1024
SPOOL_BYTES = 8 * 1024 * 1024
LOCAL_REFERENCE = re.compile(r"^idb://([0-9a-f-]{36})$", re.IGNORECASE)
SUPPORTED_ASSET_KINDS = frozenset({Asset.Kind.IMAGE, Asset.Kind.SVG, Asset.Kind.AUDIO})


class ProjectArchiveError(APIException):
    status_code = 400
    default_code = "invalid_project_backup"
    default_detail = "This project backup is not valid."


@dataclass
class ProjectBackup:
    file: BinaryIO
    size: int
    filename: str

    def __enter__(self) -> ProjectBackup:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.file.close()


@dataclass(frozen=True)
class ArchivedAsset:
    id: str
    path: str
    name: str
    mime: str
    width: int
    height: int


def _project_filename(title: str) -> str:
    plain = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    clean = re.sub(r"[^a-zA-Z0-9._ -]+", "", plain).strip()
    clean = re.sub(r"[ .]+", "-", clean).strip(".")[:120]
    return f"{clean or 'design'}.doory"


def _asset_ids(document: dict) -> list[str]:
    """Asset ids in first-seen order; catalogue elements have no assetId and are left as remote content."""
    found: dict[str, None] = {}
    stack: list[object] = [document]
    while stack:
        value = stack.pop()
        if isinstance(value, dict):
            raw = value.get("assetId")
            if isinstance(raw, str):
                with contextlib.suppress(ValueError):
                    found.setdefault(str(uuid.UUID(raw)), None)
            stack.extend(reversed(tuple(value.values())))
        elif isinstance(value, list):
            stack.extend(reversed(value))
    return list(found)


def _portable_document(document: dict, asset_ids: set[str]) -> dict:
    """Replace account media URLs with the local reference understood by browser project imports."""
    portable = copy.deepcopy(document)
    stack: list[object] = [portable]
    while stack:
        value = stack.pop()
        if isinstance(value, dict):
            raw = value.get("assetId")
            try:
                asset_id = str(uuid.UUID(raw)) if isinstance(raw, str) else None
            except ValueError:
                asset_id = None
            if asset_id in asset_ids:
                for key in ("src", "url"):
                    if isinstance(value.get(key), str):
                        value[key] = f"idb://{asset_id}"
            stack.extend(value.values())
        elif isinstance(value, list):
            stack.extend(value)
    return portable


def _copy_to_zip(archive: zipfile.ZipFile, path: str, source: BinaryIO) -> None:
    with archive.open(path, "w", force_zip64=True) as target:
        shutil.copyfileobj(source, target, length=1024 * 1024)


def export_project(design: Design) -> ProjectBackup:
    """Build a versioned backup from the live design state and the owner's referenced uploads."""
    document = current_document(design)
    ids = _asset_ids(document)
    by_id = {
        str(asset.pk): asset
        for asset in Asset.objects.filter(owner=design.owner, pk__in=ids).order_by("created_at")
    }
    missing = [asset_id for asset_id in ids if asset_id not in by_id]
    if missing:
        raise ProjectArchiveError("One or more files used by this design are missing from account storage.")
    unsupported = [asset for asset in by_id.values() if asset.kind not in SUPPORTED_ASSET_KINDS]
    if unsupported:
        raise ProjectArchiveError(
            "Project backups do not support video uploads yet. Remove the video or export this design "
            "from the editor instead."
        )
    if sum(asset.size for asset in by_id.values()) > MAX_EXPANDED_BYTES:
        raise ProjectArchiveError("This project is too large to back up safely.")

    archived = [
        {
            "id": asset_id,
            "path": f"assets/{asset_id}",
            "name": by_id[asset_id].name,
            "mime": by_id[asset_id].mime,
            "width": by_id[asset_id].width,
            "height": by_id[asset_id].height,
        }
        for asset_id in ids
    ]
    manifest = {
        "format": FORMAT,
        "version": FORMAT_VERSION,
        "exportedAt": datetime.now(UTC).isoformat(),
        "title": design.title,
        "document": _portable_document(document, set(ids)),
        **({"thumbnail": {"path": THUMBNAIL, "mime": "image/webp"}} if design.thumbnail else {}),
        "assets": archived,
    }
    manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
    if len(manifest_bytes) > MAX_MANIFEST_BYTES:
        raise ProjectArchiveError("This project's document is too large to back up safely.")
    # ProjectBackup owns this handle and closes it after delivery; a with block here would close it too soon.
    target = SpooledTemporaryFile(max_size=SPOOL_BYTES, mode="w+b")  # noqa: SIM115
    try:
        with zipfile.ZipFile(target, "w", allowZip64=True) as archive:
            archive.writestr(
                MANIFEST,
                manifest_bytes,
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=6,
            )
            if design.thumbnail:
                try:
                    with design.thumbnail.storage.open(design.thumbnail.name, "rb") as thumbnail:
                        _copy_to_zip(archive, THUMBNAIL, thumbnail)
                except OSError as exc:
                    raise ProjectArchiveError("The design thumbnail could not be read.") from exc
            for asset_id in ids:
                asset = by_id[asset_id]
                try:
                    with asset.file.storage.open(asset.file.name, "rb") as source:
                        _copy_to_zip(archive, f"assets/{asset_id}", source)
                except OSError as exc:
                    message = f'The file "{asset.name or asset_id}" could not be read.'
                    raise ProjectArchiveError(message) from exc
        size = target.tell()
        if size > MAX_PROJECT_BYTES:
            raise ProjectArchiveError("This project is too large to back up safely.")
        target.seek(0)
        return ProjectBackup(target, size, _project_filename(design.title))
    except Exception:
        target.close()
        raise


def _integer(value: object, *, low: int = 0) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= low


def _parse_asset(value: object) -> ArchivedAsset:
    if not isinstance(value, dict):
        raise ProjectArchiveError("This project backup has invalid asset information.")
    try:
        asset_id = str(uuid.UUID(value.get("id", "")))
    except (ValueError, AttributeError, TypeError) as exc:
        raise ProjectArchiveError("This project backup has invalid asset information.") from exc
    valid = (
        value.get("path") == f"assets/{asset_id}"
        and isinstance(value.get("name"), str)
        and len(value["name"]) <= 500
        and isinstance(value.get("mime"), str)
        and len(value["mime"]) <= 200
        and _integer(value.get("width"))
        and _integer(value.get("height"))
    )
    if not valid:
        raise ProjectArchiveError("This project backup has invalid asset information.")
    return ArchivedAsset(
        asset_id, value["path"], value["name"], value["mime"], value["width"], value["height"]
    )


def _parse_manifest(data: bytes) -> tuple[dict, list[ArchivedAsset], str, dict | None]:
    try:
        value = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProjectArchiveError("This project backup does not contain valid project data.") from exc
    if not isinstance(value, dict) or value.get("format") != FORMAT or value.get("version") != FORMAT_VERSION:
        raise ProjectArchiveError("This is not a supported Doory project backup.")
    title, document, raw_assets = value.get("title"), value.get("document"), value.get("assets")
    if (
        not isinstance(title, str)
        or len(title) > 500
        or not isinstance(document, dict)
        or not isinstance(raw_assets, list)
    ):
        raise ProjectArchiveError("This project backup is not valid.")
    assets = [_parse_asset(item) for item in raw_assets]
    if len({asset.id for asset in assets}) != len(assets):
        raise ProjectArchiveError("This project backup contains duplicate assets.")
    thumbnail = value.get("thumbnail")
    if thumbnail is not None and (
        not isinstance(thumbnail, dict)
        or thumbnail.get("path") != THUMBNAIL
        or not isinstance(thumbnail.get("mime"), str)
        or len(thumbnail["mime"]) > 200
    ):
        raise ProjectArchiveError("This project backup has invalid thumbnail information.")
    return document, assets, TitleField().run_validation(title), thumbnail


def _local_ids(document: dict) -> list[str]:
    found: dict[str, None] = {}
    stack: list[object] = [document.get("pages"), document.get("audioTracks")]
    while stack:
        value = stack.pop()
        if isinstance(value, dict):
            for key, child in value.items():
                if key in ("src", "url") and isinstance(child, str):
                    match = LOCAL_REFERENCE.fullmatch(child)
                    if match:
                        with contextlib.suppress(ValueError):
                            found.setdefault(str(uuid.UUID(match.group(1))), None)
                else:
                    stack.append(child)
        elif isinstance(value, list):
            stack.extend(value)
    return list(found)


def _rewrite_local_references(document: dict, replacements: dict[str, Asset]) -> dict:
    rewritten = copy.deepcopy(document)
    stack: list[object] = [rewritten.get("pages"), rewritten.get("audioTracks")]
    while stack:
        value = stack.pop()
        if isinstance(value, dict):
            for key, child in tuple(value.items()):
                match = (
                    LOCAL_REFERENCE.fullmatch(child)
                    if key in ("src", "url") and isinstance(child, str)
                    else None
                )
                asset = None
                if match:
                    with contextlib.suppress(ValueError):
                        asset = replacements.get(str(uuid.UUID(match.group(1))))
                if asset is not None:
                    value[key] = asset.file.url
                    if key == "src" and ("type" in value or "kind" in value):
                        value["assetId"] = str(asset.pk)
                else:
                    stack.append(child)
        elif isinstance(value, list):
            stack.extend(value)
    return rewritten


def _checked_archive(data: bytes) -> tuple[zipfile.ZipFile, dict, list[ArchivedAsset], str, dict | None]:
    if len(data) > MAX_PROJECT_BYTES:
        raise ProjectArchiveError("This project backup is too large to open safely.")
    try:
        archive = zipfile.ZipFile(BytesIO(data))
        infos = archive.infolist()
    except (OSError, zipfile.BadZipFile) as exc:
        raise ProjectArchiveError("This project backup could not be opened.") from exc
    try:
        if len(infos) > MAX_ENTRIES or sum(info.file_size for info in infos) > MAX_EXPANDED_BYTES:
            raise ProjectArchiveError("This project backup is too large to open safely.")
        names = [info.filename for info in infos]
        if len(names) != len(set(names)) or any(info.flag_bits & 1 for info in infos):
            raise ProjectArchiveError("This project backup is not valid.")
        by_name = {info.filename: info for info in infos}
        manifest_info = by_name.get(MANIFEST)
        if manifest_info is None or manifest_info.file_size > MAX_MANIFEST_BYTES:
            raise ProjectArchiveError("This project backup does not contain a valid project file.")
        document, assets, title, thumbnail = _parse_manifest(archive.read(manifest_info))
        expected = {MANIFEST, *(asset.path for asset in assets), *([THUMBNAIL] if thumbnail else [])}
        if set(names) != expected:
            raise ProjectArchiveError("This project backup contains missing or unexpected files.")
        return archive, document, assets, title, thumbnail
    except Exception:
        archive.close()
        raise


def import_project(data: bytes, owner, *, folder: Folder | None = None) -> Design:
    """Validate a `.doory` archive, upload its files, and create a new account design."""
    archive, document, assets, title, thumbnail = _checked_archive(data)
    created: list[Asset] = []
    design: Design | None = None
    try:
        referenced = _local_ids(document)
        archived = {asset.id: asset for asset in assets}
        if set(referenced) != set(archived):
            raise ProjectArchiveError("This project backup is missing one or more files used by the design.")
        replacements: dict[str, Asset] = {}
        by_name = {info.filename: info for info in archive.infolist()}
        for asset_id in referenced:
            spec = archived[asset_id]
            info = by_name[spec.path]
            if info.file_size > settings.MAX_UPLOAD_BYTES:
                raise ProjectArchiveError(f'The file "{spec.name or asset_id}" is too large to upload.')
            asset = create_asset(owner, archive.read(info), name=clean_name(spec.name, "Imported file"))
            created.append(asset)
            replacements[asset_id] = asset
        rewritten = _rewrite_local_references(document, replacements)
        validate_document(rewritten, max_bytes=settings.MAX_DESIGN_DOCUMENT_BYTES)
        design = services.create_design(owner, title=title, document=rewritten, folder=folder)
        if thumbnail:
            thumb = archive.read(THUMBNAIL)
            uploaded = SimpleUploadedFile("thumbnail", thumb, content_type=thumbnail["mime"])
            services.set_thumbnail(design, uploaded)
        return design
    except Exception:
        if design is not None:
            design.delete()
        if created:
            Asset.objects.filter(pk__in=[asset.pk for asset in created]).delete()
        raise
    finally:
        archive.close()
