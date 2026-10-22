"""`POST /api/v1/designs/{id}/export/image/` (the browser is stubbed out; see test_chromium for the real one)."""

import io
import zipfile

import pytest
from django.utils import timezone

from apps.designs.tests.helpers import make_design, make_doc
from apps.exports import optimizers, services, views
from apps.exports.exceptions import ExportBusy, InvalidExport
from apps.exports.services import IMAGE_FORMATS, ImageResult
from apps.exports.throttling import ExportRateThrottle, OffsiteOptimizeRateThrottle

from .helpers import FakeOptimizer

IMAGE = b"\x89PNG\r\n\x1a\nfake"
# What the view passes on when the body only names the page and format.
DEFAULTS = {
    "quality": 90,
    "scale": 1.0,
    "size": None,
    "transparent": False,
    "max_bytes": None,
    "png_colors": None,
    "strip_metadata": True,
    "srgb": True,
    "progressive": False,
    "optimize": False,
}


def url(design) -> str:
    return f"/api/v1/designs/{design.pk}/export/image/"


@pytest.fixture(autouse=True)
def _image_export_on(settings):
    """The options are checked (server switch included) before `export_image`, which is faked below."""
    settings.SERVER_IMAGE_EXPORT_ENABLED = True


@pytest.fixture
def renders(monkeypatch) -> list[dict]:
    calls: list[dict] = []

    def fake_export_image(design, *, deadline, **options):
        calls.append(options)
        index = options["page"] if isinstance(options["page"], int) else 0
        ext = {"jpeg": "jpg", "auto": "webp"}.get(options["format"], options["format"])
        return ImageResult(
            data=IMAGE,
            format=ext,
            mime=IMAGE_FORMATS[ext],
            width=10,
            height=10,
            page_id="p",
            page_index=index,
            placeholders=1,
            page_width=1080,
            page_height=1920,
            page_count=design.page_count,
            preset=design.preset,
        )

    monkeypatch.setattr(services, "export_image", fake_export_image)
    return calls


@pytest.fixture
def design(user):
    return make_design(user, title="Summer sale", document=make_doc())


def test_the_image_is_the_response(client, design, renders):
    response = client.post(url(design), {}, format="json")
    assert response.status_code == 200
    assert response.content == IMAGE
    assert response["Content-Type"] == "image/png"
    assert response["Content-Disposition"] == 'attachment; filename="Summer sale.png"'
    assert response["Cache-Control"] == "no-store" and response["X-Content-Type-Options"] == "nosniff"
    assert response["X-Doory-Placeholders"] == "1"
    assert renders == [{"page": 0, "format": "png", **DEFAULTS}]


def test_options_are_passed_on_and_pages_count_from_one(client, user, renders):
    design = make_design(user, title="Deck", document=make_doc(pages=3))
    body = {"page": 2, "format": "webp", "quality": 40, "scale": 2, "transparent": True}
    response = client.post(url(design), body, format="json")
    assert response.status_code == 200
    assert response["Content-Disposition"] == 'attachment; filename="Deck - page 2.webp"'
    assert renders[-1] == {
        "page": 1,
        "format": "webp",
        **DEFAULTS,
        "quality": 40,
        "scale": 2.0,
        "transparent": True,
    }
    client.post(url(design), {"page": design.document["pages"][2]["id"], "format": "jpeg"}, format="json")
    assert renders[-1]["page"] == 2


@pytest.mark.django_db
def test_structured_names_on_request_and_by_default(client, user, renders, settings, monkeypatch):
    design = make_design(user, title="Summer Sale", document=make_doc(pages=3))
    design.preset = "instagram-story"
    design.save()
    body = {"page": 2, "filename_style": "structured"}
    response = client.post(url(design), body, format="json")
    expected = "summer-sale_instagram_instagram-story_1080x1920_p02"
    assert response["Content-Disposition"] == f'attachment; filename="{expected}.png"'
    monkeypatch.setattr(views, "unix_now", lambda: 1792259000)
    settings.EXPORT_FILENAME_STYLE = "structured"
    settings.EXPORT_FILENAME_TIMESTAMP = True
    response = client.post(url(design), {"page": 2}, format="json")
    assert response["Content-Disposition"] == f'attachment; filename="{expected}_1792259000.png"'
    response = client.post(url(design), {"page": 2, "filename_timestamp": False}, format="json")
    assert response["Content-Disposition"] == f'attachment; filename="{expected}.png"'
    response = client.post(url(design), {"page": 2, "filename_style": "simple"}, format="json")
    assert response["Content-Disposition"] == 'attachment; filename="Summer Sale - page 2.png"'


