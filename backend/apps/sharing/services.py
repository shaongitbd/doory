"""Business rules for share links: lookup, password gate, access accounting and shared saves.

Views stay thin; everything that decides *whether* a request may proceed lives here so it can be
tested without HTTP.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, NamedTuple

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from apps.designs.models import Design
from apps.designs.services import record_auto_version_if_due
from apps.designs.validators import describe_document, validate_document

from .models import ShareLink

logger = logging.getLogger(__name__)

TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
MAX_ACTIVE_LINKS_PER_DESIGN = 20
MAX_COMMENTS_PER_DESIGN = 2000

# ---------------------------------------------------------------------------------------------
# Link lookup
# ---------------------------------------------------------------------------------------------


class ShareLinkNotFound(Exception):
    """Unknown, revoked, expired or trashed-design link. One exception, one response: no oracle."""


def active_links(queryset=None):
    """Links that currently grant access: switched on, not expired, design not trashed, owner enabled."""
    now = timezone.now()
    base = ShareLink.objects.all() if queryset is None else queryset
    return base.filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now),
        is_active=True,
        design__trashed_at__isnull=True,
        design__owner__is_active=True,
    )


def resolve_link(token: str, *, with_document: bool = False) -> ShareLink:
    """Return the valid link for `token` or raise `ShareLinkNotFound`.

    The design (and its owner) is joined in; the potentially huge `document` column is only loaded
    when the caller needs it.
    """
    if not TOKEN_PATTERN.match(token):
        raise ShareLinkNotFound
    queryset = active_links().select_related("design", "design__owner")
    if not with_document:
        queryset = queryset.defer("design__document")
    link = queryset.filter(token=token).first()
    if link is None:
        raise ShareLinkNotFound
    return link


def count_active_links(design: Design) -> int:
    return active_links(ShareLink.objects.filter(design=design)).count()


def record_access(link: ShareLink) -> None:
    """One UPDATE per successful view; never read-modify-write."""
    updated = ShareLink.objects.filter(pk=link.pk).update(
        access_count=F("access_count") + 1, last_accessed_at=timezone.now()
    )
    if not updated:
        logger.warning("record_access: link %s no longer exists, access not counted", link.pk)


# ---------------------------------------------------------------------------------------------
# Password gate
# ---------------------------------------------------------------------------------------------

PASSWORD_WINDOW_SECONDS = 15 * 60
PASSWORD_LIMIT_PER_TOKEN_AND_IP = 10
PASSWORD_LIMIT_PER_IP = 30
PASSWORD_LIMIT_PER_TOKEN = 100


class PasswordRequired(Exception):
    """The link is password protected and the supplied password is missing or wrong."""


class PasswordLocked(Exception):
    """Too many wrong passwords; `retry_after` is the number of seconds until the window resets."""

    def __init__(self, retry_after: int) -> None:
        super().__init__(retry_after)
        self.retry_after = retry_after


def _digest(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()[:40]


class _FailureBucket:
    """Fixed-window failure counter on top of the Django cache (atomic `add` + `incr`)."""

    def __init__(self, name: str, key: str, limit: int) -> None:
        self.key = f"share-pw:{name}:{key}"
        self.started_key = f"{self.key}:t0"
        self.limit = limit

    def count(self) -> int:
        return int(cache.get(self.key, 0))

    def retry_after(self) -> int:
        started = cache.get(self.started_key)
        if started is None:
            return PASSWORD_WINDOW_SECONDS
        return max(1, int(PASSWORD_WINDOW_SECONDS - (timezone.now().timestamp() - started)))

    def record(self) -> None:
        if cache.add(self.key, 0, PASSWORD_WINDOW_SECONDS):
            cache.set(self.started_key, timezone.now().timestamp(), PASSWORD_WINDOW_SECONDS)
        try:
            cache.incr(self.key)
        except ValueError:  # expired between add() and incr()
            cache.set(self.key, 1, PASSWORD_WINDOW_SECONDS)

    def clear(self) -> None:
        cache.delete_many([self.key, self.started_key])

    @property
    def exhausted(self) -> bool:
        return self.count() >= self.limit


@dataclass
class PasswordAttempts:
    """Three independent windows: this IP on this link, this IP on any link, any IP on this link."""

    pair: _FailureBucket
    per_ip: _FailureBucket
    per_token: _FailureBucket

    @classmethod
    def for_request(cls, token: str, ip: str) -> PasswordAttempts:
        return cls(
            pair=_FailureBucket("pair", _digest(token, ip), PASSWORD_LIMIT_PER_TOKEN_AND_IP),
            per_ip=_FailureBucket("ip", _digest(ip), PASSWORD_LIMIT_PER_IP),
            per_token=_FailureBucket("token", _digest(token), PASSWORD_LIMIT_PER_TOKEN),
        )

    def ensure_not_locked(self) -> None:
        locked = [bucket for bucket in (self.pair, self.per_ip, self.per_token) if bucket.exhausted]
        if locked:
            raise PasswordLocked(max(bucket.retry_after() for bucket in locked))

    def register_failure(self) -> None:
        for bucket in (self.pair, self.per_ip, self.per_token):
            bucket.record()


def enforce_link_password(link: ShareLink, supplied: str | None, client_ip: str) -> None:
    """Gate a request on the link password.

    * no password on the link: always passes;
    * missing header: `PasswordRequired` (not counted as an attempt, it is how clients discover the gate);
    * a password is supplied while a window is exhausted: `PasswordLocked`, even if it is the right one;
    * wrong password: counted in all windows, then `PasswordRequired`.
    """
    if not link.has_password:
        return
    supplied = (supplied or "").strip()
    if not supplied:
        raise PasswordRequired
    attempts = PasswordAttempts.for_request(link.token, client_ip)
    attempts.ensure_not_locked()
    if link.check_password(supplied):
        attempts.pair.clear()
        return
    attempts.register_failure()
    raise PasswordRequired


# ---------------------------------------------------------------------------------------------
# Shared document saves
# ---------------------------------------------------------------------------------------------


class RevisionConflict(Exception):
    def __init__(self, current_revision: int, updated_at) -> None:
        super().__init__(current_revision)
        self.current_revision = current_revision
        self.updated_at = updated_at


class DesignUnavailable(Exception):
    """The design vanished or was trashed between link lookup and save."""


class SavedRevision(NamedTuple):
    revision: int
    updated_at: datetime


@transaction.atomic
def save_shared_document(design: Design, document: Any, base_revision: int, actor) -> SavedRevision:
    """Optimistic-concurrency save used by edit links.

    Locks the design row, rejects a stale `base_revision` with `RevisionConflict`, validates the document
    with the same rules as the owner's saves (`apps.designs.validators`; invalid input raises that app's
    API errors), then stores it, bumps `revision` and records an automatic version attributed to `actor`.
    The final write is also a compare-and-swap on `revision`, so the guarantee holds on databases without
    row locks.
    """
    locked = Design.objects.select_for_update().defer("document").filter(pk=design.pk).first()
    if locked is None or locked.trashed_at is not None:
        raise DesignUnavailable
    if locked.revision != base_revision:
        raise RevisionConflict(locked.revision, locked.updated_at)
    validate_document(document, max_bytes=settings.MAX_DESIGN_DOCUMENT_BYTES)
    info = describe_document(document)
    saved_at = timezone.now()
    written = Design.objects.filter(pk=locked.pk, revision=base_revision, trashed_at__isnull=True).update(
        document=document,
        width=info.width,
        height=info.height,
        page_count=info.page_count,
        preset=info.preset,
        revision=base_revision + 1,
        updated_at=saved_at,
    )
    if not written:
        current = Design.objects.only("revision", "updated_at").get(pk=locked.pk)
        raise RevisionConflict(current.revision, current.updated_at)
    locked.document, locked.page_count, locked.revision, locked.updated_at = (
        document,
        info.page_count,
        base_revision + 1,
        saved_at,
    )
    record_auto_version_if_due(locked, actor)
    return SavedRevision(base_revision + 1, saved_at)
