"""`export_document`: SVG and PDF of a saved design, from pages the render page made (no browser)."""

import base64
import io
import json
import zipfile

import pytest
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image

from apps.designs.tests.helpers import make_design, make_doc
from apps.exports import services
from apps.exports.exceptions import (
    ExportBusy,
    ExportDisabled,
    ExportFailed,
    ImageExportDisabled,
    InvalidExport,
)
from apps.exports.layout import PX_PER_MM
from apps.exports.renderer import PagesResult, RenderedPage, RenderResult, render_slot

from .conftest import FAKE_PDF
from .helpers import build_test_font

RENDER_URL = "http://frontend.test:8080/render.html"


def jpeg(width: int, height: int) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), (255, 0, 0)).save(out, "JPEG")
    return out.getvalue()


def page_svg(width: float, height: float) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}"><rect width="{width}" height="{height}" fill="#ff0000"/></svg>'
    )


@pytest.fixture(autouse=True)
def _export_settings(settings):
    settings.SERVER_IMAGE_EXPORT_ENABLED = True
    settings.SERVER_PDF_ENABLED = True
    settings.EXPORT_RENDER_PAGE_URL = RENDER_URL
    settings.EXPORT_IMAGE_MAX_PIXELS = 40_000_000
    settings.EXPORT_TIMEOUT_SECONDS = 30


class FakePages:
    """The render page: answers `render_pages` with a page of the right kind for every page asked for."""

    def __init__(self):
        self.calls: list[dict] = []
        self.font_files: tuple[dict, ...] = ()
        self.placeholders = 0
        self.missing_fonts: tuple[str, ...] = ()

    def __call__(self, payload, *, render_url, timeout=None):
        self.calls.append(
            {"payload": json.loads(json.dumps(payload)), "render_url": render_url, "timeout": timeout}
        )
        document = payload["document"]
        pages = []
        for index in payload["pages"]:
            page = document["pages"][index]
            width = float(page.get("width") or document["width"])
            height = float(page.get("height") or document["height"])
            bleed = payload.get("bleed", 0)
            if payload["output"] == "picture":
                scale = min(
                    payload["multiplier"],
                    ((payload["maxPixels"]) / ((width + 2 * bleed) * (height + 2 * bleed))) ** 0.5,
                )
                pixels = (round((width + 2 * bleed) * scale), round((height + 2 * bleed) * scale))
                data = jpeg(*pixels)
            else:
                pixels = (0, 0)
                data = page_svg(width, height).encode()
            pages.append(
                RenderedPage(
                    data=data,
                    width=width,
                    height=height,
                    page_id=page["id"],
                    page_index=index,
                    pixel_width=pixels[0],
                    pixel_height=pixels[1],
                    placeholders=self.placeholders,
                    missing_fonts=self.missing_fonts,
                )
            )
        mime = {"svg": "image/svg+xml", "print": "image/svg+xml", "picture": "image/jpeg"}[payload["output"]]
        return PagesResult(pages=tuple(pages), mime=mime, font_files=self.font_files, blocked_total=1)


@pytest.fixture
def drawn(monkeypatch) -> FakePages:
    fake = FakePages()
    monkeypatch.setattr(services, "render_pages", fake)
    return fake


@pytest.fixture
def printed(monkeypatch) -> list[dict]:
    """The print browser: records the HTML it was asked to print."""
    calls: list[dict] = []

    def fake_render_pdf(html, *, width_px, height_px):
        calls.append({"html": html, "width_px": width_px, "height_px": height_px})
        return RenderResult(data=FAKE_PDF)

    monkeypatch.setattr(services, "render_pdf", fake_render_pdf)
    return calls


@pytest.fixture
def design(user):
    document = make_doc(pages=3, width=400, height=200)
    document["pages"][1] |= {"width": 100, "height": 300}
    return make_design(user, title="Poster", document=document)


# ---- SVG -----------------------------------------------------------------------------------------


