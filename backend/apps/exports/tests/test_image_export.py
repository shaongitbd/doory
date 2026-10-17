"""`export_image`: the document it draws, its limits, the font manifest and the format conversion (no browser)."""

import io
import json

import pytest
from django.core.files.base import ContentFile
from PIL import Image

from apps.accounts.models import User
from apps.designs.tests.helpers import make_design, make_doc
from apps.exports import services
from apps.exports.exceptions import ExportBusy, ImageExportDisabled, InvalidExport, PayloadTooLarge
from apps.exports.renderer import RenderResult, render_slot
from apps.fonts.models import FontFamily, FontVariant

RENDER_URL = "http://frontend.test:8080/render.html"


def drawn_png(width=40, height=20) -> bytes:
    """Left half opaque red, right half fully transparent: what a transparent export looks like."""
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    image.paste((255, 0, 0, 255), (0, 0, width // 2, height))
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


@pytest.fixture(autouse=True)
def _image_settings(settings):
    settings.SERVER_IMAGE_EXPORT_ENABLED = True
    settings.EXPORT_RENDER_PAGE_URL = RENDER_URL
    settings.EXPORT_IMAGE_MAX_PIXELS = 40_000_000
    settings.EXPORT_IMAGE_MAX_DOCUMENT_BYTES = 5 * 1024 * 1024


@pytest.fixture
def renders(monkeypatch) -> list[dict]:
    """Replace the browser with a stub that records the payload and answers with `drawn_png()`."""
    calls: list[dict] = []

    def fake_render_image(payload, *, render_url):
        calls.append({"payload": json.loads(json.dumps(payload)), "render_url": render_url})
        page = payload["document"]["pages"][payload["page"]]
        return RenderResult(
            data=drawn_png(),
            mime="image/png",
            width=40,
            height=20,
            page_id=page["id"],
            page_index=payload["page"],
        )

    monkeypatch.setattr(services, "render_image", fake_render_image)
    return calls


@pytest.fixture
def other(db) -> User:
    return User.objects.create_user("someone-else@example.com", "other-pass-123")


@pytest.fixture
def design(user):
    return make_design(user, document=make_doc(pages=2, width=400, height=200))


def opened(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


# ---- what is drawn -----------------------------------------------------------------------------


def test_the_first_page_is_drawn_by_default_at_page_size(design, renders):
    result = services.export_image(design)
    (call,) = renders
    assert call["render_url"] == RENDER_URL
    assert call["payload"]["document"] == design.document
    assert call["payload"] | {"document": None, "fonts": None} == {
        "document": None,
        "page": 0,
        "multiplier": 1.0,
        "transparent": False,
        "fonts": None,
    }
    assert (result.format, result.mime, result.page_index) == ("png", "image/png", 0)
    assert result.page_id == design.document["pages"][0]["id"]


def test_a_page_is_picked_by_index_or_id(design, renders):
    second = design.document["pages"][1]["id"]
    assert services.export_image(design, page=1).page_id == second
    assert services.export_image(design, page=second).page_index == 1
    assert [call["payload"]["page"] for call in renders] == [1, 1]


@pytest.mark.parametrize("page", [2, -1, "no-such-page", 1.5, True])
def test_a_missing_page_is_refused(design, renders, page):
    with pytest.raises(InvalidExport) as caught:
        services.export_image(design, page=page)
    assert caught.value.get_codes() == "page_not_found"
    assert renders == []


def test_the_live_editor_state_is_drawn_while_the_design_is_open(design, renders, monkeypatch):
    live = make_doc(width=300, height=100)
    live["pages"][0]["id"] = "live-page"
    monkeypatch.setattr("apps.designs.edits.read_current", lambda d: (live, True))
    result = services.export_image(design)
    assert renders[0]["payload"]["document"] == live
    assert result.page_id == "live-page"


def test_the_saved_document_is_drawn_when_nobody_has_it_open(design, renders, settings):
    settings.REALTIME_ENABLED = True
    services.export_image(design)
    assert renders[0]["payload"]["document"] == design.document


# ---- limits ------------------------------------------------------------------------------------


def test_scale_counts_against_the_pixel_limit(design, renders, settings):
    settings.EXPORT_IMAGE_MAX_PIXELS = 400 * 200 * 4  # exactly 2x
    services.export_image(design, scale=2)
    assert renders[-1]["payload"]["multiplier"] == 2.0
    with pytest.raises(InvalidExport) as caught:
        services.export_image(design, scale=2.1)
    assert caught.value.get_codes() == "too_large"
    assert len(renders) == 1


def test_a_page_of_its_own_size_is_measured_by_that_size(user, renders, settings):
    document = make_doc(width=100, height=100)
    document["pages"][0].update(width=4000, height=4000)
    settings.EXPORT_IMAGE_MAX_PIXELS = 1_000_000
    with pytest.raises(InvalidExport) as caught:
        services.export_image(make_design(user, document=document))
    assert caught.value.get_codes() == "too_large"


def test_a_document_over_the_size_limit_is_refused(design, renders, settings):
    settings.EXPORT_IMAGE_MAX_DOCUMENT_BYTES = len(json.dumps(design.document, separators=(",", ":"))) - 1
    with pytest.raises(PayloadTooLarge):
        services.export_image(design)
    assert renders == []


@pytest.mark.parametrize(
    ("options", "code"),
    [
        ({"format": "gif"}, "invalid_format"),
        ({"format": "svg"}, "invalid_format"),
        ({"quality": 0}, "invalid_quality"),
        ({"quality": 101}, "invalid_quality"),
        ({"quality": 50.5}, "invalid_quality"),
        ({"scale": 0}, "invalid_scale"),
        ({"scale": 4.5}, "invalid_scale"),
        ({"scale": "big"}, "invalid_scale"),
        ({"scale": float("nan")}, "invalid_scale"),
    ],
)
def test_bad_options_are_refused(design, renders, options, code):
    with pytest.raises(InvalidExport) as caught:
        services.export_image(design, **options)
    assert caught.value.get_codes() == code
    assert renders == []


def test_a_page_without_a_size_is_refused(user, renders):
    document = make_doc()
    document["width"] = 0
    with pytest.raises(InvalidExport) as caught:
        services.export_image(make_design(user, document=document))
    assert caught.value.get_codes() == "invalid_document"


def test_the_switch_turns_it_off(design, renders, settings):
    settings.SERVER_IMAGE_EXPORT_ENABLED = False
    with pytest.raises(ImageExportDisabled):
        services.export_image(design)


def test_one_render_at_a_time_per_account(design, renders):
    with render_slot(design.owner_id), pytest.raises(ExportBusy):
        services.export_image(design)
    services.export_image(design)


# ---- formats -----------------------------------------------------------------------------------


def test_png_is_passed_through_as_drawn(design, renders):
    assert services.export_image(design, format="png", transparent=True).data == drawn_png()


@pytest.mark.parametrize("fmt", ["jpg", "jpeg", "JPG"])
def test_jpg_has_no_alpha_and_is_flattened_on_white(design, renders, fmt):
    result = services.export_image(design, format=fmt, transparent=True)
    assert (result.format, result.mime) == ("jpg", "image/jpeg")
    image = opened(result.data)
    assert image.format == "JPEG" and image.mode == "RGB"
    assert all(abs(a - b) <= 8 for a, b in zip(image.getpixel((35, 10)), (255, 255, 255), strict=True))
    assert image.getpixel((5, 10))[0] > 240
    assert renders[0]["payload"]["transparent"] is False  # the background is drawn, as in the editor


def test_webp_keeps_alpha_only_when_transparent(design, renders):
    clear = opened(services.export_image(design, format="webp", transparent=True).data)
    assert clear.format == "WEBP" and clear.mode == "RGBA" and clear.getpixel((35, 10))[3] == 0
    assert renders[0]["payload"]["transparent"] is True
    solid = opened(services.export_image(design, format="webp").data)
    assert solid.mode == "RGB"


def test_quality_changes_the_lossy_formats(design, renders, monkeypatch):
    noisy = Image.effect_noise((200, 100), 80).convert("RGBA")
    out = io.BytesIO()
    noisy.save(out, "PNG")
    monkeypatch.setattr(
        services,
        "render_image",
        lambda payload, render_url: RenderResult(
            data=out.getvalue(), mime="image/png", width=200, height=100
        ),
    )
    for fmt in ("jpg", "webp"):
        low = services.export_image(design, format=fmt, quality=10).data
        high = services.export_image(design, format=fmt, quality=95).data
        assert len(low) < len(high)


def test_stand_ins_and_missing_fonts_are_warnings_not_errors(design, monkeypatch):
    monkeypatch.setattr(
        services,
        "render_image",
        lambda payload, render_url: RenderResult(
            data=drawn_png(), mime="image/png", placeholders=2, missing_fonts=("Gone Sans",)
        ),
    )
    result = services.export_image(design)
    assert result.placeholders == 2 and result.missing_fonts == ("Gone Sans",)
    assert len(result.warnings) == 2
    assert "2 object(s)" in result.warnings[0] and "Gone Sans" in result.warnings[1]


# ---- fonts -------------------------------------------------------------------------------------


def font(family: str, owner=None) -> FontFamily:
    record = FontFamily.objects.create(family=family, slug=family.lower().replace(" ", "-"), owner=owner)
    FontVariant.objects.create(
        family=record, weight=400, file=ContentFile(b"font", name="f.woff2"), subset="latin"
    )
    return record


def text(family: str) -> dict:
    return {
        "id": family,
        "type": "textbox",
        "text": "A",
        "left": 0,
        "top": 0,
        "fontFamily": f"'{family}', serif",
    }


def test_the_fonts_of_the_page_go_along_in_the_fonts_api_shape(user, other, renders):
    catalogue, mine = font("Catalogue Serif"), font("My Upload", owner=user)
    font("Not Used Sans")
    font("Someone Elses", owner=other)
    document = make_doc(pages=2, objects=[text("Catalogue Serif"), text("My Upload"), text("Someone Elses")])
    document["pages"][1]["objects"] = [text("Not Used Sans")]
    services.export_image(make_design(user, document=document))
    fonts = renders[0]["payload"]["fonts"]
    assert sorted(f["family"] for f in fonts) == ["Catalogue Serif", "My Upload"]
    by_family = {f["family"]: f for f in fonts}
    assert by_family["My Upload"]["is_user_font"] is True
    assert by_family["Catalogue Serif"] | {"variants": None} == {
        "id": str(catalogue.pk),
        "family": "Catalogue Serif",
        "category": "sans-serif",
        "scripts": [],
        "is_variable": False,
        "is_user_font": False,
        "variants": None,
        "unicode_ranges": {},
        "popularity": catalogue.popularity,
    }
    (variant,) = by_family["Catalogue Serif"]["variants"]
    assert variant["weight"] == 400 and variant["url"].startswith("/media/fonts/system/")
    assert by_family["My Upload"]["id"] == str(mine.pk)


def test_an_uploaded_font_wins_over_the_catalogue_family_of_the_same_name(user, renders):
    font("Shared Name")
    mine = font("Shared Name", owner=user)
    services.export_image(make_design(user, document=make_doc(objects=[text("Shared Name")])))
    assert [f["id"] for f in renders[0]["payload"]["fonts"]] == [str(mine.pk)]


def test_unpublished_catalogue_fonts_are_left_out(user, renders):
    hidden = font("Hidden Font")
    hidden.is_published = False
    hidden.save()
    services.export_image(make_design(user, document=make_doc(objects=[text("Hidden Font")])))
    assert renders[0]["payload"]["fonts"] == []
