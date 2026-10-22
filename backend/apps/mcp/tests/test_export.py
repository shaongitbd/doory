"""`export_design`: the tool around `apps.exports.services.export_images` (the browser is stubbed out)."""

from __future__ import annotations

import base64
import io
import json
import time
import zipfile

import pytest
from mcp.server.mcpserver.exceptions import ToolError
from mcp_types import ImageContent, TextContent
from rest_framework.test import APIClient

from apps.designs.tests.helpers import make_design, make_doc
from apps.exports import delivery, optimizers, services
from apps.exports.exceptions import ExportBusy, InvalidExport
from apps.exports.renderer import VideoResult as RenderedVideo
from apps.exports.services import IMAGE_FORMATS, ImageResult
from apps.exports.tests.helpers import FakeOptimizer
from apps.exports.throttling import ExportRateThrottle, OffsiteOptimizeRateThrottle
from apps.mcp.tools import export

from .test_http import call

pytestmark = pytest.mark.django_db

IMAGE = b"\x89PNG\r\n\x1a\n" + b"pixels" * 10
# What the tool passes on besides the page, format, quality, scale and transparency.
DEFAULTS = {
    "size": None,
    "max_bytes": None,
    "png_colors": None,
    "strip_metadata": True,
    "srgb": True,
    "progressive": False,
    "optimize": False,
}


@pytest.fixture(autouse=True)
def _image_export_on(settings):
    """The options are checked (server switch included) before `export_image`, which is faked below."""
    settings.SERVER_IMAGE_EXPORT_ENABLED = True


@pytest.fixture
def renders(monkeypatch) -> list[dict]:
    calls: list[dict] = []

    def fake_export_image(design, *, deadline, **options):
        calls.append({"design": design.pk, **options})
        index = options["page"]
        fmt = "webp" if options["format"] == "auto" else options["format"]
        return ImageResult(
            data=IMAGE,
            format=fmt,
            mime=IMAGE_FORMATS[fmt],
            width=400,
            height=200,
            page_id=design.document["pages"][index]["id"],
            page_index=index,
            page_count=len(design.document["pages"]),
            options_used={"format": fmt, "quality": 90},
        )

    monkeypatch.setattr(services, "export_image", fake_export_image)
    return calls


@pytest.fixture
def design(user):
    return make_design(user, title="Poster", document=make_doc(pages=2))


def info_of(content) -> dict:
    texts = [block for block in content if isinstance(block, TextContent)]
    assert len(texts) == 1
    return json.loads(texts[0].text)


def test_the_image_comes_back_inline_with_what_it_shows(as_caller, design, renders):
    content = export.export_design(str(design.pk))
    image = content[0]
    assert isinstance(image, ImageContent) and image.mime_type == "image/png"
    assert base64.b64decode(image.data) == IMAGE
    info = info_of(content)
    assert info | {"editor_url": None} == {
        "design_id": str(design.pk),
        "page": 1,
        "page_id": design.document["pages"][0]["id"],
        "format": "png",
        "width": 400,
        "height": 200,
        "bytes": len(IMAGE),
        "filename": "Poster - page 1.png",
        "options": {"format": "png", "quality": 90},
        "editor_url": None,
    }
    assert renders == [
        {
            "design": design.pk,
            "page": 0,
            "format": "png",
            "quality": 90,
            "scale": 1.0,
            "transparent": False,
            **DEFAULTS,
        }
    ]


def test_pages_are_numbered_from_one_or_named_by_id(as_caller, design, renders):
    second = design.document["pages"][1]["id"]
    assert info_of(export.export_design(str(design.pk), page=2))["page"] == 2
    export.export_design(str(design.pk), page=second, format="webp", quality=50, scale=0.5, transparent=True)
    assert [r["page"] for r in renders] == [1, 1]
    assert renders[1] | {"design": None} == {
        "design": None,
        "page": 1,
        "format": "webp",
        "quality": 50,
        "scale": 0.5,
        "transparent": True,
        **DEFAULTS,
    }
    with pytest.raises(ToolError, match="numbered from 1"):
        export.export_design(str(design.pk), page=0)


