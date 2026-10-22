"""Runs the render worker (PDF, image, pages or video) in a child process with a hard deadline and bounded
concurrency."""

from __future__ import annotations

import contextlib
import json
import logging
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO
from urllib.parse import urlsplit

from django.conf import settings

from apps.core import svg

from .exceptions import ExportBusy, ExportFailed, ExportTimeout, ExportUnavailable, InvalidExport
from .policy import RequestPolicy

logger = logging.getLogger("doory.exports")

KILL_GRACE_SECONDS = 3
# Chromium puts `.org.chromium.Chromium.XXXXXX/SingletonSocket` (45 characters) below the worker's TMPDIR, and
# the path of a unix socket stops at 107 characters.
MAX_WORKDIR_CHARS = 60
MAX_ASSET_BYTES = 10 * 1024 * 1024
MAX_SOUND_BYTES = 30 * 1024 * 1024  # video: a sound file of the design (the editor takes up to 25 MB)
# Error codes of the render page that describe the request (a 400), not a broken renderer.
# `image_unavailable`: a picture of the design could not be fetched, so it can't go into an SVG.
# Video: `too_long` and `too_large` (the server's limits), `sound_unavailable` (a sound file would not load).
RENDER_PAGE_INPUT_ERRORS = frozenset(
    {
        "invalid_document",
        "page_not_found",
        "invalid_options",
        "image_unavailable",
        "too_long",
        "too_large",
        "sound_unavailable",
    }
)
# The render page's browser has no encoder for the video asked for (a 503).
RENDER_PAGE_UNAVAILABLE = frozenset({"video_unsupported"})
PAGE_MIME_TYPES = {"svg": "image/svg+xml", "print": "image/svg+xml", "picture": "image/jpeg"}
# The largest file of one page `render_pages` takes, and of all its pages together (`too_large`, before the
# worker writes them). An SVG carries its pictures inside, once for every use: a design that repeats a large
# picture makes a huge file. Print pages go through the SVG sanitiser, which takes at most `svg.MAX_BYTES`.
# Pictures (JPEG) are bounded by their pixels.
MAX_PAGE_BYTES = {"svg": 50 * 1024 * 1024, "print": svg.MAX_BYTES}
MAX_PAGES_TOTAL_BYTES = 200 * 1024 * 1024
VIDEO_MIME_TYPES = frozenset({"video/mp4", "video/webm", "image/gif"})
COPY_CHUNK_BYTES = 1024 * 1024
_ENV_ALLOWLIST = (
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "PLAYWRIGHT_BROWSERS_PATH",
    "PLAYWRIGHT_NODEJS_PATH",
    "FONTCONFIG_PATH",
    "FONTCONFIG_FILE",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
)


@dataclass(frozen=True)
class BlockedRequest:
    url: str
    reason: str


@dataclass(frozen=True)
class RenderResult:
    data: bytes
    mime: str = "application/pdf"
    allowed_total: int = 0
    blocked_total: int = 0
    blocked: tuple[BlockedRequest, ...] = field(default_factory=tuple)
    # Image mode only, as the render page reports them.
    width: int = 0
    height: int = 0
    page_id: str = ""
    page_index: int = 0
    placeholders: int = 0  # objects drawn as grey stand-ins (usually a picture that did not load)
    missing_fonts: tuple[str, ...] = ()

    @property
    def pdf(self) -> bytes:
        return self.data


@dataclass(frozen=True)
class RenderedPage:
    """One page `render_pages` made: its file and what the render page reported about it."""

    data: bytes
    width: float  # the page's own size in px, without the bleed
    height: float
    page_id: str
    page_index: int
    pixel_width: int = 0  # pictures only
    pixel_height: int = 0
    placeholders: int = 0
    missing_fonts: tuple[str, ...] = ()


