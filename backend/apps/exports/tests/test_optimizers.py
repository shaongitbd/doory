"""`apps.exports.optimizers`: the built-in one with stand-in programs, the services through a fake transport
(no real keys, nothing leaves the machine), the registry and the configuration checks."""

from __future__ import annotations

import base64
import io
import json
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from PIL import Image

from apps.ai import transport
from apps.ai.tests.fakes import parse_form
from apps.exports import checks, optimizers
from apps.exports.exceptions import InvalidExport
from apps.exports.optimizers import builtin
from apps.exports.optimizers.base import UNAVAILABLE, Job, OptimizerError
from apps.exports.services import image_formats

WIDTH, HEIGHT = 64, 48


def picture(fmt: str = "png", quality: int = 95, size=(WIDTH, HEIGHT)) -> bytes:
    """A gradient, so encoders have something to work on."""
    image = Image.new("RGB", size)
    image.putdata([(x * 4 % 256, y * 5 % 256, (x * y) % 256) for y in range(size[1]) for x in range(size[0])])
    out = io.BytesIO()
    kind = {"png": "PNG", "jpg": "JPEG", "webp": "WEBP", "avif": "AVIF"}[fmt]
    image.save(out, kind, **({} if fmt == "png" else {"quality": quality}))
    return out.getvalue()


def job(fmt: str = "png", **changes) -> Job:
    lossy = fmt != "png"
    values = {
        "data": picture(fmt),
        "format": fmt,
        "width": WIDTH,
        "height": HEIGHT,
        "quality": 82 if lossy else None,
        "source": picture("png"),
    }
    return Job(**(values | changes))


# ---- the built-in optimizer, with stand-in programs ---------------------------------------------

FAKE_TOOL = """#!{python}
import pathlib, sys, time
from PIL import Image

here = pathlib.Path(__file__).parent
args = sys.argv[1:]
if args == ["-version"]:
    print((here / "version").read_text(), file=sys.stderr)
    sys.exit(0)
with open(here / "calls.log", "a") as log:
    log.write(" ".join(args) + "\\n")
mode = (here / "mode").read_text().strip()
if mode == "fail":
    sys.exit(2)
if mode == "slow":
    time.sleep(10)
source, out = args[-1], args[args.index("-outfile" if "-outfile" in args else "--out") + 1]
image = Image.open(source)
if mode == "resize":
    image = image.resize((image.width // 2, image.height // 2))
if mode == "big":
    pathlib.Path(out).write_bytes(pathlib.Path(source).read_bytes() + bytes(500_000))
elif out.endswith(".jpg"):
    image.convert("RGB").save(out, "JPEG", quality=10)
else:
    image.convert("RGB").quantize(8).save(out, "PNG")
"""


class Tools:
    def __init__(self, root: Path):
        self.root = root

    def mode(self, value: str) -> None:
        (self.root / "mode").write_text(value)

    def calls(self) -> list[str]:
        log = self.root / "calls.log"
        return log.read_text().splitlines() if log.exists() else []

    def remove(self, name: str) -> None:
        (self.root / name).unlink()
        builtin.cjpeg.cache_clear()
        builtin.oxipng.cache_clear()


@pytest.fixture
def tools(tmp_path, monkeypatch, settings, work_root) -> Tools:
    """Stand-ins for `cjpeg` and `oxipng`, alone on the PATH."""
    for name in ("cjpeg", "oxipng"):
        path = tmp_path / name
        path.write_text(FAKE_TOOL.replace("{python}", sys.executable))
        path.chmod(path.stat().st_mode | stat.S_IXUSR)
    (tmp_path / "version").write_text("mozjpeg version 4.1.5 (fake)")
    (tmp_path / "mode").write_text("ok")
    monkeypatch.setenv("PATH", str(tmp_path))
    settings.EXPORT_WORK_DIR = str(work_root)
    builtin.cjpeg.cache_clear()
    builtin.oxipng.cache_clear()
    yield Tools(tmp_path)
    builtin.cjpeg.cache_clear()
    builtin.oxipng.cache_clear()


@pytest.fixture
def no_tools(tmp_path, monkeypatch):
    monkeypatch.setenv("PATH", str(tmp_path))
    builtin.cjpeg.cache_clear()
    builtin.oxipng.cache_clear()
    yield
    builtin.cjpeg.cache_clear()
    builtin.oxipng.cache_clear()


BUILTIN = optimizers.OPTIMIZERS["builtin"]