def test_the_new_options_are_passed_on(as_caller, design, renders, settings, monkeypatch):
    settings.IMAGE_OPTIMIZERS = ["builtin", "kraken"]
    monkeypatch.setitem(optimizers.OPTIMIZERS, "kraken", FakeOptimizer("kraken"))
    export.export_design(
        str(design.pk),
        format="auto",
        quality="balanced",
        size="1080w",
        max_bytes=100_000,
        png_colors=256,
        strip_metadata=False,
        srgb=False,
        progressive=True,
        optimize="kraken",
    )
    assert renders[-1] | {"design": None} == {
        "design": None,
        "page": 0,
        "format": "auto",
        "quality": "balanced",
        "scale": 1.0,
        "transparent": False,
        "size": "1080w",
        "max_bytes": 100_000,
        "png_colors": 256,
        "strip_metadata": False,
        "srgb": False,
        "progressive": True,
        "optimize": "kraken",
    }


def test_the_optimizer_and_the_size_before_are_reported(as_caller, design, monkeypatch):
    def fake_export_image(design, **options):
        return ImageResult(
            data=IMAGE,
            format="png",
            mime="image/png",
            width=400,
            height=200,
            page_id="p",
            page_index=0,
            options_used={
                "format": "png",
                "optimizer": "builtin",
                "optimized": True,
                "bytes_before_optimizing": 999,
            },
        )

    monkeypatch.setattr(services, "export_image", fake_export_image)
    info = info_of(export.export_design(str(design.pk), optimize=True))
    assert (info["optimizer"], info["bytes_before_optimizing"], info["bytes"]) == ("builtin", 999, len(IMAGE))


def test_avif_is_always_a_link(as_caller, design, renders):
    content = export.export_design(str(design.pk), format="avif")
    assert [type(block) for block in content] == [TextContent]
    info = info_of(content)
    assert info["format"] == "avif" and "always sent as a link" in info["note"]
    response = APIClient().get(info["url"].removeprefix("http://localhost:5173"))
    assert response["Content-Type"] == "image/avif"
    assert b"".join(response.streaming_content) == IMAGE


def test_several_pages_come_back_as_a_zip_link(as_caller, user, renders):
    design = make_design(user, title="Deck", document=make_doc(pages=3))
    content = export.export_design(str(design.pk), pages=[3, 1], format="jpg", file_names="detailed")
    assert [type(block) for block in content] == [TextContent]
    info = info_of(content)
    assert (info["format"], info["filename"]) == ("zip", "Deck.zip")
    assert [(p["page"], p["format"], p["filename"]) for p in info["pages"]] == [
        (3, "jpg", "deck_p03.jpg"),
        (1, "jpg", "deck_p01.jpg"),
    ]
    assert [r["page"] for r in renders] == [2, 0]
    response = APIClient().get(info["url"].removeprefix("http://localhost:5173"))
    assert response["Content-Type"] == "application/zip"
    assert response["Content-Disposition"].startswith("attachment;")
    data = b"".join(response.streaming_content)
    assert len(data) == info["bytes"]
    assert zipfile.ZipFile(io.BytesIO(data)).namelist() == ["deck_p03.jpg", "deck_p01.jpg"]


def test_each_extra_page_is_one_more_call(as_caller, user, renders, settings):
    settings.MCP_CALLS_PER_MINUTE = 3
    design = make_design(user, document=make_doc(pages=3))
    export.export_design(str(design.pk), pages="all")
    assert len(renders) == 3
    with pytest.raises(ToolError, match="Too many calls"):
        export.export_design(str(design.pk), pages="all")
    assert len(renders) == 3


def test_each_extra_page_uses_the_export_rate(as_caller, user, renders, monkeypatch):
    monkeypatch.setattr(ExportRateThrottle, "THROTTLE_RATES", {"export": "2/min"})
    design = make_design(user, document=make_doc(pages=3))
    with pytest.raises(ToolError, match="Too many requests"):
        export.export_design(str(design.pk), pages="all")
    assert renders == []


def test_pages_sent_to_an_offsite_optimizer_use_its_rate(as_caller, user, renders, monkeypatch, settings):
    settings.IMAGE_OPTIMIZERS = ["custom"]
    custom = FakeOptimizer("custom", "Ours")
    custom.sends_offsite = True
    monkeypatch.setitem(optimizers.OPTIMIZERS, "custom", custom)
    monkeypatch.setattr(OffsiteOptimizeRateThrottle, "THROTTLE_RATES", {"optimize_offsite": "2/min"})
    design = make_design(user, document=make_doc(pages=3))
    with pytest.raises(ToolError, match="Too many requests"):
        export.export_design(str(design.pk), pages="all", optimize="custom")
    assert renders == []


