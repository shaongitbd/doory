"""Database side of the rooms. Plain synchronous functions; the async code calls them through
`database_sync_to_async`.

Durable state of a design's room: `YState.snapshot` (a compacted Y update) plus the `YUpdate` rows appended
since. `version` counts appended batches, `flushed_version` is the version `Design.document` was last saved
from, `base_revision` is the `Design.revision` the state belongs to.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from importlib import import_module

from django.conf import settings
from django.contrib.auth import HASH_SESSION_KEY
from django.db import transaction
from django.db.models import Count, F
from django.utils import timezone
from django.utils.crypto import constant_time_compare

from apps.accounts.models import User
from apps.designs.models import Design
from apps.designs.services import record_auto_version_if_due
from apps.designs.validators import describe_document
from apps.sharing.models import ShareLink
from apps.sharing.services import active_links

from .models import CollabInstance, RoomConnection, YState, YUpdate
from .signals import saving_from_room

HEARTBEAT_STALE = timedelta(seconds=30)


# ---------------------------------------------------------------------------------------------
# Y state
# ---------------------------------------------------------------------------------------------


@dataclass
class LoadedState:
    snapshot: bytes
    updates: list[bytes]
    version: int
    flushed_version: int
    base_revision: int
    title: str
    revision: int


def _reset_allowed(design_id: uuid.UUID, instance: str) -> bool:
    """A stale state is only rebuilt while nobody else is connected (their rooms would lose history)."""
    cutoff = timezone.now() - HEARTBEAT_STALE
    others = RoomConnection.objects.filter(design_id=design_id, heartbeat_at__gt=cutoff).exclude(
        instance=instance
    )
    return not others.exists()


def load_or_init(design_id: uuid.UUID, instance: str, build_snapshot: Callable[[dict], bytes]) -> LoadedState:
    """The stored Y state of a design, rebuilt from `Design.document` when it is missing or stale.

    Raises `Design.DoesNotExist` for an unknown design.
    """
    with transaction.atomic():
        design = Design.objects.select_for_update().defer("document").get(pk=design_id)
        state = YState.objects.select_for_update().filter(design_id=design_id).first()
        usable = state is not None and (
            state.base_revision == design.revision or not _reset_allowed(design_id, instance)
        )
        if usable and state is not None:
            updates = [
                bytes(row.data) for row in YUpdate.objects.filter(design_id=design_id).order_by("version")
            ]
            return LoadedState(
                bytes(state.snapshot),
                updates,
                state.version,
                state.flushed_version,
                state.base_revision,
                design.title,
                design.revision,
            )
        snapshot = build_snapshot(design.document)
        YUpdate.objects.filter(design_id=design_id).delete()
        if state is None:
            YState.objects.create(design=design, snapshot=snapshot, base_revision=design.revision)
        else:
            state.snapshot, state.version, state.flushed_version = snapshot, 0, 0
            state.base_revision = design.revision
            state.save(
                update_fields=["snapshot", "version", "flushed_version", "base_revision", "updated_at"]
            )
        return LoadedState(snapshot, [], 0, 0, design.revision, design.title, design.revision)


def reset_state(design_id: uuid.UUID, build_snapshot: Callable[[dict], bytes]) -> None:
    """Throw the stored Y state away and rebuild it from `Design.document` (the state could not be read)."""
    with transaction.atomic():
        design = Design.objects.select_for_update().get(pk=design_id)
        snapshot = build_snapshot(design.document)
        YUpdate.objects.filter(design_id=design_id).delete()
        YState.objects.update_or_create(
            design=design,
            defaults={
                "snapshot": snapshot,
                "version": 0,
                "flushed_version": 0,
                "base_revision": design.revision,
            },
        )


def append_update(design_id: uuid.UUID, data: bytes, editor_id: uuid.UUID | None) -> int:
    """Durably append one batch of updates; returns the new version."""
    with transaction.atomic():
        state = YState.objects.select_for_update().get(design_id=design_id)
        state.version += 1
        if editor_id is not None:
            state.last_editor_id = editor_id
        state.save(update_fields=["version", "last_editor", "updated_at"])
        YUpdate.objects.create(design_id=design_id, version=state.version, data=data)
        return state.version


@dataclass
class CompactionInput:
    snapshot: bytes
    row_ids: list[uuid.UUID]
    updates: list[bytes]


def read_for_compaction(design_id: uuid.UUID) -> CompactionInput | None:
    with transaction.atomic():
        state = YState.objects.select_for_update().filter(design_id=design_id).first()
        if state is None:
            return None
        rows = list(YUpdate.objects.filter(design_id=design_id).order_by("version"))
        if not rows:
            return None
        return CompactionInput(
            bytes(state.snapshot), [row.pk for row in rows], [bytes(row.data) for row in rows]
        )


def apply_compaction(design_id: uuid.UUID, source: CompactionInput, merged: bytes) -> bool:
    """Replace the snapshot by `merged` and drop the rows it folded in, unless someone compacted meanwhile."""
    with transaction.atomic():
        state = YState.objects.select_for_update().filter(design_id=design_id).first()
        if state is None or bytes(state.snapshot) != source.snapshot:
            return False
        rows = YUpdate.objects.filter(pk__in=source.row_ids)
        if rows.count() != len(source.row_ids):
            return False
        state.snapshot = merged
        state.save(update_fields=["snapshot", "updated_at"])
        rows.delete()
        return True


@dataclass
class FlushResult:
    saved: bool
    revision: int = 0
    reason: str = ""


def flush_document(
    design_id: uuid.UUID, document: dict, version: int, editor_id: uuid.UUID | None
) -> FlushResult:
    """Write `document` (already validated) to the design when it is newer than what was saved."""
    with transaction.atomic():
        state = YState.objects.select_for_update().filter(design_id=design_id).first()
        design = (
            Design.objects.select_for_update()
            .defer("document")
            .filter(pk=design_id, trashed_at__isnull=True)
            .first()
        )
        if state is None or design is None:
            return FlushResult(False, reason="gone")
        if version <= state.flushed_version:
            return FlushResult(False, design.revision, "up_to_date")
        if design.revision != state.base_revision:
            return FlushResult(False, design.revision, "external_change")
        info = describe_document(document)
        design.document = document
        design.width, design.height = info.width, info.height
        design.page_count, design.preset = info.page_count, info.preset
        design.revision += 1
        with saving_from_room():
            design.save(
                update_fields=[
                    "document",
                    "width",
                    "height",
                    "page_count",
                    "preset",
                    "revision",
                    "updated_at",
                ]
            )
        state.base_revision, state.flushed_version = design.revision, version
        state.save(update_fields=["base_revision", "flushed_version", "updated_at"])
        editor = User.objects.filter(pk=editor_id or state.last_editor_id).first()
        record_auto_version_if_due(design, editor)
        return FlushResult(True, design.revision)


@dataclass
class ReplaceTicket:
    document: dict
    revision: int
    title: str


def read_replacement(design_id: uuid.UUID) -> ReplaceTicket | None:
    """The design's current document when it moved on without the room (a restore); None when in sync."""
    state = YState.objects.filter(design_id=design_id).values("base_revision").first()
    head = Design.objects.filter(pk=design_id, trashed_at__isnull=True).values("revision", "title").first()
    if state is None or head is None or head["revision"] == state["base_revision"]:
        return None
    document = Design.objects.filter(pk=design_id).values_list("document", flat=True).first()
    return ReplaceTicket(document, head["revision"], head["title"])