@dataclass(frozen=True)
class PagesResult:
    pages: tuple[RenderedPage, ...]
    mime: str
    font_files: tuple[dict, ...] = ()  # print pages: the font files they use, as the editor sends them
    allowed_total: int = 0
    blocked_total: int = 0
    blocked: tuple[BlockedRequest, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class VideoResult:
    """The file `render_video` made and what the render page reported about it."""

    file: BinaryIO  # open at its start; a temporary file, deleted when it is closed
    size: int
    mime: str  # video/mp4, video/webm or image/gif
    width: int
    height: int
    fps: int
    frames: int
    duration_ms: int
    video: str  # what the picture was made with: H.264, VP9, GIF ...
    audio: str | None  # and the sound (Opus, AAC), or None for a file without sound
    warnings: tuple[str, ...] = ()  # the pipeline's codes: audio-fallback, no-audio, video-fallback
    page_ids: tuple[str, ...] = ()
    page_indexes: tuple[int, ...] = ()
    placeholders: int = 0
    missing_fonts: tuple[str, ...] = ()
    allowed_total: int = 0
    blocked_total: int = 0
    blocked: tuple[BlockedRequest, ...] = field(default_factory=tuple)


# ---- bounded concurrency -----------------------------------------------------------------------

_slots_lock = threading.Lock()
_slots: tuple[int, threading.BoundedSemaphore] | None = None
_busy_owners: set[object] = set()


def _semaphore() -> threading.BoundedSemaphore:
    global _slots
    size = max(1, int(settings.EXPORT_MAX_CONCURRENCY))
    with _slots_lock:
        if _slots is None or _slots[0] != size:
            _slots = (size, threading.BoundedSemaphore(size))
        return _slots[1]


@contextlib.contextmanager
def render_slot(owner: object = None) -> Iterator[None]:
    """Hold one of `EXPORT_MAX_CONCURRENCY` render slots (per process) or raise `ExportBusy` at once.

    One `owner` (the account) holds one slot at a time: a render may take the whole deadline, and a single
    account running two of them would otherwise keep every other account out of the PDF export.
    """
    semaphore = _semaphore()
    with _slots_lock:
        if owner is not None and owner in _busy_owners:
            raise ExportBusy
        if not semaphore.acquire(blocking=False):
            raise ExportBusy
        if owner is not None:
            _busy_owners.add(owner)
    try:
        yield
    finally:
        with _slots_lock:
            _busy_owners.discard(owner)
        semaphore.release()


# ---- policy inputs -----------------------------------------------------------------------------


def allowed_origins() -> list[str]:
    origins = list(settings.EXPORT_ALLOWED_ORIGINS)
    media = urlsplit(settings.MEDIA_URL)
    if media.scheme and media.netloc:
        origins.append(f"{media.scheme}://{media.netloc}")
    return origins


def allowed_path_prefixes() -> list[str]:
    return [urlsplit(settings.MEDIA_URL).path or "/media/", urlsplit(settings.STATIC_URL).path or "/static/"]


# ---- worker process ----------------------------------------------------------------------------


def worker_command(spec_path: Path) -> list[str]:
    return [sys.executable, "-m", "apps.exports.chromium_worker", str(spec_path)]


def _worker_env(workdir: Path) -> dict[str, str]:
    """Minimal environment (no app secrets). TMPDIR points into the work directory so the browser profile
    is deleted with it even when the worker has to be killed."""
    env = {key: os.environ[key] for key in _ENV_ALLOWLIST if key in os.environ}
    env["TMPDIR"] = str(workdir)
    return env


def _kill_group(process: subprocess.Popen) -> None:
    with contextlib.suppress(ProcessLookupError, PermissionError):
        os.killpg(process.pid, signal.SIGKILL)
    process.wait()


def _kill_browser_leftovers(workdir: Path) -> None:
    """Kill browser processes that outlived their worker.

    Playwright starts Chromium in a process group of its own, so killing the worker's group does not reach
    it; the browser notices the dead worker only after a while and keeps writing to its profile until then.
    Its command line names that profile, which lives below the private work directory, so the directory
    path finds exactly the processes of this render (Linux; elsewhere there is no /proc, nothing to do).
    """
    proc = Path("/proc")
    if not proc.is_dir():
        return
    needle = str(workdir).encode()
    for _ in range(10):
        found = False
        for entry in proc.iterdir():
            if not entry.name.isdigit() or int(entry.name) == os.getpid():
                continue
            try:
                found_here = needle in (entry / "cmdline").read_bytes()
            except OSError:
                continue
            if found_here:
                found = True
                with contextlib.suppress(ProcessLookupError, PermissionError):
                    os.kill(int(entry.name), signal.SIGKILL)
        if not found:
            return
        time.sleep(0.05)


def _new_workdir() -> Path:
    """A private directory for one render, under `EXPORT_WORK_DIR` (default: the system temp directory)."""
    root = settings.EXPORT_WORK_DIR or None
    if root:
        Path(root).mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix="doory-export-", dir=root))
    if len(str(workdir)) > MAX_WORKDIR_CHARS:
        shutil.rmtree(workdir, ignore_errors=True)
        logger.error(
            "The export work directory %s is longer than %d characters: Chromium keeps a unix socket (at "
            "most 107 characters) below it and would not start. Point EXPORT_WORK_DIR at a shorter path.",
            workdir,
            MAX_WORKDIR_CHARS,
        )
        raise ExportUnavailable
    return workdir