def test_mozjpeg_encodes_the_jpg_again_from_the_lossless_png(tools, work_root):
    work = job("jpg", progressive=True)
    result = optimizers.optimize(BUILTIN, work)
    assert result.optimized and result.optimizer == "builtin" and not result.warnings
    assert len(result.data) < len(work.data) == result.bytes_before
    (call,) = tools.calls()
    assert call.startswith("-quality 82 -outfile ") and call.endswith("in.ppm")
    assert "-baseline" not in call
    assert list(work_root.iterdir()) == []  # the work directory is gone


def test_a_baseline_jpg_asks_mozjpeg_for_one(tools):
    optimizers.optimize(BUILTIN, job("jpg", progressive=False))
    assert "-baseline" in tools.calls()[0]


@pytest.mark.parametrize(
    "changes",
    [{"quality": 95}, {"source": None}, {"strip_metadata": False}, {"srgb": False}],
    ids=["above quality 90", "no lossless source", "metadata kept", "profile kept"],
)
def test_mozjpeg_is_left_out_where_it_gains_nothing_or_would_lose_something(tools, changes):
    work = job("jpg", **changes)
    result = optimizers.optimize(BUILTIN, work)
    assert result.data == work.data and not result.optimized and not result.warnings
    assert tools.calls() == []


def test_oxipng_recompresses_a_png(tools):
    work = job("png")
    result = optimizers.optimize(BUILTIN, work)
    assert result.optimized and len(result.data) < len(work.data)
    (call,) = tools.calls()
    assert call.startswith("-q -o 2 -t 2 --strip safe --out ")


def test_oxipng_keeps_the_metadata_when_asked(tools):
    optimizers.optimize(BUILTIN, job("png", strip_metadata=False))
    assert "--strip" not in tools.calls()[0]


@pytest.mark.parametrize("fmt", ["webp", "avif"])
def test_webp_and_avif_stay_as_pillow_made_them(tools, fmt):
    if fmt not in image_formats():
        pytest.skip("Pillow without AVIF")
    work = job(fmt)
    result = optimizers.optimize(BUILTIN, work)
    assert result.data == work.data and not result.warnings and tools.calls() == []


def test_without_the_programs_the_builtin_optimizer_is_not_offered(no_tools):
    assert not BUILTIN.ready() and BUILTIN.formats == ()
    assert optimizers.available() == []
    assert optimizers.choose(True) is UNAVAILABLE


def test_with_one_program_only_its_format_is_optimized(tools):
    tools.remove("cjpeg")
    assert BUILTIN.ready() and BUILTIN.formats == ("png",)
    work = job("jpg")
    assert optimizers.optimize(BUILTIN, work).data == work.data


def test_libjpeg_cjpeg_is_not_mistaken_for_mozjpeg(tools):
    (tools.root / "version").write_text("libjpeg-turbo version 3.0.0")
    builtin.cjpeg.cache_clear()
    assert builtin.cjpeg() is None


@pytest.mark.parametrize(
    ("mode", "warned"),
    [("fail", "cjpeg failed"), ("resize", "returned a different image"), ("big", None)],
)
def test_a_failing_tool_or_a_wrong_or_bigger_file_leaves_the_jpg_as_it_was(tools, work_root, mode, warned):
    tools.mode(mode)
    work = job("jpg")
    result = optimizers.optimize(BUILTIN, work)
    assert result.data == work.data and not result.optimized
    assert (warned in result.warnings[0]) if warned else result.warnings == ()
    assert list(work_root.iterdir()) == []


def test_a_tool_that_takes_too_long_is_stopped(tools, settings):
    settings.IMAGE_OPTIMIZER_TIMEOUT = 1
    tools.mode("slow")
    work = job("png")
    result = optimizers.optimize(BUILTIN, work)
    assert result.data == work.data
    assert result.warnings == (
        "Built-in could not optimize the file (It took too long.); it is not optimized.",
    )


def _real_mozjpeg() -> str | None:
    for path in (os.environ.get("DOORY_TEST_MOZJPEG", ""), "/opt/homebrew/opt/mozjpeg/bin/cjpeg"):
        if path and os.access(path, os.X_OK):
            return path
    return None


