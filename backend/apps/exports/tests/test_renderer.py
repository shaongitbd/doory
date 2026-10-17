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

from apps.exports import renderer
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