def test_warnings_are_passed_on(as_caller, design, monkeypatch):
    monkeypatch.setattr(
        services,
        "export_image",
        lambda d, **o: ImageResult(
            IMAGE, "png", "image/png", 1, 1, "p", 0, placeholders=1, warnings=("grey",)
        ),
    )
    assert info_of(export.export_design(str(design.pk)))["warnings"] == ["grey"]


def test_a_link_is_returned_on_request_and_serves_the_image_until_it_expires(
    as_caller, design, renders, monkeypatch
):
    content = export.export_design(str(design.pk), delivery="url")
    assert [type(block) for block in content] == [TextContent]
    info = info_of(content)
    assert info["expires_in_seconds"] == 600 and "note" not in info
    assert info["url"].startswith("http://localhost:5173/api/v1/exports/image/")
    path = info["url"].removeprefix("http://localhost:5173")

    anonymous = APIClient()
    response = anonymous.get(path)
    assert response.status_code == 200
    assert b"".join(response.streaming_content) == IMAGE
    assert response["Content-Type"] == "image/png"
    assert response["Cache-Control"] == "no-store" and response["X-Content-Type-Options"] == "nosniff"

    later = time.time() + 601
    monkeypatch.setattr(time, "time", lambda: later)
    assert anonymous.get(path).status_code == 404


def test_stored_images_live_outside_public_media_storage(as_caller, design, renders, settings, rf):
    from pathlib import Path

    from django.core import signing
    from django.core.files.storage import default_storage
    from django.http import Http404
    from django.views.static import serve

    url = info_of(export.export_design(str(design.pk), delivery="url"))["url"]
    token = url.rstrip("/").rsplit("/", 1)[-1]
    name = signing.loads(token, salt=delivery.SALT)["name"]
    storage = delivery.export_storage()
    assert storage.exists(name)
    assert not Path(storage.path(name)).resolve().is_relative_to(Path(settings.MEDIA_ROOT).resolve())
    assert not default_storage.exists(name) and not default_storage.exists(f"exports/{name}")
    with pytest.raises(ValueError, match="not accessible via a URL"):
        storage.url(name)
    for candidate in (name, f"exports/{name}"):
        assert APIClient().get(f"{settings.MEDIA_URL}{candidate}").status_code == 404
        with pytest.raises(Http404):
            serve(rf.get(f"{settings.MEDIA_URL}{candidate}"), candidate, document_root=settings.MEDIA_ROOT)


def test_images_too_large_to_send_inline_become_a_link(as_caller, design, renders, settings):
    settings.MCP_EXPORT_INLINE_MAX_BYTES = len(IMAGE) - 1
    info = info_of(export.export_design(str(design.pk)))
    assert info["url"] and "smaller scale" in info["note"]
    settings.MCP_EXPORT_INLINE_MAX_BYTES = len(IMAGE)
    assert isinstance(export.export_design(str(design.pk))[0], ImageContent)


def test_forged_and_tampered_links_are_not_found(as_caller, design, renders):
    path = info_of(export.export_design(str(design.pk), delivery="url"))["url"].split("5173", 1)[1]
    anonymous = APIClient()
    assert anonymous.get(path[:-3] + "abc/").status_code == 404
    assert anonymous.get("/api/v1/exports/image/not-a-token/").status_code == 404
    from django.core import signing

    other_name = signing.dumps({"name": "fonts/user/x.ttf"}, salt=delivery.SALT, compress=True)
    assert anonymous.get(f"/api/v1/exports/image/{other_name}/").status_code == 404


def test_other_peoples_and_trashed_designs_are_not_found(as_caller, other, renders):
    theirs = make_design(other)
    with pytest.raises(ToolError, match="Not found"):
        export.export_design(str(theirs.pk))
    with pytest.raises(ToolError, match="Not found"):
        export.export_design("not-a-uuid")
    assert renders == []


def test_reading_designs_is_the_scope_it_needs(as_caller, design, renders):
    as_caller.token.scopes = ["designs:write"]
    with pytest.raises(ToolError, match="`designs:read` scope"):
        export.export_design(str(design.pk))
    as_caller.token.scopes = ["designs:read"]
    export.export_design(str(design.pk))


