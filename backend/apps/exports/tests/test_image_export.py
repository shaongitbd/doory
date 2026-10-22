"""`export_image`: the document it draws, its limits, the font manifest and the format conversion (no browser)."""

import io
import json

import pytest
from django.core.files.base import ContentFile
from PIL import Image

from apps.accounts.models import User
from apps.designs.tests.helpers import make_design, make_doc
from apps.exports import optimizers, services
from apps.exports.exceptions import ExportBusy, ImageExportDisabled, InvalidExport, PayloadTooLarge
from apps.exports.filenames import slug
from apps.exports.renderer import RenderResult, render_slot
from apps.fonts.models import FontFamily, FontVariant

from .helpers import FakeOptimizer

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


def test_the_switch_is_off_by_default_and_turns_it_off(design, renders, settings):
    from doory.settings import base

    assert base.SERVER_IMAGE_EXPORT_ENABLED is False
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


def noisy_png(width=200, height=100, alpha=False) -> bytes:
    image = Image.merge("RGB", [Image.effect_noise((width, height), 60 + 10 * band) for band in range(3)])
    image = image.convert("RGBA")
    if alpha:
        image.paste((0, 0, 0, 0), (width // 2, 0, width, height))
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


def drawing(monkeypatch, png: bytes, width=200, height=100) -> None:
    monkeypatch.setattr(
        services,
        "render_image",
        lambda payload, render_url: RenderResult(data=png, mime="image/png", width=width, height=height),
    )


needs_avif = pytest.mark.skipif("avif" not in services.image_formats(), reason="Pillow without AVIF")


@needs_avif
def test_avif_keeps_alpha_only_when_transparent(design, renders):
    clear = services.export_image(design, format="avif", transparent=True)
    assert (clear.format, clear.mime) == ("avif", "image/avif")
    image = opened(clear.data)
    assert image.format == "AVIF" and image.mode == "RGBA" and image.getpixel((35, 10))[3] < 10
    assert opened(services.export_image(design, format="avif").data).mode == "RGB"
    assert clear.options_used["speed"] == 4


def test_avif_is_refused_when_pillow_cannot_make_it(design, renders, monkeypatch):
    monkeypatch.setattr(services.features, "check", lambda feature: feature != "avif")
    assert services.image_formats() == ("png", "jpg", "webp")
    with pytest.raises(InvalidExport) as caught:
        services.export_image(design, format="avif")
    assert caught.value.get_codes() == "format_unavailable"
    assert renders == []
    assert services.export_image(design, format="auto").options_used["compared"].keys() == {
        "png",
        "jpg",
        "webp",
    }


def test_big_avif_images_are_encoded_faster():
    assert services.avif_speed(2000, 4000) == 4
    assert services.avif_speed(2000, 4001) == 6


def test_auto_keeps_the_smallest_file_and_says_what_it_compared(design, monkeypatch):
    drawing(monkeypatch, noisy_png())
    result = services.export_image(design, format="auto", quality=60)
    compared = result.options_used["compared"]
    assert set(compared) == set(services.image_formats())
    assert len(result.data) == min(compared.values()) == compared[result.format]
    assert result.mime == services.IMAGE_FORMATS[result.format]


def test_auto_leaves_jpg_out_of_a_transparent_export(design, monkeypatch):
    drawing(monkeypatch, noisy_png(alpha=True))
    result = services.export_image(design, format="auto", transparent=True)
    assert "jpg" not in result.options_used["compared"] and result.format != "jpg"
    assert opened(result.data).mode in ("RGBA", "P")


def test_a_flat_png_can_win_auto(design, renders):
    result = services.export_image(design, format="auto")
    assert result.options_used["compared"]["png"] == len(drawn_png())


@pytest.mark.parametrize(("size", "multiplier"), [("2x", 2.0), ("0.5X", 0.5), ("1000w", 2.5), ("100h", 0.5)])
def test_a_size_sets_the_scale(design, renders, size, multiplier):
    result = services.export_image(design, size=size, scale=3)
    assert renders[-1]["payload"]["multiplier"] == multiplier
    assert result.options_used["scale"] == multiplier


def test_a_width_lands_on_whole_pixels():
    assert round(1080 * services.parse_size("1350w", 1080, 1350)) == 1350
    assert round(1350 * services.parse_size("1080h", 1080, 1350)) == 1080
    assert round(333 * services.parse_size("1000w", 333, 100)) == 1000


@pytest.mark.parametrize(
    ("size", "message"),
    [
        ("big", "must look like"),
        ("10.5w", "must look like"),
        ("5x", "between 0.1x and 4x"),
        ("1700w", "1600 px"),
    ],
)
def test_a_size_out_of_range_is_refused(design, renders, settings, size, message):
    with pytest.raises(InvalidExport, match=message) as caught:
        services.export_image(design, size=size)
    assert caught.value.get_codes() == "invalid_size"
    assert renders == []


def test_a_size_counts_against_the_pixel_limit(design, renders, settings):
    settings.EXPORT_IMAGE_MAX_PIXELS = 400 * 200 * 4
    with pytest.raises(InvalidExport) as caught:
        services.export_image(design, size="801w")
    assert caught.value.get_codes() == "too_large"


@pytest.mark.parametrize(
    ("preset", "value"), [("small", 65), ("balanced", 82), ("Best", 95), ("original", 100)]
)
def test_quality_presets(design, renders, preset, value):
    assert services.export_image(design, format="jpg", quality=preset).options_used["quality"] == value


@pytest.mark.parametrize(
    ("options", "code"),
    [
        ({"quality": "great"}, "invalid_quality"),
        ({"max_bytes": 0}, "invalid_max_bytes"),
        ({"max_bytes": True}, "invalid_max_bytes"),
        ({"max_bytes": 10.5}, "invalid_max_bytes"),
        ({"png_colors": 1}, "invalid_png_colors"),
        ({"png_colors": 257}, "invalid_png_colors"),
        ({"png_colors": "256"}, "invalid_png_colors"),
        ({"format": "tiff"}, "invalid_format"),
    ],
)
def test_bad_new_options_are_refused(design, renders, options, code):
    with pytest.raises(InvalidExport) as caught:
        services.export_image(design, **options)
    assert caught.value.get_codes() == code
    assert renders == []


@pytest.mark.parametrize("fmt", ["jpg", "webp", pytest.param("avif", marks=needs_avif)])
def test_max_bytes_finds_the_highest_quality_that_fits(design, monkeypatch, fmt):
    drawing(monkeypatch, noisy_png())
    full = services.export_image(design, format=fmt, quality=90)
    limit = len(full.data) // 2
    fitted = services.export_image(design, format=fmt, quality=90, max_bytes=limit)
    quality = fitted.options_used["quality"]
    assert len(fitted.data) <= limit and 1 <= quality < 90
    assert fitted.options_used["max_bytes"] == limit and not fitted.warnings
    one_more = services.export_image(design, format=fmt, quality=quality + 1)
    assert len(one_more.data) > limit
    assert services.export_image(design, format=fmt, quality=90, max_bytes=len(full.data)).data == full.data


def test_a_max_bytes_that_cannot_be_met_is_a_warning(design, monkeypatch):
    drawing(monkeypatch, noisy_png())
    result = services.export_image(design, format="jpg", max_bytes=100)
    assert result.options_used["quality"] < 10  # the smallest file tried
    assert "more than max_bytes (100)" in result.warnings[-1]
    png = services.export_image(design, format="png", max_bytes=100)
    assert "a PNG has no quality" in png.warnings[-1]


def test_png_colors_makes_a_smaller_palette_png(design, monkeypatch):
    image = Image.linear_gradient("L").resize((300, 100)).convert("RGBA")
    out = io.BytesIO()
    image.save(out, "PNG")
    drawing(monkeypatch, out.getvalue(), 300, 100)
    result = services.export_image(design, png_colors=16)
    assert opened(result.data).mode == "P" and len(opened(result.data).getcolors()) <= 16
    assert len(result.data) < result.bytes_before == len(out.getvalue())
    assert result.options_used["png_colors"] == 16


def test_png_colors_never_makes_the_png_bigger(design, monkeypatch):
    tiny = io.BytesIO()
    Image.new("RGBA", (1, 1), (10, 20, 30, 255)).save(tiny, "PNG", optimize=True)
    drawing(monkeypatch, tiny.getvalue(), 1, 1)
    result = services.export_image(design, png_colors=256)
    assert result.data == tiny.getvalue() and result.options_used["png_colors"] is None


def png_with_metadata() -> bytes:
    from PIL import PngImagePlugin

    text = PngImagePlugin.PngInfo()
    text.add_text("Comment", "made by someone")
    out = io.BytesIO()
    Image.open(io.BytesIO(drawn_png())).save(out, "PNG", pnginfo=text, icc_profile=b"fake-profile")
    return out.getvalue()


def test_metadata_and_the_colour_profile_are_left_out_by_default(design, monkeypatch):
    drawing(monkeypatch, png_with_metadata(), 40, 20)
    clean = services.export_image(design)
    assert b"tEXt" not in clean.data and b"iCCP" not in clean.data
    assert opened(clean.data).tobytes() == opened(drawn_png()).tobytes()
    kept = services.export_image(design, strip_metadata=False, srgb=False)
    assert kept.data == png_with_metadata()
    assert services.export_image(design, strip_metadata=False).data.count(b"tEXt") == 1
    assert opened(services.export_image(design, format="webp").data).info.get("icc_profile") is None


def test_progressive_jpg(design, renders):
    result = services.export_image(design, format="jpg", progressive=True)
    assert opened(result.data).info.get("progressive") == 1
    assert result.options_used["progressive"] is True
    assert "progressive" not in opened(services.export_image(design, format="jpg").data).info


def test_the_result_says_how_it_was_made(design, renders):
    result = services.export_image(design, format="webp", quality="best", scale=2)
    assert result.bytes_before == len(drawn_png())
    assert result.options_used == {
        "format": "webp",
        "quality": 95,
        "scale": 2.0,
        "transparent": False,
        "strip_metadata": True,
        "srgb": True,
    }


# ---- several pages -----------------------------------------------------------------------------


def test_pick_pages(user, settings):
    design = make_design(user, document=make_doc(pages=3))
    second = design.document["pages"][1]["id"]
    assert services.pick_pages(design, None) == [0]
    assert services.pick_pages(design, "all") == [0, 1, 2]
    assert services.pick_pages(design, [2, second, 1, 2]) == [2, 1]
    for pages, code in (([5], "page_not_found"), ([], "invalid_pages"), ("some", "invalid_pages")):
        with pytest.raises(InvalidExport) as caught:
            services.pick_pages(design, pages)
        assert caught.value.get_codes() == code
    settings.EXPORT_IMAGE_MAX_PAGES = 2
    with pytest.raises(InvalidExport) as caught:
        services.pick_pages(design, "all")
    assert caught.value.get_codes() == "too_many_pages"


def test_several_pages_go_into_one_zip_one_render_each(user, renders):
    import zipfile

    design = make_design(user, title="Spring / Sale", document=make_doc(pages=3, width=400, height=200))
    charged = []
    bundle = services.export_images(
        design, pages="all", format="webp", charge=charged.append, filename_style="simple"
    )
    assert charged == [2]
    assert [call["payload"]["page"] for call in renders] == [0, 1, 2]
    assert (bundle.format, bundle.mime, bundle.filename) == ("zip", "application/zip", "Spring Sale.zip")
    archive = zipfile.ZipFile(io.BytesIO(bundle.data))
    assert archive.namelist() == list(bundle.filenames) == [f"Spring Sale - page {n}.webp" for n in (1, 2, 3)]
    assert all(info.compress_type == zipfile.ZIP_STORED for info in archive.infolist())
    assert [archive.read(name) for name in archive.namelist()] == [image.data for image in bundle.images]
    assert opened(archive.read("Spring Sale - page 2.webp")).format == "WEBP"


@pytest.mark.parametrize(
    ("style", "pattern"),
    [("simple", "{title} - page {n}.png"), ("structured", "{slug}_400x200_p0{n}.png")],
)
def test_a_long_title_still_gives_every_page_its_own_file(user, renders, style, pattern):
    import zipfile

    title = ("Quarterly results for the northern region " * 3)[:100]
    assert len(title) == 100
    design = make_design(user, title=title, document=make_doc(pages=3, width=400, height=200))
    bundle = services.export_images(design, pages="all", filename_style=style)
    names = zipfile.ZipFile(io.BytesIO(bundle.data)).namelist()
    assert len(names) == len(set(names)) == 3
    expected = [pattern.format(title=title[:71].strip(), slug=slug(title), n=n) for n in (1, 2, 3)]
    assert names == list(bundle.filenames) == expected


def test_one_page_is_its_own_file(design, renders, settings):
    settings.EXPORT_FILENAME_STYLE = "structured"
    charged = []
    bundle = services.export_images(design, pages=[1], charge=charged.append)
    assert charged == [] and bundle.format == "png" and bundle.data == drawn_png()
    assert bundle.filename == "design_400x200_p02.png" and bundle.images[0].page_index == 1


def test_warnings_of_several_pages_name_the_page(user, monkeypatch):
    monkeypatch.setattr(
        services,
        "render_image",
        lambda payload, render_url: RenderResult(
            data=drawn_png(), mime="image/png", placeholders=1, page_index=payload["page"]
        ),
    )
    bundle = services.export_images(make_design(user, document=make_doc(pages=2)), pages="all")
    assert bundle.placeholders == 2
    assert [w.split(":")[0] for w in bundle.warnings] == ["Page 1", "Page 2"]


@pytest.mark.parametrize(
    ("options", "code"),
    [
        ({"format": "avif"}, "format_unavailable"),
        ({"size": "9000w"}, "invalid_size"),
        ({"size": "big"}, "invalid_size"),
        ({"scale": 2}, "too_large"),
        ({"optimize": "tinypng"}, "optimizer_unavailable"),
        ({"quality": 0}, "invalid_quality"),
    ],
)
def test_options_are_checked_for_every_page_before_the_extra_pages_are_charged(
    user, renders, monkeypatch, settings, options, code
):
    monkeypatch.setattr(services.features, "check", lambda feature: feature != "avif")
    settings.EXPORT_IMAGE_MAX_PIXELS = 400 * 200 * 4
    document = make_doc(pages=3, width=400, height=200)
    document["pages"][2] |= {"width": 800, "height": 400}  # only the last page is too large at 2x
    charged = []
    with pytest.raises(InvalidExport) as raised:
        services.export_images(
            make_design(user, document=document), pages="all", charge=charged.append, **options
        )
    assert raised.value.get_codes() == code
    assert charged == [] and renders == []


def test_a_design_too_large_to_draw_is_refused_before_the_extra_pages_are_charged(design, renders, settings):
    settings.EXPORT_IMAGE_MAX_DOCUMENT_BYTES = 100
    charged = []
    with pytest.raises(PayloadTooLarge):
        services.export_images(design, pages="all", charge=charged.append)
    assert charged == [] and renders == []


def test_bad_pages_are_refused_before_anything_is_drawn(design, renders):
    with pytest.raises(InvalidExport):
        services.export_images(design, pages=[0, 7])
    assert renders == []


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


# ---- optimizing --------------------------------------------------------------------------------


@pytest.fixture
def optimizer(monkeypatch) -> FakeOptimizer:
    fake = FakeOptimizer()
    monkeypatch.setitem(optimizers.OPTIMIZERS, "builtin", fake)
    return fake


def test_optimize_makes_the_file_smaller_after_converting_it(design, renders, optimizer):
    plain = services.export_image(design, format="webp", quality=80)
    result = services.export_image(design, format="webp", quality=80, optimize=True)
    (job,) = optimizer.jobs
    assert (job.format, job.quality, job.width, job.height) == ("webp", 80, 40, 20)
    assert job.data == plain.data and job.source == drawn_png()
    assert len(result.data) < len(plain.data)
    assert result.options_used | {"optimizer": "builtin", "optimized": True} == result.options_used
    assert result.options_used["bytes_before_optimizing"] == len(plain.data)
    assert "optimizer" not in plain.options_used
    assert opened(result.data).size == (40, 20)


def test_converting_and_optimizing_hold_the_render_slot(design, renders, optimizer, monkeypatch):
    held = []

    def shrink(job, deadline):
        try:
            with render_slot(design.owner_id):
                held.append(False)
        except ExportBusy:
            held.append(True)
        return job.data

    monkeypatch.setattr(optimizer, "shrink", shrink)
    services.export_image(design, format="webp", optimize=True)
    assert held == [True]


def test_an_optimizer_by_id_and_a_failing_one_keeps_the_export(design, renders, monkeypatch, settings):
    settings.IMAGE_OPTIMIZERS = ["builtin", "custom"]
    monkeypatch.setitem(optimizers.OPTIMIZERS, "custom", FakeOptimizer("custom", "Ours", fail=True))
    result = services.export_image(design, format="png", optimize="custom")
    assert result.data and not result.options_used["optimized"]
    assert result.warnings == (
        "Ours could not optimize the file (the service answered 503); it is not optimized.",
    )


def test_an_unknown_optimizer_is_refused_before_anything_is_drawn(design, renders, optimizer):
    with pytest.raises(InvalidExport) as raised:
        services.export_image(design, optimize="tinypng")
    assert raised.value.detail.code == "optimizer_unavailable"
    assert renders == []


def test_optimize_true_on_a_server_without_optimizers_is_a_warning(design, renders, settings):
    settings.IMAGE_OPTIMIZERS = []
    result = services.export_image(design, optimize=True)
    assert result.warnings == ("No image optimizer is set up on this server; the file is not optimized.",)


def test_a_max_bytes_warning_goes_when_the_optimized_file_fits(design, renders, optimizer):
    plain = services.export_image(design, format="png")
    result = services.export_image(design, format="png", max_bytes=len(plain.data) - 1, optimize=True)
    assert len(result.data) < len(plain.data) and result.warnings == ()
