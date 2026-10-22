"""Render worker: runs in its own short-lived process so a stuck or crashing browser can be killed.

Usage: `python -m apps.exports.chromium_worker <spec.json>`. The spec names the mode, the input, the output
and report files and the policy. No Django here: only the standard library and Playwright's sync API.

Three modes share one locked-down browser:
 * `pdf` (the default) prints static HTML. JavaScript is disabled for page content (the evaluate calls below
   are DevTools calls).
 * `image` opens the frontend's headless render page (`render.html`) and draws one design page with the
   editor's own engine, so JavaScript is on, for that page's own bundle. The design goes in through
   `page.evaluate` and the PNG comes back the same way: the page needs no API, cookies or tokens.
 * `pages` opens the same page and makes several pages at once for the SVG and PDF exports (SVG files, the
   print server's SVG pages or JPEG pictures, `window.__dooryRenderPages`), one file per page.
 * `video` opens the same page, makes an MP4, WebM or GIF (`window.__dooryRenderVideo`) and reads the file in
   slices (`window.__dooryVideoSlice`). The browser's encoders need a secure context, so a page at a plain
   `http://` address is opened at its `*.localhost` alias (`policy.secure_alias`), which the route serves from
   the real address.

For both:
 * every request goes through `context.route`: `data:` URLs pass, same-origin `/media/` and `/static/`
   GETs are fetched by this process *without following redirects*, everything else is aborted and recorded;
 * Chromium cannot resolve host names at all (`--host-resolver-rules`) and WebRTC UDP is disabled, so even a
   routing bug has no network to reach; service workers, downloads and permissions are off.
"""

from __future__ import annotations

import base64
import binascii
import json
import sys
import time
import traceback
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from apps.exports.policy import RequestPolicy, secure_alias, unaliased

WAIT_FOR_FONTS = """
(timeoutMs) => Promise.race([
  document.fonts.ready.then(() => true),
  new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
])
"""
# Resolves to the page's answer, or to a timeout error of the same shape when the deadline comes first.
RENDER_IMAGE = """
([input, timeoutMs]) => Promise.race([
  window.__dooryRender(input),
  new Promise((resolve) => setTimeout(
    () => resolve({ ok: false, error: { code: "timeout", message: "render deadline exceeded" } }), timeoutMs,
  )),
])
"""
RENDER_PAGES = """
([input, timeoutMs]) => Promise.race([
  window.__dooryRenderPages(input),
  new Promise((resolve) => setTimeout(
    () => resolve({ ok: false, error: { code: "timeout", message: "render deadline exceeded" } }), timeoutMs,
  )),
])
"""
RENDER_VIDEO = """
([input, timeoutMs]) => Promise.race([
  window.__dooryRenderVideo(input),
  new Promise((resolve) => setTimeout(
    () => resolve({ ok: false, error: { code: "timeout", message: "render deadline exceeded" } }), timeoutMs,
  )),
])
"""
READ_VIDEO_SLICE = "([offset, length]) => window.__dooryVideoSlice(offset, length)"
RENDER_READY = "() => window.__dooryRenderReady === true && typeof window.__dooryRender === 'function'"
HAS_RENDER_PAGES = "() => typeof window.__dooryRenderPages === 'function'"
HAS_RENDER_VIDEO = (
    "() => typeof window.__dooryRenderVideo === 'function' && typeof window.__dooryVideoSlice === 'function'"
)
VIDEO_SLICE_BYTES = 4 * 1024 * 1024  # base64 through the DevTools connection, one slice at a time
PAGE_SUFFIXES = {"svg": "svg", "print": "svg", "picture": "jpg"}
PAGE_KINDS = {"svg": "SVG files", "print": "print pages", "picture": "pictures"}
MAX_RECORDED_REQUESTS = 50
LAUNCH_ARGS = (
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--no-first-run",
    "--mute-audio",
    "--force-color-profile=srgb",
    "--host-resolver-rules=MAP * ~NOTFOUND",
    "--force-webrtc-ip-handling-policy",
    "--webrtc-ip-handling-policy=disable_non_proxied_udp",
)


class RenderTimeout(Exception):
    pass


# (page, spec, remaining_ms, report): writes the output file and may add to the report.
Work = Callable[[Any, dict[str, Any], Callable[[], int], dict[str, Any]], None]


def run(spec: dict[str, Any]) -> dict[str, Any]:
    """Render as `spec["mode"]` says and return the report."""
    if spec.get("mode", "pdf") == "image":
        return _with_page(spec, js=True, work=_render_image)
    if spec.get("mode") == "pages":
        return _with_page(spec, js=True, work=_render_pages)
    if spec.get("mode") == "video":
        return _with_page(spec, js=True, work=_render_video, secure=True)
    return _with_page(spec, js=False, work=_print_pdf)


