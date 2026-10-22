"""What an image optimizer gets, what it gives back, and the checks around every run (`optimize`).

An optimizer only has to return smaller bytes of the same image. `optimize` does the rest for all of them: an
error, a timeout or a file that is not smaller (or not the same format and size) leaves the input as it was,
with a warning when something went wrong. Nothing an optimizer does can make an export fail or grow.
"""

from __future__ import annotations

import io
import logging
import time
from dataclasses import dataclass, replace
from typing import Protocol

from django.conf import settings
from PIL import Image

logger = logging.getLogger("doory.exports")

PIL_FORMATS = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp", "AVIF": "avif"}
MIMES = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "avif": "image/avif"}


@dataclass(frozen=True)
class Job:
    """One file to make smaller."""

    data: bytes
    format: str  # png, jpg, webp or avif
    width: int
    height: int
    quality: int | None = None  # JPG, WebP and AVIF: the quality `data` was made at
    strip_metadata: bool = True
    srgb: bool = True  # whether a colour profile may be left out
    progressive: bool = False  # JPG
    source: bytes | None = None  # the lossless PNG `data` was made from, when there is one

    @property
    def mime(self) -> str:
        return MIMES[self.format]


@dataclass(frozen=True)
class OptimizeResult:
    data: bytes
    format: str
    width: int
    height: int
    bytes_before: int
    optimizer: str = ""  # the id of the optimizer asked; empty: none was available
    optimized: bool = False  # whether its file was smaller and kept
    warnings: tuple[str, ...] = ()


class OptimizerError(Exception):
    """The optimizer could not make the file. `message` is safe to show (no URL, no key)."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class Optimizer(Protocol):
    id: str
    formats: tuple[str, ...]  # the formats it makes smaller
    sends_offsite: bool  # whether the image leaves this server

    @property
    def name(self) -> str: ...

    def ready(self) -> bool:
        """Whether it can run here (its programs are installed, its key is set)."""

    def shrink(self, job: Job, deadline: float) -> bytes:
        """`job.data` made smaller, before `deadline` (`time.monotonic()`); raises OptimizerError."""


class Unavailable:
    """`optimize: true` on a server without an optimizer: the file stays as it is, with a note."""

    id = ""
    name = ""
    formats: tuple[str, ...] = ()
    sends_offsite = False

    def ready(self) -> bool:
        return False

    def shrink(self, job: Job, deadline: float) -> bytes:
        return job.data


UNAVAILABLE = Unavailable()


def left(deadline: float) -> float:
    """Seconds until `deadline`; OptimizerError when it has passed."""
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise OptimizerError("It took too long.")
    return remaining


def same_image(data: bytes, job: Job) -> bool:
    """Whether `data` is an image in `job.format` at `job`'s size (only the header is read)."""
    try:
        with Image.open(io.BytesIO(data)) as image:
            return PIL_FORMATS.get(image.format or "") == job.format and image.size == (job.width, job.height)
    except Exception:
        return False


def optimize(optimizer: Optimizer, job: Job, *, deadline: float | None = None) -> OptimizeResult:
    """`job.data` made smaller by `optimizer`, or as it was (see the module docstring). It gets
    `IMAGE_OPTIMIZER_TIMEOUT`, or less when `deadline` (`time.monotonic()`: the whole export's) is sooner."""
    kept = OptimizeResult(job.data, job.format, job.width, job.height, len(job.data), optimizer.id)

    def note(message: str) -> OptimizeResult:
        return replace(kept, warnings=(message,))

    if optimizer is UNAVAILABLE:
        return note("No image optimizer is set up on this server; the file is not optimized.")
    if job.format not in optimizer.formats:
        return kept
    if len(job.data) > settings.IMAGE_OPTIMIZER_MAX_BYTES:
        return note(
            f"The file is larger than {settings.IMAGE_OPTIMIZER_MAX_BYTES} bytes, which {optimizer.name} "
            "doesn't take on this server; it is not optimized."
        )
    started = time.monotonic()
    until = started + settings.IMAGE_OPTIMIZER_TIMEOUT
    until = until if deadline is None else min(until, deadline)
    try:
        left(until)
        data = optimizer.shrink(job, until)
    except OptimizerError as exc:
        logger.warning("Image optimizer %s failed: %s", optimizer.id, exc.message)
        return note(f"{optimizer.name} could not optimize the file ({exc.message}); it is not optimized.")
    except Exception:
        logger.exception("Image optimizer %s failed", optimizer.id)
        return note(f"{optimizer.name} could not optimize the file; it is not optimized.")
    if len(data) >= len(job.data):
        return kept
    if not same_image(data, job):
        logger.warning("Image optimizer %s returned another format or size", optimizer.id)
        return note(f"{optimizer.name} returned a different image; the file is not optimized.")
    logger.info(
        "Image optimizer %s: %s %d -> %d byte(s) in %.2f s",
        optimizer.id,
        job.format,
        len(job.data),
        len(data),
        time.monotonic() - started,
    )
    return replace(kept, data=data, optimized=True)
