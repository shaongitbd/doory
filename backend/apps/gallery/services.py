"""Gallery business logic shared by the API, the admin and the management commands."""

from __future__ import annotations

import copy
from typing import Any

from django.core.files.base import ContentFile
from django.db import IntegrityError
from django.utils.text import slugify

from apps.core.images import make_thumbnail, process_image_upload

from .models import Template

THUMBNAIL_MAX_SIDE = 720
MAX_THUMBNAIL_BYTES = 8 * 1024 * 1024
SLUG_MAX_LENGTH = Template._meta.get_field("slug").max_length


def unique_template_slug(title: str, *, exclude_pk: Any = None) -> str:
    """A free slug derived from `title` (`my-title`, `my-title-2`, …)."""
    base = slugify(title)[: SLUG_MAX_LENGTH - 6].strip("-") or "template"
    candidate, counter = base, 1
    taken = Template.objects.exclude(pk=exclude_pk) if exclude_pk else Template.objects.all()
    while taken.filter(slug=candidate).exists():
        counter += 1
        candidate = f"{base}-{counter}"
    return candidate


def thumbnail_from_upload(file_obj, *, slug: str) -> ContentFile:
    """Validate an uploaded raster image by decoding it and return it as a bounded WebP thumbnail.

    The storage path for template thumbnails is always `<slug>.webp`, so the bytes must really be WebP.
    Raises `apps.core.images.ImageError` for anything that is not a safe raster image.
    """
    processed = process_image_upload(file_obj, max_bytes=MAX_THUMBNAIL_BYTES)
    return ContentFile(make_thumbnail(processed.data, THUMBNAIL_MAX_SIDE), name=f"{slug}.webp")


def replace_thumbnail(template: Template, content: ContentFile) -> None:
    """Swap the stored thumbnail, removing the previous file so replaced images do not pile up."""
    previous = template.thumbnail.name if template.thumbnail else ""
    template.thumbnail.save(content.name, content, save=False)
    if previous and previous != template.thumbnail.name:
        template.thumbnail.storage.delete(previous)


_SLUG_RETRIES = 3


def duplicate_template(template: Template, *, created_by=None) -> Template:
    """Unpublished copy of `template` ("Copy of …") with a fresh slug and a zero use count.

    Retries with a fresh slug on ``IntegrityError`` so concurrent duplicates of the same template
    don't collide.
    """
    title = f"Copy of {template.title}"[:200]
    for attempt in range(_SLUG_RETRIES):
        copy_ = Template(
            slug=unique_template_slug(title),
            title=title,
            description=template.description,
            category=template.category,
            tags=list(template.tags),
            width=template.width,
            height=template.height,
            preset=template.preset,
            document=copy.deepcopy(template.document),
            page_count=template.page_count,
            is_featured=False,
            is_published=False,
            created_by=created_by,
        )
        if template.thumbnail:
            with template.thumbnail.open("rb") as handle:
                copy_.thumbnail.save(f"{copy_.slug}.webp", ContentFile(handle.read()), save=False)
        try:
            copy_.save()
            return copy_
        except IntegrityError:
            if attempt == _SLUG_RETRIES - 1:
                raise
    return copy_  # unreachable, keeps type checkers happy
