"""Video clips: check an upload with ffprobe and make it web-ready with ffmpeg.

Both tools run as separate commands (never linked or imported), with a fixed argument list, a minimal
environment, a private work directory and a hard deadline. They're installed with the image
(`INSTALL_FFMPEG`) or by the operator; without them the server takes no video (`available()`).

Every clip ends up the same way, whatever came in: H.264 (yuv420p) with AAC sound in an MP4 whose index sits
at the front (`+faststart`), at most 1920 by 1080. Then every browser can play it, the editor can seek it
quickly, and the export can decode it with WebCodecs. A file that already looks like that is only rewrapped
(`remux`, a second or two) and keeps the key frames it came with. Anything else is converted (`transcode`),
with a key frame every two seconds, which can take minutes and so runs off the request (`video_jobs`).

Each clip also gets a poster (the frame every still surface shows: thumbnails, PNG/PDF export, the server's
image export), a filmstrip for the timeline, and its sound as an .m4a of its own for the audio mix.
"""

from __future__ import annotations

import contextlib
import json
import logging
import math
import os
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, replace
from fractions import Fraction
from io import BytesIO
from pathlib import Path

from django.conf import settings
from PIL import Image, UnidentifiedImageError

from apps.core.images import ImageError, make_thumbnail

logger = logging.getLogger(__name__)

MP4_MIME = "video/mp4"
PROBE_TIMEOUT_SECONDS = 20
REMUX_TIMEOUT_SECONDS = 60
STILLS_TIMEOUT_SECONDS = 60
MAX_PROBE_OUTPUT = 256 * 1024
STDERR_TAIL = 2000  # the end of a failed command's messages, for the log
PIPE_CHUNK = 64 * 1024
MAX_DIMENSION = 8192
MAX_WIDTH, MAX_HEIGHT = 1920, 1080  # landscape; a portrait clip may be 1080 by 1920
MAX_FPS = 60
MAX_SOURCE_FPS = 240
VARIABLE_RATE_FPS = 30  # the rate a clip that names none (a browser recording) is converted at
POSTER_MAX_SIDE = 1920
POSTER_QUALITY = 88
STRIP_HEIGHT = 90
STRIP_MAX_FRAMES = 60
STRIP_MIN_INTERVAL_MS = 500
SLOT_WAIT_SECONDS = 20.0
WORK_PREFIX = "doory-video-"
# The containers ffprobe may name for an upload (format_name is a comma list; any of these will do).
CONTAINERS = frozenset({"mov", "mp4", "m4a", "3gp", "3g2", "mj2", "matroska", "webm", "avi"})
# Containers a browser recording (MediaRecorder) comes in, which may not say how long it is.
RECORDING_CONTAINERS = frozenset({"matroska", "webm"})
# Still-image "videos" (a GIF, a PNG sequence) are pictures, not clips.
STILL_CODECS = frozenset({"gif", "png", "mjpeg", "apng", "webp", "bmp", "tiff"})
_ENV_ALLOWLIST = ("PATH", "HOME", "LANG", "LC_ALL")
_RECOVERABLE = (OSError, ValueError, subprocess.SubprocessError)


class VideoError(Exception):
    """The file is not a clip we can take; the message is safe to show."""


class NotAVideo(VideoError):
    """The file holds no video (sound only, say): the caller may treat it as another kind of upload."""


class Unreadable(VideoError):
    """ffprobe or ffmpeg could not read the file at all."""


class VideoBusy(VideoError):
    """Every conversion slot stayed taken for too long."""


@dataclass(frozen=True)
class VideoInfo:
    duration_ms: int  # 0: not known before converting (a browser recording)
    width: int  # as shown, after any rotation
    height: int
    fps: float
    codec: str
    pix_fmt: str
    rotation: int  # 0, 90, 180 or 270
    constant_rate: bool
    has_audio: bool
    audio_codec: str
    hdr: bool
    size: int  # bytes of the source file

    @property
    def web_ready(self) -> bool:
        """True when rewrapping is enough: everything a browser and WebCodecs need is already there."""
        long_side, short_side = max(self.width, self.height), min(self.width, self.height)
        return (
            self.duration_ms > 0  # a clip of unknown length is converted, which caps it
            and self.codec == "h264"
            and self.pix_fmt in ("yuv420p", "yuvj420p")
            and long_side <= MAX_WIDTH
            and short_side <= MAX_HEIGHT
            and self.rotation == 0
            and self.constant_rate
            and self.fps <= MAX_FPS
            and not self.hdr
            and (not self.has_audio or self.audio_codec == "aac")
        )

    def as_meta(self) -> dict:
        return {
            "duration_ms": self.duration_ms,
            "width": self.width,
            "height": self.height,
            "fps": round(self.fps, 3),
            "has_audio": self.has_audio,
            "source_codec": self.codec,
        }