def render_pdf(html: str, *, width_px: float, height_px: float) -> RenderResult:
    """Print `html` to a PDF with locked-down headless Chromium. Raises the `Export*` API exceptions."""

    def prepare(workdir: Path) -> tuple[dict, Path]:
        html_path, pdf_path = workdir / "input.html", workdir / "output.pdf"
        html_path.write_text(html, encoding="utf-8")
        spec = {
            "html_path": str(html_path),
            "pdf_path": str(pdf_path),
            "width_px": round(width_px, 4),
            "height_px": round(height_px, 4),
        }
        return spec, pdf_path

    return _run_worker(prepare, "application/pdf", "PDF export")


def _check_render_url(render_url: str) -> None:
    try:
        if not render_url:
            raise ValueError
        RequestPolicy.build([], [], page_url=render_url)
    except ValueError:
        logger.error("EXPORT_RENDER_PAGE_URL must be the http(s) URL of render.html, not %r", render_url)
        raise ExportUnavailable


def render_image(payload: dict, *, render_url: str, timeout: float | None = None) -> RenderResult:
    """Draw one design page as a PNG on the frontend's headless render page at `render_url`.

    `payload` is the render page's input (`document`, `page`, `multiplier`, `transparent`, `fonts`). `timeout`
    replaces `EXPORT_TIMEOUT_SECONDS`. Raises the `Export*` API exceptions, and `InvalidExport` with the
    page's code when it refuses the input."""
    _check_render_url(render_url)

    def prepare(workdir: Path) -> tuple[dict, Path]:
        payload_path, png_path = workdir / "payload.json", workdir / "output.png"
        payload_path.write_text(json.dumps(payload), encoding="utf-8")
        spec = {
            "mode": "image",
            "render_url": render_url,
            "payload_path": str(payload_path),
            "png_path": str(png_path),
        }
        return spec, png_path

    return _run_worker(prepare, "image/png", "Image export", timeout=timeout)


def render_pages(payload: dict, *, render_url: str, timeout: float | None = None) -> PagesResult:
    """Make several design pages at once on the frontend's headless render page at `render_url`, in one
    browser: SVG files, the print server's SVG pages or JPEG pictures (`payload["output"]`: svg, print or
    picture).

    `payload` is the render page's input (`document`, `pages`, `output`, `bleed`, `multiplier`, `maxPixels`,
    `fonts`); the size limits of SVG and print pages (`MAX_PAGE_BYTES`, `MAX_PAGES_TOTAL_BYTES`) are added to
    it. `timeout` replaces `EXPORT_TIMEOUT_SECONDS` (several pages take longer than one). Raises the `Export*`
    API exceptions, and `InvalidExport` with the page's code when it refuses the input (`too_large` for pages
    over the limits)."""
    _check_render_url(render_url)
    limits = {}
    if payload.get("output") in MAX_PAGE_BYTES:
        limits = {"maxPageBytes": MAX_PAGE_BYTES[payload["output"]], "maxTotalBytes": MAX_PAGES_TOTAL_BYTES}

    def prepare(workdir: Path) -> tuple[dict, Path]:
        payload_path, pages_dir = workdir / "payload.json", workdir / "pages"
        payload_path.write_text(json.dumps({**payload, **limits}), encoding="utf-8")
        pages_dir.mkdir()
        spec = {
            "mode": "pages",
            "render_url": render_url,
            "payload_path": str(payload_path),
            "pages_dir": str(pages_dir),
            "max_page_bytes": limits.get("maxPageBytes"),
            "max_total_bytes": limits.get("maxTotalBytes"),
        }
        return spec, pages_dir

    mime = PAGE_MIME_TYPES.get(payload.get("output"), "image/svg+xml")
    return _run_worker(prepare, mime, "Page export", timeout=timeout, read=_read_pages)