def _print_pdf(page, spec: dict[str, Any], remaining_ms: Callable[[], int], report: dict[str, Any]) -> None:
    """Print `spec["html_path"]` to `spec["pdf_path"]`."""
    html = Path(spec["html_path"]).read_text(encoding="utf-8")
    page.set_content(html, wait_until="load", timeout=remaining_ms())
    fonts_ready = page.evaluate(WAIT_FOR_FONTS, min(remaining_ms(), 10_000))
    report["fonts_ready"] = bool(fonts_ready)
    remaining_ms()
    pdf = page.pdf(
        width=f"{spec['width_px']}px",
        height=f"{spec['height_px']}px",
        print_background=True,
        prefer_css_page_size=True,
        margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
    )
    Path(spec["pdf_path"]).write_bytes(pdf)


def _render_image(
    page, spec: dict[str, Any], remaining_ms: Callable[[], int], report: dict[str, Any]
) -> None:
    """Open `spec["render_url"]`, draw the payload of `spec["payload_path"]` and write `spec["png_path"]`."""
    payload = json.loads(Path(spec["payload_path"]).read_text(encoding="utf-8"))
    page.goto(spec["render_url"], wait_until="load", timeout=remaining_ms())
    page.wait_for_function(RENDER_READY, timeout=remaining_ms())
    answer = page.evaluate(RENDER_IMAGE, [payload, remaining_ms()])
    remaining_ms()
    if not _answered(answer, report):
        return
    try:
        png = base64.b64decode(answer["png"], validate=True)
    except (KeyError, TypeError, binascii.Error):
        report.update(status="error", kind="failed", message="the render page sent no PNG")
        return
    Path(spec["png_path"]).write_bytes(png)
    report.update(
        width=int(answer.get("width") or 0),
        height=int(answer.get("height") or 0),
        page_id=str(answer.get("pageId") or ""),
        page_index=int(answer.get("pageIndex") or 0),
        placeholders=int(answer.get("placeholders") or 0),
        missing_fonts=[str(name)[:120] for name in answer.get("missingFonts") or []][:64],
    )


def _answered(answer, report: dict[str, Any]) -> bool:
    """Whether the render page answered `ok`; else its error goes into the report (a timeout is raised)."""
    if isinstance(answer, dict) and answer.get("ok"):
        return True
    error = answer.get("error") if isinstance(answer, dict) else None
    error = error if isinstance(error, dict) else {}
    code, message = str(error.get("code") or "render_failed"), str(error.get("message") or "")[:500]
    if code == "timeout":
        raise RenderTimeout
    report.update(status="error", kind="render", error={"code": code[:64], "message": message})
    return False


def _render_pages(
    page, spec: dict[str, Any], remaining_ms: Callable[[], int], report: dict[str, Any]
) -> None:
    """Open `spec["render_url"]`, make the pages of the payload in `spec["payload_path"]` and write one file
    per page into `spec["pages_dir"]` (`page-1.svg`, ...), in the order the page answered them. A page over
    `spec["max_page_bytes"]`, or pages over `spec["max_total_bytes"]` together, are refused (`too_large`)
    before anything is written."""
    payload = json.loads(Path(spec["payload_path"]).read_text(encoding="utf-8"))
    page.goto(spec["render_url"], wait_until="load", timeout=remaining_ms())
    page.wait_for_function(RENDER_READY, timeout=remaining_ms())
    if not page.evaluate(HAS_RENDER_PAGES):
        report.update(status="error", kind="unavailable", message="the render page cannot make pages yet")
        return
    answer = page.evaluate(RENDER_PAGES, [payload, remaining_ms()])
    remaining_ms()
    if not _answered(answer, report):
        return
    suffix = PAGE_SUFFIXES.get(payload.get("output"), "svg")
    pages, out = answer.get("pages"), Path(spec["pages_dir"])
    if not isinstance(pages, list) or not pages or not all(isinstance(item, dict) for item in pages):
        report.update(status="error", kind="failed", message="the render page sent no pages")
        return
    files: list[bytes] = []
    for number, item in enumerate(pages, start=1):
        try:
            data = (
                base64.b64decode(item["data"], validate=True)
                if suffix == "jpg"
                else str(item["data"]).encode("utf-8")
            )
        except (KeyError, TypeError, binascii.Error):
            report.update(status="error", kind="failed", message=f"the render page sent no page {number}")
            return
        files.append(data)
        too_large = _too_large(payload.get("output"), item, data, sum(map(len, files)), spec)
        if too_large:
            report.update(status="error", kind="render", error={"code": "too_large", "message": too_large})
            return
    report["pages"] = []
    for number, (item, data) in enumerate(zip(pages, files, strict=True), start=1):
        name = f"page-{number}.{suffix}"
        (out / name).write_bytes(data)
        report["pages"].append(
            {
                "file": name,
                "width": float(item.get("width") or 0),
                "height": float(item.get("height") or 0),
                "pixel_width": int(item.get("pixelWidth") or 0),
                "pixel_height": int(item.get("pixelHeight") or 0),
                "page_id": str(item.get("pageId") or ""),
                "page_index": int(item.get("pageIndex") or 0),
                "placeholders": int(item.get("placeholders") or 0),
                "missing_fonts": [str(family)[:120] for family in item.get("missingFonts") or []][:64],
            }
        )
    files = answer.get("fontFiles") if isinstance(answer.get("fontFiles"), list) else []
    report["font_files"] = [
        {key: item.get(key) for key in ("family", "url", "weight", "style")}
        for item in files[:64]
        if isinstance(item, dict)
    ]