@dataclass(frozen=True)
class Stills:
    poster: bytes  # WebP, the clip's size (at most POSTER_MAX_SIDE)
    thumbnail: bytes  # WebP, at most 480 on its longest side
    filmstrip: bytes | None  # WebP, `frames` tiles side by side
    strip: dict | None  # {"frames", "interval_ms", "tile_width", "tile_height"}


def available() -> bool:
    """Whether this server can take clips: video is on and both commands are installed."""
    return bool(
        settings.VIDEO_ENABLED and shutil.which(settings.FFMPEG_PATH) and shutil.which(settings.FFPROBE_PATH)
    )


# ---- bounded concurrency -----------------------------------------------------------------------

_slots_lock = threading.Lock()
_slots: tuple[int, threading.BoundedSemaphore] | None = None


def _semaphore() -> threading.BoundedSemaphore:
    global _slots
    size = max(1, int(settings.VIDEO_MAX_CONCURRENCY))
    with _slots_lock:
        if _slots is None or _slots[0] != size:
            _slots = (size, threading.BoundedSemaphore(size))
        return _slots[1]


@contextlib.contextmanager
def slot(wait: float | None = SLOT_WAIT_SECONDS) -> Iterator[None]:
    """Hold one of `VIDEO_MAX_CONCURRENCY` ffmpeg slots (per process). A request waits `wait` seconds and then
    raises `VideoBusy`; a background job passes `None` and waits its turn."""
    semaphore = _semaphore()
    acquired = semaphore.acquire() if wait is None else semaphore.acquire(timeout=wait)
    if not acquired:
        raise VideoBusy("The server is busy converting other videos. Try again in a moment.")
    try:
        yield
    finally:
        semaphore.release()


# ---- running the commands ----------------------------------------------------------------------


def work_dir(prefix: str = WORK_PREFIX) -> Path:
    """A private directory for one clip, under `VIDEO_WORK_DIR` (default: the system temp directory)."""
    root = settings.VIDEO_WORK_DIR or None
    if root:
        Path(root).mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix=prefix, dir=root))


def _last_change(path: Path) -> float:
    newest = path.lstat().st_mtime
    with os.scandir(path) as entries:
        for entry in entries:
            newest = max(newest, entry.stat(follow_symlinks=False).st_mtime)
    return newest


def remove_old_work_dirs(max_age_seconds: float) -> int:
    """Remove the clip directories that nothing has written to for `max_age_seconds`: left behind by a process
    that was killed while it worked on a clip. Returns how many were removed."""
    root = Path(settings.VIDEO_WORK_DIR or tempfile.gettempdir())
    cutoff = time.time() - max_age_seconds
    removed = 0
    try:
        entries = list(os.scandir(root))
    except OSError:
        return 0
    for entry in entries:
        if not entry.name.startswith(WORK_PREFIX) or not entry.is_dir(follow_symlinks=False):
            continue
        try:
            if _last_change(Path(entry.path)) >= cutoff:
                continue
        except OSError:
            continue
        shutil.rmtree(entry.path, ignore_errors=True)
        removed += 1
    return removed


def _env(workdir: Path | None) -> dict[str, str]:
    env = {key: os.environ[key] for key in _ENV_ALLOWLIST if key in os.environ}
    if workdir is not None:
        env["TMPDIR"] = str(workdir)
    return env


class _Drain(threading.Thread):
    """Read a pipe to its end in chunks, keeping at most `limit` bytes: the first ones, or with `tail` the
    last ones. However much a command writes, no more than that is ever held in memory."""

    def __init__(self, pipe, limit: int, *, tail: bool = False):
        super().__init__(daemon=True)
        self.pipe, self.limit, self.tail = pipe, limit, tail
        self.data = bytearray()
        self.overflow = False

    def run(self) -> None:
        with contextlib.suppress(OSError, ValueError), self.pipe:
            while chunk := self.pipe.read1(PIPE_CHUNK):
                if self.tail:
                    self.data += chunk
                    del self.data[: -self.limit]
                elif len(self.data) + len(chunk) > self.limit:
                    self.overflow = True  # keep reading, so the command doesn't block on a full pipe
                else:
                    self.data += chunk