@pytest.mark.parametrize(
    ("error", "message"),
    [
        (InvalidExport("too_large", "8000 x 8000 px is more than this server exports."), "8000 x 8000"),
        (ExportBusy(), "busy"),
    ],
)
def test_export_errors_reach_the_agent_as_messages(as_caller, design, monkeypatch, error, message):
    def refuse(design, **options):
        raise error

    monkeypatch.setattr(services, "export_image", refuse)
    with pytest.raises(ToolError, match=message):
        export.export_design(str(design.pk))


def test_renders_share_the_export_throttle(as_caller, design, renders, monkeypatch):
    monkeypatch.setattr(ExportRateThrottle, "THROTTLE_RATES", {"export": "1/min"})
    export.export_design(str(design.pk))
    with pytest.raises(ToolError, match="Too many requests"):
        export.export_design(str(design.pk))


@pytest.mark.django_db(transaction=True)
def test_the_image_is_an_image_block_on_the_wire(issued, user, renders):
    design = make_design(user, document=make_doc())
    result = call(issued.plaintext, "export_design", {"design_id": str(design.pk), "format": "jpg"})
    assert result["isError"] is False
    image, text = result["content"]
    assert image["type"] == "image" and image["mimeType"] == "image/jpeg"
    assert base64.b64decode(image["data"]) == IMAGE
    assert json.loads(text["text"])["format"] == "jpg"
    assert "structuredContent" not in result or result["structuredContent"] is None


def test_expired_files_are_purged_by_name(settings):
    from django.core.files.base import ContentFile

    storage = delivery.export_storage()
    now = int(time.time())
    old = storage.save(f"{now - 700:010d}-{'a' * 32}.png", ContentFile(b"x"))
    fresh = storage.save(f"{now - 10:010d}-{'b' * 32}.png", ContentFile(b"x"))
    stray = storage.save("readme.txt", ContentFile(b"x"))
    try:
        assert delivery.purge_expired(now) == 1
        assert not storage.exists(old)
        assert storage.exists(fresh) and storage.exists(stray)
    finally:
        for name in (fresh, stray):
            storage.delete(name)


# ---- SVG and PDF -----------------------------------------------------------------------------------


@pytest.fixture
def documents(monkeypatch) -> list[dict]:
    calls: list[dict] = []

    def fake_export_document(design, **options):
        calls.append(options)
        fmt = "svg" if options["format"] == "svg" else "pdf"
        mime = services.DOCUMENT_FORMATS[options["format"]]
        images = tuple(
            ImageResult(
                b"<svg/>" if fmt == "svg" else b"",
                fmt,
                mime,
                400,
                200,
                page["id"],
                index,
                options_used={
                    "format": options["format"],
                    **({"dpi": 300} if options["format"] == "pdf" else {}),
                },
            )
            for index, page in enumerate(design.document["pages"])
        )
        name = f"{design.title}.{fmt}"
        if fmt == "svg":
            return services.ImageBundle(b"<svg/>", "svg", mime, name, images[:1], (name,))
        options_used = {
            "format": options["format"],
            "bleed_mm": options["bleed_mm"],
            "crop_marks": False,
            "cmyk": False,
        }
        return services.ImageBundle(b"%PDF-1.7 fake", "pdf", mime, name, images, (name,), options_used)

    monkeypatch.setattr(services, "export_document", fake_export_document)
    return calls


def test_a_pdf_is_a_link_with_its_pages(as_caller, design, documents, renders):
    content = export.export_design(str(design.pk), pages="all", format="pdf", bleed_mm=3)
    assert [type(block) for block in content] == [TextContent]
    info = info_of(content)
    assert (info["format"], info["filename"], info["bytes"]) == ("pdf", "Poster.pdf", len(b"%PDF-1.7 fake"))
    assert [(p["page"], p["width"], p["dpi"]) for p in info["pages"]] == [(1, 400, 300), (2, 400, 300)]
    assert info["options"]["bleed_mm"] == 3 and "always sent as a link" in info["note"]
    assert documents[0]["bleed_mm"] == 3 and renders == []
    response = APIClient().get(info["url"].removeprefix("http://localhost:5173"))
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"].startswith("inline;")
    assert b"".join(response.streaming_content) == b"%PDF-1.7 fake"


def test_an_svg_is_a_sandboxed_download(as_caller, design, documents):
    info = info_of(export.export_design(str(design.pk), format="svg"))
    assert (info["format"], info["page"], info["filename"]) == ("svg", 1, "Poster.svg")
    response = APIClient().get(info["url"].removeprefix("http://localhost:5173"))
    assert response["Content-Type"] == "image/svg+xml"
    assert response["Content-Disposition"].startswith("attachment;")
    assert response["Content-Security-Policy"].startswith("sandbox;")