def test_an_image_comes_back_whatever_the_accept_header(client, design, renders):
    response = client.post(url(design), {}, format="json", HTTP_ACCEPT="image/png")
    assert response.status_code == 200


@pytest.mark.parametrize(
    "body",
    [
        {"page": 0},
        {"page": True},
        {"page": ""},
        {"format": "heic"},
        {"filename_style": "fancy"},
        {"quality": 0},
        {"scale": 5},
        {"scale": "NaN"},
        {"format": "tiff"},
        {"quality": "great"},
        {"quality": True},
        {"size": "big"},
        {"size": "2y"},
        {"max_bytes": 0},
        {"png_colors": 1},
        {"png_colors": 257},
        {"png_colors": "half"},
        {"pages": []},
        {"pages": "some"},
        {"pages": [0]},
        {"pages": [1, ""]},
        {"file_names": "fancy"},
    ],
)
def test_bad_options_are_refused(client, design, renders, body):
    response = client.post(url(design), body, format="json")
    assert response.status_code == 400
    assert renders == []


def test_only_the_owner_gets_it_and_not_from_the_trash(client, anon, design, renders, db):
    from apps.accounts.models import User

    stranger = make_design(User.objects.create_user("x@example.com", "pass-pass-123"))
    assert client.post(url(stranger), {}, format="json").status_code == 404
    assert anon.post(url(design), {}, format="json").status_code == 401
    design.trashed_at = timezone.now()
    design.save()
    assert client.post(url(design), {}, format="json").status_code == 404
    assert renders == []


def test_typed_export_errors_keep_their_status_and_code(client, design, monkeypatch):
    def refuse(error):
        def fake(design, **options):
            raise error

        return fake

    monkeypatch.setattr(services, "export_image", refuse(InvalidExport("too_large", "Too big.")))
    response = client.post(url(design), {}, format="json", HTTP_ACCEPT="image/png")
    assert response.status_code == 400 and response["Content-Type"] == "application/json"
    assert "Too big." in response.content.decode()
    monkeypatch.setattr(services, "export_image", refuse(ExportBusy()))
    response = client.post(url(design), {}, format="json")
    assert response.status_code == 503 and response["Retry-After"] == "5"


def test_renders_are_rate_limited(client, design, renders, monkeypatch):
    monkeypatch.setattr(ExportRateThrottle, "THROTTLE_RATES", {"export": "1/min"})
    assert client.post(url(design), {}, format="json").status_code == 200
    assert client.post(url(design), {}, format="json").status_code == 429


def test_the_new_options_are_passed_on(client, design, renders, settings, monkeypatch):
    settings.IMAGE_OPTIMIZERS = ["builtin", "tinypng"]
    monkeypatch.setitem(optimizers.OPTIMIZERS, "tinypng", FakeOptimizer("tinypng"))
    body = {
        "format": "avif",
        "quality": "small",
        "size": "1080w",
        "max_bytes": 200_000,
        "png_colors": 256,
        "strip_metadata": False,
        "srgb": False,
        "progressive": True,
        "optimize": "tinypng",
    }
    response = client.post(url(design), body, format="json")
    assert response.status_code == 200
    assert response["Content-Type"] == "image/avif"
    assert response["Content-Disposition"] == 'attachment; filename="Summer sale.avif"'
    assert renders[-1] == {"page": 0, **DEFAULTS, **body}
    client.post(url(design), {"format": "auto", "quality": 70, "png_colors": "full"}, format="json")
    assert renders[-1] | {"page": None} == {"page": None, **DEFAULTS, "format": "auto", "quality": 70}
    client.post(url(design), {"optimize": True}, format="json")
    assert renders[-1]["optimize"] is True
    assert client.post(url(design), {"optimize": 3}, format="json").status_code == 400


