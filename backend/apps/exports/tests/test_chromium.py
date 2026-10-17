"""End-to-end tests with the real headless Chromium (skipped when no browser is installed)."""

import io
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pypdf
import pytest
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image

from apps.exports import services
from apps.exports.exceptions import ExportTimeout, ExportUnavailable
from apps.exports.layout import PX_PER_MM
from apps.exports.renderer import render_image, render_pdf
from apps.exports.services import ExportRequest, export_image
from apps.fonts.models import FontFamily, FontVariant

from .conftest import requires_chromium
from .helpers import PNG_RED_10X10, RenderSite, build_test_font, payload, svg_page

pytestmark = [requires_chromium, pytest.mark.chromium]

URL = "/api/v1/exports/pdf/"
PT = 0.75  # one CSS px in PDF points
PT_PER_MM = PX_PER_MM * PT


def post(client, pages, **fields):
    return client.post(URL, payload(pages, **fields), format="multipart")


def reader(response_or_bytes) -> pypdf.PdfReader:
    data = response_or_bytes if isinstance(response_or_bytes, bytes) else response_or_bytes.content
    return pypdf.PdfReader(io.BytesIO(data))


def sizes_px(pdf: pypdf.PdfReader) -> list[tuple[float, float]]:
    return [(float(p.mediabox.width) / PT, float(p.mediabox.height) / PT) for p in pdf.pages]


def raster(pdf_bytes: bytes, tmp_path, dpi=96) -> list[Image.Image]:
    if shutil.which("pdftoppm") is None:
        pytest.skip("pdftoppm (poppler) is not installed")
    source = tmp_path / "out.pdf"
    source.write_bytes(pdf_bytes)
    subprocess.run(["pdftoppm", "-r", str(dpi), "-png", str(source), str(tmp_path / "page")], check=True)
    return [Image.open(path).convert("RGB") for path in sorted(tmp_path.glob("page-*.png"))]


def all_text(pdf: pypdf.PdfReader) -> str:
    return "\n".join(page.extract_text() for page in pdf.pages)


# ---- the happy path ------------------------------------------------------------------------


def test_two_page_pdf_has_two_pages_of_the_requested_size(client, chromium):
    response = post(
        client, [svg_page(400, 300), svg_page(400, 300, fill="#aa3333")], width=400, height=300, title="Deck"
    )
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    pdf = reader(response)
    assert len(pdf.pages) == 2
    for width, height in sizes_px(pdf):
        assert width == pytest.approx(400, abs=0.5) and height == pytest.approx(300, abs=0.5)
    assert pdf.metadata.title == "Deck"


@pytest.mark.parametrize("count", [1, 3, 7])
def test_page_count_matches_the_upload_count(client, chromium, count):
    pdf = reader(
        post(
            client,
            [svg_page(300, 200, fill=f"#{i * 20:02x}2030") for i in range(count)],
            width=300,
            height=200,
        )
    )
    assert len(pdf.pages) == count


def test_bleed_and_crop_marks_grow_the_page(client, chromium):
    response = post(client, [svg_page(500, 300)] * 3, width=500, height=300, bleed_mm=3, crop_marks="true")
    pdf = reader(response)
    margin = (3 + 6) * PX_PER_MM
    assert len(pdf.pages) == 3
    for width, height in sizes_px(pdf):
        assert width == pytest.approx(500 + 2 * margin, abs=0.6)
        assert height == pytest.approx(300 + 2 * margin, abs=0.6)


def test_bleed_without_marks(client, chromium):
    pdf = reader(post(client, [svg_page(500, 300)] * 2, width=500, height=300, bleed_mm=2.5))
    assert len(pdf.pages) == 2
    for width, _height in sizes_px(pdf):
        assert width == pytest.approx(500 + 2 * 2.5 * PX_PER_MM, abs=0.6)


def test_fractional_page_sizes_do_not_spill_onto_extra_pages(client, chromium):
    pdf = reader(post(client, [svg_page(793.7, 1122.5)] * 4, width=793.7, height=1122.5, bleed_mm=1.5))
    assert len(pdf.pages) == 4


def test_the_maximum_page_count(client, chromium):
    pdf = reader(post(client, [svg_page(60, 40)] * 100, width=60, height=40))
    assert len(pdf.pages) == 100


def test_the_maximum_page_size(client, chromium):
    pdf = reader(post(client, [svg_page(2000, 2000)], width=20000, height=20000))
    assert len(pdf.pages) == 1
    assert sizes_px(pdf)[0][0] == pytest.approx(20000, abs=1)


def test_vector_text_stays_text(client, chromium):
    text = '<text x="20" y="60" font-size="40" font-family="serif" fill="#000">Quarterly report</text>'
    pdf = reader(post(client, [svg_page(500, 120, extra=text)], width=500, height=120))
    assert "Quarterly report" in all_text(pdf)


def test_artwork_is_rendered_and_pages_stay_isolated(client, chromium, tmp_path):
    """Ids, classes and <style> rules reused by different pages must not leak between them."""

    def page(colour):
        return (
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">'
            f"<style>.fill{{fill:{colour}}}</style>"
            '<defs><clipPath id="c"><rect width="100" height="100"/></clipPath></defs>'
            '<rect class="fill" width="100" height="100" clip-path="url(#c)"/></svg>'
        ).encode()

    response = post(client, [page("#ff0000"), page("#0000ff")], width=100, height=100)
    first, second = raster(response.content, tmp_path)
    assert first.getpixel((50, 50)) == (255, 0, 0)
    assert second.getpixel((50, 50)) == (0, 0, 255)