def _run(args: list[str], *, timeout: float, workdir: Path | None = None, capture: bool = False) -> bytes:
    """Run one command; kill its whole process group on timeout. Returns stdout (capped) when `capture`."""
    process = subprocess.Popen(  # noqa: S603 - fixed argv, no shell
        args,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        env=_env(workdir),
        cwd=str(workdir) if workdir else None,
        start_new_session=True,
    )
    err = _Drain(process.stderr, STDERR_TAIL, tail=True)
    out = _Drain(process.stdout, MAX_PROBE_OUTPUT) if capture else None
    readers = [err] if out is None else [err, out]
    for reader in readers:
        reader.start()
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        with contextlib.suppress(ProcessLookupError, PermissionError):
            os.killpg(process.pid, signal.SIGKILL)
        process.wait()
        raise VideoError("Converting the video took too long.") from None
    finally:
        for reader in readers:
            reader.join()
    if process.returncode != 0:
        logger.info(
            "%s failed (%s): %s", Path(args[0]).name, process.returncode, err.data.decode(errors="replace")
        )
        raise Unreadable("The video could not be read.")
    if out is None:
        return b""
    if out.overflow:
        raise Unreadable("The video could not be read.")
    return bytes(out.data)


def _ffmpeg(*args: str) -> list[str]:
    return [settings.FFMPEG_PATH, "-hide_banner", "-nostdin", "-loglevel", "error", "-y", *args]


# Every file ffprobe or ffmpeg opens is read as a local file in one of the containers clips come in: a crafted
# file can't make them open a URL or another file (HLS, concat and other playlists) or use another demuxer.
INPUT_GUARD = ("-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,avi")


def _input(path: Path) -> list[str]:
    return [*INPUT_GUARD, "-i", str(path)]


# ---- probing -----------------------------------------------------------------------------------


def _rate(value: object) -> float:
    try:
        rate = Fraction(str(value))
    except (ValueError, ZeroDivisionError):
        return 0.0
    return float(rate) if rate > 0 else 0.0


def _rotation(stream: dict) -> int:
    angle = 0.0
    for side in stream.get("side_data_list") or []:
        if isinstance(side, dict) and "rotation" in side:
            with contextlib.suppress(TypeError, ValueError):
                angle = float(side["rotation"])
    if not angle:
        with contextlib.suppress(TypeError, ValueError):
            angle = float((stream.get("tags") or {}).get("rotate", 0))
    return round(angle / 90) * 90 % 360


def read_probe(data: dict, size: int) -> VideoInfo:
    """Describe a clip from ffprobe's JSON, or raise `VideoError` when it isn't one we take."""
    fmt = data.get("format") if isinstance(data.get("format"), dict) else {}
    streams = [s for s in data.get("streams") or [] if isinstance(s, dict)]
    formats = set(str(fmt.get("format_name", "")).split(","))
    if not CONTAINERS & formats:
        raise VideoError("This video format is not supported.")
    videos = [
        s
        for s in streams
        if s.get("codec_type") == "video" and not (s.get("disposition") or {}).get("attached_pic")
    ]
    if not videos:
        raise NotAVideo("The file has no video in it.")
    video = videos[0]
    codec = str(video.get("codec_name", ""))
    if codec in STILL_CODECS:
        raise VideoError("The file is a picture, not a video.")
    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    if not (0 < width <= MAX_DIMENSION and 0 < height <= MAX_DIMENSION):
        raise VideoError("The video's size is not supported.")
    # A container that doesn't say how long it is: its longest stream. A browser recording (MediaRecorder
    # WebM) often names no length at all: converting it caps it at the longest clip and tells its length.
    duration = _rate(fmt.get("duration")) or max((_rate(s.get("duration")) for s in streams), default=0.0)
    if duration <= 0 and not RECORDING_CONTAINERS & formats:
        raise VideoError("The video has no length.")
    if duration > settings.MAX_VIDEO_DURATION_SECONDS:
        minutes = settings.MAX_VIDEO_DURATION_SECONDS / 60
        raise VideoError(f"The video is too long: clips can be at most {minutes:g} minutes.")
    real, average = _rate(video.get("r_frame_rate")), _rate(video.get("avg_frame_rate"))
    # Browser and screen recordings (MediaRecorder WebM) name no average and the time base (1000 fps)
    # as the "real" rate: such a clip has a variable rate and is converted at a steady one.
    sane = [rate for rate in (average, real) if 0 < rate <= MAX_SOURCE_FPS]
    fps = sane[0] if sane else VARIABLE_RATE_FPS
    rotation = _rotation(video)
    if rotation in (90, 270):
        width, height = height, width
    audios = [s for s in streams if s.get("codec_type") == "audio"]
    transfer = str(video.get("color_transfer", ""))
    return VideoInfo(
        duration_ms=round(duration * 1000),
        width=width,
        height=height,
        fps=fps,
        codec=codec,
        pix_fmt=str(video.get("pix_fmt", "")),
        rotation=rotation,
        constant_rate=bool(sane and real and average and abs(real - average) / real < 0.01),
        has_audio=bool(audios),
        audio_codec=str(audios[0].get("codec_name", "")) if audios else "",
        hdr=transfer in ("smpte2084", "arib-std-b67"),  # PQ or HLG: BT.2020 colours alone are not HDR
        size=size,
    )


