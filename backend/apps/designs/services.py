"""Design lifecycle: creation, optimistic-concurrency saves, versions, trash, duplicates, thumbnails."""

from __future__ import annotations

import uuid
from datetime import timedelta
from io import BytesIO

from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import F, QuerySet
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import NotFound

from apps.assets.exceptions import FileTooLarge, InvalidFile, LimitReached
from apps.assets.storage import delete_files_on_commit
from apps.core.images import ImageError, make_thumbnail, process_image_upload

from .exceptions import DesignTrashed, NotInTrash, RevisionConflict
from .models import Design, DesignVersion, Folder
from .validators import DocumentInfo, describe_document, validate_document

AUTO_VERSION_INTERVAL = timedelta(minutes=10)
MAX_AUTO_VERSIONS = 50
MAX_MANUAL_VERSIONS = 100
THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024
THUMBNAIL_MAX_PIXELS = 16_000_000  # the editor sends a few hundred pixels; a small file can still hold many
THUMBNAIL_SIDE = 480
BULK_ACTIONS = ("trash", "restore", "delete", "star", "unstar", "move")
DEFAULT_TITLE = "Untitled design"
DEFAULT_SIZE = 1080


def blank_document(width: int, height: int, preset: str = "") -> dict:
    document: dict = {
        "schemaVersion": 1,
        "width": width,
        "height": height,
        "unit": "px",
        "pages": [
            {"id": str(uuid.uuid4()), "background": {"type": "solid", "color": "#ffffff"}, "objects": []}
        ],
    }
    if preset:
        document["meta"] = {"presetId": preset}
    return document


def _apply_document(design: Design, document: dict, info: DocumentInfo) -> list[str]:
    """Copy the document and the facts derived from it onto `design`; returns the fields touched."""
    design.document = document
    design.width, design.height = info.width, info.height
    design.page_count, design.preset = info.page_count, info.preset
    return ["document", "width", "height", "page_count", "preset"]


def _lock(design_id, owner, *, defer_document: bool = True) -> Design:
    queryset = Design.objects.select_for_update().filter(owner=owner)
    if defer_document:
        queryset = queryset.defer("document")
    try:
        design = queryset.get(pk=design_id)
    except Design.DoesNotExist as exc:
        raise Http404 from exc
    if design.trashed_at is not None:
        raise DesignTrashed()
    return design


def _check_design_limit(owner) -> None:
    """Must be called inside ``transaction.atomic()``. Locks the owner row so concurrent requests
    serialise their count-then-insert sequence — same pattern used by ``assets.services.create_asset``.
    """
    get_user_model().objects.select_for_update().filter(pk=owner.pk).first()
    if Design.objects.filter(owner=owner).count() >= settings.MAX_DESIGNS_PER_USER:
        raise LimitReached(f"You can keep at most {settings.MAX_DESIGNS_PER_USER} designs.")


def create_design(
    owner,
    *,
    title: str,
    document: dict,
    folder: Folder | None = None,
    template_id: object = None,
    thumbnail: ContentFile | None = None,
) -> Design:
    """Persist a validated document as a new design; the document decides size, pages and preset."""
    info = describe_document(document)
    with transaction.atomic():
        _check_design_limit(owner)
        design = Design(owner=owner, title=title, folder=folder)
        _apply_document(design, document, info)
        if thumbnail:
            design.thumbnail.save(f"{design.id}.webp", thumbnail, save=False)
        design.save()
        if template_id is not None:
            template_model = apps.get_model("gallery", "Template")
            template_model.objects.filter(pk=template_id).update(use_count=F("use_count") + 1)
    return design


def create_from_template(owner, slug: str, *, title: str | None, folder: Folder | None) -> Design:
    template_model = apps.get_model("gallery", "Template")
    try:
        template = template_model.objects.get(slug=slug, is_published=True)
    except template_model.DoesNotExist as exc:
        raise NotFound("Template not found.") from exc
    document = template.document
    validate_document(document, max_bytes=settings.MAX_DESIGN_DOCUMENT_BYTES)
    if template.preset and not describe_document(document).preset:
        meta = document.get("meta") if isinstance(document.get("meta"), dict) else {}
        document = {**document, "meta": {**meta, "presetId": template.preset}}
    # The template's picture is the copy's thumbnail until the editor saves one of its own, so a design opened
    # from a template never shows up blank on the dashboard.
    return create_design(
        owner,
        title=title or template.title[:200],
        document=document,
        folder=folder,
        template_id=template.pk,
        thumbnail=_thumbnail_copy(template.thumbnail),
    )