@pytest.mark.parametrize("href", ["href", "xlink:href"])
def test_internal_references_survive_inlining(client, chromium, tmp_path, href):
    page = (
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100" '
        'viewBox="0 0 100 100"><defs><symbol id="s" viewBox="0 0 10 10"><rect width="10" height="10" fill="#00ff00"/>'
        f'</symbol></defs><use {href}="#s" width="100" height="100"/></svg>'
    ).encode()
    (rendered,) = raster(post(client, [page], width=100, height=100).content, tmp_path)
    assert rendered.getpixel((50, 50)) == (0, 255, 0)


def test_bleed_extends_the_artwork_to_the_page_edge(client, chromium, tmp_path):
    response = post(client, [svg_page(200, 200, fill="#00ff00")], width=200, height=200, bleed_mm=3)
    (page,) = raster(response.content, tmp_path)
    assert page.getpixel((1, 1)) == (0, 255, 0)
    assert page.getpixel((page.width - 2, page.height - 2)) == (0, 255, 0)


def test_crop_marks_are_drawn_outside_the_artwork(client, chromium, tmp_path):
    response = post(
        client, [svg_page(200, 200, fill="#ffffff")], width=200, height=200, bleed_mm=3, crop_marks="true"
    )
    (page,) = raster(response.content, tmp_path)
    dark = [(x, y) for x in range(page.width) for y in range(page.height) if sum(page.getpixel((x, y))) < 200]
    assert dark, "no crop marks were rendered"
    slug = 6 * PX_PER_MM
    assert all(
        x < slug + 1 or x > page.width - slug - 1 or y < slug + 1 or y > page.height - slug - 1
        for x, y in dark
    )


def test_embedded_raster_images_are_kept(client, chromium):
    import base64

    image = f'<image width="100" height="100" href="data:image/png;base64,{base64.b64encode(PNG_RED_10X10).decode()}"/>'
    pdf = reader(post(client, [svg_page(100, 100, extra=image)], width=100, height=100))
    assert len(pdf.pages[0].images) >= 1


def test_custom_fonts_are_embedded_from_media_storage(client, chromium, db):
    name = default_storage.save("fonts/e2e-test.ttf", ContentFile(build_test_font()))
    try:
        text = '<text x="10" y="80" font-size="80" font-family="\'Doory Test Sans\', serif">A</text>'
        fonts = json.dumps([{"family": "Doory Test Sans", "url": f"/media/{name}"}])
        pdf = reader(post(client, [svg_page(200, 120, extra=text)], width=200, height=120, fonts=fonts))
    finally:
        default_storage.delete(name)
    names = set()
    for page in pdf.pages:
        for font in page["/Resources"].get("/Font", {}).values():
            names.add(str(font.get_object().get("/BaseFont")))
    assert any("DooryTestSans" in name for name in names), names


def test_without_the_font_the_custom_family_falls_back(client, chromium):
    text = '<text x="10" y="80" font-size="80" font-family="\'Doory Test Sans\', serif">A</text>'
    pdf = reader(post(client, [svg_page(200, 120, extra=text)], width=200, height=120))
    names = {
        str(font.get_object().get("/BaseFont"))
        for p in pdf.pages
        for font in p["/Resources"].get("/Font", {}).values()
    }
    assert not any("DooryTestSans" in name for name in names)


# ---- pages of different sizes, print boxes -----------------------------------------------------


def box_mm(rect) -> list[float]:
    return [float(v) / PT_PER_MM for v in rect]


def media_px(pdf: pypdf.PdfReader) -> list[tuple[float, float]]:
    return [(float(p.mediabox.width) / PT, float(p.mediabox.height) / PT) for p in pdf.pages]


MIXED = [(1080, 1080), (794, 1123), (336, 192)]


def mixed_pages():
    return [
        svg_page(w, h, fill=colour)
        for (w, h), colour in zip(MIXED, ("#cc2222", "#22aa22", "#2222cc"), strict=True)
    ]


def post_mixed(client, **fields):
    sizes = json.dumps([{"width": w, "height": h} for w, h in MIXED])
    return post(client, mixed_pages(), width=MIXED[0][0], height=MIXED[0][1], sizes=sizes, **fields)


def test_every_page_has_a_media_box_of_exactly_its_own_size(client, chromium):
    pdf = reader(post_mixed(client))
    assert len(pdf.pages) == 3
    for (width, height), expected in zip(media_px(pdf), MIXED, strict=True):
        assert width == pytest.approx(expected[0], abs=0.01) and height == pytest.approx(
            expected[1], abs=0.01
        )
    assert all("/TrimBox" not in page for page in pdf.pages)


