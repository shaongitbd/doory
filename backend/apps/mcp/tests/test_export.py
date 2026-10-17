"""`export_design`: the tool around `apps.exports.services.export_image` (the browser is stubbed out)."""

from __future__ import annotations

import base64
import json
import time

import pytest
from mcp.server.mcpserver.exceptions import ToolError
from mcp_types import ImageContent, TextContent
from rest_framework.test import APIClient

from apps.designs.tests.helpers import make_design, make_doc
from apps.exports import delivery
from apps.exports.exceptions import ExportBusy, InvalidExport
from apps.exports.services import ImageResult
from apps.exports.throttling import ExportRateThrottle
from apps.mcp.tools import export

from .test_http import call

pytestmark = pytest.mark.django_db

IMAGE = b"\x89PNG\r\n\x1a\n" + b"pixels" * 10


@pytest.fixture
def renders(monkeypatch) -> list[dict]:
    calls: list[dict] = []

    def fake_export_image(design, **options):
        calls.append({"design": design.pk, **options})
        page = options["page"]
        index = page if isinstance(page, int) else (0 if page is None else 1)
        return ImageResult(
            data=IMAGE,
            format=options["format"],
            mime={"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}[options["format"]],
            width=400,
            height=200,
            page_id=design.document["pages"][index]["id"],
            page_index=index,
        )

    monkeypatch.setattr(export, "export_image", fake_export_image)
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
        "editor_url": None,
    }
    assert renders == [
        {
            "design": design.pk,
            "page": None,
            "format": "png",
            "quality": 90,
            "scale": 1.0,
            "transparent": False,
        }
    ]


def test_pages_are_numbered_from_one_or_named_by_id(as_caller, design, renders):
    second = design.document["pages"][1]["id"]
    assert info_of(export.export_design(str(design.pk), page=2))["page"] == 2
    export.export_design(str(design.pk), page=second, format="webp", quality=50, scale=0.5, transparent=True)
    assert [r["page"] for r in renders] == [1, second]
    assert renders[1] | {"design": None} == {
        "design": None,
        "page": second,
        "format": "webp",
        "quality": 50,
        "scale": 0.5,
        "transparent": True,
    }
    with pytest.raises(ToolError, match="numbered from 1"):
        export.export_design(str(design.pk), page=0)


def test_warnings_are_passed_on(as_caller, design, monkeypatch):
    monkeypatch.setattr(
        export,
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

    monkeypatch.setattr(export, "export_image", refuse)
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
    from django.core.files.storage import default_storage

    now = int(time.time())
    old = default_storage.save(f"exports/{now - 700:010d}-{'a' * 32}.png", ContentFile(b"x"))
    fresh = default_storage.save(f"exports/{now - 10:010d}-{'b' * 32}.png", ContentFile(b"x"))
    stray = default_storage.save("exports/readme.txt", ContentFile(b"x"))
    try:
        assert delivery.purge_expired(now) == 1
        assert not default_storage.exists(old)
        assert default_storage.exists(fresh) and default_storage.exists(stray)
    finally:
        for name in (fresh, stray):
            default_storage.delete(name)