def commit_replacement(design_id: uuid.UUID, ticket: ReplaceTicket, delta: bytes) -> int | None:
    """Claim the replacement of the Y state described by `ticket` and append its delta.

    Returns the new version, or None when another process claimed it first (or the design moved on again).
    """
    with transaction.atomic():
        state = YState.objects.select_for_update().filter(design_id=design_id).first()
        design = Design.objects.filter(pk=design_id).only("revision").first()
        if state is None or design is None:
            return None
        if state.base_revision == ticket.revision or design.revision != ticket.revision:
            return None
        state.version += 1
        state.base_revision, state.flushed_version = ticket.revision, state.version
        state.save(update_fields=["version", "base_revision", "flushed_version", "updated_at"])
        YUpdate.objects.create(design_id=design_id, version=state.version, data=delta)
        return state.version


def load_current(design_id: uuid.UUID) -> tuple[bytes, list[bytes]] | None:
    """Snapshot and update rows as they are now (a room that fell behind re-reads them)."""
    with transaction.atomic():
        state = YState.objects.select_for_update().filter(design_id=design_id).first()
        if state is None:
            return None
        updates = [bytes(row.data) for row in YUpdate.objects.filter(design_id=design_id).order_by("version")]
        return bytes(state.snapshot), updates


def current_version(design_id: uuid.UUID) -> int | None:
    return YState.objects.filter(design_id=design_id).values_list("version", flat=True).first()