def test_the_print_pdf_takes_crop_marks_and_refuses_cmyk(as_caller, design, documents):
    export.export_design(str(design.pk), format="pdf-print", crop_marks=True)
    assert documents[0]["format"] == "pdf-print" and documents[0]["crop_marks"] is True
    with pytest.raises(ToolError, match="no CMYK conversion"):
        export.export_design(str(design.pk), format="pdf-print", cmyk=True)
    assert len(documents) == 1


# ---- Video ---------------------------------------------------------------------------------------


@pytest.fixture
def videos(monkeypatch, settings) -> list[dict]:
    """The render page's video, faked below `export_video`: records the payload, answers with a small file."""
    settings.SERVER_IMAGE_EXPORT_ENABLED = True
    settings.SERVER_VIDEO_EXPORT_ENABLED = True
    settings.EXPORT_RENDER_PAGE_URL = "http://frontend.test:8080/render.html"
    calls: list[dict] = []

    def fake_render_video(payload, **kwargs):
        calls.append(payload)
        pages = payload["document"]["pages"]
        data = b"\x00\x00\x00\x18ftypisom-video"
        return RenderedVideo(
            file=io.BytesIO(data),
            size=len(data),
            mime=services.VIDEO_FORMATS[payload["format"]],
            width=480,
            height=240,
            fps=payload["fps"],
            frames=100,
            duration_ms=10_000,
            video="GIF" if payload["format"] == "gif" else "H.264",
            audio=None if payload["format"] == "gif" else "Opus",
            warnings=() if payload["format"] == "gif" else ("audio-fallback",),
            page_ids=tuple(pages[index]["id"] for index in payload["pages"]),
            page_indexes=tuple(payload["pages"]),
        )

    monkeypatch.setattr(services, "render_video", fake_render_video)
    return calls


def test_a_video_of_all_pages_is_a_link_with_what_it_holds(as_caller, design, videos, renders):
    info = info_of(export.export_design(str(design.pk), format="mp4", delivery="inline"))
    assert videos[0]["pages"] == [0, 1] and renders == []
    assert (info["format"], info["filename"], info["width"], info["height"]) == (
        "mp4",
        "Poster.mp4",
        480,
        240,
    )
    assert (info["fps"], info["duration_ms"], info["frames"], info["video"], info["audio"]) == (
        30,
        10_000,
        100,
        "H.264",
        "Opus",
    )
    assert info["pages"] == [1, 2] and info["options"]["resolution"] == "design"
    assert info["warnings"][0].startswith("The sound is Opus") and "always sent as a link" in info["note"]
    assert info["bytes"] == len(b"\x00\x00\x00\x18ftypisom-video")
    response = APIClient().get(info["url"].removeprefix("http://localhost:5173"))
    assert response["Content-Type"] == "video/mp4"
    assert b"".join(response.streaming_content) == b"\x00\x00\x00\x18ftypisom-video"


def test_a_gif_takes_its_options(as_caller, design, videos):
    info = info_of(
        export.export_design(
            str(design.pk), page=2, format="gif", resolution=240, fps=10, loop=2, dither=False, page_seconds=3
        )
    )
    payload = videos[0]
    assert (payload["pages"], payload["resolution"], payload["fps"]) == ([1], 240, 10)
    assert (payload["loops"], payload["dither"], payload["pageSeconds"]) == (2, False, 3)
    assert info["format"] == "gif" and info["options"]["loop"] == 2 and "warnings" not in info


def test_each_started_10_seconds_after_the_first_is_one_more_call(as_caller, design, videos, settings):
    settings.MCP_CALLS_PER_MINUTE = 3
    export.export_design(str(design.pk), format="webm", page_seconds=10)  # 20 s: one more call
    with pytest.raises(ToolError, match="Too many calls"):
        export.export_design(str(design.pk), format="webm", page_seconds=10)
    assert len(videos) == 1


def test_video_export_is_off_unless_the_server_turns_it_on(as_caller, design, videos, settings):
    settings.SERVER_VIDEO_EXPORT_ENABLED = False
    with pytest.raises(ToolError, match="video export is not enabled"):
        export.export_design(str(design.pk), format="mp4")
    assert videos == []