@pytest.mark.skipif(_real_mozjpeg() is None, reason="mozjpeg not installed; set DOORY_TEST_MOZJPEG")
def test_the_real_mozjpeg_output_is_kept_only_when_smaller(monkeypatch, tmp_path, settings, work_root):
    """At the same quality number mozjpeg is ~20% smaller for photos but can be larger for flat graphics
    (it uses other quantization tables): the export keeps whichever file is smaller."""
    shutil.copy(_real_mozjpeg(), tmp_path / "cjpeg")
    monkeypatch.setenv("PATH", str(tmp_path))
    settings.EXPORT_WORK_DIR = str(work_root)
    builtin.cjpeg.cache_clear()
    source = picture("png", size=(400, 300))
    pillow = io.BytesIO()
    Image.open(io.BytesIO(source)).convert("RGB").save(pillow, "JPEG", quality=82, optimize=True)
    work = Job(pillow.getvalue(), "jpg", 400, 300, quality=82, source=source)
    ppm = tmp_path / "in.ppm"
    Image.open(io.BytesIO(source)).convert("RGB").save(ppm, "PPM")
    command = [
        str(tmp_path / "cjpeg"),
        "-quality",
        "82",
        "-baseline",
        "-outfile",
        str(tmp_path / "direct.jpg"),
    ]
    subprocess.run([*command, str(ppm)], check=True)
    direct = (tmp_path / "direct.jpg").read_bytes()
    try:
        result = optimizers.optimize(BUILTIN, work)
    finally:
        builtin.cjpeg.cache_clear()
    assert result.data == min(direct, work.data, key=len)
    assert result.optimized == (len(direct) < len(work.data))
    assert Image.open(io.BytesIO(result.data)).size == (400, 300)


# ---- the services, through a fake transport -----------------------------------------------------


class FakeTransport:
    """Stands in for `apps.ai.transport.send`: records each call and answers from a queue."""

    def __init__(self):
        self.calls: list[dict] = []
        self.answers: list = []

    def answer(self, status=200, body=b"", **headers) -> FakeTransport:
        names = {name.replace("_", "-").lower(): value for name, value in headers.items()}
        self.answers.append(transport.HttpResponse(status=status, headers=names, body=body))
        return self

    def fail(self, code="timeout", message="The server took too long to answer.") -> FakeTransport:
        self.answers.append(transport.TransportError(code, message))
        return self

    def __call__(self, method, url, *, policy, headers=None, body=b"", max_bytes, timeout, **_):
        self.calls.append(
            {
                "method": method,
                "url": url,
                "policy": policy.name,
                "headers": dict(headers or {}),
                "body": body,
                "max_bytes": max_bytes,
                "timeout": timeout,
            }
        )
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


@pytest.fixture
def remote(monkeypatch) -> FakeTransport:
    fake = FakeTransport()
    monkeypatch.setattr(transport, "send", fake)
    return fake


@pytest.fixture
def keys(settings):
    settings.IMAGE_OPTIMIZERS = ["builtin", "tinypng", "kraken", "custom"]
    settings.TINYPNG_API_KEY = "tiny-key-123"
    settings.KRAKEN_API_KEY = "kraken-key"
    settings.KRAKEN_API_SECRET = "kraken-secret"
    settings.IMAGE_OPTIMIZER_CUSTOM_URL = "http://10.0.0.5:9000/optimize"
    settings.IMAGE_OPTIMIZER_CUSTOM_KEY = "custom-key"
    settings.IMAGE_OPTIMIZER_CUSTOM_NAME = "Our squeezer"


SMALLER = picture("jpg", quality=20)
TINYPNG = optimizers.OPTIMIZERS["tinypng"]
KRAKEN = optimizers.OPTIMIZERS["kraken"]
CUSTOM = optimizers.OPTIMIZERS["custom"]


def test_every_service_call_goes_through_the_operator_policy(keys, remote):
    remote.answer(201, b"{}", location="https://api.tinify.com/output/abc").answer(200, SMALLER)
    remote.answer(200, json.dumps({"success": True, "kraked_url": "https://dl.kraken.io/x.jpg"}).encode())
    remote.answer(200, SMALLER)
    remote.answer(200, SMALLER, content_type="image/jpeg")
    for optimizer in (TINYPNG, KRAKEN, CUSTOM):
        assert optimizers.optimize(optimizer, job("jpg")).optimized
    assert {call["policy"] for call in remote.calls} == {"operator"}
    assert all(0 < call["timeout"] <= 30 for call in remote.calls)