def designs_needing_compaction(threshold: int) -> list[uuid.UUID]:
    rows = YUpdate.objects.values("design_id").annotate(total=Count("id")).filter(total__gte=threshold)
    return [row["design_id"] for row in rows]


def purge_stale_presence() -> int:
    """Presence rows of processes that stopped without cleaning up; returns how many were removed."""
    cutoff = timezone.now() - HEARTBEAT_STALE * 4
    removed, _ = RoomConnection.objects.filter(heartbeat_at__lt=cutoff).delete()
    CollabInstance.objects.filter(heartbeat_at__lt=cutoff).delete()
    return removed


def unflushed_designs() -> list[uuid.UUID]:
    """Designs whose Y state is ahead of their document."""
    return list(
        YState.objects.filter(version__gt=F("flushed_version"), design__trashed_at__isnull=True).values_list(
            "design_id", flat=True
        )
    )


# ---------------------------------------------------------------------------------------------
# Connections (presence, limits)
# ---------------------------------------------------------------------------------------------


@dataclass
class Admission:
    ok: bool
    connection_id: uuid.UUID | None = None
    reason: str = ""


def stale_cutoff() -> datetime:
    """Heartbeats older than this belong to processes that are gone."""
    return timezone.now() - HEARTBEAT_STALE


def admit(
    design_id: uuid.UUID, user_id: uuid.UUID, role: str, link_id: uuid.UUID | None, instance: str
) -> Admission:
    """Register a connection unless the per-design or per-user limit is reached.

    The row is inserted first and the counts checked afterwards, so concurrent connects on different
    processes cannot both slip under a limit; a loser is removed again.
    """
    row = RoomConnection.objects.create(
        design_id=design_id,
        user_id=user_id,
        instance=instance,
        role=role,
        share_link_id=link_id,
        heartbeat_at=timezone.now(),
    )
    fresh = RoomConnection.objects.filter(heartbeat_at__gt=stale_cutoff())
    per_design = fresh.filter(design_id=design_id, created_at__lte=row.created_at).count()
    per_user = fresh.filter(user_id=user_id, created_at__lte=row.created_at).count()
    if per_design > settings.REALTIME_MAX_CONNECTIONS_PER_DESIGN:
        row.delete()
        return Admission(False, reason="design_full")
    if per_user > settings.REALTIME_MAX_CONNECTIONS_PER_USER:
        row.delete()
        return Admission(False, reason="too_many_connections")
    return Admission(True, row.pk)


def other_instance_serves(design_id: uuid.UUID, instance: str) -> list[str]:
    """Instances (other than `instance`) with live connections to the design."""
    return list(
        RoomConnection.objects.filter(design_id=design_id, heartbeat_at__gt=stale_cutoff())
        .exclude(instance=instance)
        .values_list("instance", flat=True)
        .distinct()
    )