def test_several_pages_come_back_as_one_zip(client, user, renders):
    design = make_design(user, title="Deck", document=make_doc(pages=3))
    response = client.post(url(design), {"pages": [3, 1], "format": "jpg"}, format="json")
    assert response.status_code == 200
    assert response["Content-Type"] == "application/zip"
    assert response["Content-Disposition"] == 'attachment; filename="Deck.zip"'
    assert response["X-Doory-Placeholders"] == "2"
    assert [r["page"] for r in renders] == [2, 0]
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    assert archive.namelist() == ["Deck - page 3.jpg", "Deck - page 1.jpg"]
    assert {info.compress_type for info in archive.infolist()} == {zipfile.ZIP_STORED}
    assert archive.read("Deck - page 1.jpg") == IMAGE

    renders.clear()
    response = client.post(url(design), {"pages": "all", "file_names": "detailed"}, format="json")
    assert [r["page"] for r in renders] == [0, 1, 2]
    names = zipfile.ZipFile(io.BytesIO(response.content)).namelist()
    assert names == [f"deck_1080x1920_p0{n}.png" for n in (1, 2, 3)]


def test_one_page_asked_for_as_pages_is_a_plain_image(client, design, renders):
    response = client.post(url(design), {"pages": "all"}, format="json")
    assert response["Content-Type"] == "image/png" and response.content == IMAGE


def test_each_extra_page_counts_against_the_export_rate(client, user, renders, monkeypatch):
    monkeypatch.setattr(ExportRateThrottle, "THROTTLE_RATES", {"export": "3/min"})
    design = make_design(user, document=make_doc(pages=3))
    assert client.post(url(design), {"pages": [1, 2]}, format="json").status_code == 200
    response = client.post(url(design), {"pages": [1, 2]}, format="json")
    assert response.status_code == 429
    assert len(renders) == 2  # nothing is drawn once the budget is spent


def test_a_refused_export_of_several_pages_costs_one_export(client, user, renders, monkeypatch):
    monkeypatch.setattr(ExportRateThrottle, "THROTTLE_RATES", {"export": "2/min"})
    design = make_design(user, document=make_doc(pages=3))
    response = client.post(url(design), {"pages": "all", "optimize": "tinypng"}, format="json")
    assert response.status_code == 400 and response.json()["error"]["code"] == "optimizer_unavailable"
    assert client.post(url(design), {"pages": [1]}, format="json").status_code == 200
    assert client.post(url(design), {"pages": [1]}, format="json").status_code == 429


@pytest.fixture
def offsite(settings, monkeypatch) -> FakeOptimizer:
    """An optimizer that sends the image away, as TinyPNG does, next to the built-in one."""
    settings.IMAGE_OPTIMIZERS = ["builtin", "tinypng"]
    fake = FakeOptimizer("tinypng", "TinyPNG")
    fake.sends_offsite = True
    monkeypatch.setitem(optimizers.OPTIMIZERS, "tinypng", fake)
    monkeypatch.setitem(optimizers.OPTIMIZERS, "builtin", FakeOptimizer())
    monkeypatch.setattr(OffsiteOptimizeRateThrottle, "THROTTLE_RATES", {"optimize_offsite": "3/min"})
    return fake


def test_each_page_sent_to_an_offsite_optimizer_counts_against_its_own_rate(client, user, renders, offsite):
    design = make_design(user, document=make_doc(pages=3))
    for _ in range(2):  # the built-in optimizer runs here: not counted
        assert (
            client.post(url(design), {"pages": "all", "optimize": "builtin"}, format="json").status_code
            == 200
        )
    assert (
        client.post(url(design), {"pages": [1, 2], "optimize": "tinypng"}, format="json").status_code == 200
    )
    drawn = len(renders)
    response = client.post(url(design), {"pages": [1, 2], "optimize": "tinypng"}, format="json")
    assert response.status_code == 429 and len(renders) == drawn
    assert client.post(url(design), {"optimize": "builtin"}, format="json").status_code == 200


