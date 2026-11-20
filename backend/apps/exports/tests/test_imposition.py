"""Folded page order and the sheet HTML given to Chromium."""

import pytest

from apps.exports.exceptions import InvalidExport
from apps.exports.imposition import folded_sheet, impose_pages, validate_fold
from apps.exports.layout import build_imposed_html


def pairs(count, layout, signature_pages=4, binding="left"):
    return [
        (side.left + 1 if side.left is not None else None, side.right + 1 if side.right is not None else None)
        for side in impose_pages(count, layout, signature_pages, binding)
    ]


def test_booklet_and_book_order():
    assert pairs(8, "booklet") == [(8, 1), (2, 7), (6, 3), (4, 5)]
    assert pairs(8, "book") == [(4, 1), (2, 3), (8, 5), (6, 7)]
    assert pairs(4, "booklet", binding="right") == [(1, 4), (3, 2)]


def test_last_signature_gets_blank_pages():
    assert pairs(6, "book") == [(4, 1), (2, 3), (None, 5), (6, None)]
    assert pairs(5, "booklet") == [(None, 1), (2, None), (None, 3), (4, 5)]


def test_fold_requires_matching_portrait_pages_without_bleed():
    assert validate_fold([(100, 180)] * 4, "booklet", 4, "left", 0, False)
    for sizes, bleed, marks in [
        ([(100, 180), (110, 180)], 0, False),
        ([(180, 100)], 0, False),
        ([(100, 180)], 3, False),
        ([(100, 180)], 0, True),
    ]:
        with pytest.raises(InvalidExport):
            validate_fold(sizes, "booklet", 4, "left", bleed, marks)


def test_manual_duplex_selects_one_side_per_sheet():
    fronts = validate_fold([(100, 180)] * 8, "booklet", 4, "left", 0, False, "front")
    backs = validate_fold([(100, 180)] * 8, "booklet", 4, "left", 0, False, "back")
    assert [(side.left, side.right) for side in fronts] == [(7, 0), (5, 2)]
    assert [(side.left, side.right) for side in backs] == [(1, 6), (3, 4)]
    with pytest.raises(InvalidExport):
        validate_fold([(100, 180)], "normal", 4, "left", 0, False, "front")


def test_a5_leaves_fit_an_exact_a4_sheet():
    sheet_width, sheet_height, x, y = folded_sheet(559, 794)
    assert sheet_width == pytest.approx(297 * 96 / 25.4)
    assert sheet_height == pytest.approx(210 * 96 / 25.4)
    assert x > 0
    assert y < 0


def test_imposed_html_has_one_sheet_side_with_isolated_leaves():
    sides = impose_pages(4, "booklet", 4, "left")
    svgs = [f'<svg width="100" height="180"><text>{i}</text></svg>' for i in range(4)]
    html, geometries = build_imposed_html(svgs, sides, 100, 180, "Book", [], "en")
    assert html.count('<section class="page">') == 2
    assert html.count('shadowrootmode="open"') == 4
    assert html.index("<text>3</text>") < html.index("<text>0</text>")
    assert len(geometries) == 2
    assert geometries[0].page_width == 200
    assert geometries[0].page_height == 180
