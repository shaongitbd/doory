from pathlib import Path

import pytest
from defusedxml import ElementTree as ET
from django.core.files.storage import default_storage
from PIL import Image

from apps.assets.models import Asset

from .helpers import HOSTILE_SVG, SAFE_SVG, image_bytes, jpeg_with_exif, noisy_png, upload

URL = "/api/v1/assets/"


def post(api, data, filename="file.png", **extra):
    return api.post(URL, {"file": upload(data, filename), **extra}, format="multipart")


def stored_bytes(asset: Asset) -> bytes:
    return Path(default_storage.path(asset.file.name)).read_bytes()


@pytest.mark.django_db
class TestRasterUpload:
    def test_png_upload_returns_contract_shape(self, api, user):
        res = post(api, image_bytes("PNG", (64, 32)), "My Photo.png", tags=["Red", "Logo"])
        assert res.status_code == 201
        body = res.json()
        assert set(body) == {
            "id", "kind", "name", "url", "thumb_url", "width", "height", "size", "mime",
            "tags", "attribution", "duration_ms", "created_at",
        }  # fmt: skip
        assert (body["kind"], body["name"], body["width"], body["height"]) == (
            "image",
            "My Photo.png",
            64,
            32,
        )
        assert body["mime"] == "image/png" and body["tags"] == ["red", "logo"]
        assert body["url"].endswith(".png") and body["thumb_url"].endswith(".webp")
        assert body["thumb_url"] != body["url"] and body["attribution"] is None
        asset = Asset.objects.get(pk=body["id"])
        assert asset.owner == user and asset.size == len(stored_bytes(asset))

    def test_stored_filename_is_a_uuid_never_the_users_filename(self, api):
        res = post(api, image_bytes(), "../../etc/passwd<script>.png")
        asset = Asset.objects.get(pk=res.json()["id"])
        assert asset.file.name == f"assets/{asset.owner_id}/{asset.id}.png"
        assert res.json()["name"] == "passwd<script>.png"

    @pytest.mark.parametrize(
        "fmt,mime", [("JPEG", "image/jpeg"), ("WEBP", "image/webp"), ("GIF", "image/gif")]
    )
    def test_other_raster_formats(self, api, fmt, mime):
        res = post(api, image_bytes(fmt), f"x.{fmt.lower()}")
        assert res.status_code == 201 and res.json()["mime"] == mime

    def test_type_comes_from_content_not_extension_or_client_mime(self, api):
        res = api.post(
            URL, {"file": upload(image_bytes("JPEG"), "evil.svg", "image/svg+xml")}, format="multipart"
        )
        assert res.status_code == 201
        assert (res.json()["kind"], res.json()["mime"]) == ("image", "image/jpeg")
        assert res.json()["url"].endswith(".jpg")

    def test_exif_is_stripped_and_orientation_applied(self, api):
        res = post(api, jpeg_with_exif(orientation=6, size=(40, 20)), "photo.jpg")
        asset = Asset.objects.get(pk=res.json()["id"])
        assert (asset.width, asset.height) == (20, 40)
        with Image.open(Path(default_storage.path(asset.file.name))) as img:
            assert not img.getexif()
            assert b"SecretCameraMaker" not in stored_bytes(asset)

    def test_thumbnail_is_480px_webp(self, api):
        res = post(api, image_bytes("PNG", (1200, 600)))
        asset = Asset.objects.get(pk=res.json()["id"])
        with Image.open(Path(default_storage.path(asset.thumbnail.name))) as thumb:
            assert thumb.format == "WEBP" and max(thumb.size) == 480

    @pytest.mark.parametrize(
        "payload",
        [
            b"<?php system($_GET['c']); ?>",
            b"<html><body><script>alert(1)</script></body></html>",
            b"\x89PNG\r\n\x1a\nthis is not really a png",
            b"MZ\x90\x00\x03\x00\x00\x00 executable",
            b"GIF89a" + b"\x00" * 10,
            b"",
        ],
    )
    def test_non_images_renamed_to_png_are_rejected(self, api, payload):
        res = api.post(URL, {"file": upload(payload, "innocent.png")}, format="multipart")
        assert res.status_code == 400
        assert res.json()["error"]["code"] in {"invalid_file", "validation_error"}
        assert Asset.objects.count() == 0

    def test_dimension_cap(self, api):
        res = post(api, image_bytes("PNG", (12_001, 2)))
        assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_file"

    def test_pixel_cap_blocks_decompression_bombs(self, api):
        res = post(api, image_bytes("PNG", (9_000, 9_000), mode="L"))
        assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_file"

    def test_a_busy_decoder_answers_503_with_retry_after(self, api, monkeypatch):
        from apps.core import images

        monkeypatch.setattr(images, "LARGE_IMAGE_PIXELS", 10)
        monkeypatch.setattr(images, "LARGE_DECODE_WAIT_SECONDS", 0.05)
        held = [images._large_decodes.acquire() for _ in range(images.LARGE_DECODE_SLOTS)]
        try:
            res = post(api, image_bytes("PNG", (64, 32)))
        finally:
            for _ in held:
                images._large_decodes.release()
        assert res.status_code == 503 and res.json()["error"]["code"] == "server_busy"
        assert res["Retry-After"] == "5" and not Asset.objects.exists()
        assert post(api, image_bytes("PNG", (64, 32))).status_code == 201

    def test_oversize_file_rejected(self, api, settings):
        settings.MAX_UPLOAD_BYTES = 2_000
        res = post(api, noisy_png())
        assert res.status_code == 413 and res.json()["error"]["code"] == "file_too_large"

    def test_declared_content_length_is_checked_before_parsing(self, api, settings):
        settings.MAX_UPLOAD_BYTES = 1_000
        res = api.post(
            URL, {"file": upload(image_bytes())}, format="multipart", CONTENT_LENGTH=str(50 * 1024 * 1024)
        )
        assert res.status_code == 413 and res.json()["error"]["code"] == "file_too_large"

    def test_missing_file_is_a_validation_error(self, api):
        res = api.post(URL, {"name": "x"}, format="multipart")
        assert res.status_code == 400
        assert "file" in res.json()["error"]["fields"]

    def test_requires_authentication(self, db):
        from rest_framework.test import APIClient

        res = APIClient().post(URL, {"file": upload(image_bytes())}, format="multipart")
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "not_authenticated"