def render_video(payload: dict, *, render_url: str, timeout: float, max_bytes: int) -> VideoResult:
    """Make an MP4, WebM or GIF of a design on the frontend's headless render page at `render_url`, in one
    browser, within `timeout` seconds. `payload` is the render page's input (`document`, `pages`, `format` and
    the video options, `maxMs`, `maxBytes`, `fonts`); a file over `max_bytes` is refused. The video comes back
    as a temporary file (never all in memory), which the caller closes. The design's sound files may be up to
    `MAX_SOUND_BYTES`. Raises the `Export*` API exceptions, `InvalidExport` with the page's
    code when it refuses the input, and `ExportUnavailable` when the browser cannot encode the format."""
    _check_render_url(render_url)

    def prepare(workdir: Path) -> tuple[dict, Path]:
        payload_path, video_path = workdir / "payload.json", workdir / "output.video"
        payload_path.write_text(json.dumps(payload), encoding="utf-8")
        spec = {
            "mode": "video",
            "render_url": render_url,
            "payload_path": str(payload_path),
            "video_path": str(video_path),
            "max_video_bytes": max_bytes,
            "max_asset_bytes": MAX_SOUND_BYTES,
        }
        return spec, video_path

    return _run_worker(prepare, "", "Video export", timeout=timeout, read=_read_video)


def _run_worker(prepare, mime: str, label: str, *, timeout: float | None = None, read=None):
    """Run the worker on the spec `prepare(workdir)` writes the inputs for, and read its output (`read`, by
    default one file: a `RenderResult`)."""
    timeout = float(settings.EXPORT_TIMEOUT_SECONDS if timeout is None else timeout)
    workdir = _new_workdir()
    try:
        spec, output_path = prepare(workdir)
        spec.setdefault("max_asset_bytes", MAX_ASSET_BYTES)
        report_path, spec_path, log_path = (
            workdir / "report.json",
            workdir / "spec.json",
            workdir / "worker.log",
        )
        spec_path.write_text(
            json.dumps(
                {
                    **spec,
                    "report_path": str(report_path),
                    "executable_path": settings.EXPORT_CHROMIUM_PATH,
                    "no_sandbox": bool(settings.EXPORT_CHROMIUM_NO_SANDBOX),
                    "allowed_origins": allowed_origins(),
                    "path_prefixes": allowed_path_prefixes(),
                    "timeout_s": timeout,
                }
            ),
            encoding="utf-8",
        )
        with log_path.open("wb") as log:
            process = subprocess.Popen(  # noqa: S603 - fixed argv built from our own constants
                worker_command(spec_path),
                cwd=settings.BASE_DIR,
                env=_worker_env(workdir),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=log,
                start_new_session=True,
            )
            try:
                process.wait(timeout=timeout + KILL_GRACE_SECONDS)
            except subprocess.TimeoutExpired:
                _kill_group(process)
                logger.warning("%s killed after %.0fs", label, timeout + KILL_GRACE_SECONDS)
                raise ExportTimeout
            finally:
                if process.poll() is None:
                    _kill_group(process)
        report = _checked_report(report_path, log_path, process.returncode, label)
        return (read or _read_result)(report, output_path, mime)
    finally:
        _kill_browser_leftovers(workdir)
        shutil.rmtree(workdir, ignore_errors=True)


def _checked_report(report_path: Path, log_path: Path, returncode: int, label: str) -> dict:
    """The worker's report when it says `ok`; else the `Export*` exception its error stands for."""
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        tail = log_path.read_bytes()[-2000:].decode("utf-8", "replace") if log_path.exists() else ""
        logger.error("%s worker exited with %s and no report: %s", label, returncode, tail)
        raise ExportUnavailable if "ModuleNotFoundError" in tail else ExportFailed
    blocked = _blocked(report)
    if blocked:
        logger.warning(
            "%s blocked %d request(s): %s",
            label,
            report.get("blocked_total", len(blocked)),
            "; ".join(f"{b.reason} {b.url[:120]}" for b in blocked[:5]),
        )
    if report.get("fonts_ready") is False:
        logger.warning("PDF export printed before all fonts finished loading")
    if report.get("status") != "ok":
        kind = report.get("kind")
        error = report.get("error") if isinstance(report.get("error"), dict) else {}
        logger.error("%s failed (%s): %s", label, kind, report.get("message") or error)
        if kind == "timeout":
            raise ExportTimeout
        if kind == "unavailable":
            raise ExportUnavailable
        if kind == "render" and error.get("code") in RENDER_PAGE_UNAVAILABLE:
            raise ExportUnavailable("This server's browser cannot encode this video format.")
        if kind == "render" and error.get("code") in RENDER_PAGE_INPUT_ERRORS:
            raise InvalidExport(
                str(error["code"]), str(error.get("message") or "The design cannot be drawn.")
            )
        raise ExportFailed
    return report


