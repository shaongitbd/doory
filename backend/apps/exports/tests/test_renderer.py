"""The parent side of the print worker: process lifecycle, deadlines, error mapping (no real browser)."""

import json
import os
import subprocess
import sys
import textwrap
import time
from pathlib import Path

import pytest
from django.conf import settings as django_settings

from apps.exports import chromium_worker, renderer
from apps.exports.exceptions import ExportFailed, ExportTimeout, ExportUnavailable, InvalidExport


def fake_worker(tmp_path: Path, body: str) -> Path:
    script = tmp_path / "fake_worker.py"
    script.write_text(
        "import json, sys, time\nfrom pathlib import Path\n"
        "spec = json.loads(Path(sys.argv[1]).read_text())\n" + textwrap.dedent(body)
    )
    return script


@pytest.fixture
def use_worker(monkeypatch, tmp_path):
    def install(body: str) -> None:
        script = fake_worker(tmp_path, body)
        monkeypatch.setattr(
            renderer, "worker_command", lambda spec_path: [sys.executable, str(script), str(spec_path)]
        )

    return install


def render(html="<p>x</p>"):
    return renderer.render_pdf(html, width_px=100, height_px=100)


def test_successful_worker_result_is_returned(use_worker):
    use_worker(
        """
        Path(spec["pdf_path"]).write_bytes(b"%PDF-fake")
        Path(spec["report_path"]).write_text(json.dumps({
            "status": "ok", "allowed_total": 2, "blocked_total": 3,
            "blocked": [{"url": "http://x.test/a", "reason": "origin"}],
        }))
        """
    )
    result = render()
    assert result.pdf == b"%PDF-fake"
    assert (result.allowed_total, result.blocked_total) == (2, 3)
    assert result.blocked == (renderer.BlockedRequest("http://x.test/a", "origin"),)


def test_the_worker_receives_the_policy_and_the_page(use_worker, settings, tmp_path):
    settings.EXPORT_CHROMIUM_PATH = "/opt/some/chrome"
    settings.EXPORT_CHROMIUM_NO_SANDBOX = True
    settings.EXPORT_ALLOWED_ORIGINS = ["http://allowed.test:8000"]
    settings.MEDIA_URL = "/media/"
    use_worker(
        f"""
        Path({str(tmp_path / "seen.json")!r}).write_text(json.dumps(dict(spec, html=Path(spec["html_path"]).read_text())))
        Path(spec["pdf_path"]).write_bytes(b"x")
        Path(spec["report_path"]).write_text(json.dumps({{"status": "ok"}}))
        """
    )
    render("<p>hello</p>")
    seen = json.loads((tmp_path / "seen.json").read_text())
    assert seen["html"] == "<p>hello</p>"
    assert (seen["width_px"], seen["height_px"]) == (100, 100)
    assert seen["executable_path"] == "/opt/some/chrome" and seen["no_sandbox"] is True
    assert "http://allowed.test:8000" in seen["allowed_origins"]
    assert seen["path_prefixes"] == ["/media/", "/static/"]
    assert seen["timeout_s"] == 30


def test_absolute_media_url_adds_its_origin(settings):
    settings.EXPORT_ALLOWED_ORIGINS = ["http://a.test"]
    settings.MEDIA_URL = "https://cdn.example/media/"
    assert renderer.allowed_origins() == ["http://a.test", "https://cdn.example"]
    assert renderer.allowed_path_prefixes()[0] == "/media/"


def test_workdir_is_removed(use_worker, monkeypatch, tmp_path):
    seen = []
    real_mkdtemp = renderer.tempfile.mkdtemp
    monkeypatch.setattr(
        renderer.tempfile, "mkdtemp", lambda **kw: seen.append(real_mkdtemp(**kw)) or seen[-1]
    )
    use_worker(
        """
        Path(spec["pdf_path"]).write_bytes(b"x")
        Path(spec["report_path"]).write_text(json.dumps({"status": "ok"}))
        """
    )
    render()
    assert len(seen) == 1 and not os.path.exists(seen[0])