@pytest.mark.django_db
class TestNamesAndTags:
    def test_name_override_is_sanitised(self, api):
        res = post(api, image_bytes(), "a.png", name="  C:\\fakepath\\bad\x07name\u202e.png \n")
        assert res.json()["name"] == "badname.png"

    def test_nul_in_name_is_a_validation_error(self, api):
        res = post(api, image_bytes(), "a.png", name="bad\x00name.png")
        assert res.status_code == 400

    def test_overlong_name_is_truncated_to_255(self, api):
        res = post(api, image_bytes(), "a.png", name="n" * 400)
        assert len(res.json()["name"]) == 255

    def test_blank_name_falls_back_to_filename(self, api):
        res = post(api, image_bytes(), "holiday.png", name="  ")
        assert res.json()["name"] == "holiday.png"

    def test_tags_are_normalised_and_deduplicated(self, api):
        res = post(api, image_bytes(), tags=["Sale", " sale ", "SUMMER", ""])
        assert res.json()["tags"] == ["sale", "summer"]

    def test_too_many_tags_rejected(self, api):
        res = post(api, image_bytes(), tags=[f"t{i}" for i in range(21)])
        assert res.status_code == 400 and "tags" in res.json()["error"]["fields"]

    def test_overlong_tag_rejected(self, api):
        res = post(api, image_bytes(), tags=["x" * 41])
        assert res.status_code == 400