def _blocked(report: dict) -> tuple[BlockedRequest, ...]:
    return tuple(BlockedRequest(item["url"], item["reason"]) for item in report.get("blocked", []))


def _read_result(report: dict, output_path: Path, mime: str) -> RenderResult:
    try:
        data = output_path.read_bytes()
    except OSError:
        raise ExportFailed
    blocked = _blocked(report)
    return RenderResult(
        data=data,
        mime=mime,
        allowed_total=int(report.get("allowed_total", 0)),
        blocked_total=int(report.get("blocked_total", 0)),
        blocked=blocked,
        width=int(report.get("width", 0)),
        height=int(report.get("height", 0)),
        page_id=str(report.get("page_id", "")),
        page_index=int(report.get("page_index", 0)),
        placeholders=int(report.get("placeholders", 0)),
        missing_fonts=tuple(str(name) for name in report.get("missing_fonts", [])),
    )


def _read_pages(report: dict, pages_dir: Path, mime: str) -> PagesResult:
    pages = []
    try:
        for item in report["pages"]:
            name = str(item["file"])
            if "/" in name or name.startswith("."):
                raise ExportFailed
            pages.append(
                RenderedPage(
                    data=(pages_dir / name).read_bytes(),
                    width=float(item.get("width", 0)),
                    height=float(item.get("height", 0)),
                    page_id=str(item.get("page_id", "")),
                    page_index=int(item.get("page_index", 0)),
                    pixel_width=int(item.get("pixel_width", 0)),
                    pixel_height=int(item.get("pixel_height", 0)),
                    placeholders=int(item.get("placeholders", 0)),
                    missing_fonts=tuple(str(family) for family in item.get("missing_fonts", [])),
                )
            )
    except (OSError, KeyError, TypeError, ValueError):
        raise ExportFailed
    if not pages:
        raise ExportFailed
    return PagesResult(
        pages=tuple(pages),
        mime=mime,
        font_files=tuple(item for item in report.get("font_files", []) if isinstance(item, dict)),
        allowed_total=int(report.get("allowed_total", 0)),
        blocked_total=int(report.get("blocked_total", 0)),
        blocked=_blocked(report),
    )


def _read_video(report: dict, video_path: Path, mime: str) -> VideoResult:
    """The video, copied out of the work directory (removed next) into a temporary file that goes away when it
    is closed; a file of up to `EXPORT_VIDEO_MAX_BYTES` is never read into memory."""
    try:
        size = video_path.stat().st_size
        details = {
            "mime": str(report["mime"]),
            "width": int(report["width"]),
            "height": int(report["height"]),
            "fps": int(report["fps"]),
            "frames": int(report["frames"]),
            "duration_ms": int(report["duration_ms"]),
            "video": str(report["video"]),
            "audio": str(report["audio"]) if report.get("audio") else None,
            "warnings": tuple(str(code) for code in report.get("warnings", [])),
            "page_ids": tuple(str(item) for item in report.get("page_ids", [])),
            "page_indexes": tuple(int(item) for item in report.get("page_indexes", [])),
            "placeholders": int(report.get("placeholders", 0)),
            "missing_fonts": tuple(str(name) for name in report.get("missing_fonts", [])),
            "allowed_total": int(report.get("allowed_total", 0)),
            "blocked_total": int(report.get("blocked_total", 0)),
            "blocked": _blocked(report),
        }
    except (OSError, KeyError, TypeError, ValueError):
        raise ExportFailed
    if details["mime"] not in VIDEO_MIME_TYPES or not size or size != report.get("bytes"):
        raise ExportFailed
    file = tempfile.TemporaryFile(prefix="doory-video-", dir=settings.EXPORT_WORK_DIR or None)  # noqa: SIM115
    try:
        with video_path.open("rb") as source:
            shutil.copyfileobj(source, file, COPY_CHUNK_BYTES)
        file.seek(0)
    except OSError:
        file.close()
        raise ExportFailed
    return VideoResult(file=file, size=size, **details)