def test_tinypng_shrinks_then_downloads_with_the_key(keys, remote):
    remote.answer(201, b'{"output": {"size": 10}}', location="https://api.tinify.com/output/abc")
    remote.answer(200, SMALLER)
    work = job("jpg")
    result = optimizers.optimize(TINYPNG, work)
    assert result.optimized and result.data == SMALLER
    shrink, download = remote.calls
    auth = "Basic " + base64.b64encode(b"api:tiny-key-123").decode()
    assert (shrink["method"], shrink["url"]) == ("POST", "https://api.tinify.com/shrink")
    assert shrink["headers"] == {"Authorization": auth, "Content-Type": "image/jpeg"}
    assert shrink["body"] == work.data
    assert (download["method"], download["url"]) == ("GET", "https://api.tinify.com/output/abc")
    assert download["headers"] == {"Authorization": auth}


def test_tinypng_keeps_the_metadata_when_asked(keys, remote):
    remote.answer(201, b"{}", location="/output/abc").answer(200, SMALLER)
    optimizers.optimize(TINYPNG, job("jpg", strip_metadata=False))
    download = remote.calls[1]
    assert (download["method"], download["url"]) == ("POST", "https://api.tinify.com/output/abc")
    assert json.loads(download["body"]) == {"preserve": ["copyright", "creation", "location"]}


def test_tinypng_errors_leave_the_file_with_a_note(keys, remote):
    remote.answer(401, b'{"error": "Unauthorized", "message": "Credentials are invalid"}')
    work = job("png")
    result = optimizers.optimize(TINYPNG, work)
    assert result.data == work.data and not result.optimized
    assert result.warnings == (
        "TinyPNG could not optimize the file (the service answered 401: Credentials are invalid); "
        "it is not optimized.",
    )


def test_tinypng_never_sends_the_key_to_another_host(keys, remote):
    remote.answer(201, b"{}", location="https://elsewhere.example/output/abc")
    result = optimizers.optimize(TINYPNG, job("png"))
    assert len(remote.calls) == 1
    assert "no download address" in result.warnings[0]


def test_a_service_timeout_leaves_the_file_with_a_note(keys, remote):
    remote.fail()
    work = job("webp")
    result = optimizers.optimize(TINYPNG, work)
    assert result.data == work.data
    assert "took too long" in result.warnings[0]


def test_a_bigger_answer_is_dropped_quietly(keys, remote):
    work = job("jpg")
    remote.answer(201, b"{}", location="https://api.tinify.com/output/abc").answer(
        200, work.data + b"\0" * 99
    )
    result = optimizers.optimize(TINYPNG, work)
    assert result.data == work.data and result.warnings == () and not result.optimized


def test_an_answer_that_is_not_the_image_is_dropped(keys, remote):
    remote.answer(201, b"{}", location="https://api.tinify.com/output/abc").answer(200, b"<html>oops</html>")
    result = optimizers.optimize(TINYPNG, job("jpg"))
    assert not result.optimized and "different image" in result.warnings[0]


def test_kraken_uploads_with_the_options_as_json_then_downloads(keys, remote):
    remote.answer(200, json.dumps({"success": True, "kraked_url": "https://dl.kraken.io/a/b.jpg"}).encode())
    remote.answer(200, SMALLER)
    work = job("jpg", quality=70)
    assert optimizers.optimize(KRAKEN, work).optimized
    upload, download = remote.calls
    assert (upload["method"], upload["url"]) == ("POST", "https://api.kraken.io/v1/upload")
    form = parse_form(upload["headers"]["Content-Type"], upload["body"])
    assert form["upload"] == ("image.jpg", work.data)
    assert json.loads(form["data"][1]) == {
        "auth": {"api_key": "kraken-key", "api_secret": "kraken-secret"},
        "wait": True,
        "lossy": True,
        "quality": 70,
    }
    assert (download["method"], download["url"], download["headers"]) == (
        "GET",
        "https://dl.kraken.io/a/b.jpg",
        {},
    )


def test_kraken_keeps_a_png_lossless_and_its_metadata_when_asked(keys, remote):
    remote.answer(200, json.dumps({"success": True, "kraked_url": "https://dl.kraken.io/a.png"}).encode())
    remote.answer(200, b"")
    optimizers.optimize(KRAKEN, job("png", strip_metadata=False))
    options = json.loads(
        parse_form(remote.calls[0]["headers"]["Content-Type"], remote.calls[0]["body"])["data"][1]
    )
    assert "lossy" not in options
    assert options["preserve_meta"] == ["profile", "date", "copyright", "geotag", "orientation"]


