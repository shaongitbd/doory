"""Runs the render worker (PDF or image) in a child process with a hard deadline and bounded concurrency."""

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
from urllib.parse import urlsplit

from django.conf import settings

from .exceptions import ExportBusy, ExportFailed, ExportTimeout, ExportUnavailable, InvalidExport
from .policy import RequestPolicy

logger = logging.getLogger("doory.exports")

KILL_GRACE_SECONDS = 3
# Chromium puts `.org.chromium.Chromium.XXXXXX/SingletonSocket` (45 characters) below the worker's TMPDIR, and
# the path of a unix socket stops at 107 characters.
MAX_WORKDIR_CHARS = 60
MAX_ASSET_BYTES = 10 * 1024 * 1024
# Error codes of the render page that describe the request (a 400), not a broken renderer.
RENDER_PAGE_INPUT_ERRORS = frozenset({"invalid_document", "page_not_found", "invalid_options"})
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


def render_image(payload: dict, *, render_url: str) -> RenderResult:
    """Draw one design page as a PNG on the frontend's headless render page at `render_url`.

    `payload` is the render page's input (`document`, `page`, `multiplier`, `transparent`, `fonts`). Raises
    the `Export*` API exceptions, and `InvalidExport` with the page's code when it refuses the input."""
    try:
        if not render_url:
            raise ValueError
        RequestPolicy.build([], [], page_url=render_url)
    except ValueError:
        logger.error("EXPORT_RENDER_PAGE_URL must be the http(s) URL of render.html, not %r", render_url)
        raise ExportUnavailable

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

    return _run_worker(prepare, "image/png", "Image export")


def _run_worker(prepare, mime: str, label: str) -> RenderResult:
    """Run the worker on the spec `prepare(workdir)` writes the inputs for, and read its output file."""
    timeout = float(settings.EXPORT_TIMEOUT_SECONDS)
    workdir = _new_workdir()
    try:
        spec, output_path = prepare(workdir)
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
                    "max_asset_bytes": MAX_ASSET_BYTES,
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
        return _read_result(report_path, output_path, log_path, process.returncode, mime, label)
    finally:
        _kill_browser_leftovers(workdir)
        shutil.rmtree(workdir, ignore_errors=True)


def _read_result(
    report_path: Path, output_path: Path, log_path: Path, returncode: int, mime: str, label: str
) -> RenderResult:
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        tail = log_path.read_bytes()[-2000:].decode("utf-8", "replace") if log_path.exists() else ""
        logger.error("%s worker exited with %s and no report: %s", label, returncode, tail)
        raise ExportUnavailable if "ModuleNotFoundError" in tail else ExportFailed
    blocked = tuple(BlockedRequest(item["url"], item["reason"]) for item in report.get("blocked", []))
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
        if kind == "render" and error.get("code") in RENDER_PAGE_INPUT_ERRORS:
            raise InvalidExport(
                str(error["code"]), str(error.get("message") or "The design cannot be drawn.")
            )
        raise ExportFailed
    try:
        data = output_path.read_bytes()
    except OSError:
        raise ExportFailed
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