def test_too_many_pages_are_refused_before_anything_is_drawn(client, user, renders, settings):
    settings.EXPORT_IMAGE_MAX_PAGES = 2
    design = make_design(user, document=make_doc(pages=3))
    response = client.post(url(design), {"pages": "all"}, format="json")
    assert response.status_code == 400 and "at most 2 pages" in response.content.decode()
    assert client.post(url(design), {"pages": [1, 9]}, format="json").status_code == 400
    assert renders == []


def test_the_schema_documents_the_new_formats(client, db):
    schema = client.get("/api/v1/schema/", {"format": "json"}).json()
    operation = schema["paths"]["/api/v1/designs/{id}/export/image/"]["post"]
    assert set(operation["responses"]["200"]["content"]) >= {"image/avif", "application/zip"}


# ---- SVG and PDF ---------------------------------------------------------------------------------


@pytest.fixture
def documents(monkeypatch) -> list[dict]:
    """`export_document` stubbed out: records its options and answers with a one-file bundle."""
    calls: list[dict] = []

    def fake_export_document(design, **options):
        calls.append(options)
        fmt = "svg" if options["format"] == "svg" else "pdf"
        mime = services.DOCUMENT_FORMATS[options["format"]]
        name = f"{design.title}.{fmt}"
        image = ImageResult(b"", fmt, mime, 10, 10, "p", 0, placeholders=2)
        return services.ImageBundle(b"%PDF-or-svg", fmt, mime, name, (image,), (name,))

    monkeypatch.setattr(services, "export_document", fake_export_document)
    return calls


def test_pdf_and_svg_with_the_print_options(client, design, documents, renders):
    response = client.post(
        url(design), {"format": "pdf-print", "pages": "all", "bleed_mm": 3, "crop_marks": True}, format="json"
    )
    assert response.status_code == 200 and response.content == b"%PDF-or-svg"
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"] == 'attachment; filename="Summer sale.pdf"'
    assert response["X-Doory-Placeholders"] == "2"
    assert documents[0] | {"charge": None} == {
        "format": "pdf-print",
        "pages": "all",
        "bleed_mm": 3.0,
        "crop_marks": True,
        "filename_style": "simple",
        "unix": None,
        "charge": None,
    }
    assert "Content-Security-Policy" not in response
    response = client.post(url(design), {"format": "svg", "page": 1}, format="json")
    assert response["Content-Type"] == "image/svg+xml" and documents[1]["pages"] == [0]
    assert response["Content-Security-Policy"] == views.SVG_SANDBOX_CSP
    assert response["Content-Security-Policy"].startswith("sandbox; default-src 'none';")
    assert documents[1]["bleed_mm"] == 0 and documents[1]["crop_marks"] is False
    assert renders == []


@pytest.mark.parametrize(
    "body", [{"bleed_mm": 11}, {"bleed_mm": -1}, {"crop_marks": "maybe"}, {"format": "eps"}]
)
def test_bad_print_options_are_refused(client, design, documents, body):
    response = client.post(url(design), {"format": "pdf", **body}, format="json")
    assert response.status_code == 400 and documents == []


def test_cmyk_is_refused_with_a_reason(client, design, documents, renders):
    for fmt in ("pdf-print", "png"):
        response = client.post(url(design), {"format": fmt, "cmyk": True}, format="json")
        assert response.status_code == 400 and "no CMYK conversion" in response.content.decode()
    assert documents == [] and renders == []


def test_the_schema_documents_pdf_and_svg(client, db):
    schema = client.get("/api/v1/schema/", {"format": "json"}).json()
    operation = schema["paths"]["/api/v1/designs/{id}/export/image/"]["post"]
    assert set(operation["responses"]["200"]["content"]) >= {"application/pdf", "image/svg+xml"}
    body = schema["components"]["schemas"]["ImageExportRequest"]["properties"]
    assert {"bleed_mm", "crop_marks", "cmyk"} <= set(body)


# ---- Video ---------------------------------------------------------------------------------------


@pytest.fixture
def videos(monkeypatch) -> list[dict]:
    """`export_video` stubbed out: records its options and answers with the video."""
    calls: list[dict] = []

    def fake_export_video(design, **options):
        calls.append(options)
        fmt = options["format"]
        mime = services.VIDEO_FORMATS[fmt]
        name = f"{design.title}.{fmt}"
        video = ImageResult(b"video", fmt, mime, 1920, 1080, "p", 0, placeholders=3)
        return services.ImageBundle(b"video", fmt, mime, name, (video,), (name,))

    monkeypatch.setattr(services, "export_video", fake_export_video)
    return calls