def _thumbnail_copy(source) -> ContentFile | None:
    """A copy of a stored thumbnail, or None when there is none (or it can no longer be read)."""
    if not source:
        return None
    try:
        with source.storage.open(source.name, "rb") as handle:
            return ContentFile(handle.read())
    except OSError:
        return None


def duplicate_design(design: Design, owner) -> Design:
    """`design` must have its document loaded. The copy starts at revision 1, unstarred, same folder."""
    if design.trashed_at is not None:
        raise DesignTrashed()
    with transaction.atomic():
        _check_design_limit(owner)
        copy = Design(
            owner=owner,
            title=f"Copy of {design.title}"[:200],
            width=design.width,
            height=design.height,
            preset=design.preset,
            document=design.document,
            page_count=design.page_count,
            folder_id=design.folder_id,
        )
        thumbnail = _thumbnail_copy(design.thumbnail)
        if thumbnail:
            copy.thumbnail.save(f"{copy.id}.webp", thumbnail, save=False)
        copy.save()
    return copy


def _record_version(design: Design, user, *, is_auto: bool, label: str = "") -> DesignVersion:
    version = DesignVersion(
        design=design,
        label=label,
        is_auto=is_auto,
        document=design.document,
        page_count=design.page_count,
        created_by=user,
    )
    thumbnail = _thumbnail_copy(design.thumbnail)
    if thumbnail:
        version.thumbnail.save(f"{version.id}.webp", thumbnail, save=False)
    version.save()
    return version


def prune_auto_versions(design: Design) -> None:
    """Keep the newest `MAX_AUTO_VERSIONS` automatic versions; manual ones are never pruned."""
    stale = list(
        DesignVersion.objects.filter(design=design, is_auto=True)
        .order_by("-created_at", "-pk")
        .values_list("pk", "thumbnail")[MAX_AUTO_VERSIONS:]
    )
    if stale:
        DesignVersion.objects.filter(pk__in=[pk for pk, _ in stale]).delete()
        delete_files_on_commit(design.thumbnail.storage, [name for _, name in stale])


def _maybe_record_auto_version(design: Design, user) -> None:
    latest = (
        DesignVersion.objects.filter(design=design)
        .order_by("-created_at")
        .values_list("created_at", flat=True)
    ).first()
    if latest is None or timezone.now() - latest >= AUTO_VERSION_INTERVAL:
        _record_version(design, user, is_auto=True)
        prune_auto_versions(design)


def record_auto_version_if_due(design: Design, user) -> None:
    """Public hook for other apps that save documents: snapshot `design` if its newest version is old."""
    _maybe_record_auto_version(design, user)


def update_design(design_id, owner, data: dict) -> Design:
    """Apply a validated PATCH. Saving a document needs `base_revision` to equal the stored revision."""
    with transaction.atomic():
        design = _lock(design_id, owner)
        touched: list[str] = []
        if "title" in data:
            design.title = data["title"]
            touched += ["title", "updated_at"]
        if "starred" in data:
            design.starred = data["starred"]
            touched.append("starred")
        if "folder" in data:
            design.folder = data["folder"]
            touched.append("folder")
        if "document" in data:
            if design.revision != data["base_revision"]:
                raise RevisionConflict(design.revision, design.updated_at)
            touched += _apply_document(design, data["document"], describe_document(data["document"]))
            design.revision += 1
            touched += ["revision", "updated_at"]
            _maybe_record_auto_version(design, owner)
        if touched:
            design.save(update_fields=sorted(set(touched)))
    return design


def trash_design(design_id, owner) -> None:
    Design.objects.filter(pk=design_id, owner=owner, trashed_at__isnull=True).update(
        trashed_at=timezone.now()
    )