@pytest.mark.parametrize(
    ("answer", "warned"),
    [
        ({"success": False, "message": "Unknown API Key"}, "answered 200: Unknown API Key"),
        ({"success": True, "kraked_url": "http://dl.kraken.io/a.png"}, "no download address"),
        ({"success": True, "kraked_url": "https://169.254.169.254/latest/meta-data/"}, "no download address"),
        ({"success": True, "kraked_url": "https://10.0.0.7:8443/a.png"}, "no download address"),
        ({"success": True, "kraked_url": "https://dl.kraken.io.example.com/a.png"}, "no download address"),
        ({"success": True, "kraked_url": "https://evilkraken.io/a.png"}, "no download address"),
        ({"success": True, "kraked_url": "https://dl.kraken.io:8443/a.png"}, "no download address"),
        ({"success": True, "kraked_url": "https://user@dl.kraken.io/a.png"}, "no download address"),
    ],
)
def test_kraken_failures_leave_the_file_with_a_note(keys, remote, answer, warned):
    remote.answer(200, json.dumps(answer).encode())
    result = optimizers.optimize(KRAKEN, job("png"))
    assert not result.optimized and warned in result.warnings[0] and len(remote.calls) == 1


def test_the_custom_optimizer_follows_the_contract(keys, remote):
    work = job("jpg", quality=77, srgb=False)
    remote.answer(
        200,
        SMALLER,
        content_type="image/jpeg",
        x_format="jpeg",
        x_width=str(WIDTH),
        x_height=str(HEIGHT),
        x_output_size=str(len(SMALLER)),
    )
    result = optimizers.optimize(CUSTOM, work)
    assert result.optimized and result.data == SMALLER
    (call,) = remote.calls
    parts = urlsplit(call["url"])
    assert f"{parts.scheme}://{parts.netloc}{parts.path}" == "http://10.0.0.5:9000/optimize"
    assert parse_qs(parts.query) == {"format": ["keep"], "metadata": ["icc"], "quality": ["77"]}
    assert call["headers"] == {"Content-Type": "image/jpeg", "Authorization": "Bearer custom-key"}
    assert call["body"] == work.data


def test_the_custom_optimizer_without_a_key_sends_no_authorization(keys, remote, settings):
    settings.IMAGE_OPTIMIZER_CUSTOM_KEY = ""
    remote.answer(200, b"")
    optimizers.optimize(CUSTOM, job("png"))
    assert remote.calls[0]["headers"] == {"Content-Type": "image/png"}
    assert parse_qs(urlsplit(remote.calls[0]["url"]).query) == {"format": ["keep"], "metadata": ["none"]}


@pytest.mark.parametrize(
    ("status", "headers", "warned"),
    [
        (200, {"x_width": "999"}, "X-Width header doesn't match"),
        (200, {"x_format": "webp"}, "X-Format header doesn't match"),
        (200, {"x_output_size": "1"}, "X-Output-Size header doesn't match"),
        (200, {"content_type": "image/png"}, "another content type"),
        (422, {}, "answered 422: The format is not supported"),
    ],
)
def test_the_custom_optimizer_is_checked_against_the_contract(keys, remote, status, headers, warned):
    body = SMALLER if status == 200 else b'{"error": "bad_format", "message": "The format is not supported"}'
    remote.answer(status, body, **headers)
    result = optimizers.optimize(CUSTOM, job("jpg"))
    assert not result.optimized
    assert result.warnings[0].startswith("Our squeezer could not optimize the file (")
    assert warned in result.warnings[0]


def test_the_services_are_offered_only_once_they_are_set_up(settings):
    settings.IMAGE_OPTIMIZERS = ["tinypng", "kraken", "custom"]
    assert optimizers.available() == []
    settings.TINYPNG_API_KEY = "k"
    settings.KRAKEN_API_KEY = "k"  # no secret yet
    settings.IMAGE_OPTIMIZER_CUSTOM_URL = "ftp://optimizer.example/"
    assert [o.id for o in optimizers.available()] == ["tinypng"]
    settings.KRAKEN_API_SECRET = "s"
    settings.IMAGE_OPTIMIZER_CUSTOM_URL = "https://optimizer.example/v1?x=1"
    assert [o.id for o in optimizers.available()] == ["tinypng", "kraken"]
    settings.IMAGE_OPTIMIZER_CUSTOM_URL = "https://optimizer.example/v1"
    assert [o.id for o in optimizers.available()] == ["tinypng", "kraken", "custom"]


