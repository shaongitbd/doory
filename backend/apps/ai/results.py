"""Turning what a provider answered into a safe PNG: decoded with Pillow under the upload limits (no
decompression bombs), checked against the source's size, a mask applied to the source, alpha required where
the task promises it."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

from apps.core.images import MAX_DIMENSION, MAX_PIXELS, ImageBusy, decode_slot

from .errors import AIProviderError
from .tasks import Task

RESULT_FORMATS = ["PNG", "WEBP", "JPEG", "GIF", "AVIF"]
ASPECT_TOLERANCE = 0.01


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


def _probe(data: bytes, *, what: str = "result") -> Image.Image:
    if not data:
        raise AIProviderError("not_image", f"The server's {what} is empty.")
    try:
        probe = Image.open(BytesIO(data), formats=RESULT_FORMATS)
        width, height = probe.size
        if not (0 < width <= MAX_DIMENSION and 0 < height <= MAX_DIMENSION) or width * height > MAX_PIXELS:
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


def from_image(task: Task, source: SourceImage | None, data: bytes) -> bytes:
    """The provider's finished image, as PNG (scaled to `source` when the task keeps its size)."""
    try:
        probe = _probe(data, what="result")
        width, height = probe.size
        with decode_slot(width * height):
            result = _load(probe)
            if task.output == "image-alpha":
                if not _has_alpha(result):
                    raise AIProviderError("bad_response", "The server's result has no transparency.")
                result = result.convert("RGBA")
            elif result.mode not in ("RGB", "RGBA", "L", "LA"):
                result = result.convert("RGBA" if _has_alpha(result) else "RGB")
            if task.same_size and source is not None:
                result = _fit(result, source.width, source.height, any_aspect=False)
            return _png(result)
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