def purge_designs(queryset: QuerySet[Design]) -> int:
    """Permanently delete the designs (and, through signals/cascade, their thumbnails and versions)."""
    with transaction.atomic():
        _, details = queryset.defer("document").delete()
    return details.get(Design._meta.label, 0)


def delete_permanently(design: Design) -> None:
    if design.trashed_at is None:
        raise NotInTrash()
    design.delete()


def restore_trashed(design: Design) -> Design:
    if design.trashed_at is not None:
        design.trashed_at = None
        design.save(update_fields=["trashed_at"])
    return design


def empty_trash(owner) -> int:
    return purge_designs(Design.objects.filter(owner=owner, trashed_at__isnull=False))


def purge_expired_trash(days: int) -> int:
    cutoff = timezone.now() - timedelta(days=days)
    return purge_designs(Design.objects.filter(trashed_at__isnull=False, trashed_at__lt=cutoff))


def bulk_apply(owner, ids: list, action: str, folder: Folder | None) -> int:
    """Run `action` (one of BULK_ACTIONS) on the caller's own designs in `ids`; returns how many changed."""
    owned = Design.objects.filter(owner=owner, pk__in=ids)
    with transaction.atomic():
        if action == "trash":
            return owned.filter(trashed_at__isnull=True).update(trashed_at=timezone.now())
        if action == "restore":
            return owned.filter(trashed_at__isnull=False).update(trashed_at=None)
        if action == "delete":
            return purge_designs(owned.filter(trashed_at__isnull=False))
        live = owned.filter(trashed_at__isnull=True)
        if action in ("star", "unstar"):
            return live.update(starred=action == "star")
        return live.update(folder=folder)


def create_manual_version(design_id, owner, label: str) -> DesignVersion:
    with transaction.atomic():
        design = _lock(design_id, owner, defer_document=False)
        if DesignVersion.objects.filter(design=design, is_auto=False).count() >= MAX_MANUAL_VERSIONS:
            raise LimitReached(f"A design can keep at most {MAX_MANUAL_VERSIONS} saved versions.")
        return _record_version(design, owner, is_auto=False, label=label)


def restore_version(design_id, version_id, owner) -> Design:
    with transaction.atomic():
        design = _lock(design_id, owner, defer_document=False)
        try:
            version = DesignVersion.objects.get(pk=version_id, design=design)
        except DesignVersion.DoesNotExist as exc:
            raise Http404 from exc
        validate_document(version.document, max_bytes=settings.MAX_DESIGN_DOCUMENT_BYTES)
        _record_version(design, owner, is_auto=True, label="Before restore")
        touched = _apply_document(design, version.document, describe_document(version.document))
        design.revision += 1
        design.save(update_fields=[*touched, "revision", "updated_at"])
        prune_auto_versions(design)
    return design


def set_thumbnail(design: Design, uploaded) -> Design:
    """Validate by decoding, then store a 480 px WebP. The previous file is removed after commit."""
    if design.trashed_at is not None:
        raise DesignTrashed()
    if uploaded.size is not None and uploaded.size > THUMBNAIL_MAX_BYTES:
        raise FileTooLarge("The thumbnail is larger than 2 MB.")
    data = uploaded.read(THUMBNAIL_MAX_BYTES + 1)
    if len(data) > THUMBNAIL_MAX_BYTES:
        raise FileTooLarge("The thumbnail is larger than 2 MB.")
    try:
        processed = process_image_upload(
            BytesIO(data), max_bytes=THUMBNAIL_MAX_BYTES, max_pixels=THUMBNAIL_MAX_PIXELS
        )
        webp = make_thumbnail(processed.data, THUMBNAIL_SIDE)
    except ImageError as exc:
        raise InvalidFile(str(exc)) from exc
    with transaction.atomic():
        previous = design.thumbnail.name
        design.thumbnail.save(f"{design.id}.webp", ContentFile(webp), save=False)
        design.save(update_fields=["thumbnail"])
        delete_files_on_commit(design.thumbnail.storage, [previous])
    return design