def test_mixed_sizes_with_bleed_and_marks_get_trim_and_bleed_boxes_per_page(client, chromium):
    pdf = reader(post_mixed(client, bleed_mm=3, crop_marks="true"))
    assert len(pdf.pages) == 3
    for page, (width, height) in zip(pdf.pages, MIXED, strict=True):
        media, bleed, trim = (box_mm(r) for r in (page.mediabox, page.bleedbox, page.trimbox))
        assert [media[2] - media[0], media[3] - media[1]] == pytest.approx(
            [width / PX_PER_MM + 18, height / PX_PER_MM + 18], abs=0.01
        )
        # the slug (6 mm, where the marks are) lies between the media box and the bleed box on every side
        assert [bleed[0] - media[0], bleed[1] - media[1], media[2] - bleed[2], media[3] - bleed[3]] == (
            pytest.approx([6, 6, 6, 6], abs=0.01)
        )
        # the bleed (3 mm) lies between the bleed box and the trim box
        assert [trim[0] - bleed[0], trim[1] - bleed[1], bleed[2] - trim[2], bleed[3] - trim[3]] == (
            pytest.approx([3, 3, 3, 3], abs=0.01)
        )
        assert trim[2] - trim[0] == pytest.approx(width / PX_PER_MM, abs=0.01)
        assert trim[3] - trim[1] == pytest.approx(height / PX_PER_MM, abs=0.01)


def test_each_page_gets_its_bleed_without_marks_or_marks_without_bleed(client, chromium):
    only_bleed = reader(post_mixed(client, bleed_mm=2))
    for page, (width, _height) in zip(only_bleed.pages, MIXED, strict=True):
        assert box_mm(page.bleedbox) == pytest.approx(box_mm(page.mediabox), abs=1e-3)
        assert float(page.trimbox.width) / PT_PER_MM == pytest.approx(width / PX_PER_MM, abs=0.01)
    only_marks = reader(post_mixed(client, crop_marks="true"))
    for page in only_marks.pages:
        assert box_mm(page.trimbox) == pytest.approx(box_mm(page.bleedbox), abs=1e-3)
        assert float(page.trimbox.left) / PT_PER_MM == pytest.approx(6, abs=0.01)


def test_without_sizes_every_page_has_the_size_of_width_and_height(client, chromium):
    pdf = reader(post(client, mixed_pages(), width=500, height=250))
    for width, height in media_px(pdf):
        assert (width, height) == (pytest.approx(500, abs=0.01), pytest.approx(250, abs=0.01))


@pytest.mark.parametrize("sizes", [[(1, 1)], [(20000, 1), (1, 20000)], [(20000, 20000), (3, 3)]])
def test_extreme_page_sizes_keep_their_exact_boxes(client, chromium, sizes):
    pages = [svg_page(w, h) for w, h in sizes]
    response = post(
        client,
        pages,
        width=sizes[0][0],
        height=sizes[0][1],
        sizes=json.dumps([{"width": w, "height": h} for w, h in sizes]),
        bleed_mm=2,
        crop_marks="true",
    )
    pdf = reader(response)
    assert len(pdf.pages) == len(sizes)
    for page, (width, height) in zip(pdf.pages, sizes, strict=True):
        assert float(page.trimbox.width) == pytest.approx(width * PT, abs=0.01)
        assert float(page.trimbox.height) == pytest.approx(height * PT, abs=0.01)
        assert float(page.mediabox.width) == pytest.approx((width + 2 * 8 * PX_PER_MM) * PT, abs=0.01)


def test_the_same_size_twice_in_a_row_and_apart(client, chromium):
    sizes = [(300, 200), (300, 200), (150, 150), (300, 200)]
    pages = [svg_page(w, h) for w, h in sizes]
    response = post(
        client, pages, width=300, height=200, sizes=json.dumps([{"width": w, "height": h} for w, h in sizes])
    )
    assert [tuple(round(v) for v in size) for size in media_px(reader(response))] == sizes


def test_the_artwork_fills_the_page_box_to_the_last_pixel(client, chromium, tmp_path):
    """794 x 1123 px is not a whole number of points: the sheet is larger, the box is cut back, no white strip."""
    page = svg_page(794, 1123, fill="#00ff00")
    response = post(client, [page], width=794, height=1123, sizes='[{"width": 794, "height": 1123}]')
    (image,) = raster(response.content, tmp_path, dpi=300)
    assert image.width == pytest.approx(794 / 96 * 300, abs=1) and image.height == pytest.approx(
        1123 / 96 * 300, abs=1
    )
    for point in ((0, 0), (image.width - 2, 0), (0, image.height - 2), (image.width - 2, image.height - 2)):
        assert image.getpixel(point) == (0, 255, 0), point