def test_workdir_is_removed_after_failures_too(use_worker, monkeypatch):
    seen = []
    real_mkdtemp = renderer.tempfile.mkdtemp
    monkeypatch.setattr(
        renderer.tempfile, "mkdtemp", lambda **kw: seen.append(real_mkdtemp(**kw)) or seen[-1]
    )
    use_worker("sys.exit(3)")
    with pytest.raises(ExportFailed):
        render()
    assert not os.path.exists(seen[0])


def test_a_worker_that_hangs_is_killed_at_the_deadline(use_worker, settings, monkeypatch):
    settings.EXPORT_TIMEOUT_SECONDS = 1
    monkeypatch.setattr(renderer, "KILL_GRACE_SECONDS", 0.5)
    use_worker(
        """
        time.sleep(120)
        """
    )
    started = time.monotonic()
    with pytest.raises(ExportTimeout):
        render()
    assert time.monotonic() - started < 10


def test_the_whole_process_group_is_killed(use_worker, settings, monkeypatch, tmp_path):
    settings.EXPORT_TIMEOUT_SECONDS = 1
    monkeypatch.setattr(renderer, "KILL_GRACE_SECONDS", 0.5)
    marker = tmp_path / "child.pid"
    use_worker(
        f"""
        import subprocess
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"])
        Path({str(marker)!r}).write_text(str(child.pid))
        time.sleep(120)
        """
    )
    with pytest.raises(ExportTimeout):
        render()
    child_pid = int(marker.read_text())
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        try:
            os.kill(child_pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.05)
    else:
        pytest.fail("the grandchild process survived the timeout")


def test_worker_reported_timeout(use_worker):
    use_worker('Path(spec["report_path"]).write_text(json.dumps({"status": "error", "kind": "timeout"}))')
    with pytest.raises(ExportTimeout):
        render()


def test_worker_reported_unavailable_browser(use_worker):
    use_worker('Path(spec["report_path"]).write_text(json.dumps({"status": "error", "kind": "unavailable"}))')
    with pytest.raises(ExportUnavailable):
        render()


def test_worker_reported_failure(use_worker):
    use_worker(
        'Path(spec["report_path"]).write_text(json.dumps({"status": "error", "kind": "failed", "message": "x"}))'
    )
    with pytest.raises(ExportFailed):
        render()


def test_worker_crash_without_report(use_worker):
    use_worker("raise SystemExit(139)")
    with pytest.raises(ExportFailed):
        render()


def test_missing_playwright_module_is_reported_as_unavailable(use_worker):
    use_worker("import module_that_does_not_exist_anywhere")
    with pytest.raises(ExportUnavailable):
        render()


def test_ok_report_without_a_pdf_is_a_failure(use_worker):
    use_worker('Path(spec["report_path"]).write_text(json.dumps({"status": "ok"}))')
    with pytest.raises(ExportFailed):
        render()


def test_garbage_report_is_a_failure(use_worker):
    use_worker('Path(spec["report_path"]).write_text("not json")')
    with pytest.raises(ExportFailed):
        render()


def test_blocked_requests_are_logged(use_worker, caplog):
    use_worker(
        """
        Path(spec["pdf_path"]).write_bytes(b"x")
        Path(spec["report_path"]).write_text(json.dumps({"status": "ok", "blocked_total": 1,
            "blocked": [{"url": "http://169.254.169.254/latest", "reason": "origin"}]}))
        """
    )
    with caplog.at_level("WARNING", logger="doory.exports"):
        render()
    assert "169.254.169.254" in caplog.text