def test_a_video_of_all_pages_by_default(client, design, videos, renders):
    response = client.post(url(design), {"format": "mp4"}, format="json")
    assert response.status_code == 200 and response.content == b"video"
    assert response["Content-Type"] == "video/mp4"
    assert response["Content-Disposition"] == 'attachment; filename="Summer sale.mp4"'
    assert response["X-Doory-Placeholders"] == "3"
    assert videos[0] | {"charge": None} == {
        "format": "mp4",
        "pages": "all",
        "quality": 90,
        "resolution": None,
        "fps": None,
        "fit": "fit",
        "sound": True,
        "loop": 0,
        "dither": True,
        "page_seconds": None,
        "filename_style": "simple",
        "unix": None,
        "charge": None,
    }
    assert renders == []


def test_the_video_options_are_passed_on(client, user, videos):
    design = make_design(user, title="Deck", document=make_doc(pages=3))
    body = {
        "format": "gif",
        "page": 2,
        "resolution": 360,
        "fps": 10,
        "quality": "best",
        "fit": "fill",
        "loop": 2,
        "dither": False,
        "page_seconds": 3,
    }
    response = client.post(url(design), body, format="json")
    assert response.status_code == 200 and response["Content-Type"] == "image/gif"
    call = videos[0]
    assert (call["pages"], call["resolution"], call["fps"], call["quality"]) == ([1], 360, 10, "best")
    assert (call["fit"], call["loop"], call["dither"], call["page_seconds"]) == ("fill", 2, False, 3.0)
    client.post(url(design), {"format": "webm", "resolution": "design", "sound": False}, format="json")
    assert (videos[1]["resolution"], videos[1]["sound"]) == ("design", False)


@pytest.mark.parametrize(
    "body",
    [
        {"resolution": "big"},
        {"resolution": True},
        {"fps": 0},
        {"fps": 120},
        {"fit": "stretch"},
        {"loop": -1},
        {"page_seconds": 0},
        {"page_seconds": 601},
    ],
)
def test_bad_video_options_are_refused(client, design, videos, body):
    response = client.post(url(design), {"format": "mp4", **body}, format="json")
    assert response.status_code == 400 and videos == []


def test_video_export_is_off_unless_turned_on(client, design, settings):
    settings.SERVER_IMAGE_EXPORT_ENABLED = True
    settings.SERVER_VIDEO_EXPORT_ENABLED = False
    response = client.post(url(design), {"format": "webm"}, format="json")
    assert response.status_code == 404
    assert "video export is not enabled" in response.content.decode()


def test_a_video_file_is_streamed_and_closed_after(client, design, monkeypatch):
    file = io.BytesIO(b"video-from-a-file")

    def fake_export_video(design, **options):
        video = ImageResult(b"", "mp4", "video/mp4", 1920, 1080, "p", 0)
        return services.ImageBundle(
            b"", "mp4", "video/mp4", "Clip.mp4", (video,), ("Clip.mp4",), file=file, file_size=17
        )

    monkeypatch.setattr(services, "export_video", fake_export_video)
    response = client.post(url(design), {"format": "mp4"}, format="json")
    assert response.status_code == 200 and response.streaming
    assert response["Content-Length"] == "17" and response["Content-Type"] == "video/mp4"
    assert response["Content-Disposition"] == 'attachment; filename="Clip.mp4"'
    assert b"".join(response.streaming_content) == b"video-from-a-file"
    response.close()
    assert file.closed


def test_the_schema_documents_video(client, db):
    schema = client.get("/api/v1/schema/", {"format": "json"}).json()
    operation = schema["paths"]["/api/v1/designs/{id}/export/image/"]["post"]
    assert set(operation["responses"]["200"]["content"]) >= {"video/mp4", "video/webm", "image/gif"}
    body = schema["components"]["schemas"]["ImageExportRequest"]["properties"]
    assert {"resolution", "fps", "fit", "sound", "loop", "dither", "page_seconds"} <= set(body)
