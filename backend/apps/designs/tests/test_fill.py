"""Filling a template by field key: the `fill` service, `bulk_fill` and their REST endpoints."""

from __future__ import annotations

import uuid

import pytest
from django.core.files.base import ContentFile

from apps.assets.models import Asset
from apps.designs import fill
from apps.designs.doc.ops import apply_ops
from apps.designs.models import Design, Folder
from apps.mcp.resolver import DjangoResolver

from .helpers import image_object, make_design, make_doc, text_object
from .test_fields import shape, tagged

URL = "/api/v1/designs/"
pytestmark = pytest.mark.django_db


def make_asset(owner, name="Photo") -> Asset:
    asset = Asset(owner=owner, name=name, width=400, height=200, mime="image/png", size=10)
    asset.file.save("photo.png", ContentFile(b"png"), save=False)
    asset.save()
    return asset


def template_doc() -> dict:
    photo = {**image_object("/media/old.png"), "width": 100, "height": 100, "left": 0, "top": 0}
    page_one = [
        tagged({**text_object("Name"), "id": "name-1", "width": 300}, "name", "text", "Name"),
        tagged({**photo, "id": "photo-1"}, "photo", "image"),
        tagged({**shape(), "id": "badge-1"}, "accent", "color"),
    ]
    doc = make_doc(objects=page_one)
    second = {**doc["pages"][0], "id": "page-2"}
    second["objects"] = [tagged({**text_object("Name"), "id": "name-2", "width": 300}, "name", "text")]
    doc["pages"].append(second)
    return doc


@pytest.fixture
def template(user):
    return make_design(user, title="Badge", document=template_doc())


def run(template, user, values, **kwargs):
    return fill.fill_design(template, user, values, resolver=DjangoResolver(user, allow_urls=True), **kwargs)


def objects(design, page=0):
    return Design.objects.get(pk=design.pk).document["pages"][page]["objects"]


def test_fill_gives_the_same_document_as_the_hand_written_edit(user, template):
    asset = make_asset(user)
    values = {"name": "Ada Lovelace", "photo": {"asset_id": str(asset.pk), "focal": [0.5, 0.2]}}
    values["accent"] = "#00ff88"
    result = run(template, user, values)
    assert (result.filled, result.skipped, result.overflow) == (["name", "photo", "accent"], [], [])
    by_hand = apply_ops(
        template.document,
        fill.OPERATIONS.validate_python(
            [
                {"op": "update_object", "object_id": "name-1", "text": "Ada Lovelace"},
                {"op": "update_object", "object_id": "name-2", "text": "Ada Lovelace"},
                {
                    "op": "replace_image",
                    "object_id": "photo-1",
                    "asset_id": str(asset.pk),
                    "focal": [0.5, 0.2],
                },
                {"op": "update_object", "object_id": "badge-1", "color": "#00ff88"},
            ]
        ),
        DjangoResolver(user),
        max_pages=100,
    ).document
    assert Design.objects.get(pk=result.design.pk).document == by_hand


def test_as_copy_leaves_the_template_alone_and_in_place_edits_it(user, template):
    folder = Folder.objects.create(owner=user, name="Out")
    copy = run(template, user, {"name": "Grace"}, name="Grace's badge", folder=folder).design
    assert copy.pk != template.pk and copy.title == "Grace's badge" and copy.folder_id == folder.pk
    assert objects(copy)[0]["text"] == "Grace" and objects(copy, 1)[0]["text"] == "Grace"
    assert objects(template)[0]["text"] == "Name"
    result = run(template, user, {"name": "Edited", "accent": ""}, as_copy=False)
    assert result.design.pk == template.pk and objects(template)[0]["text"] == "Edited"
    assert result.skipped == ["photo", "accent"]


def test_a_bad_value_names_its_key_and_leaves_nothing_behind(user, template):
    before = Design.objects.count()
    with pytest.raises(fill.FillError) as caught:
        run(template, user, {"name": "Ok", "nope": "x", "accent": "red", "photo": 12})
    assert set(caught.value.problems) == {"nope", "accent", "photo"}
    with pytest.raises(fill.FillError, match="photo"):
        run(template, user, {"name": "Ok", "photo": {"asset_id": str(uuid.uuid4())}})
    with pytest.raises(fill.FillError, match="name"):
        run(template, user, {"name": "x" * 100_000})
    assert Design.objects.count() == before
    assert objects(template)[0]["text"] == "Name"


