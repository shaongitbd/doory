"""Tiny real clips made with ffmpeg for the video tests (which skip when ffmpeg isn't installed)."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from functools import cache
from pathlib import Path

import pytest

HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
needs_ffmpeg = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg and ffprobe are not installed")


@cache
def clip(
    kind: str = "h264",
    *,
    seconds: float = 2.0,
    size: str = "320x240",
    audio: bool = True,
    rate: int = 25,
) -> bytes:
    """A clip with a test pattern (and a tone): `h264` (web-ready MP4), `mpeg4` (an MP4 that has to be
    converted) or `m4a` (sound only). It is made in a temporary folder, which is removed again."""
    video = ["-f", "lavfi", "-i", f"testsrc2=size={size}:rate={rate}:duration={seconds}"]
    sound = ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}"]
    codecs = {
        "h264": ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"],
        "mpeg4": ["-c:v", "mpeg4", "-q:v", "5", "-c:a", "aac"],
        "m4a": ["-c:a", "aac"],
    }[kind]
    inputs = sound if kind == "m4a" else video + (sound if audio else [])
    args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs, *codecs, "-shortest"]
    with tempfile.TemporaryDirectory(prefix="doory-test-clip-") as folder:
        target = Path(folder) / ("clip.m4a" if kind == "m4a" else "clip.mp4")
        subprocess.run([*args, str(target)], check=True, timeout=60)
        return target.read_bytes()
