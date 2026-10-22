"""Short-lived download links for exported images, SVGs, PDFs, ZIPs and videos (MCP `delivery="url"`).

The image is stored in a private directory outside `MEDIA_ROOT` (`EXPORT_STORAGE_ROOT`, never under `/media/`)
and served only by `ImageDownloadView` at a URL that carries a signed, timestamped token naming the file:
whoever has the link can fetch it until it expires (like a presigned URL), without an account. The file name
starts with the time it was made, so expired files are removed by name alone, without asking the storage for
each file's age: whenever a new image is stored, and by `manage.py purge_exports`.
"""

from __future__ import annotations

import contextlib
import logging
import re
import time
import uuid
from typing import BinaryIO

from django.conf import settings
from django.core import signing
from django.core.files.base import ContentFile, File
from django.core.files.storage import FileSystemStorage
from django.urls import reverse

logger = logging.getLogger("doory.exports")

SALT = "doory.exports.image-link"
EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "image/gif": "gif",
}
MIME_TYPES = {ext: mime for mime, ext in EXTENSIONS.items()}
_NAME = re.compile(r"^(?P<made>\d{10})-[0-9a-f]{32}\.(?P<ext>png|jpg|webp|avif|svg|pdf|zip|mp4|webm|gif)$")


def export_storage() -> FileSystemStorage:
    """Private storage outside `MEDIA_ROOT`, with no public URL: `ImageDownloadView` is the only way in."""
    storage = FileSystemStorage(location=settings.EXPORT_STORAGE_ROOT)
    storage.base_url = None
    return storage


def store_image(data: bytes | BinaryIO, mime: str) -> str:
    """Store `data` (bytes, or a file, copied in chunks) and return an absolute link to it, valid for
    `MCP_EXPORT_URL_TTL_SECONDS`."""
    purge_expired()
    content = ContentFile(data) if isinstance(data, bytes) else File(data)
    name = export_storage().save(f"{int(time.time()):010d}-{uuid.uuid4().hex}.{EXTENSIONS[mime]}", content)
    token = signing.dumps({"name": name}, salt=SALT, compress=True)
    path = reverse("export-image-download", kwargs={"token": token})
    return f"{settings.SITE_URL.rstrip('/')}{path}"


def open_link(token: str) -> tuple[str, str] | None:
    """The storage name and MIME type a link names, or None when it is forged, expired or gone."""
    try:
        payload = signing.loads(token, salt=SALT, max_age=settings.MCP_EXPORT_URL_TTL_SECONDS)
    except signing.BadSignature:  # includes SignatureExpired
        return None
    name = payload.get("name") if isinstance(payload, dict) else None
    match = _NAME.match(name) if isinstance(name, str) else None
    if match is None or not export_storage().exists(name):
        return None
    return name, MIME_TYPES[match["ext"]]


def purge_expired(now: float | None = None) -> int:
    """Delete stored images whose links have expired; returns how many."""
    cutoff = (now if now is not None else time.time()) - settings.MCP_EXPORT_URL_TTL_SECONDS
    storage = export_storage()
    try:
        _, files = storage.listdir("")
    except (FileNotFoundError, NotADirectoryError):
        return 0
    deleted = 0
    for file in files:
        match = _NAME.match(file)
        if match is None or int(match["made"]) >= cutoff:
            continue
        with contextlib.suppress(OSError):
            storage.delete(file)
            deleted += 1
    if deleted:
        logger.info("Removed %d expired exported image(s)", deleted)
    return deleted