def test_images_by_upload_name_and_url(user, template, monkeypatch):
    from apps.assets import remote
    from apps.assets.tests.helpers import image_bytes

    asset = make_asset(user, name="Portrait")
    copy = run(template, user, {"photo": "portrait"}).design
    assert objects(copy)[1]["assetId"] == str(asset.pk)
    monkeypatch.setattr(remote, "fetch_image", lambda url, max_bytes: image_bytes())
    copy = run(template, user, {"photo": "https://img.example/p.png"}).design
    assert Asset.objects.get(pk=objects(copy)[1]["assetId"]).meta["source_url"] == "https://img.example/p.png"

    def refuse(url, max_bytes):
        raise remote.RemoteImageError("That address is not on the public internet.")

    monkeypatch.setattr(remote, "fetch_image", refuse)
    with pytest.raises(fill.FillError, match="public internet"):
        run(template, user, {"photo": "https://10.0.0.1/x.png"})
    with pytest.raises(fill.FillError, match="no picture named"):
        run(template, user, {"photo": "missing"})


def test_shrink_to_fit_text_reports_overflow(user):
    text = {**text_object("Hi"), "width": 80, "height": 40, "fontSize": 30, "fit": {"mode": "shrink"}}
    design = make_design(user, document=make_doc(objects=[tagged(text, "quote", "text")]))
    assert run(design, user, {"quote": "Short"}).overflow == []
    assert run(design, user, {"quote": "A very long quote " * 30}).overflow == ["quote"]


def test_bulk_fill_reports_each_row_and_respects_the_row_limit(user, template, settings):
    rows = [{"name": "Ada"}, {"accent": "nope"}, {"name": "Grace"}]
    results = fill.bulk_fill(template, user, rows, resolver=DjangoResolver(user), name_pattern="{name} ({n})")
    assert [r["ok"] for r in results] == [True, False, True]
    assert results[0]["title"] == "Ada (1)" and results[2]["title"] == "Grace (3)"
    assert "accent" in results[1]["error"]
    assert Design.objects.filter(title__in=["Ada (1)", "Grace (3)"]).count() == 2
    settings.BULK_FILL_MAX_ROWS = 2
    with pytest.raises(fill.ValidationError):
        fill.bulk_fill(template, user, rows, resolver=DjangoResolver(user))