def test_one_svg_page_is_its_own_file(design, drawn, printed):
    bundle = services.export_images(design, format="svg", pages=[1])
    (call,) = drawn.calls
    assert call["render_url"] == RENDER_URL and call["timeout"] == 30
    assert call["payload"]["output"] == "svg" and call["payload"]["pages"] == [1]
    assert "bleed" not in call["payload"] and "multiplier" not in call["payload"]
    assert call["payload"]["fonts"] == []
    assert (bundle.format, bundle.mime, bundle.filename) == ("svg", "image/svg+xml", "Poster - page 2.svg")
    assert bundle.data.startswith(b"<svg") and printed == []
    (image,) = bundle.images
    assert (image.width, image.height, image.page_index, image.options_used) == (
        100,
        300,
        1,
        {"format": "svg"},
    )


def test_several_svg_pages_go_into_a_compressed_zip(design, drawn, printed):
    bundle = services.export_images(design, format="svg", pages="all")
    assert drawn.calls[0]["payload"]["pages"] == [0, 1, 2]
    assert drawn.calls[0]["timeout"] == 90  # EXPORT_TIMEOUT_SECONDS per page, in one browser
    assert (bundle.format, bundle.filename) == ("zip", "Poster.zip")
    archive = zipfile.ZipFile(io.BytesIO(bundle.data))
    assert archive.namelist() == ["Poster - page 1.svg", "Poster - page 2.svg", "Poster - page 3.svg"]
    assert {entry.compress_type for entry in archive.infolist()} == {zipfile.ZIP_DEFLATED}


def test_the_image_options_are_not_used_for_svg(design, drawn):
    bundle = services.export_images(design, format="svg", quality="small", scale=2, transparent=True)
    assert bundle.format == "svg" and len(drawn.calls) == 1


# ---- PDF of pictures -----------------------------------------------------------------------------


def test_a_pdf_of_pictures_prints_a_300_dpi_jpeg_per_page(design, drawn, printed):
    bundle = services.export_images(design, format="pdf", pages="all", bleed_mm=3, crop_marks=True)
    payload = drawn.calls[0]["payload"]
    assert payload["output"] == "picture" and payload["multiplier"] == 300 / 96
    assert payload["bleed"] == pytest.approx(3 * PX_PER_MM) and payload["maxPixels"] == 40_000_000
    (call,) = printed
    assert call["html"].count("data:image/jpeg;base64,") == 3
    margin = 9 * PX_PER_MM
    assert call["width_px"] == pytest.approx(400 + 2 * margin)
    assert (bundle.format, bundle.mime, bundle.filename) == ("pdf", "application/pdf", "Poster.pdf")
    assert bundle.data == FAKE_PDF  # the fake is not a PDF pypdf can add boxes to
    assert bundle.options == {"format": "pdf", "bleed_mm": 3.0, "crop_marks": True, "cmyk": False, "dpi": 300}
    assert [image.options_used["dpi"] for image in bundle.images] == [300, 300, 300]
    assert [image.data for image in bundle.images] == [b"", b"", b""]
    assert bundle.filenames == ("Poster.pdf",) and bundle.warnings == ()


def test_a_page_too_large_for_300_dpi_is_drawn_at_less_with_a_warning(design, drawn, printed, settings):
    settings.EXPORT_IMAGE_MAX_PIXELS = 800 * 400
    bundle = services.export_images(design, format="pdf")
    assert bundle.options["dpi"] == 192
    assert bundle.warnings == ("Drawn at 192 dpi: at 300 dpi the page would have more than 320000 pixels.",)


def test_the_render_page_must_send_a_jpeg(design, drawn, printed, monkeypatch):
    def not_a_picture(payload, **kwargs):
        result = drawn(payload, **kwargs)
        return PagesResult(
            pages=tuple(RenderedPage(b"<svg/>", 400, 200, p.page_id, p.page_index) for p in result.pages),
            mime="image/jpeg",
        )

    monkeypatch.setattr(services, "render_pages", not_a_picture)
    with pytest.raises(ExportFailed):
        services.export_images(design, format="pdf")
    assert printed == []