def probe(path: Path) -> VideoInfo:
    """ffprobe `path`. Raises `VideoError` unless it is a clip we take."""
    out = _run(
        [
            settings.FFPROBE_PATH,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            *_input(path),
        ],
        timeout=PROBE_TIMEOUT_SECONDS,
        capture=True,
    )
    try:
        data = json.loads(out)
    except ValueError as exc:
        raise Unreadable("The video could not be read.") from exc
    if not isinstance(data, dict):
        raise Unreadable("The video could not be read.")
    return read_probe(data, path.stat().st_size)


# ---- making it web-ready -----------------------------------------------------------------------


def _even(value: float) -> int:
    return max(2, int(value) // 2 * 2)


def output_size(info: VideoInfo) -> tuple[int, int]:
    """The converted clip's size: the source's, fitted into 1920 by 1080 (either way round), even numbers."""
    box_w, box_h = (MAX_WIDTH, MAX_HEIGHT) if info.width >= info.height else (MAX_HEIGHT, MAX_WIDTH)
    scale = min(1.0, box_w / info.width, box_h / info.height)
    return _even(info.width * scale), _even(info.height * scale)


def remux_args(source: Path, target: Path) -> list[str]:
    return _ffmpeg(
        *_input(source),
        "-map", "0:v:0", "-map", "0:a:0?",
        "-c", "copy",
        "-map_metadata", "-1",
        "-movflags", "+faststart",
        str(target),
    )  # fmt: skip


def transcode_args(source: Path, target: Path, info: VideoInfo) -> list[str]:
    width, height = output_size(info)
    fps = min(info.fps, MAX_FPS)
    keyframes = max(1, round(fps * 2))
    filters = [f"scale={width}:{height}:flags=lanczos", "format=yuv420p"]
    if info.hdr:
        # Tone-map to SDR when this ffmpeg has zimg; without it the colours come out flatter but usable.
        filters.insert(
            0,
            "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,"
            "zscale=t=bt709:m=bt709:r=tv",
        )
    if not info.constant_rate or info.fps > MAX_FPS:
        filters.append(f"fps={fps:.3f}")
    audio = ["-c:a", "aac", "-b:a", "160k", "-ac", "2", "-ar", "48000"] if info.has_audio else ["-an"]
    # The result is always tagged as ordinary (BT.709) video, so a browser never treats it as HDR.
    colour = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"]
    return _ffmpeg(
        *_input(source),
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", ",".join(filters),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-profile:v", "high",
        "-g", str(keyframes), "-keyint_min", str(max(1, round(fps))), "-sc_threshold", "0",
        *colour,
        *audio,
        "-map_metadata", "-1",
        "-movflags", "+faststart",
        *_bounds(),
        str(target),
    )  # fmt: skip


def max_output_bytes() -> int:
    """The largest converted clip, twice the largest upload: a conversion seldom outgrows its source."""
    return 2 * settings.MAX_VIDEO_UPLOAD_BYTES


def _bounds() -> list[str]:
    """Options that bound one conversion whatever the source claims: its length, its size, the threads its
    encoder and filters use (`VIDEO_FFMPEG_THREADS`) and its CPU time."""
    threads = str(max(1, int(settings.VIDEO_FFMPEG_THREADS)))
    # A backstop for an ffmpeg whose worker was killed (nothing enforces the deadline any more): it stops
    # itself after the deadline's worth of CPU time on every core, which no conversion within it can reach.
    cpu_seconds = settings.VIDEO_TRANSCODE_TIMEOUT_SECONDS * (os.cpu_count() or 1)
    return [
        "-t", str(settings.MAX_VIDEO_DURATION_SECONDS),
        "-fs", str(max_output_bytes()),
        "-threads", threads, "-filter_threads", threads,
        "-timelimit", str(cpu_seconds),
    ]  # fmt: skip


def has_zscale() -> bool:
    try:
        out = _run([settings.FFMPEG_PATH, "-hide_banner", "-filters"], timeout=10, capture=True)
    except VideoError:
        return False
    return b" zscale " in out


def normalize(source: Path, target: Path, info: VideoInfo) -> VideoInfo:
    """Write the web-ready MP4 to `target` and describe it (rewrap when enough, otherwise convert)."""
    if info.web_ready:
        _run(remux_args(source, target), timeout=REMUX_TIMEOUT_SECONDS, workdir=target.parent)
    else:
        if info.hdr and not has_zscale():
            info = replace(info, hdr=False)
        _run(
            transcode_args(source, target, info),
            timeout=settings.VIDEO_TRANSCODE_TIMEOUT_SECONDS,
            workdir=target.parent,
        )
        if target.stat().st_size >= max_output_bytes():  # ffmpeg stopped at `-fs`: the clip was cut short
            raise VideoError("The converted video is too large.")
    result = probe(target)
    if result.codec != "h264":
        raise VideoError("The video could not be converted.")
    return result


def extract_audio(clip: Path, target: Path) -> bool:
    """Copy the clip's (AAC) sound into an .m4a of its own; False when the clip is silent."""
    try:
        _run(
            _ffmpeg(
                *_input(clip),
                "-vn",
                "-map",
                "0:a:0",
                "-c:a",
                "copy",
                "-movflags",
                "+faststart",
                str(target),
            ),
            timeout=REMUX_TIMEOUT_SECONDS,
            workdir=target.parent,
        )
    except VideoError:
        return False
    return target.exists() and target.stat().st_size > 0


# ---- stills ------------------------------------------------------------------------------------


def strip_plan(duration_ms: int) -> tuple[int, int]:
    """(frames, interval_ms) for the timeline's filmstrip: a frame every half second or more, at most 60."""
    interval = max(STRIP_MIN_INTERVAL_MS, math.ceil(duration_ms / STRIP_MAX_FRAMES))
    return max(1, min(STRIP_MAX_FRAMES, math.ceil(duration_ms / interval))), interval


def _webp(png: bytes, quality: int, max_side: int | None = None) -> tuple[bytes, int, int]:
    try:
        with Image.open(BytesIO(png)) as img:
            img = img.convert("RGB")
            if max_side:
                img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            out = BytesIO()
            img.save(out, "WEBP", quality=quality, method=4)
            return out.getvalue(), img.width, img.height
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise VideoError("The video's frames could not be read.") from exc


def make_stills(clip: Path, info: VideoInfo) -> Stills:
    """The poster (a frame a second in, or a tenth of the way for a short clip), its thumbnail and the
    filmstrip, all from the web-ready clip."""
    workdir = clip.parent
    poster_png, strip_png = workdir / "poster.png", workdir / "strip.png"
    at = min(1.0, info.duration_ms / 10_000)
    _run(
        _ffmpeg("-ss", f"{at:.3f}", *_input(clip), "-frames:v", "1", "-update", "1", str(poster_png)),
        timeout=STILLS_TIMEOUT_SECONDS,
        workdir=workdir,
    )
    poster, _, _ = _webp(poster_png.read_bytes(), POSTER_QUALITY, POSTER_MAX_SIDE)
    try:
        thumbnail = make_thumbnail(poster)
    except ImageError as exc:
        raise VideoError("The video's frames could not be read.") from exc

    frames, interval = strip_plan(info.duration_ms)
    filmstrip, strip = None, None
    try:
        _run(
            _ffmpeg(
                *_input(clip),
                "-vf", f"fps=1000/{interval},scale=-2:{STRIP_HEIGHT},tile={frames}x1",
                "-frames:v", "1", "-update", "1",
                str(strip_png),
            ),
            timeout=STILLS_TIMEOUT_SECONDS,
            workdir=workdir,
        )  # fmt: skip
        filmstrip, width, height = _webp(strip_png.read_bytes(), 75)
        strip = {
            "frames": frames,
            "interval_ms": interval,
            "tile_width": width // frames,
            "tile_height": height,
        }
    except VideoError:
        logger.info("No filmstrip for %s.", clip.name)  # the timeline shows the poster instead
    return Stills(poster=poster, thumbnail=thumbnail, filmstrip=filmstrip, strip=strip)