class TestRest:
    def test_fill(self, api, other_api, user, template):
        res = api.post(f"{URL}{template.pk}/fill/", {"values": {"name": "Ada"}}, format="json")
        assert res.status_code == 201 and res.json()["filled"] == ["name"]
        assert objects(Design.objects.get(pk=res.json()["design_id"]))[0]["text"] == "Ada"
        res = api.post(f"{URL}{template.pk}/fill/", {"values": {"x": "1"}}, format="json")
        assert res.status_code == 400 and "x" in str(res.json())
        res = api.post(
            f"{URL}{template.pk}/fill/", {"values": {"name": "Me"}, "as_copy": False}, format="json"
        )
        assert res.status_code == 200 and objects(template)[0]["text"] == "Me"
        assert (
            other_api.post(f"{URL}{template.pk}/fill/", {"values": {"name": "A"}}, format="json").status_code
            == 404
        )

    def test_bulk_fill(self, api, user, template, settings):
        folder = Folder.objects.create(owner=user, name="Badges")
        body = {"rows": [{"name": "A"}, {"name": "B"}], "folder": str(folder.pk)}
        res = api.post(f"{URL}{template.pk}/bulk-fill/", body, format="json")
        assert res.status_code == 200 and res.json()["created"] == 2
        assert Design.objects.filter(folder=folder).count() == 2
        settings.BULK_FILL_MAX_ROWS = 1
        res = api.post(f"{URL}{template.pk}/bulk-fill/", body, format="json")
        assert res.status_code == 400

    def test_one_fill_at_a_time_per_user(self, api, other_api, user, other, template):
        from django.core.cache import cache

        cache.add(f"bulk-fill:running:{user.pk}", 1, 60)  # a fill of this user's still running
        res = api.post(f"{URL}{template.pk}/bulk-fill/", {"rows": [{"name": "A"}]}, format="json")
        assert res.status_code == 429 and "already running" in str(res.json())
        res = api.post(f"{URL}{template.pk}/fill/", {"values": {"name": "A"}}, format="json")
        assert res.status_code == 429
        theirs = make_design(other, title="Badge", document=template_doc())  # other users are not held up
        res = other_api.post(f"{URL}{theirs.pk}/fill/", {"values": {"name": "B"}}, format="json")
        assert res.status_code == 201
        cache.delete(f"bulk-fill:running:{user.pk}")
        # A refused run (400) frees the slot as well.
        assert api.post(f"{URL}{template.pk}/fill/", {"values": {"x": "1"}}, format="json").status_code == 400
        res = api.post(f"{URL}{template.pk}/fill/", {"values": {"name": "A"}}, format="json")
        assert res.status_code == 201

    def test_bulk_fill_rows_count_against_the_bulk_fill_rate(self, api, template, monkeypatch):
        from django.core.cache import cache

        from apps.designs.throttling import BulkFillRateThrottle

        cache.clear()
        monkeypatch.setattr(BulkFillRateThrottle, "THROTTLE_RATES", {"bulk_fill": "2/min"})
        body = {"rows": [{"name": str(n)} for n in range(3)]}
        res = api.post(f"{URL}{template.pk}/bulk-fill/", body, format="json")
        rows = res.json()["rows"]
        assert res.json()["created"] == 2 and not rows[2]["ok"] and "throttled" in rows[2]["error"]
        cache.clear()

    def test_bulk_fill_url_images_use_their_own_rate_not_upload(self, api, template, monkeypatch):
        from django.core.cache import cache

        from apps.assets import remote
        from apps.assets.tests.helpers import image_bytes
        from apps.assets.throttling import UploadRateThrottle
        from apps.designs.throttling import BulkFillImageRateThrottle

        cache.clear()
        monkeypatch.setattr(remote, "fetch_image", lambda url, max_bytes: image_bytes())
        monkeypatch.setattr(UploadRateThrottle, "THROTTLE_RATES", {"upload": "1/min"})
        monkeypatch.setattr(
            BulkFillImageRateThrottle, "THROTTLE_RATES", {"bulk_fill": "100/min", "bulk_fill_images": "2/min"}
        )
        body = {"rows": [{"photo": f"https://img.example/{n}.png"} for n in range(3)]}
        rows = api.post(f"{URL}{template.pk}/bulk-fill/", body, format="json").json()["rows"]
        assert [r["ok"] for r in rows] == [True, True, False] and "Too many requests" in rows[2]["error"]
        cache.clear()

    def test_bulk_fill_respects_row_numbers(self, api, template):
        body = {"rows": [{"name": "A"}, {"name": "C"}], "row_numbers": [1, 3]}
        res = api.post(f"{URL}{template.pk}/bulk-fill/", body, format="json")
        rows = res.json()["rows"]
        assert [r["row"] for r in rows] == [1, 3]
        assert rows[0]["title"] == "Badge - 1" and rows[1]["title"] == "Badge - 3"

    def test_url_images_switched_off_reports_clear_error(self, api, template, settings):
        settings.URL_IMAGE_UPLOADS = False
        res = api.post(
            f"{URL}{template.pk}/fill/", {"values": {"photo": "https://img.example/a.png"}}, format="json"
        )
        assert res.status_code == 400
        assert "switched off" in str(res.json())


def test_image_exporter_counts_each_render_against_the_export_rate(user, template, monkeypatch):
    from django.core.cache import cache

    pytest.importorskip("apps.exports.services")
    from apps.exports import services as exports
    from apps.exports.throttling import ExportRateThrottle

    cache.clear()
    monkeypatch.setattr(ExportRateThrottle, "THROTTLE_RATES", {"export": "1/min"})
    image = type("Image", (), {"mime": "image/png", "data": b"png"})()
    monkeypatch.setattr(exports, "export_image", lambda *a, **k: image)
    rows = fill.bulk_fill(
        template,
        user,
        [{"name": "A"}, {"name": "B"}],
        resolver=DjangoResolver(user),
        after_row=fill.image_exporter("png", user),
    )
    assert "image" in rows[0] and "throttled" in rows[1]["export_error"]
    cache.clear()


def test_image_exporter_returns_url_when_above_inline_limit(user, template, monkeypatch, settings):
    pytest.importorskip("apps.exports.services")
    from apps.exports import services as exports

    settings.MCP_EXPORT_INLINE_MAX_BYTES = 5
    image = type("Image", (), {"mime": "image/png", "data": b"1234567890"})()
    monkeypatch.setattr(exports, "export_image", lambda *a, **k: image)
    rows = fill.bulk_fill(
        template,
        user,
        [{"name": "A"}],
        resolver=DjangoResolver(user),
        after_row=fill.image_exporter("png", user),
    )
    assert "url" in rows[0]["image"] and "data_base64" not in rows[0]["image"]