def test_every_page_of_a_mixed_design_gets_bleed_and_marks_of_its_own_size(client, chromium, tmp_path):
    response = post_mixed(client, bleed_mm=3, crop_marks="true")
    images = raster(response.content, tmp_path, dpi=96)
    bleed, slug = 3 * PX_PER_MM, 6 * PX_PER_MM
    for image, (width, height), colour in zip(
        images, MIXED, [(204, 34, 34), (34, 170, 34), (34, 34, 204)], strict=True
    ):
        assert image.width == pytest.approx(width + 2 * (bleed + slug), abs=1)
        assert image.height == pytest.approx(height + 2 * (bleed + slug), abs=1)
        assert image.getpixel((int(slug) + 3, int(slug) + 3)) == colour  # the bleed carries the artwork
        assert image.getpixel((image.width // 2, image.height // 2)) == colour
        assert image.getpixel((2, 2)) == (255, 255, 255)  # the slug is white
        trim_top = int(slug + bleed)
        row = [image.getpixel((x, trim_top)) for x in range(int(slug * 0.2), int(slug * 0.8))]
        assert any(sum(pixel) < 300 for pixel in row), "no crop mark at the trim line of this page"


def test_document_information(client, chromium):
    pdf = reader(post(client, [svg_page()], title="Menu card", lang="de-CH"))
    assert pdf.metadata.title == "Menu card"
    assert pdf.metadata.creator == "Doory"
    assert pdf.trailer["/Root"]["/Lang"] == "de-CH"
    assert reader(post(client, [svg_page()])).trailer["/Root"]["/Lang"] == "en"


def test_text_is_text_and_every_font_is_embedded(client, chromium, db):
    name = default_storage.save("fonts/e2e-embed.ttf", ContentFile(build_test_font()))
    try:
        text = (
            '<text x="10" y="80" font-size="60" font-family="\'Doory Test Sans\', serif">A</text>'
            '<text x="10" y="150" font-size="30" font-family="serif">Searchable words</text>'
        )
        fonts = json.dumps([{"family": "Doory Test Sans", "url": f"/media/{name}"}])
        pdf = reader(post(client, [svg_page(300, 200, extra=text)], width=300, height=200, fonts=fonts))
    finally:
        default_storage.delete(name)
    assert "Searchable words" in all_text(pdf)
    custom = other = 0
    for page in pdf.pages:
        for font in page["/Resources"].get("/Font", {}).values():
            font = font.get_object()
            descendant = font["/DescendantFonts"][0].get_object() if "/DescendantFonts" in font else font
            if font.get("/Subtype") == "/Type3":
                # Chromium writes fonts with CFF outlines (some system .otf files) as glyph procedures: still vector,
                # still searchable through the ToUnicode map, but not a font file. Which fonts the machine has decides.
                assert "/ToUnicode" in font
                other += 1
                continue
            descriptor = descendant["/FontDescriptor"].get_object()
            assert {"/FontFile", "/FontFile2", "/FontFile3"} & set(descriptor), descriptor
            if "DooryTestSans" in str(descendant.get("/BaseFont")):
                assert "/FontFile2" in descriptor  # the font we sent, as a TrueType subset
                custom += 1
            else:
                other += 1
    assert custom == 1
    assert other >= 1


# ---- hyperlinks ------------------------------------------------------------------------------------


def links_of(pdf: pypdf.PdfReader) -> list[list[tuple[str, list[float]]]]:
    found = []
    for page in pdf.pages:
        items = []
        for annotation in page.get("/Annots", []):
            annotation = annotation.get_object()
            if annotation.get("/Subtype") == "/Link":
                items.append((str(annotation["/A"]["/URI"]), [float(v) for v in annotation["/Rect"]]))
        found.append(items)
    return found


def linked_page(width=400, height=300):
    extra = (
        '<a href="https://example.com/offer?a=1&amp;b=2"><rect x="50" y="40" width="100" height="60" fill="#f00"/></a>'
        '<a xlink:href="mailto:hi@example.com"><text x="200" y="100" font-size="24">Mail us</text></a>'
    )
    return svg_page(width, height, extra=extra).replace(
        b"<svg ", b'<svg xmlns:xlink="http://www.w3.org/1999/xlink" ', 1
    )


def test_links_become_clickable_pdf_annotations(client, chromium):
    pdf = reader(post(client, [linked_page(), linked_page()], width=400, height=300))
    for page, items in zip(pdf.pages, links_of(pdf), strict=True):
        assert [uri for uri, _ in items] == ["https://example.com/offer?a=1&b=2", "mailto:hi@example.com"]
        _, (x0, y0, x1, y1) = items[0]
        top = float(page.mediabox.top)
        # the rectangle of the 100 x 60 px shape at (50, 40), measured from the page's top left corner in points
        assert (x0, x1) == (pytest.approx(50 * PT, abs=0.6), pytest.approx(150 * PT, abs=0.6))
        assert (top - y1, top - y0) == (pytest.approx(40 * PT, abs=0.6), pytest.approx(100 * PT, abs=0.6))


def test_the_link_rectangle_moves_with_the_bleed(client, chromium):
    """The editor's pages already contain the bleed (see the API docs): a page 1:1 with a margin of its own."""
    bleed = 3 * PX_PER_MM
    inner = linked_page()
    page = inner.replace(
        b'width="400" height="300" viewBox="0 0 400 300"',
        (
            f'width="{400 + 2 * bleed}" height="{300 + 2 * bleed}" viewBox="{-bleed} {-bleed} {400 + 2 * bleed} {300 + 2 * bleed}"'
        ).encode(),
    )
    pdf = reader(post(client, [page], width=400, height=300, bleed_mm=3))
    (items,) = links_of(pdf)
    top = float(pdf.pages[0].mediabox.top)
    _, (x0, _y0, x1, y1) = items[0]
    # 1:1: the link keeps its place relative to the trim box, which starts one bleed in
    assert x0 == pytest.approx((bleed + 50) * PT, abs=0.6)
    assert top - y1 == pytest.approx((bleed + 40) * PT, abs=0.6)
    assert x1 - x0 == pytest.approx(100 * PT, abs=0.6)


@pytest.mark.parametrize(
    "href",
    [
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        "java&#9;script:alert(1)",
        "data:text/html;base64,PGgxPng8L2gxPg==",
        "file:///etc/passwd",
        "vbscript:x",
        "//evil.example/",
        "relative/path",
        "#internal",
        "http://user:pw@example.com/",
        "ftp://example.com/",
        "tel:+1555",
    ],
)
def test_unsafe_link_targets_never_reach_the_pdf(client, chromium, href):
    page = svg_page(
        200, 100, extra=f'<a href="{href}"><rect x="10" y="10" width="50" height="50" fill="#f00"/></a>'
    )
    response = post(client, [page], width=200, height=100)
    assert response.status_code == 200
    pdf = reader(response)
    assert links_of(pdf) == [[]]
    raw = response.content
    for needle in (b"/JavaScript", b"/Launch", b"/URI", b"evil.example", b"alert"):
        assert needle not in raw, needle


def test_all_link_schemes_in_one_design(client, chromium):
    safe = [
        ("https://example.com/", 10),
        ("http://example.com/", 60),
        ("mailto:me@example.com", 110),
    ]
    links = "".join(
        f'<a href="{url}"><rect x="{x}" y="10" width="40" height="40" fill="#00f"/></a>' for url, x in safe
    )
    links += '<a href="javascript:alert(1)"><rect x="160" y="10" width="40" height="40" fill="#f00"/></a>'
    pdf = reader(post(client, [svg_page(240, 100, extra=links)], width=240, height=100))
    assert [uri for uri, _ in links_of(pdf)[0]] == [url for url, _ in safe]


# ---- hostile input -------------------------------------------------------------------------


def hostile_page(canary_origin: str) -> bytes:
    return svg_page(
        200,
        100,
        fill="#00aa00",
        extra=(
            '<script>document.documentElement.setAttribute("data-pwned","1")</script>'
            f'<image href="{canary_origin}/media/track.png" width="10" height="10"/>'
            '<image href="file:///etc/passwd" x="10" width="50" height="50"/>'
            '<image href="http://169.254.169.254/latest/meta-data/" x="60" width="10" height="10"/>'
            '<foreignObject width="100" height="100"><iframe xmlns="http://www.w3.org/1999/xhtml" src="file:///etc/passwd"/></foreignObject>'
            f'<rect width="5" height="5" onload="fetch(\'{canary_origin}/onload\')" style="fill:url({canary_origin}/css)"/>'
            f"<style>@import url({canary_origin}/import.css); rect{{stroke:red}}</style>"
            '<text x="10" y="90" font-size="14" font-family="serif">visible text</text>'
        ),
    )


def test_malicious_svg_is_neutralised_end_to_end(client, chromium, canary, settings, tmp_path):
    settings.EXPORT_ALLOWED_ORIGINS = [canary.origin]  # even a reachable, allow-listed server must not be hit
    response = post(client, [hostile_page(canary.origin)], width=200, height=100)
    assert response.status_code == 200
    pdf = reader(response)
    assert len(pdf.pages) == 1
    text = all_text(pdf)
    assert "root:" not in text and "/bin/" not in text
    assert "visible text" in text
    assert canary.hits == []
    (page,) = raster(response.content, tmp_path)
    assert page.getpixel((150, 30)) == (0, 170, 0)  # the safe artwork still renders


def test_blocked_requests_are_counted_when_the_sanitiser_is_bypassed(chromium, canary, monkeypatch, settings):
    """Defence in depth: even unsanitised markup cannot reach the network or the filesystem."""
    monkeypatch.setattr(services, "sanitize_pages", lambda pages: list(pages))
    settings.EXPORT_ALLOWED_ORIGINS = [canary.origin]
    page = (
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100">'
        '<rect width="200" height="100" fill="#00aa00"/>'
        '<image xlink:href="http://169.254.169.254/latest/meta-data/" width="10" height="10"/>'
        '<image xlink:href="http://evil.example/track.png" width="10" height="10"/>'
        f'<image xlink:href="{canary.origin}/admin/login/" width="10" height="10"/>'
        f'<image xlink:href="{canary.origin}/media/../admin/" width="10" height="10"/>'
        '<image xlink:href="file:///etc/passwd" width="10" height="10"/>'
        '<script>fetch("http://evil.example/js")</script>'
        "</svg>"
    ).encode()
    result = services.export_pdf(ExportRequest(pages=[page], width=200, height=100))
    assert result.pdf.startswith(b"%PDF-")
    assert result.blocked_total >= 2
    reasons = {b.reason for b in result.blocked}
    assert "origin" in reasons
    assert canary.hits == []


def test_javascript_never_runs_while_printing(chromium):
    html = (
        "<!doctype html><html><body><p>static text</p>"
        "<script>document.body.appendChild(document.createTextNode('SCRIPT RAN'))</script>"
        '<svg xmlns="http://www.w3.org/2000/svg" onload="document.title=\'SCRIPT RAN\'"><rect/></svg>'
        '<img src="x" onerror="document.body.appendChild(document.createTextNode(\'ONERROR RAN\'))">'
        "</body></html>"
    )
    pdf = reader(render_pdf(html, width_px=400, height_px=300).pdf)
    text = all_text(pdf)
    assert "static text" in text
    assert "SCRIPT RAN" not in text and "ONERROR RAN" not in text
    assert "SCRIPT RAN" not in (pdf.metadata.title or "")


def test_same_origin_media_is_fetched_but_only_under_the_allowed_prefixes(chromium, canary, settings):
    settings.EXPORT_ALLOWED_ORIGINS = [canary.origin]
    html = (
        "<!doctype html><html><body>"
        f'<img src="{canary.origin}/media/pixel.png" width="10" height="10">'
        f'<img src="{canary.origin}/secret/pixel.png" width="10" height="10">'
        "</body></html>"
    )
    result = render_pdf(html, width_px=200, height_px=100)
    assert canary.hits == ["/media/pixel.png"]
    assert result.allowed_total == 1
    assert [(b.reason, b.url.endswith("/secret/pixel.png")) for b in result.blocked] == [("path", True)]
    assert len(reader(result.pdf).pages[0].images) == 1


def test_redirects_from_allowed_urls_are_not_followed(chromium, canary, settings):
    settings.EXPORT_ALLOWED_ORIGINS = [canary.origin]
    html = f'<!doctype html><html><body><img src="{canary.origin}/media/redirect.png" width="10" height="10"></body></html>'
    result = render_pdf(html, width_px=200, height_px=100)
    assert canary.hits == ["/media/redirect.png"]  # the redirect target was never requested
    assert [b.reason for b in result.blocked] == ["redirect"]


def test_other_hosts_and_ports_are_unreachable(chromium, canary, settings):
    settings.EXPORT_ALLOWED_ORIGINS = ["http://127.0.0.1:1"]
    html = f'<!doctype html><html><body><img src="{canary.origin}/media/pixel.png"></body></html>'
    result = render_pdf(html, width_px=200, height_px=100)
    assert canary.hits == []
    assert [b.reason for b in result.blocked] == ["origin"]


def test_local_files_cannot_be_read(chromium, tmp_path):
    secret = tmp_path / "secret.txt"
    secret.write_text("TOP-SECRET-CONTENT")
    html = (
        "<!doctype html><html><body>"
        f'<img src="file://{secret}"><iframe src="file://{secret}"></iframe><object data="file://{secret}"></object>'
        "<p>page body</p></body></html>"
    )
    pdf = reader(render_pdf(html, width_px=300, height_px=200).pdf)
    assert "TOP-SECRET-CONTENT" not in all_text(pdf)
    assert "page body" in all_text(pdf)


def test_hostile_fonts_cannot_pull_remote_resources(chromium, canary, settings):
    settings.EXPORT_ALLOWED_ORIGINS = [canary.origin]
    html = (
        f'<!doctype html><html><head><style>@font-face{{font-family:X;src:url("http://evil.example/f.woff2")}}'
        f"@font-face{{font-family:Y;src:url({canary.origin}/secret/f.woff2)}}"
        "p{font-family:X,Y,serif}</style></head><body><p>text</p></body></html>"
    )
    result = render_pdf(html, width_px=200, height_px=100)
    assert canary.hits == []
    assert result.blocked_total >= 1


# ---- deadlines and availability ---------------------------------------------------------------


def test_a_stalled_resource_hits_the_deadline(chromium, canary, settings):
    settings.EXPORT_ALLOWED_ORIGINS = [canary.origin]
    settings.EXPORT_TIMEOUT_SECONDS = 2
    html = f'<!doctype html><html><body><img src="{canary.origin}/media/slow.png"></body></html>'
    with pytest.raises(ExportTimeout):
        render_pdf(html, width_px=200, height_px=100)


def test_no_browser_profiles_are_left_behind_even_when_the_worker_is_killed(
    chromium, canary, settings, monkeypatch, work_root
):
    """The render's work directory is the whole footprint: the browser profile lives inside it (the worker's
    TMPDIR) and goes with it. The directory root is private to this test, so nothing else can add to it."""
    from apps.exports import renderer

    root = work_root
    assert list(root.iterdir()) == []

    render_pdf("<p>ok</p>", width_px=50, height_px=50)
    assert list(root.iterdir()) == []

    settings.EXPORT_ALLOWED_ORIGINS = [canary.origin]
    settings.EXPORT_TIMEOUT_SECONDS = 3
    monkeypatch.setattr(renderer, "KILL_GRACE_SECONDS", -1.5)  # the parent kills the stuck worker first
    with pytest.raises(ExportTimeout):
        render_pdf(f'<img src="{canary.origin}/media/slow.png">', width_px=50, height_px=50)
    assert list(root.iterdir()) == []


def test_the_browser_profile_is_created_inside_the_work_directory(tmp_path):
    """What the test above relies on: Chromium's profile goes to the worker's TMPDIR, which is the work directory."""
    from apps.exports import renderer

    env = renderer._worker_env(tmp_path)
    assert env["TMPDIR"] == str(tmp_path)
    assert not {"DJANGO_SECRET_KEY", "DATABASE_URL"} & env.keys()


def test_work_directories_are_made_under_the_configured_root(settings, work_root):
    from apps.exports import renderer

    settings.EXPORT_WORK_DIR = str(work_root / "nested")
    first, second = renderer._new_workdir(), renderer._new_workdir()
    assert first.parent == second.parent == work_root / "nested"
    assert first != second
    assert first.name.startswith("doory-export-")


def test_a_work_root_too_deep_for_chromium_is_reported_instead_of_failing_obscurely(settings, tmp_path):
    from apps.exports import renderer

    root = tmp_path.joinpath(*["deeper"] * 12)
    settings.EXPORT_WORK_DIR = str(root)
    with pytest.raises(ExportUnavailable):
        render_pdf("<p>x</p>", width_px=10, height_px=10)
    assert list(root.iterdir()) == []
    assert len(str(root)) > renderer.MAX_WORKDIR_CHARS


def test_without_a_configured_root_the_system_temp_directory_is_used(settings):
    import tempfile

    from apps.exports import renderer

    settings.EXPORT_WORK_DIR = ""
    workdir = renderer._new_workdir()
    try:
        assert workdir.parent == Path(tempfile.gettempdir())
    finally:
        workdir.rmdir()


def test_timeouts_surface_as_504_through_the_api(client, chromium, canary, settings, monkeypatch):
    settings.EXPORT_ALLOWED_ORIGINS = [canary.origin]
    settings.EXPORT_TIMEOUT_SECONDS = 2
    monkeypatch.setattr(services, "sanitize_pages", lambda pages: list(pages))
    page = (
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="50" height="50">'
        f'<image xlink:href="{canary.origin}/media/slow.png" width="10" height="10"/></svg>'
    ).encode()
    response = post(client, [page], width=50, height=50)
    assert response.status_code == 504
    assert response.json()["error"]["code"] == "export_timeout"


def test_a_missing_browser_is_a_clean_503(client, chromium, settings):
    settings.EXPORT_CHROMIUM_PATH = "/nonexistent/chromium"
    response = post(client, [svg_page()], width=400, height=300)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "export_unavailable"
    with pytest.raises(ExportUnavailable):
        render_pdf("<p>x</p>", width_px=10, height_px=10)


def test_sandbox_is_only_disabled_on_request(chromium, settings):
    """With the sandbox on, the root user in this environment cannot start Chromium: proves the flag is honoured."""
    import os

    if os.geteuid() != 0:
        pytest.skip("Chromium's sandbox works for unprivileged users")
    settings.EXPORT_CHROMIUM_NO_SANDBOX = False
    with pytest.raises(ExportUnavailable):
        render_pdf("<p>x</p>", width_px=10, height_px=10)


def test_the_output_is_a_well_formed_pdf(client, chromium):
    response = post(client, [svg_page()], width=400, height=300)
    pdf = reader(response)
    assert re.search(rb"%%EOF\s*$", response.content)
    assert len(pdf.pages) == 1


def test_browser_processes_that_outlive_the_worker_are_killed_with_their_work_directory(tmp_path):
    """Playwright starts Chromium in a process group of its own: killing the worker's group misses it."""
    from apps.exports import renderer

    workdir = tmp_path / "doory-export-leftover"
    workdir.mkdir()
    unrelated = tmp_path / "doory-export-other"
    unrelated.mkdir()
    sleeper = [sys.executable, "-c", "import time; time.sleep(60)"]
    stray = subprocess.Popen([*sleeper, f"--user-data-dir={workdir}/profile"], start_new_session=True)
    bystander = subprocess.Popen([*sleeper, f"--user-data-dir={unrelated}/profile"], start_new_session=True)
    try:
        renderer._kill_browser_leftovers(workdir)
        assert stray.wait(timeout=5) == -9  # SIGKILL
        assert bystander.poll() is None
    finally:
        for process in (stray, bystander):
            process.kill()
            process.wait()


# ---- image export: the frontend's render page in the same locked-down browser -------------------

DIST = Path(__file__).resolve().parents[4] / "frontend" / "dist"
requires_dist = pytest.mark.skipif(
    not (DIST / "render.html").is_file(),
    reason=f"no built frontend at {DIST}; run `npm run build` in frontend/",
)


@pytest.fixture
def render_site(settings, chromium):
    site = RenderSite(DIST, Path(settings.MEDIA_ROOT))
    settings.SERVER_IMAGE_EXPORT_ENABLED = True
    settings.EXPORT_RENDER_PAGE_URL = f"{site.origin}/render.html"
    yield site
    site.close()


def rect(left, top, width, height, fill) -> dict:
    return {
        "id": f"rect-{left}-{top}",
        "type": "rect",
        "left": left,
        "top": top,
        "width": width,
        "height": height,
        "fill": fill,
        "stroke": None,
        "strokeWidth": 0,
        "originX": "left",
        "originY": "top",
    }


def picture(src, left=0, top=0, size=10) -> dict:  # the size of PNG_RED_10X10
    return {
        "id": f"img-{left}",
        "type": "image",
        "src": src,
        "left": left,
        "top": top,
        "width": size,
        "height": size,
        "originX": "left",
        "originY": "top",
    }


def design_of(owner, *objects, width=200, height=100, color="#00ff00"):
    from apps.designs.tests.helpers import make_design

    page = {"id": "p1", "background": {"type": "solid", "color": color}, "objects": list(objects)}
    return make_design(
        owner, document={"schemaVersion": 1, "width": width, "height": height, "unit": "px", "pages": [page]}
    )


def pixel(data: bytes, x: int, y: int) -> tuple:
    return Image.open(io.BytesIO(data)).convert("RGBA").getpixel((x, y))


@requires_dist
def test_a_design_page_is_drawn_with_the_editors_engine(render_site, user):
    design = design_of(user, rect(10, 10, 40, 30, "#ff0000"))
    result = export_image(design)
    assert (result.width, result.height, result.page_id, result.placeholders) == (200, 100, "p1", 0)
    assert pixel(result.data, 20, 20) == (255, 0, 0, 255)
    assert pixel(result.data, 150, 80) == (0, 255, 0, 255)
    assert "/render.html" in render_site.hits and any(hit.startswith("/assets/") for hit in render_site.hits)

    double = export_image(design, scale=2, format="jpg")
    assert (double.width, double.height) == (400, 200)
    image = Image.open(io.BytesIO(double.data))
    assert (image.format, image.mode, image.size) == ("JPEG", "RGB", (400, 200))

    clear = export_image(design, transparent=True, format="webp")
    assert pixel(clear.data, 150, 80)[3] == 0 and pixel(clear.data, 20, 20)[3] == 255


@requires_dist
def test_external_images_are_blocked_like_in_the_pdf_export(render_site, canary, user, settings):
    name = default_storage.save("uploads/e2e-red.png", ContentFile(PNG_RED_10X10))
    try:
        design = design_of(
            user,
            picture(f"/media/{name}", left=0),  # the render page's own origin: allowed
            picture(f"{canary.origin}/media/pixel.png", left=100),  # another origin: blocked
            picture("/api/v1/auth/me/", left=150),  # the render page's origin, outside its paths: blocked
        )
        result = render_image(
            {"document": design.document, "page": 0, "multiplier": 1, "transparent": False, "fonts": []},
            render_url=settings.EXPORT_RENDER_PAGE_URL,
        )
    finally:
        default_storage.delete(name)
    assert canary.hits == []
    assert f"/media/{name}" in render_site.hits and "/api/v1/auth/me/" not in render_site.hits
    reasons = {(b.reason, b.url.split("/", 3)[-1]) for b in result.blocked}
    assert ("origin", "media/pixel.png") in reasons and ("path", "api/v1/auth/me/") in reasons
    assert result.placeholders == 2
    assert pixel(result.data, 5, 5) == (255, 0, 0, 255)  # the allowed picture was drawn


@requires_dist
def test_stand_ins_reach_the_export_result_as_warnings(render_site, canary, user):
    result = export_image(design_of(user, picture(f"{canary.origin}/media/pixel.png")))
    assert result.placeholders == 1 and result.blocked_total >= 1
    assert result.warnings and canary.hits == []


def dark_pixels(data: bytes) -> int:
    image = Image.open(io.BytesIO(data)).convert("L")
    return sum(1 for value in image.getdata() if value < 64)


@requires_dist
def test_fonts_of_the_manifest_are_drawn_and_missing_ones_reported(render_site, user):
    text = {
        "id": "t",
        "type": "textbox",
        "text": "A",
        "left": 10,
        "top": 10,
        "width": 180,
        "height": 90,
        "originX": "left",
        "originY": "top",
        "fontFamily": "'Doory Test Sans', serif",
        "fontSize": 80,
        "fill": "#000000",
        "textAlign": "left",
        "lineHeight": 1,
    }
    design = design_of(user, text, color="#ffffff")
    fallback = export_image(design)
    assert fallback.missing_fonts == ("Doory Test Sans",)

    family = FontFamily.objects.create(family="Doory Test Sans", slug="doory-test-sans", owner=user)
    FontVariant.objects.create(
        family=family, weight=400, format="ttf", file=ContentFile(build_test_font(), name="e2e.ttf")
    )
    drawn = export_image(design)
    assert drawn.missing_fonts == () and drawn.warnings == ()
    # The test font's "A" is a solid 40 x 56 px block at this size; any real font's "A" is mostly white.
    assert dark_pixels(drawn.data) > 1500 > dark_pixels(fallback.data)


@requires_dist
def test_a_page_that_never_becomes_ready_hits_the_deadline(chromium, canary, settings, user):
    settings.EXPORT_TIMEOUT_SECONDS = 3
    settings.SERVER_IMAGE_EXPORT_ENABLED = True
    settings.EXPORT_RENDER_PAGE_URL = f"{canary.origin}/render.html"  # answers, but is not the render page
    with pytest.raises(ExportTimeout):
        export_image(design_of(user))


@requires_dist
def test_the_rest_endpoint_returns_the_drawn_page(client, render_site, user):
    design = design_of(user, rect(10, 10, 40, 30, "#ff0000"))
    response = client.post(f"/api/v1/designs/{design.pk}/export/image/", {"format": "jpg"}, format="json")
    assert response.status_code == 200 and response["Content-Type"] == "image/jpeg"
    image = Image.open(io.BytesIO(response.content)).convert("RGB")
    assert image.size == (200, 100)
    red = image.getpixel((20, 20))
    assert red[0] > 230 and red[1] < 30 and red[2] < 30
