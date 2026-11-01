"""Raster upload validation and thumbnailing. Content decides the type — never the filename."""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps, ImageSequence, UnidentifiedImageError

MAX_DIMENSION = 12_000
MAX_PIXELS = 80_000_000  # keep well under Pillow's decompression-bomb error threshold
# Decoding an image holds about 3 bytes per pixel (a 250 kB PNG of 80 megapixels peaks at ~700 MB), so the
# big ones take turns: at most LARGE_DECODE_SLOTS of them are decoded at once per process, the others wait.
LARGE_IMAGE_PIXELS = 12_000_000
LARGE_DECODE_SLOTS = 2
LARGE_DECODE_WAIT_SECONDS = 20.0
_large_decodes = threading.BoundedSemaphore(LARGE_DECODE_SLOTS)
AVIF_QUALITY = 92
_WEBP_EXIF_FLAG, _WEBP_XMP_FLAG = 0x08, 0x04

_FORMATS = {
    "PNG": ("image/png", "png"),
    "JPEG": ("image/jpeg", "jpg"),
    "WEBP": ("image/webp", "webp"),
    "GIF": ("image/gif", "gif"),
    "AVIF": ("image/avif", "avif"),
}


class ImageError(ValueError):
    """Raised for anything that is not a safe, supported raster image."""


class ImageBusy(ImageError):
    """Too many large images are being decoded; the caller should answer 503 and ask to retry."""


@contextmanager
def decode_slot(pixels: int) -> Iterator[None]:
    """Hold one of the few places for decoding a large image (small ones pass at once)."""
    if pixels <= LARGE_IMAGE_PIXELS:
        yield
        return
    if not _large_decodes.acquire(timeout=LARGE_DECODE_WAIT_SECONDS):
        raise ImageBusy("The server is busy decoding other large images. Try again in a moment.")
    try:
        yield
    finally:
        _large_decodes.release()


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    mime: str
    ext: str
    width: int
    height: int


def _read(file_obj, max_bytes: int) -> bytes:
    data = file_obj.read(max_bytes + 1)
    if not data:
        raise ImageError("The file is empty.")
    if len(data) > max_bytes:
        raise ImageError("The file is too large.")
    return data


def process_image_upload(file_obj, *, max_bytes: int, max_pixels: int = MAX_PIXELS) -> ProcessedImage:
    """Validate by decoding, apply EXIF orientation, strip metadata (incl. GPS) where we re-encode.

    `max_pixels` lets callers that only need small images (avatars) refuse large ones before decoding.
    """
    data = _read(file_obj, max_bytes)
    try:
        probe = Image.open(BytesIO(data), formats=list(_FORMATS))
        # MPO (phones, cameras): a JPEG with more pictures after it, such as a depth map. Its first one counts.
        fmt = "JPEG" if probe.format == "MPO" else probe.format
        width, height = probe.size
        if (
            width < 1
            or height < 1
            or width > MAX_DIMENSION
            or height > MAX_DIMENSION
            or width * height > min(max_pixels, MAX_PIXELS)
        ):
            raise ImageError("The image dimensions are too large.")
        with decode_slot(width * height):
            probe.verify()  # structural check; the instance is unusable afterwards
            img = Image.open(BytesIO(data), formats=list(_FORMATS))
            img.load()  # full decode — surfaces truncated / corrupt files
            return _normalise(img, fmt, data, width, height)
    except ImageError:
        raise
    except UnidentifiedImageError as exc:
        raise ImageError("Unsupported image type. Use PNG, JPEG, WebP, GIF or AVIF.") from exc
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise ImageError("The file is not a valid image.") from exc