def _megabytes(size: int) -> str:
    return f"{size / 1024 / 1024:.1f} MB"


def _too_large(output, item: dict, data: bytes, total: int, spec: dict[str, Any]) -> str:
    """Why a page (`data`, after pages of `total` bytes with it) is over the limits of the spec, or ""."""
    page, total_limit = spec.get("max_page_bytes"), spec.get("max_total_bytes")
    kind = PAGE_KINDS.get(output, "pages")
    if page and len(data) > page:
        number = int(item.get("pageIndex") or 0) + 1
        return (
            f"Page {number} would be a file of {_megabytes(len(data))}; this server makes {kind} of at most "
            f"{_megabytes(page)}. A picture is put into the file once for every time it is used: use large "
            "pictures fewer times, or export PNG or JPG."
        )
    if total_limit and total > total_limit:
        return (
            f"The pages would be more than {_megabytes(total_limit)} together, the most this server makes in "
            "one export. Export fewer pages at once."
        )
    return ""


def _render_video(
    page, spec: dict[str, Any], remaining_ms: Callable[[], int], report: dict[str, Any]
) -> None:
    """Open the render page (at its secure alias, see the module), make the video of the payload in
    `spec["payload_path"]` and write it to `spec["video_path"]`, read in slices of `VIDEO_SLICE_BYTES`."""
    payload = json.loads(Path(spec["payload_path"]).read_text(encoding="utf-8"))
    url = secure_alias(spec["render_url"]) or spec["render_url"]
    page.goto(url, wait_until="load", timeout=remaining_ms())
    page.wait_for_function(RENDER_READY, timeout=remaining_ms())
    if not page.evaluate(HAS_RENDER_VIDEO):
        report.update(status="error", kind="unavailable", message="the render page cannot make videos yet")
        return
    answer = page.evaluate(RENDER_VIDEO, [payload, remaining_ms()])
    remaining_ms()
    if not _answered(answer, report):
        return
    size = answer.get("bytes")
    if not isinstance(size, int) or not 0 < size <= int(spec["max_video_bytes"]):
        report.update(status="error", kind="failed", message=f"the render page made a video of {size} bytes")
        return
    written = 0
    with Path(spec["video_path"]).open("wb") as out:
        while written < size:
            part = page.evaluate(READ_VIDEO_SLICE, [written, VIDEO_SLICE_BYTES])
            remaining_ms()
            if not _answered(part, report):
                return
            try:
                data = base64.b64decode(part["data"], validate=True)
            except (KeyError, TypeError, binascii.Error):
                data = b""
            if not data:
                break
            out.write(data)
            written += len(data)
    if written != size:
        message = f"the render page sent {written} of {size} bytes"
        report.update(status="error", kind="failed", message=message)
        return
    report.update(
        mime=str(answer.get("mime") or "")[:40],
        bytes=size,
        width=int(answer.get("width") or 0),
        height=int(answer.get("height") or 0),
        fps=int(answer.get("fps") or 0),
        frames=int(answer.get("frames") or 0),
        duration_ms=int(answer.get("durationMs") or 0),
        video=str(answer.get("video") or "")[:40],
        audio=str(answer["audio"])[:40] if answer.get("audio") else None,
        warnings=[str(code)[:40] for code in answer.get("warnings") or []][:16],
        page_ids=[str(item)[:100] for item in answer.get("pageIds") or []][:1000],
        page_indexes=[int(item) for item in answer.get("pageIndexes") or []][:1000],
        placeholders=int(answer.get("placeholders") or 0),
        missing_fonts=[str(name)[:120] for name in answer.get("missingFonts") or []][:64],
    )