def release(connection_id: uuid.UUID) -> None:
    RoomConnection.objects.filter(pk=connection_id).delete()


def heartbeat(instance: str, shared_layer: bool, counters: dict, connection_ids: list[uuid.UUID]) -> None:
    """Refresh the rows of the connections this process really holds; others (leaked ones) go stale."""
    now = timezone.now()
    RoomConnection.objects.filter(instance=instance, pk__in=connection_ids).update(heartbeat_at=now)
    CollabInstance.objects.update_or_create(
        instance=instance, defaults={"heartbeat_at": now, "counters": counters, "shared_layer": shared_layer}
    )
    RoomConnection.objects.filter(heartbeat_at__lt=now - HEARTBEAT_STALE * 4).delete()
    CollabInstance.objects.filter(heartbeat_at__lt=now - HEARTBEAT_STALE * 4).delete()


def forget_instance(instance: str) -> None:
    RoomConnection.objects.filter(instance=instance).delete()
    CollabInstance.objects.filter(instance=instance).delete()


def room_is_live(design_id: uuid.UUID) -> bool:
    """True while some process holds a connection to the design (REST document saves answer 409)."""
    return RoomConnection.objects.filter(design_id=design_id, heartbeat_at__gt=stale_cutoff()).exists()


# ---------------------------------------------------------------------------------------------
# Access re-checks
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class MemberCheck:
    member_id: str
    user_id: uuid.UUID
    role: str
    link_id: uuid.UUID | None
    session_key: str | None


@dataclass
class AccessReport:
    closed: dict[str, str]
    title: str = ""
    revision: int = 0


def _session_valid(session_key: str | None, user: User) -> bool:
    if not session_key:
        return False
    store = import_module(settings.SESSION_ENGINE).SessionStore(session_key)
    if not store.exists(session_key):
        return False
    recorded = store.get(HASH_SESSION_KEY)
    if not recorded:
        return False
    # The current secret key first, then the previous ones (DJANGO_SECRET_KEY_FALLBACKS), as Django does.
    accepted = [user.get_session_auth_hash(), *user.get_session_auth_fallback_hash()]
    return any(constant_time_compare(recorded, candidate) for candidate in accepted)


def _link_problem(link_id: uuid.UUID, role: str, valid: dict[uuid.UUID, ShareLink]) -> str:
    link = valid.get(link_id)
    if link is not None:
        return "role_changed" if link.role != role else ""
    stored = ShareLink.objects.filter(pk=link_id).first()
    if stored is not None and stored.is_expired():
        return "link_expired"
    return "link_revoked"


def check_access(design_id: uuid.UUID, members: list[MemberCheck]) -> AccessReport:
    """Why (if at all) each connection must be closed now. Keys of `closed` are member ids."""
    design = Design.objects.filter(pk=design_id).values("title", "revision", "owner_id", "trashed_at").first()
    if design is None:
        return AccessReport({m.member_id: "design_deleted" for m in members})
    if design["trashed_at"] is not None:
        return AccessReport(
            {m.member_id: "design_trashed" for m in members}, design["title"], design["revision"]
        )
    users = {u.pk: u for u in User.objects.filter(pk__in={m.user_id for m in members}, is_active=True)}
    link_ids = {m.link_id for m in members if m.link_id}
    valid_links = {link.pk: link for link in active_links(ShareLink.objects.filter(pk__in=link_ids))}
    closed: dict[str, str] = {}
    for member in members:
        user = users.get(member.user_id)
        if user is None:
            closed[member.member_id] = "account_disabled"
        elif not _session_valid(member.session_key, user):
            closed[member.member_id] = "session_ended"
        elif member.link_id is not None:
            problem = _link_problem(member.link_id, member.role, valid_links)
            if problem:
                closed[member.member_id] = problem
        elif member.role != "owner" or design["owner_id"] != member.user_id:
            closed[member.member_id] = "role_changed"
    return AccessReport(closed, design["title"], design["revision"])