# ---- print PDF -------------------------------------------------------------------------------------


def test_a_print_pdf_prints_the_sanitised_vector_pages_with_their_fonts(design, drawn, printed, user):
    name = default_storage.save("fonts/print-test.ttf", ContentFile(build_test_font()))
    drawn.font_files = (
        {"family": "Doory Test Sans", "url": f"/media/{name}", "weight": 400, "style": "italic"},
    )
    try:
        bundle = services.export_images(design, format="pdf-print", pages=[1, 2], bleed_mm=2)
    finally:
        default_storage.delete(name)
    payload = drawn.calls[0]["payload"]
    assert payload["output"] == "print" and payload["bleed"] == pytest.approx(2 * PX_PER_MM)
    assert "multiplier" not in payload
    (call,) = printed
    assert call["html"].count("<svg") == 2 and "data:image/jpeg" not in call["html"]
    assert 'font-family:"Doory Test Sans";font-weight:400;font-style:italic' in call["html"]
    assert call["width_px"] == pytest.approx(100 + 4 * PX_PER_MM)  # the first page asked for
    assert bundle.filename == "Poster-print.pdf"
    assert bundle.options == {"format": "pdf-print", "bleed_mm": 2.0, "crop_marks": False, "cmyk": False}


@pytest.mark.parametrize("format_id", ["pdf", "pdf-print"])
def test_saved_design_exports_back_sides_of_a_booklet(user, drawn, printed, format_id):
    design = make_design(user, title="Booklet", document=make_doc(pages=4, width=559, height=794))
    bundle = services.export_images(
        design, format=format_id, pages="all", layout="booklet", print_sides="back"
    )
    assert len(drawn.calls[0]["payload"]["pages"]) == 4
    assert printed[0]["html"].count('<section class="page">') == 1
    assert printed[0]["width_px"] == pytest.approx(297 * PX_PER_MM)
    assert bundle.filename == "Booklet-booklet-back.pdf"
    assert bundle.options["print_sides"] == "back"
    assert bundle.options["layout"] == "booklet"


def test_font_files_the_render_page_lists_are_checked_like_the_editors(design, drawn, printed):
    drawn.font_files = ({"family": "Evil", "url": "https://elsewhere.test/font.ttf", "weight": 400},)
    with pytest.raises(InvalidExport) as error:
        services.export_images(design, format="pdf-print")
    assert error.value.get_codes() == "invalid_font"
    assert printed == []


def test_odd_font_entries_are_left_out_or_cleaned(design, drawn):
    specs = services._font_specs(
        [
            {"family": "A", "url": "/media/a.ttf", "weight": 9999, "style": "oblique"},
            {"family": "", "url": "/media/b.ttf"},
            {"family": "C", "url": None},
        ]
    )
    assert specs == [{"family": "A", "url": "/media/a.ttf", "weight": 400, "style": "normal"}]


def test_a_print_page_that_is_not_a_safe_svg_is_refused(design, drawn, printed, monkeypatch):
    def scripted(payload, **kwargs):
        page = RenderedPage(b"<html><script>alert(1)</script></html>", 400, 200, "x", 0)
        return PagesResult(pages=(page,), mime="image/svg+xml")

    monkeypatch.setattr(services, "render_pages", scripted)
    with pytest.raises(InvalidExport):
        services.export_images(design, format="pdf-print")


def test_structured_names_have_the_first_pages_size_and_no_page_number(design, drawn, printed):
    bundle = services.export_images(
        design, format="pdf-print", pages="all", filename_style="structured", unix=1
    )
    assert bundle.filename == "poster_400x200_print_1.pdf"
    assert (
        services.export_images(design, format="pdf", filename_style="structured").filename
        == "poster_400x200.pdf"
    )


# ---- options, limits, switches ---------------------------------------------------------------------