def _with_page(spec: dict[str, Any], *, js: bool, work: Work, secure: bool = False) -> dict[str, Any]:
    """Launch the browser, route every request through the policy and hand a fresh page to `work`, which
    writes its output and may add to the report. Deadline and failures become the report's error kinds.

    `secure`: the render page is opened at its secure alias (when it needs one), whose requests are checked
    and fetched at the real address; the answers name the alias as allowed origin, for pictures, fonts and
    sounds the page loads from the real address."""
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
    from playwright.sync_api import sync_playwright

    policy = RequestPolicy.build(
        spec["allowed_origins"], spec["path_prefixes"], page_url=spec.get("render_url") if js else None
    )
    page_url = spec.get("render_url") or ""
    alias = secure_alias(page_url) if secure and js else None
    alias_origin = f"http://{urlsplit(alias).netloc}" if alias else None
    deadline = time.monotonic() + float(spec["timeout_s"])
    max_asset_bytes = int(spec["max_asset_bytes"])
    report: dict[str, Any] = {"status": "ok", "blocked": [], "blocked_total": 0, "allowed_total": 0}

    def remaining_ms() -> int:
        left = int((deadline - time.monotonic()) * 1000)
        if left <= 0:
            raise RenderTimeout
        return left

    def block(route, url: str, reason: str) -> None:
        report["blocked_total"] += 1
        if len(report["blocked"]) < MAX_RECORDED_REQUESTS:
            report["blocked"].append({"url": url[:300], "reason": reason})
        route.abort("blockedbyclient")

    def handle(route) -> None:
        request = route.request
        url = unaliased(request.url, alias, page_url) if alias else request.url
        decision = policy.evaluate(url, request.method)
        if not decision.allowed:
            block(route, url, decision.reason)
            return
        report["allowed_total"] += 1
        if not decision.fetch:
            route.continue_()
            return
        try:
            response = route.fetch(url=url, max_redirects=0, timeout=min(remaining_ms(), 10_000))
            body = response.body()
        except (PlaywrightError, RenderTimeout):
            block(route, url, "fetch-failed")
            return
        if 300 <= response.status < 400:
            block(route, url, "redirect")
        elif len(body) > max_asset_bytes:
            block(route, url, "too-large")
        elif alias_origin:
            headers = {**response.headers, "access-control-allow-origin": alias_origin}
            route.fulfill(response=response, body=body, headers=headers)
        else:
            route.fulfill(response=response, body=body)

    def refuse_web_socket(socket) -> None:
        report["blocked_total"] += 1
        if len(report["blocked"]) < MAX_RECORDED_REQUESTS:
            report["blocked"].append({"url": socket.url[:300], "reason": "websocket"})
        socket.close()

    options: dict[str, Any] = {
        "headless": True,
        "args": list(LAUNCH_ARGS),
        # Playwright adds --no-sandbox unless the sandbox is requested explicitly.
        "chromium_sandbox": not spec.get("no_sandbox"),
        "timeout": remaining_ms(),
    }
    if spec.get("executable_path"):
        options["executable_path"] = spec["executable_path"]

    try:
        with sync_playwright() as playwright:
            try:
                browser = playwright.chromium.launch(**options)
            except PlaywrightError as exc:
                return {**report, "status": "error", "kind": "unavailable", "message": str(exc)[:500]}
            try:
                context = browser.new_context(
                    java_script_enabled=js,
                    service_workers="block",
                    accept_downloads=False,
                    permissions=[],
                    bypass_csp=False,
                    ignore_https_errors=False,
                )
                context.route("**/*", handle)
                if js:
                    # Web sockets bypass `route`; the page's own script never opens one.
                    context.route_web_socket("**/*", refuse_web_socket)
                page = context.new_page()
                work(page, spec, remaining_ms, report)
            finally:
                browser.close()
    except (PlaywrightTimeout, RenderTimeout):
        return {**report, "status": "error", "kind": "timeout", "message": "render deadline exceeded"}
    except PlaywrightError as exc:
        return {**report, "status": "error", "kind": "failed", "message": str(exc)[:500]}
    return report


def main(argv: list[str]) -> int:
    spec_path = Path(argv[1])
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    try:
        report = run(spec)
    except Exception as exc:  # last resort: the parent only trusts the report file
        traceback.print_exc()
        report = {"status": "error", "kind": "failed", "message": f"{type(exc).__name__}: {exc}"[:500]}
    Path(spec["report_path"]).write_text(json.dumps(report), encoding="utf-8")
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