@pytest.mark.django_db
class TestSvgUpload:
    def test_safe_svg(self, api):
        res = post(api, SAFE_SVG, "logo.svg")
        body = res.json()
        assert res.status_code == 201
        assert (body["kind"], body["mime"], body["width"], body["height"]) == (
            "svg",
            "image/svg+xml",
            120,
            60,
        )
        assert body["thumb_url"] == body["url"] and body["url"].endswith(".svg")

    def test_hostile_svg_is_sanitised_before_storage(self, api):
        res = post(api, HOSTILE_SVG, "x.svg")
        assert res.status_code == 201
        stored = stored_bytes(Asset.objects.get(pk=res.json()["id"])).lower()
        for needle in (b"<script", b"onload", b"onclick", b"foreignobject", b"javascript:", b"evil.example"):
            assert needle not in stored
        assert b"<circle" in stored

    def test_svg_dtd_entities_rejected(self, api):
        bomb = b'<?xml version="1.0"?><!DOCTYPE s [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg">&b;</svg>'
        res = post(api, bomb, "bomb.svg")
        assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_file"

    def test_xml_that_is_not_svg_rejected(self, api):
        res = post(api, b"<?xml version='1.0'?><note><to>x</to></note>", "n.svg")
        assert res.status_code == 400

    def test_svg_dimensions_from_viewbox_and_clamped(self, api):
        data = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="40000px"><rect width="4" height="4"/></svg>'
        body = post(api, data, "big.svg").json()
        assert max(body["width"], body["height"]) == 12_000
        assert body["width"] == 12_000 and body["height"] == 6_000

    @pytest.mark.parametrize(
        ("root", "size", "viewbox"),
        [
            ('viewBox="0 0 800 600"', (800, 600), "0 0 800 600"),
            ('width="100%" height="100%" viewBox="0 0 800 600"', (800, 600), "0 0 800 600"),
            ('width="200"', (200, 150), "0 0 200 150"),  # no viewBox: one is added for the original size
            ('viewBox="0 0 400 200" width="40000px"', (12_000, 6_000), "0 0 400 200"),
        ],
    )
    def test_the_stored_svg_has_the_size_it_is_listed_with(self, api, root, size, viewbox):
        # A browser draws an SVG at its root size (300x150 when it has none), so it must match `width`/`height`.
        data = f'<svg xmlns="http://www.w3.org/2000/svg" {root}><rect width="10" height="10"/></svg>'.encode()
        body = post(api, data, "drawing.svg").json()
        assert (body["width"], body["height"]) == size
        stored = ET.fromstring(stored_bytes(Asset.objects.get(pk=body["id"])))
        assert (stored.get("width"), stored.get("height")) == (str(size[0]), str(size[1]))
        assert stored.get("viewBox") == viewbox

    def test_oversize_svg_rejected(self, api, monkeypatch):
        monkeypatch.setattr("apps.core.svg.MAX_BYTES", 100)
        res = post(api, SAFE_SVG + b"<!--" + b"x" * 200 + b"-->", "big.svg")
        assert res.status_code == 413


@pytest.mark.django_db
class TestQuota:
    def test_quota_exceeded(self, api, user, settings):
        first = image_bytes("PNG", (50, 50))
        size = post(api, first).json()["size"]
        settings.USER_STORAGE_QUOTA_BYTES = size * 2 - 1
        res = post(api, first)
        assert res.status_code == 413 and res.json()["error"]["code"] == "quota_exceeded"
        assert Asset.objects.filter(owner=user).count() == 1

    def test_quota_is_per_user(self, api, other_api, settings):
        first = image_bytes("PNG", (50, 50))
        size = post(api, first).json()["size"]
        settings.USER_STORAGE_QUOTA_BYTES = size + 10
        assert post(other_api, first).status_code == 201

    def test_failed_upload_leaves_no_files_behind(self, api, settings):
        settings.USER_STORAGE_QUOTA_BYTES = 10
        before = {p.name for p in Path(default_storage.path("")).rglob("*") if p.is_file()}
        assert post(api, image_bytes()).status_code == 413
        assert {p.name for p in Path(default_storage.path("")).rglob("*") if p.is_file()} == before

    def test_usage_endpoint(self, api, settings):
        settings.USER_STORAGE_QUOTA_BYTES = 123_456
        assert api.get(URL + "usage/").json() == {"used_bytes": 0, "quota_bytes": 123_456}
        size = post(api, image_bytes()).json()["size"]
        assert api.get(URL + "usage/").json()["used_bytes"] == size

    def test_usage_only_counts_own_assets(self, api, other_api):
        post(other_api, image_bytes())
        assert api.get(URL + "usage/").json()["used_bytes"] == 0

    def test_default_quota_is_two_gib(self, settings):
        assert settings.USER_STORAGE_QUOTA_BYTES == 2 * 1024**3


@pytest.mark.django_db
def test_upload_is_throttled(api, monkeypatch):
    from apps.assets.throttling import UploadRateThrottle

    monkeypatch.setattr(UploadRateThrottle, "THROTTLE_RATES", {"upload": "2/min"})
    codes = [post(api, image_bytes()).status_code for _ in range(3)]
    assert codes == [201, 201, 429]
