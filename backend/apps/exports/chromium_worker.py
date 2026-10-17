"""Render worker: runs in its own short-lived process so a stuck or crashing browser can be killed.

Usage: `python -m apps.exports.chromium_worker <spec.json>`. The spec names the mode, the input, the output
and report files and the policy. No Django here: only the standard library and Playwright's sync API.

Two modes share one locked-down browser:
 * `pdf` (the default) prints static HTML. JavaScript is disabled for page content (the evaluate calls below
   are DevTools calls).
 * `image` opens the frontend's headless render page (`render.html`) and draws one design page with the
   editor's own engine, so JavaScript is on, for that page's own bundle. The design goes in through
   `page.evaluate` and the PNG comes back the same way: the page needs no API, cookies or tokens.

For both:
 * every request goes through `context.route`: `data:` URLs pass, same-origin `/media/` and `/static/`
   GETs are fetched by this process *without following redirects*, everything else is aborted and recorded;
 * Chromium cannot resolve host names at all (`--host-resolver-rules`), so even a routing bug has no
   network to reach; service workers, downloads and permissions are off.
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

from apps.exports.policy import RequestPolicy

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
RENDER_READY = "() => window.__dooryRenderReady === true && typeof window.__dooryRender === 'function'"
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
)


class RenderTimeout(Exception):
    pass


# (page, spec, remaining_ms, report): writes the output file and may add to the report.
Work = Callable[[Any, dict[str, Any], Callable[[], int], dict[str, Any]], None]


def run(spec: dict[str, Any]) -> dict[str, Any]:
    """Render as `spec["mode"]` says and return the report."""
    if spec.get("mode", "pdf") == "image":
        return _with_page(spec, js=True, work=_render_image)
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
    if not isinstance(answer, dict) or not answer.get("ok"):
        error = answer.get("error") if isinstance(answer, dict) else None
        error = error if isinstance(error, dict) else {}
        code, message = str(error.get("code") or "render_failed"), str(error.get("message") or "")[:500]
        if code == "timeout":
            raise RenderTimeout
        report.update(status="error", kind="render", error={"code": code[:64], "message": message})
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


def _with_page(spec: dict[str, Any], *, js: bool, work: Work) -> dict[str, Any]:
    """Launch the browser, route every request through the policy and hand a fresh page to `work`, which
    writes its output and may add to the report. Deadline and failures become the report's error kinds."""
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
    from playwright.sync_api import sync_playwright

    policy = RequestPolicy.build(
        spec["allowed_origins"], spec["path_prefixes"], page_url=spec.get("render_url") if js else None
    )
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
        decision = policy.evaluate(request.url, request.method)
        if not decision.allowed:
            block(route, request.url, decision.reason)
            return
        report["allowed_total"] += 1
        if not decision.fetch:
            route.continue_()
            return
        try:
            response = route.fetch(max_redirects=0, timeout=min(remaining_ms(), 10_000))
            body = response.body()
        except (PlaywrightError, RenderTimeout):
            block(route, request.url, "fetch-failed")
            return
        if 300 <= response.status < 400:
            block(route, request.url, "redirect")
        elif len(body) > max_asset_bytes:
            block(route, request.url, "too-large")
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