def test_cmyk_is_refused_for_every_format(design, drawn, printed):
    for fmt in ("pdf-print", "pdf", "svg", "png"):
        with pytest.raises(InvalidExport) as error:
            services.export_images(design, format=fmt, cmyk=True)
        assert error.value.get_codes() == "cmyk_unavailable"
    assert drawn.calls == [] and printed == []


@pytest.mark.parametrize("bleed", [-1, 10.5, float("nan"), "three", True])
def test_a_bleed_out_of_range_is_refused(design, drawn, bleed):
    with pytest.raises(InvalidExport) as error:
        services.export_images(design, format="pdf", bleed_mm=bleed)
    assert error.value.get_codes() == "invalid_bleed"


def test_each_page_after_the_first_is_charged_before_anything_is_drawn(design, drawn, printed):
    charged = []

    def charge(extra):
        charged.append(extra)
        assert drawn.calls == []

    services.export_images(design, format="pdf", pages="all", charge=charge)
    assert charged == [2]


def test_the_switches(design, drawn, printed, settings):
    settings.SERVER_PDF_ENABLED = False
    with pytest.raises(ExportDisabled):
        services.export_images(design, format="pdf")
    with pytest.raises(ExportDisabled):
        services.export_images(design, format="pdf-print")
    assert services.export_images(design, format="svg").format == "svg"  # no printing
    settings.SERVER_IMAGE_EXPORT_ENABLED = False
    with pytest.raises(ImageExportDisabled):
        services.export_images(design, format="svg")


def test_one_render_at_a_time_per_account(design, drawn, printed):
    with render_slot(design.owner_id), pytest.raises(ExportBusy):
        services.export_images(design, format="pdf-print")
    assert drawn.calls == []


def test_the_render_page_must_answer_the_pages_asked_for(design, drawn, printed, monkeypatch):
    def first_only(payload, **kwargs):
        result = drawn({**payload, "pages": payload["pages"][:1]}, **kwargs)
        return result

    monkeypatch.setattr(services, "render_pages", first_only)
    with pytest.raises(ExportFailed):
        services.export_images(design, format="pdf", pages="all")
    assert printed == []


def test_stand_ins_and_missing_fonts_are_warnings_per_page(design, drawn, printed):
    drawn.placeholders, drawn.missing_fonts = 1, ("Gone Sans",)
    bundle = services.export_images(design, format="pdf", pages=[0, 1])
    assert bundle.warnings == (
        "Page 1: 1 object(s) could not be loaded (usually a picture) and are drawn as grey boxes.",
        "Page 1: Drawn in a fallback font: Gone Sans.",
        "Page 2: 1 object(s) could not be loaded (usually a picture) and are drawn as grey boxes.",
        "Page 2: Drawn in a fallback font: Gone Sans.",
    )
    assert bundle.placeholders == 2


def test_the_fonts_of_all_chosen_pages_go_along(user, drawn):
    from apps.fonts.models import FontFamily

    FontFamily.objects.create(family="Page Two Sans", slug="page-two-sans", owner=user)
    document = make_doc(pages=2)
    document["pages"][1]["objects"] = [
        {"id": "t", "type": "textbox", "text": "x", "fontFamily": "Page Two Sans"}
    ]
    services.export_images(make_design(user, document=document), format="svg", pages="all")
    assert [family["family"] for family in drawn.calls[0]["payload"]["fonts"]] == ["Page Two Sans"]


def test_the_picture_svg_fills_the_artwork_box():
    from apps.exports.layout import PageGeometry

    geometry = PageGeometry.create(100, 50, 1, False)
    svg = services._picture_svg(RenderedPage(jpeg(4, 2), 100, 50, "p", 0), geometry)
    art = f"{100 + 2 * PX_PER_MM:.4f}".rstrip("0")
    assert f'width="{art}"' in svg and 'preserveAspectRatio="none"' in svg
    assert base64.b64encode(jpeg(4, 2)).decode() in svg
