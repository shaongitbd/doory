import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from apps.exports.filenames import (
    page_filename,
    pdf_filename,
    preset_parts,
    structured_filename,
    unique_names,
)


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("My Poster", "My Poster.pdf"),
        ("Summer sale (v2)", "Summer sale (v2).pdf"),
        ("Café menu", "Café menu.pdf"),
        ("日本語のデザイン", "日本語のデザイン.pdf"),
        ("", "design.pdf"),
        (None, "design.pdf"),
        ("   ", "design.pdf"),
        ("../../etc/passwd", "etcpasswd.pdf"),
        ("..\\..\\windows\\system32", "windowssystem32.pdf"),
        ('a/b\\c:d*e?f"g<h>i|j', "abcdefghij.pdf"),
        ("evil\r\nSet-Cookie: x=1", "evil Set-Cookie x1.pdf"),
        ("name\x00.exe", "name.exe.pdf"),
        ("🎉 Party 🎉", "Party.pdf"),
        ("report.pdf", "report.pdf.pdf"),
        ("...", "design.pdf"),
        ("a   b\t\tc", "a b c.pdf"),
        ("<script>alert(1)</script>", "scriptalert(1)script.pdf"),
    ],
)
def test_pdf_filename(title, expected):
    assert pdf_filename(title) == expected


def test_length_is_capped():
    name = pdf_filename("x" * 500)
    assert name == "x" * 80 + ".pdf"


@pytest.mark.parametrize("title", ["a\r\nb", 'q"uote', "sla/sh", "back\\slash", "semi;colon"])
def test_result_is_header_safe(title):
    name = pdf_filename(title)
    assert not any(ch in name for ch in ("\r", "\n", '"', "/", "\\", ";"))
    assert name.endswith(".pdf")


# ---- structured names (#59) --------------------------------------------------------------------

FIXTURE = Path(__file__).resolve().parents[4] / "frontend/src/editor/engine/fixtures/export-filenames.json"
CASES = json.loads(FIXTURE.read_text())["cases"] if FIXTURE.exists() else []


@pytest.mark.skipif(not CASES, reason="the shared fixture lives in the frontend")
@pytest.mark.parametrize("case", CASES, ids=lambda c: c["expected"])
def test_structured_filename_matches_the_editor(case):
    given = dict(case["input"])
    assert structured_filename(given.pop("title"), given.pop("extension"), **given) == case["expected"]


def _result(**overrides):
    values = {"format": "png", "page_index": 1, "page_count": 3, "page_width": 1080, "page_height": 1920}
    return SimpleNamespace(**{**values, "preset": "instagram-story", **overrides})


@pytest.mark.django_db
def test_a_page_at_its_preset_size_names_platform_and_preset():
    assert preset_parts("instagram-story", 1080, 1920) == ("instagram", "instagram-story")
    assert page_filename("Summer Sale", _result(), style="structured") == (
        "summer-sale_instagram_instagram-story_1080x1920_p02.png"
    )


@pytest.mark.django_db
def test_a_resized_page_or_unknown_preset_counts_as_a_custom_size():
    assert preset_parts("instagram-story", 1080, 1080) == (None, None)
    assert preset_parts("no-such-preset", 1080, 1920) == (None, None)
    assert preset_parts("", 1080, 1920) == (None, None)


@pytest.mark.django_db
def test_an_old_slug_names_the_current_preset():
    from apps.presets.models import SizePreset

    preset = SizePreset.objects.get(slug="instagram-story")
    preset.aliases = ["ig-story-old"]
    preset.save()
    assert preset_parts("ig-story-old", 1080, 1920) == ("instagram", "instagram-story")


@pytest.mark.django_db
def test_meta_platforms_wins_over_the_group():
    from apps.presets.models import SizePreset

    SizePreset.objects.filter(slug="instagram-story").update(meta={"platforms": ["Meta"]})
    assert preset_parts("instagram-story", 1080, 1920) == ("meta", "instagram-story")


def test_simple_style_keeps_the_old_names():
    assert page_filename("Summer Sale", _result(), style="simple") == "Summer Sale - page 2.png"
    assert (
        page_filename("Summer Sale", _result(page_count=1, page_index=0), style="simple") == "Summer Sale.png"
    )


def test_a_long_title_is_shortened_to_keep_the_page_number():
    title = "Spring sale " * 10
    names = [page_filename(title, _result(page_index=i), style="simple") for i in range(3)]
    assert names == [f"{title[:71].strip()} - page {i}.png" for i in (1, 2, 3)]
    assert all(len(name) - len(".png") <= 80 for name in names)
    assert page_filename("", _result(), style="simple") == "page 2.png"


def test_repeated_names_are_numbered():
    assert unique_names(["a.png", "b.png", "A.png", "a.png", "notes"]) == (
        "a.png",
        "b.png",
        "A (2).png",
        "a (3).png",
        "notes",
    )