def test_worker_environment_does_not_leak_secrets(monkeypatch):
    monkeypatch.setenv("DJANGO_SECRET_KEY", "super-secret")
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pw@db/doory")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "aws-secret")
    monkeypatch.setenv("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
    monkeypatch.setenv("TMPDIR", "/somewhere/else")
    env = renderer._worker_env(Path("/work/dir"))
    assert env["PLAYWRIGHT_BROWSERS_PATH"] == "/opt/pw-browsers"
    assert env["TMPDIR"] == "/work/dir"
    assert not {"DJANGO_SECRET_KEY", "DATABASE_URL", "AWS_SECRET_ACCESS_KEY"} & set(env)


def test_the_worker_command_runs_the_worker_module(tmp_path):
    command = renderer.worker_command(tmp_path / "spec.json")
    assert command[1:3] == ["-m", "apps.exports.chromium_worker"]
    assert (
        subprocess.run(
            [command[0], "-c", "import apps.exports.chromium_worker"],
            cwd=django_settings.BASE_DIR,
            check=False,
        ).returncode
        == 0
    )


def test_the_browser_launch_flags_block_dns_and_webrtc():
    from apps.exports.chromium_worker import LAUNCH_ARGS

    assert "--host-resolver-rules=MAP * ~NOTFOUND" in LAUNCH_ARGS
    assert "--force-webrtc-ip-handling-policy" in LAUNCH_ARGS
    assert "--webrtc-ip-handling-policy=disable_non_proxied_udp" in LAUNCH_ARGS


# ---- image mode ----------------------------------------------------------------------------------

RENDER_URL = "http://frontend.test:8080/render.html"


def render_png(payload=None):
    return renderer.render_image(payload or {"document": {"pages": []}, "page": 0}, render_url=RENDER_URL)


def test_an_image_render_returns_the_png_and_what_the_page_reported(use_worker):
    use_worker(
        """
        Path(spec["png_path"]).write_bytes(b"\\x89PNG-fake")
        Path(spec["report_path"]).write_text(json.dumps({
            "status": "ok", "allowed_total": 4, "blocked_total": 1,
            "blocked": [{"url": "http://x.test/a.png", "reason": "origin"}],
            "width": 200, "height": 100, "page_id": "p2", "page_index": 1,
            "placeholders": 1, "missing_fonts": ["Gone Sans"],
        }))
        """
    )
    result = render_png()
    assert (result.data, result.mime) == (b"\x89PNG-fake", "image/png")
    assert (result.width, result.height, result.page_id, result.page_index) == (200, 100, "p2", 1)
    assert result.placeholders == 1 and result.missing_fonts == ("Gone Sans",)
    assert result.blocked == (renderer.BlockedRequest("http://x.test/a.png", "origin"),)


def test_the_pdf_property_still_reads_the_data():
    assert renderer.RenderResult(data=b"%PDF").pdf == b"%PDF"


def test_the_image_worker_gets_the_render_page_and_the_payload_from_a_file(use_worker, settings, tmp_path):
    settings.EXPORT_ALLOWED_ORIGINS = ["http://allowed.test:8000"]
    use_worker(
        f"""
        Path({str(tmp_path / "seen.json")!r}).write_text(json.dumps(dict(
            spec, payload=json.loads(Path(spec["payload_path"]).read_text()))))
        Path(spec["png_path"]).write_bytes(b"x")
        Path(spec["report_path"]).write_text(json.dumps({{"status": "ok"}}))
        """
    )
    render_png({"document": {"pages": [{"id": "a"}]}, "page": "a", "multiplier": 2})
    seen = json.loads((tmp_path / "seen.json").read_text())
    assert seen["mode"] == "image" and seen["render_url"] == RENDER_URL
    assert seen["payload"] == {"document": {"pages": [{"id": "a"}]}, "page": "a", "multiplier": 2}
    assert "http://allowed.test:8000" in seen["allowed_origins"]
    assert seen["path_prefixes"] == ["/media/", "/static/"]
    assert "html_path" not in seen and "pdf_path" not in seen
    assert seen["timeout_s"] == 30
    renderer.render_image({"document": {}, "page": 0}, render_url=RENDER_URL, timeout=7.5)
    assert json.loads((tmp_path / "seen.json").read_text())["timeout_s"] == 7.5


@pytest.mark.parametrize("code", ["invalid_document", "page_not_found", "invalid_options"])
def test_input_the_render_page_refuses_is_an_invalid_export(use_worker, code):
    use_worker(
        f"""
        Path(spec["report_path"]).write_text(json.dumps({{"status": "error", "kind": "render",
            "error": {{"code": {code!r}, "message": "The design has no page 9."}}}}))
        """
    )
    with pytest.raises(InvalidExport) as caught:
        render_png()
    assert caught.value.get_codes() == code
    assert str(caught.value.detail) == "The design has no page 9."


def test_a_render_page_crash_is_a_failure(use_worker):
    use_worker(
        """
        Path(spec["report_path"]).write_text(json.dumps({"status": "error", "kind": "render",
            "error": {"code": "render_failed", "message": "TypeError: x is undefined"}}))
        """
    )
    with pytest.raises(ExportFailed):
        render_png()


def test_an_image_worker_that_hangs_is_killed_with_its_children(use_worker, settings, monkeypatch, tmp_path):
    settings.EXPORT_TIMEOUT_SECONDS = 1
    monkeypatch.setattr(renderer, "KILL_GRACE_SECONDS", 0.5)
    marker = tmp_path / "child.pid"
    use_worker(
        f"""
        import subprocess
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"])
        Path({str(marker)!r}).write_text(str(child.pid))
        time.sleep(120)
        """
    )
    with pytest.raises(ExportTimeout):
        render_png()
    child_pid = int(marker.read_text())
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        try:
            os.kill(child_pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.05)
    else:
        pytest.fail("the grandchild process survived the timeout")


@pytest.mark.parametrize(
    ("kind", "error"),
    [("timeout", ExportTimeout), ("unavailable", ExportUnavailable), ("failed", ExportFailed)],
)
def test_image_worker_reported_errors(use_worker, kind, error):
    use_worker(f'Path(spec["report_path"]).write_text(json.dumps({{"status": "error", "kind": {kind!r}}}))')
    with pytest.raises(error):
        render_png()


def test_ok_report_without_a_png_is_a_failure(use_worker):
    use_worker('Path(spec["report_path"]).write_text(json.dumps({"status": "ok"}))')
    with pytest.raises(ExportFailed):
        render_png()


def test_the_image_workdir_is_removed(use_worker, monkeypatch):
    seen = []
    real_mkdtemp = renderer.tempfile.mkdtemp
    monkeypatch.setattr(
        renderer.tempfile, "mkdtemp", lambda **kw: seen.append(real_mkdtemp(**kw)) or seen[-1]
    )
    use_worker(
        """
        Path(spec["png_path"]).write_bytes(b"x")
        Path(spec["report_path"]).write_text(json.dumps({"status": "ok"}))
        """
    )
    render_png()
    assert len(seen) == 1 and not os.path.exists(seen[0])


@pytest.mark.parametrize("url", ["", "file:///srv/render.html", "http://frontend.test/"])
def test_a_misconfigured_render_page_is_unavailable_without_starting_a_worker(use_worker, tmp_path, url):
    marker = tmp_path / "started"
    use_worker(f"Path({str(marker)!r}).write_text('x')")
    with pytest.raises(ExportUnavailable):
        renderer.render_image({}, render_url=url)
    assert not marker.exists()


# ---- pages mode (SVG and PDF of a saved design) ----------------------------------------------------


def render_some_pages(payload=None, **options):
    return renderer.render_pages(
        payload or {"document": {"pages": []}, "pages": [0, 1], "output": "print"},
        render_url=RENDER_URL,
        **options,
    )


def test_pages_come_back_from_their_files_with_what_the_page_reported(use_worker, settings, tmp_path):
    use_worker(
        f"""
        Path({str(tmp_path / "seen.json")!r}).write_text(json.dumps(spec))
        out = Path(spec["pages_dir"])
        (out / "page-1.svg").write_bytes(b"<svg>1</svg>")
        (out / "page-2.svg").write_bytes(b"<svg>2</svg>")
        Path(spec["report_path"]).write_text(json.dumps({{
            "status": "ok", "blocked_total": 1, "blocked": [{{"url": "http://x.test/a.png", "reason": "origin"}}],
            "pages": [
                {{"file": "page-1.svg", "width": 200.5, "height": 100, "page_id": "a", "page_index": 0}},
                {{"file": "page-2.svg", "width": 50, "height": 60, "page_id": "b", "page_index": 1,
                  "placeholders": 2, "missing_fonts": ["Gone Sans"]}},
            ],
            "font_files": [{{"family": "F", "url": "/media/f.ttf", "weight": 400, "style": "normal"}}, "junk"],
        }}))
        """
    )
    result = render_some_pages(timeout=75)
    seen = json.loads((tmp_path / "seen.json").read_text())
    assert seen["mode"] == "pages" and seen["timeout_s"] == 75 and seen["render_url"] == RENDER_URL
    assert result.mime == "image/svg+xml"
    assert [(page.data, page.width, page.page_id) for page in result.pages] == [
        (b"<svg>1</svg>", 200.5, "a"),
        (b"<svg>2</svg>", 50, "b"),
    ]
    assert result.pages[1].placeholders == 2 and result.pages[1].missing_fonts == ("Gone Sans",)
    assert result.font_files == ({"family": "F", "url": "/media/f.ttf", "weight": 400, "style": "normal"},)
    assert result.blocked_total == 1


def test_pictures_are_jpegs_and_the_default_deadline_is_the_setting(use_worker, settings, tmp_path):
    settings.EXPORT_TIMEOUT_SECONDS = 12
    use_worker(
        f"""
        Path({str(tmp_path / "seen.json")!r}).write_text(json.dumps(spec))
        (Path(spec["pages_dir"]) / "page-1.jpg").write_bytes(b"jpeg")
        Path(spec["report_path"]).write_text(json.dumps({{"status": "ok", "pages": [
            {{"file": "page-1.jpg", "pixel_width": 900, "pixel_height": 300}}]}}))
        """
    )
    result = render_some_pages({"document": {}, "pages": [0], "output": "picture"})
    assert result.mime == "image/jpeg" and result.pages[0].pixel_width == 900
    assert json.loads((tmp_path / "seen.json").read_text())["timeout_s"] == 12


def test_svg_and_print_pages_get_size_limits(use_worker, tmp_path):
    seen = tmp_path / "seen.json"
    use_worker(
        f"""
        payload = json.loads(Path(spec["payload_path"]).read_text())
        Path({str(seen)!r}).write_text(json.dumps([
            spec["max_page_bytes"], spec["max_total_bytes"], payload.get("maxPageBytes"), payload.get("maxTotalBytes"),
        ]))
        (Path(spec["pages_dir"]) / "page-1.svg").write_bytes(b"<svg/>")
        Path(spec["report_path"]).write_text(json.dumps({{"status": "ok", "pages": [{{"file": "page-1.svg"}}]}}))
        """
    )
    mb = 1024 * 1024
    for output, limits in (
        ("svg", [50 * mb, 200 * mb]),
        ("print", [5 * mb, 200 * mb]),
        ("picture", [None, None]),
    ):
        render_some_pages({"document": {}, "pages": [0], "output": output})
        assert json.loads(seen.read_text()) == limits * 2


class FakeRenderPage:
    """The render page as `chromium_worker._render_pages` drives it, answering `answer`."""

    def __init__(self, answer):
        self.answer = answer

    def goto(self, *args, **kwargs):
        pass

    def wait_for_function(self, *args, **kwargs):
        pass

    def evaluate(self, script, *args):
        return True if script == chromium_worker.HAS_RENDER_PAGES else self.answer


def worker_pages(tmp_path, texts, output="svg", **limits) -> dict:
    (tmp_path / "payload.json").write_text(json.dumps({"output": output}))
    (tmp_path / "pages").mkdir(exist_ok=True)
    spec = {"payload_path": str(tmp_path / "payload.json"), "pages_dir": str(tmp_path / "pages"), **limits}
    spec["render_url"] = RENDER_URL
    pages = [{"data": text, "pageIndex": index} for index, text in enumerate(texts)]
    report = {"status": "ok"}
    chromium_worker._render_pages(FakeRenderPage({"ok": True, "pages": pages}), spec, lambda: 1000, report)
    return report


def test_the_worker_refuses_pages_over_the_size_limits_before_writing_them(tmp_path):
    report = worker_pages(tmp_path, ["<svg/>", "<svg>" + "x" * 100 + "</svg>"], max_page_bytes=100)
    assert (report["status"], report["error"]["code"]) == ("error", "too_large")
    assert report["error"]["message"].startswith(
        "Page 2 would be a file of 0.0 MB; this server makes SVG files"
    )
    assert list((tmp_path / "pages").iterdir()) == []
    report = worker_pages(tmp_path, ["<svg>a</svg>"] * 3, "print", max_page_bytes=100, max_total_bytes=30)
    assert report["error"]["code"] == "too_large" and "together" in report["error"]["message"]
    assert list((tmp_path / "pages").iterdir()) == []
    report = worker_pages(tmp_path, ["<svg>a</svg>"] * 3, "print", max_page_bytes=100, max_total_bytes=36)
    assert report["status"] == "ok" and len(list((tmp_path / "pages").iterdir())) == 3


def test_pages_over_the_size_limits_are_an_invalid_export(use_worker):
    use_worker(
        """
        Path(spec["report_path"]).write_text(json.dumps({"status": "error", "kind": "render",
            "error": {"code": "too_large", "message": "Page 2 would be a file of 80.0 MB."}}))
        """
    )
    with pytest.raises(InvalidExport) as raised:
        render_some_pages()
    assert raised.value.get_codes() == "too_large" and "80.0 MB" in str(raised.value.detail)


@pytest.mark.parametrize(
    "pages", ['[{"file": "../report.json"}]', '[{"file": "page-9.svg"}]', "[]", '"no list"', '[{"width": 1}]']
)
def test_a_report_that_names_no_page_file_of_its_own_is_a_failure(use_worker, pages):
    use_worker(
        f"""
        (Path(spec["pages_dir"]) / "page-1.svg").write_bytes(b"<svg/>")
        Path(spec["report_path"]).write_text(json.dumps({{"status": "ok", "pages": {pages}}}))
        """
    )
    with pytest.raises(ExportFailed):
        render_some_pages()


def test_a_picture_that_cannot_go_into_an_svg_is_an_invalid_export(use_worker):
    use_worker(
        """
        Path(spec["report_path"]).write_text(json.dumps({"status": "error", "kind": "render",
            "error": {"code": "image_unavailable", "message": "An image could not be embedded."}}))
        """
    )
    with pytest.raises(InvalidExport) as error:
        render_some_pages()
    assert error.value.get_codes() == "image_unavailable"


def test_a_render_page_without_pages_is_unavailable(use_worker):
    use_worker(
        """
        Path(spec["report_path"]).write_text(json.dumps({"status": "error", "kind": "unavailable",
            "message": "the render page cannot make pages yet"}))
        """
    )
    with pytest.raises(ExportUnavailable):
        render_some_pages()


def test_a_misconfigured_render_page_makes_no_pages(use_worker, tmp_path):
    use_worker(f'Path({str(tmp_path / "ran")!r}).write_text("x")')
    with pytest.raises(ExportUnavailable):
        renderer.render_pages({}, render_url="file:///srv/render.html")
    assert not (tmp_path / "ran").exists()


# ---- video mode (MP4, WebM and GIF of a saved design) ------------------------------------------------

VIDEO_REPORT = {
    "status": "ok",
    "mime": "video/mp4",
    "bytes": 8,
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "frames": 150,
    "duration_ms": 5000,
    "video": "H.264",
    "audio": "Opus",
    "warnings": ["audio-fallback"],
    "page_ids": ["a", "b"],
    "page_indexes": [0, 1],
    "placeholders": 1,
    "missing_fonts": ["Gone Sans"],
    "blocked_total": 2,
}


def render_a_video(**options):
    return renderer.render_video(
        {"document": {"pages": []}, "pages": [0, 1], "format": "mp4"},
        render_url=RENDER_URL,
        **({"timeout": 300, "max_bytes": 1000} | options),
    )


def test_a_video_comes_back_from_its_file_with_what_the_page_reported(use_worker, tmp_path):
    use_worker(
        f"""
        spec["payload"] = json.loads(Path(spec["payload_path"]).read_text())
        Path({str(tmp_path / "seen.json")!r}).write_text(json.dumps(spec))
        Path(spec["video_path"]).write_bytes(b"ftypmp42")
        Path(spec["report_path"]).write_text({json.dumps(VIDEO_REPORT)!r})
        """
    )
    result = render_a_video()
    seen = json.loads((tmp_path / "seen.json").read_text())
    assert seen["mode"] == "video" and seen["render_url"] == RENDER_URL
    assert (seen["timeout_s"], seen["max_video_bytes"]) == (300, 1000)
    # A design's sound files are larger than its pictures may be.
    assert seen["max_asset_bytes"] == renderer.MAX_SOUND_BYTES > renderer.MAX_ASSET_BYTES
    assert seen["payload"] == {"document": {"pages": []}, "pages": [0, 1], "format": "mp4"}
    assert (result.data, result.mime, result.width, result.height) == (b"ftypmp42", "video/mp4", 1920, 1080)
    assert (result.fps, result.frames, result.duration_ms, result.video, result.audio) == (
        30,
        150,
        5000,
        "H.264",
        "Opus",
    )
    assert result.warnings == ("audio-fallback",)
    assert (result.page_ids, result.page_indexes) == (("a", "b"), (0, 1))
    assert (result.placeholders, result.missing_fonts, result.blocked_total) == (1, ("Gone Sans",), 2)


def test_the_other_modes_keep_the_smaller_asset_limit(use_worker, tmp_path):
    use_worker(
        f"""
        Path({str(tmp_path / "seen.json")!r}).write_text(json.dumps(spec))
        Path(spec["png_path"]).write_bytes(b"png")
        Path(spec["report_path"]).write_text(json.dumps({{"status": "ok"}}))
        """
    )
    render_png()
    assert json.loads((tmp_path / "seen.json").read_text())["max_asset_bytes"] == renderer.MAX_ASSET_BYTES


@pytest.mark.parametrize(
    "change",
    [{"mime": "text/html"}, {"bytes": 9}, {"width": "wide"}, {"fps": None}],
)
def test_a_video_report_that_does_not_match_its_file_is_a_failure(use_worker, change):
    report = VIDEO_REPORT | change
    use_worker(
        f"""
        Path(spec["video_path"]).write_bytes(b"ftypmp42")
        Path(spec["report_path"]).write_text({json.dumps(report)!r})
        """
    )
    with pytest.raises(ExportFailed):
        render_a_video()


def test_a_video_without_its_file_is_a_failure(use_worker):
    use_worker(f'Path(spec["report_path"]).write_text({json.dumps(VIDEO_REPORT)!r})')
    with pytest.raises(ExportFailed):
        render_a_video()


@pytest.mark.parametrize("code", ["too_long", "too_large", "sound_unavailable"])
def test_a_video_the_render_page_refuses_is_an_invalid_export(use_worker, code):
    use_worker(
        f"""
        Path(spec["report_path"]).write_text(json.dumps({{"status": "error", "kind": "render",
            "error": {{"code": {code!r}, "message": "No."}}}}))
        """
    )
    with pytest.raises(InvalidExport) as caught:
        render_a_video()
    assert caught.value.get_codes() == code


def test_a_browser_without_the_encoder_is_unavailable(use_worker):
    use_worker(
        """
        Path(spec["report_path"]).write_text(json.dumps({"status": "error", "kind": "render",
            "error": {"code": "video_unsupported", "message": "This browser cannot make video files."}}))
        """
    )
    with pytest.raises(ExportUnavailable) as caught:
        render_a_video()
    assert "cannot encode" in str(caught.value.detail)


def test_a_misconfigured_render_page_makes_no_video(use_worker, tmp_path):
    use_worker(f'Path({str(tmp_path / "ran")!r}).write_text("x")')
    with pytest.raises(ExportUnavailable):
        renderer.render_video({}, render_url="file:///srv/render.html", timeout=10, max_bytes=10)
    assert not (tmp_path / "ran").exists()