def strip_webp_metadata(data: bytes) -> bytes:
    """`data` without its EXIF and XMP chunks (lossless: every other chunk is copied byte for byte).

    Raises `ImageError` when the RIFF container is not what a WebP encoder writes.
    """
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ImageError("The file is not a valid image.")
    end = min(len(data), 8 + int.from_bytes(data[4:8], "little"))
    chunks: list[bytes] = []
    pos = 12
    while pos + 8 <= end:
        tag = data[pos : pos + 4]
        size = int.from_bytes(data[pos + 4 : pos + 8], "little")
        stop = pos + 8 + size + (size & 1)
        if pos + 8 + size > end:
            raise ImageError("The file is not a valid image.")
        chunk = data[pos : min(stop, end)]
        pos = stop
        if tag in (b"EXIF", b"XMP "):
            continue
        if tag == b"VP8X" and size >= 10:
            chunk = chunk[:8] + bytes([chunk[8] & ~(_WEBP_EXIF_FLAG | _WEBP_XMP_FLAG)]) + chunk[9:]
        chunks.append(chunk)
    body = b"WEBP" + b"".join(chunks)
    return b"RIFF" + len(body).to_bytes(4, "little") + body


def _reencode_avif(img: Image.Image) -> bytes:
    """AVIF (stills and sequences) written again from the decoded frames, so that no metadata comes along."""
    frames = [frame.copy() for frame in ImageSequence.Iterator(img)]
    out = BytesIO()
    options: dict = {"quality": AVIF_QUALITY, "icc_profile": img.info.get("icc_profile")}
    if len(frames) > 1:
        options.update(save_all=True, append_images=frames[1:], duration=img.info.get("duration", 100))
    frames[0].save(out, "AVIF", **options)
    return out.getvalue()


def _normalise(img: Image.Image, fmt: str, data: bytes, width: int, height: int) -> ProcessedImage:
    """The upload as it will be stored: its own bytes when nothing needs stripping, else a clean copy."""
    mime, ext = _FORMATS[fmt]
    animated = fmt != "JPEG" and getattr(img, "n_frames", 1) > 1
    has_exif = bool(img.info.get("exif")) or bool(img.getexif())
    has_metadata = has_exif or bool(img.info.get("xmp"))
    if fmt == "AVIF":
        return ProcessedImage(_reencode_avif(img) if has_metadata else data, mime, ext, width, height)
    if fmt == "WEBP" and animated:
        return ProcessedImage(strip_webp_metadata(data) if has_metadata else data, mime, ext, width, height)
    if animated or fmt == "GIF":
        return ProcessedImage(data, mime, ext, width, height)
    if fmt == "WEBP" and not has_exif:
        return ProcessedImage(strip_webp_metadata(data) if has_metadata else data, mime, ext, width, height)

    img = ImageOps.exif_transpose(img)
    out = BytesIO()
    if fmt == "JPEG":
        rgb = img.convert("RGB") if img.mode not in ("RGB", "L") else img
        rgb.save(out, "JPEG", quality=95, optimize=True, icc_profile=img.info.get("icc_profile"))
    elif fmt == "PNG":
        img.save(out, "PNG", optimize=True, icc_profile=img.info.get("icc_profile"))
    else:  # WEBP with EXIF
        img.save(out, "WEBP", quality=95, icc_profile=img.info.get("icc_profile"))
    return ProcessedImage(out.getvalue(), mime, ext, img.width, img.height)


def make_thumbnail(data: bytes, max_side: int = 480) -> bytes:
    """WebP thumbnail (first frame, alpha preserved) whose longest side is at most `max_side`."""
    try:
        with Image.open(BytesIO(data)) as img, decode_slot(img.width * img.height):
            img.seek(0)
            img = ImageOps.exif_transpose(img)
            img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "A" in img.getbands() or "transparency" in img.info else "RGB")
            out = BytesIO()
            img.save(out, "WEBP", quality=82, method=4)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageError("Could not create a thumbnail.") from exc


def square_crop_webp(data: bytes, size: int = 512, quality: int = 85) -> bytes:
    """Centre-crop `data` to a square of `size` px and encode it as WebP (first frame only, no metadata)."""
    try:
        with Image.open(BytesIO(data)) as img:
            img.seek(0)
            img = ImageOps.exif_transpose(img)
            img = ImageOps.fit(img, (size, size), Image.Resampling.LANCZOS, centering=(0.5, 0.5))
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "A" in img.getbands() or "transparency" in img.info else "RGB")
            out = BytesIO()
            img.save(out, "WEBP", quality=quality, method=4)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageError("Could not process the image.") from exc
