"""Turning what a provider answered into a safe PNG: decoded with Pillow under the upload limits (no
decompression bombs), checked against the size the task asks for, a mask applied to the source, alpha required
where the task promises it. A resized result too large for an upload as PNG is kept as WebP instead."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from io import BytesIO
from typing import Any

from django.conf import settings
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.core.images import MAX_DIMENSION, MAX_PIXELS, ImageBusy, decode_slot

from .errors import AIProviderError
from .tasks import Task, result_size

RESULT_FORMATS = ["PNG", "WEBP", "JPEG", "GIF", "AVIF"]
ASPECT_TOLERANCE = 0.01
WEBP_QUALITIES = (90, 80, 70)


@dataclass(frozen=True)
class SourceImage:
    """The image sent to a provider."""

    data: bytes
    mime: str
    width: int
    height: int

    @property
    def filename(self) -> str:
        ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
        return f"image.{ext.get(self.mime, self.mime.rsplit('/', 1)[-1] or 'bin')}"


def fits(width: int, height: int) -> bool:
    """Whether an image of this size may be decoded and stored (the upload limits)."""
    return 0 < width <= MAX_DIMENSION and 0 < height <= MAX_DIMENSION and width * height <= MAX_PIXELS


def _probe(data: bytes, *, what: str = "result") -> Image.Image:
    if not data:
        raise AIProviderError("not_image", f"The server's {what} is empty.")
    try:
        probe = Image.open(BytesIO(data), formats=RESULT_FORMATS)
        if not fits(*probe.size):
            raise AIProviderError("not_image", f"The server's {what} is too large an image.")
        return probe
    except AIProviderError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise AIProviderError("not_image", f"The server's {what} is too large an image.") from exc
    except (
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
        EOFError,
    ) as exc:
        raise AIProviderError("not_image", f"The server's {what} is not a valid image.") from exc


def _busy(exc: ImageBusy) -> AIProviderError:
    error = AIProviderError("busy", "The image decoder is busy. Try again in a moment.")
    error.refused = True
    return error


def _load(probe: Image.Image) -> Image.Image:
    probe.seek(0)
    probe.load()
    return probe


def decode(data: bytes, *, what: str = "result") -> Image.Image:
    """`data` decoded (first frame) within the size limits, or AIProviderError("not_image")."""
    try:
        probe = _probe(data, what=what)
        width, height = probe.size
        with decode_slot(width * height):
            return _load(probe)
    except ImageBusy as exc:
        raise _busy(exc) from exc


def decode_source(source: SourceImage) -> Image.Image:
    image = decode(source.data, what="source")
    return ImageOps.exif_transpose(image)


def _decode_source_unslotted(source: SourceImage) -> Image.Image:
    """The source decoded by a caller that already holds a decode slot covering it."""
    return ImageOps.exif_transpose(_load(_probe(source.data, what="source")))


def _fit(image: Image.Image, width: int, height: int, *, any_aspect: bool) -> Image.Image:
    if image.size == (width, height):
        return image
    if not any_aspect:
        ratio = (image.width / image.height) / (width / height)
        if abs(ratio - 1) > ASPECT_TOLERANCE:
            raise AIProviderError("bad_response", "The server's result does not match the image's shape.")
    return image.resize((width, height), Image.Resampling.LANCZOS)


def _has_alpha(image: Image.Image) -> bool:
    return "A" in image.getbands() or "transparency" in image.info


def _png(image: Image.Image) -> bytes:
    out = BytesIO()
    image.save(out, "PNG", compress_level=6)
    return out.getvalue()


def _encode(task: Task, image: Image.Image) -> bytes:
    """`image` as PNG. For a task that changes the size (a large upscaled photo), WebP at falling quality
    when the PNG is larger than an upload may be; a same-size result (a cut-out) stays lossless."""
    data = _png(image)
    if len(data) <= settings.MAX_UPLOAD_BYTES or task.same_size:
        return data
    for quality in WEBP_QUALITIES:
        out = BytesIO()
        image.save(out, "WEBP", quality=quality, method=4)
        if out.tell() <= settings.MAX_UPLOAD_BYTES:
            return out.getvalue()
    raise AIProviderError(
        "too_large", "The result is too large to store, even compressed. Choose a smaller scale."
    )


def from_image(
    task: Task, source: SourceImage, data: bytes, options: Mapping[str, Any] | None = None
) -> bytes:
    """The provider's finished image, as PNG (WebP when too large for an upload), at the size the task and
    its `options` ask for."""
    try:
        probe = _probe(data, what="result")
        width, height = probe.size
        size = result_size(task, source.width, source.height, options or {})
        if size is not None and not fits(*size):
            raise AIProviderError("too_large", "The result would be too large an image.")
        # When the result is scaled, one slot covers it and the scaled copy.
        pixels = width * height + (size[0] * size[1] if size not in (None, (width, height)) else 0)
        with decode_slot(pixels):
            result = _load(probe)
            if task.output == "image-alpha":
                if not _has_alpha(result):
                    raise AIProviderError("bad_response", "The server's result has no transparency.")
                result = result.convert("RGBA")
            elif result.mode not in ("RGB", "RGBA", "L", "LA"):
                result = result.convert("RGBA" if _has_alpha(result) else "RGB")
            if size is not None:
                result = _fit(result, *size, any_aspect=False)
            return _encode(task, result)
    except ImageBusy as exc:
        raise _busy(exc) from exc


def from_mask(task: Task, source: SourceImage, data: bytes) -> bytes:
    """The source with the provider's mask (white keeps, black removes) as its alpha channel, as PNG. A mask
    with transparency of its own uses that transparency; any size is scaled to the source."""
    try:
        mask_probe = _probe(data, what="mask")
        # One slot covers both images: a second one taken inside it could wait on a call doing the same.
        pixels = mask_probe.size[0] * mask_probe.size[1] + source.width * source.height
        with decode_slot(pixels):
            mask = _load(mask_probe)
            if _has_alpha(mask):
                rgba = mask.convert("RGBA")
                alpha = rgba.getchannel("A")
                mask = alpha if alpha.getextrema() != (255, 255) else rgba.convert("L")
            else:
                mask = mask.convert("L")
            image = _decode_source_unslotted(source).convert("RGBA")
            mask = _fit(mask, image.width, image.height, any_aspect=True)
            if _has_alpha(image):  # keep what was already transparent
                mask = Image.composite(mask, Image.new("L", mask.size, 0), image.getchannel("A"))
            image.putalpha(mask)
            return _png(image)
    except ImageBusy as exc:
        raise _busy(exc) from exc