# ---- the fail-safe around every optimizer and the registry --------------------------------------


class Exploding:
    id = "builtin"
    name = "Exploding"
    formats = ("png",)
    sends_offsite = False

    def __init__(self):
        self.calls = 0

    def ready(self):
        return True

    def shrink(self, job, deadline):
        self.calls += 1
        raise RuntimeError("boom")


def test_an_unexpected_error_is_caught_and_noted():
    exploding = Exploding()
    work = job("png")
    result = optimizers.optimize(exploding, work)
    assert result.data == work.data
    assert result.warnings == ("Exploding could not optimize the file; it is not optimized.",)


def test_a_file_over_the_size_limit_is_not_sent(settings):
    settings.IMAGE_OPTIMIZER_MAX_BYTES = 10
    exploding = Exploding()
    result = optimizers.optimize(exploding, job("png"))
    assert exploding.calls == 0 and "larger than 10 bytes" in result.warnings[0]


def test_optimize_true_without_an_optimizer_says_so(no_tools):
    work = job("png")
    result = optimizers.optimize(optimizers.choose(True), work)
    assert result.data == work.data and result.optimizer == ""
    assert result.warnings == ("No image optimizer is set up on this server; the file is not optimized.",)


def test_choose(keys, tools, settings):
    assert optimizers.choose(False) is None and optimizers.choose(None) is None
    assert optimizers.choose("false") is None and optimizers.choose("none") is None
    assert optimizers.choose(True).id == "builtin" and optimizers.choose("default").id == "builtin"
    assert optimizers.choose(" TinyPNG ").id == "tinypng"
    settings.IMAGE_OPTIMIZER_DEFAULT = "kraken"
    assert optimizers.choose(True).id == "kraken"
    settings.IMAGE_OPTIMIZERS = ["builtin"]
    assert optimizers.choose(True) is UNAVAILABLE  # the default is not offered: no other one in its place
    with pytest.raises(InvalidExport) as raised:
        optimizers.choose("kraken")
    assert raised.value.detail.code == "optimizer_unavailable"
    assert str(raised.value.detail) == "This server has no image optimizer 'kraken' (it offers: builtin)."


def test_the_admin_order_is_kept_and_unknown_or_repeated_names_are_skipped(keys, tools, settings):
    settings.IMAGE_OPTIMIZERS = ["custom", "nope", "Builtin", "custom"]
    assert optimizers.listed() == ["custom", "builtin"]
    assert [o.id for o in optimizers.available()] == ["custom", "builtin"]
    settings.IMAGE_OPTIMIZERS = []
    assert optimizers.available() == [] and optimizers.choose(True) is UNAVAILABLE


def test_optimizer_errors_carry_a_message():
    assert OptimizerError("x").message == "x"


# ---- `manage.py check` --------------------------------------------------------------------------


def ids(issues) -> list[str]:
    return [issue.id for issue in issues]


def test_a_working_setup_has_no_warnings(keys, tools):
    assert checks.check_image_optimizers(None) == []


def test_bad_settings_are_reported(no_tools, settings):
    settings.IMAGE_OPTIMIZERS = ["builtin", "tinypng", "kraken", "custom", "squoosh"]
    settings.IMAGE_OPTIMIZER_DEFAULT = "nope"
    settings.IMAGE_OPTIMIZER_CUSTOM_URL = "ftp://x.example/"
    issues = checks.check_image_optimizers(None)
    assert ids(issues) == [
        "exports.W001",
        "exports.W002",
        "exports.W003",
        "exports.W003",
        "exports.W003",
        "exports.W004",
    ]
    assert "can't find mozjpeg (cjpeg) and oxipng; it is left out." in issues[1].msg
    assert issues[4].msg.startswith("IMAGE_OPTIMIZER_CUSTOM_URL: The server address must start with")


def test_one_missing_program_is_reported_but_the_optimizer_stays(tools):
    tools.remove("oxipng")
    (issue,) = checks.check_image_optimizers(None)
    assert issue.id == "exports.W002" and issue.msg.endswith("those files are left as they are.")


def test_the_custom_key_may_not_hold_a_line_break(keys, tools, settings):
    settings.IMAGE_OPTIMIZER_CUSTOM_KEY = "a\nb"
    assert not CUSTOM.ready()
    assert ids(checks.check_image_optimizers(None)) == ["exports.W003"]
