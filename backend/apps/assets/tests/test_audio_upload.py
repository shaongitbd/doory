"""Uploading audio through POST /assets/."""

from pathlib import Path

import pytest
from django.core.files.storage import default_storage

from apps.assets.models import Asset

from .audio_helpers import m4a_bytes, mp3_bytes, ogg_opus_bytes, ogg_vorbis_bytes, wav_bytes, webm_bytes
from .helpers import SAFE_SVG, image_bytes, upload

URL = "/api/v1/assets/"


def post(api, data, filename="clip.mp3", **extra):
    return api.post(
        URL, {"file": upload(data, filename, "application/octet-stream"), **extra}, format="multipart"
    )


def stored_bytes(asset: Asset) -> bytes:
    return Path(default_storage.path(asset.file.name)).read_bytes()


ACCEPTED = [
    pytest.param(mp3_bytes(id3=True), "audio/mpeg", "mp3", id="mp3"),
    pytest.param(ogg_opus_bytes(), "audio/ogg", "ogg", id="ogg-opus"),
    pytest.param(ogg_vorbis_bytes(), "audio/ogg", "ogg", id="ogg-vorbis"),
    pytest.param(wav_bytes(), "audio/wav", "wav", id="wav"),
    pytest.param(m4a_bytes(), "audio/mp4", "m4a", id="m4a"),
    pytest.param(webm_bytes(), "audio/webm", "weba", id="webm"),
]


@pytest.mark.django_db
class TestAccepted:
    @pytest.mark.parametrize(("data", "mime", "ext"), ACCEPTED)
    def test_upload_returns_the_asset(self, api, user, data, mime, ext):
        res = post(api, data, "Voice note.bin")
        assert res.status_code == 201, res.content
        body = res.json()
        assert (body["kind"], body["mime"], body["name"]) == ("audio", mime, "Voice note.bin")
        assert (body["width"], body["height"], body["thumb_url"], body["size"]) == (0, 0, "", len(data))
        assert body["url"].endswith(f".{ext}") and body["attribution"] is None
        asset = Asset.objects.get(pk=body["id"])
        assert asset.owner == user and asset.kind == "audio"
        assert stored_bytes(asset) == data  # audio is stored as it came

    def test_the_contract_shape(self, api):
        body = post(api, wav_bytes()).json()
        assert set(body) == {
            "id", "kind", "name", "url", "thumb_url", "width", "height", "size", "mime",
            "tags", "attribution", "duration_ms", "status", "error", "poster_url", "audio_url", "video",
            "created_at",
        }  # fmt: skip

    def test_duration_and_details(self, api):
        body = post(api, wav_bytes(seconds=0.5, rate=16000)).json()
        assert body["duration_ms"] == 500
        meta = Asset.objects.get(pk=body["id"]).meta["audio"]
        assert (meta["codec"], meta["channels"], meta["sample_rate"]) == ("pcm", 1, 16000)

    def test_duration_is_null_when_the_container_does_not_say(self, api):
        assert post(api, webm_bytes()).json()["duration_ms"] is None

    def test_images_report_no_duration(self, api):
        res = api.post(URL, {"file": upload(image_bytes(), "a.png")}, format="multipart")
        assert res.json()["duration_ms"] is None

    def test_stored_name_is_a_uuid_and_the_extension_comes_from_the_content(self, api):
        res = post(api, ogg_opus_bytes(), "../../etc/passwd.mp3")
        asset = Asset.objects.get(pk=res.json()["id"])
        assert asset.file.name == f"assets/{asset.owner_id}/{asset.id}.ogg"
        assert res.json()["name"] == "passwd.mp3"

    def test_type_comes_from_content_not_from_the_client(self, api):
        res = api.post(URL, {"file": upload(wav_bytes(), "photo.png", "image/png")}, format="multipart")
        assert res.status_code == 201 and res.json()["mime"] == "audio/wav"

    def test_tags_and_name_work_as_for_images(self, api):
        res = post(api, mp3_bytes(), "x.mp3", name="  Theme  ", tags=["Music", " music "])
        assert (res.json()["name"], res.json()["tags"]) == ("Theme", ["music"])

    def test_requires_authentication(self, db):
        from rest_framework.test import APIClient

        res = APIClient().post(URL, {"file": upload(wav_bytes(), "a.wav")}, format="multipart")
        assert res.status_code == 401


@pytest.mark.django_db
class TestRejected:
    @pytest.mark.parametrize(
        "payload",
        [
            b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"<html><script>alert(1)</script></html>" * 20,
            b"\xff\xfb\x90\x44" + b"<html><script>alert(1)</script></html>" * 40,
            b"RIFF\x24\x00\x00\x00WAVEjunk",
            b"OggS" + b"\x00" * 60,
            b"\x00\x00\x00\x18ftypM4A \x00\x00\x00\x00M4A mp42isom",
            b"\x1a\x45\xdf\xa3" + b"\x00" * 60,
            m4a_bytes((b"soun", b"vide"), brand=b"mp42"),
            webm_bytes((1, 2)),
            b"MZ\x90\x00\x03\x00\x00\x00 executable",
            b"",
        ],
    )
    def test_files_that_only_claim_to_be_audio(self, api, payload):
        res = post(api, payload, "innocent.mp3")
        assert res.status_code == 400
        assert res.json()["error"]["code"] in {"invalid_file", "validation_error"}
        assert Asset.objects.count() == 0

    def test_a_truncated_ogg(self, api):
        res = post(api, ogg_opus_bytes()[:-5], "cut.ogg")
        assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_file"

    def test_a_text_file_renamed_to_mp3(self, api):
        res = post(api, b"hello world, this is not audio" * 10, "song.mp3")
        assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_file"

    def test_an_svg_renamed_to_wav_is_still_an_svg(self, api):
        res = post(api, SAFE_SVG, "song.wav")
        assert res.status_code == 201 and res.json()["kind"] == "svg"

    def test_the_error_names_the_reason(self, api):
        res = post(api, webm_bytes((1, 2)), "movie.webm")
        assert "video" in res.json()["error"]["message"]

    def test_oversize_file_rejected(self, api, settings):
        settings.MAX_UPLOAD_BYTES = 2_000
        res = post(api, wav_bytes(seconds=1.0, rate=8000, bits=16))
        assert res.status_code == 413 and res.json()["error"]["code"] == "file_too_large"

    def test_a_file_at_the_limit_is_accepted(self, api, settings):
        data = wav_bytes(seconds=0.25)
        settings.MAX_UPLOAD_BYTES = len(data)
        assert post(api, data).status_code == 201

    def test_declared_content_length_is_checked_first(self, api, settings):
        settings.MAX_UPLOAD_BYTES = 1_000
        settings.VIDEO_ENABLED = (
            False  # a server that takes clips accepts larger bodies (see test_video_upload)
        )
        res = api.post(
            URL,
            {"file": upload(wav_bytes(), "a.wav")},
            format="multipart",
            CONTENT_LENGTH=str(50 * 1024 * 1024),
        )
        assert res.status_code == 413


@pytest.mark.django_db
class TestQuotaAndUsage:
    def test_audio_counts_against_the_quota(self, api, settings):
        data = wav_bytes(seconds=0.5)
        settings.USER_STORAGE_QUOTA_BYTES = len(data) * 2 - 1
        assert post(api, data).status_code == 201
        res = post(api, data)
        assert res.status_code == 413 and res.json()["error"]["code"] == "quota_exceeded"
        assert Asset.objects.count() == 1

    def test_usage_includes_audio(self, api):
        data = mp3_bytes(frames=8)
        post(api, data)
        assert api.get(URL + "usage/").json()["used_bytes"] == len(data)

    def test_a_failed_save_leaves_no_file(self, api, settings):
        def files() -> set[Path]:
            return set(Path(default_storage.path("assets")).rglob("*"))

        before = files()
        settings.USER_STORAGE_QUOTA_BYTES = 10
        assert post(api, wav_bytes()).status_code == 413
        assert files() == before


@pytest.mark.django_db
class TestListing:
    def test_audio_is_left_out_of_the_default_list(self, api):
        api.post(URL, {"file": upload(image_bytes(), "a.png")}, format="multipart")
        post(api, mp3_bytes())
        body = api.get(URL).json()
        assert [a["kind"] for a in body["results"]] == ["image"] and body["count"] == 1

    def test_kind_audio_lists_only_audio(self, api, other_api):
        api.post(URL, {"file": upload(image_bytes(), "a.png")}, format="multipart")
        mine = post(api, mp3_bytes(), "mine.mp3").json()
        post(other_api, wav_bytes(), "theirs.wav")
        body = api.get(URL, {"kind": "audio"}).json()
        assert [a["id"] for a in body["results"]] == [mine["id"]] and body["count"] == 1

    def test_search_and_ordering_work_for_audio(self, api):
        post(api, mp3_bytes(), "Beta.mp3")
        post(api, wav_bytes(), "Alpha.wav")
        names = [a["name"] for a in api.get(URL, {"kind": "audio", "ordering": "name"}).json()["results"]]
        assert names == ["Alpha.wav", "Beta.mp3"]
        assert [a["name"] for a in api.get(URL, {"kind": "audio", "q": "beta"}).json()["results"]] == [
            "Beta.mp3"
        ]

    def test_other_users_audio_is_a_404(self, api, other_api):
        asset = post(other_api, wav_bytes()).json()
        assert api.get(f"{URL}{asset['id']}/").status_code == 404
        assert api.delete(f"{URL}{asset['id']}/").status_code == 404

    def test_rename_and_delete(self, api, django_capture_on_commit_callbacks):
        asset = post(api, wav_bytes(), "a.wav").json()
        res = api.patch(f"{URL}{asset['id']}/", {"name": "Narration", "tags": ["voice"]}, format="json")
        assert res.status_code == 200 and res.json()["name"] == "Narration"
        stored = Asset.objects.get(pk=asset["id"]).file.name
        assert default_storage.exists(stored)
        with django_capture_on_commit_callbacks(execute=True):
            assert api.delete(f"{URL}{asset['id']}/").status_code == 204
        assert not default_storage.exists(stored)

    def test_an_audio_asset_cannot_be_a_brand_logo(self, api):
        audio = post(api, wav_bytes()).json()
        res = api.post("/api/v1/brand-kits/", {"name": "Kit", "logo_ids": [audio["id"]]}, format="json")
        assert res.status_code == 400
        assert "logo_ids" in res.json()["error"]["fields"]


@pytest.mark.django_db
def test_stored_audio_has_an_audio_content_type():
    import mimetypes

    for name, mime in {
        "a.mp3": "audio/mpeg",
        "a.ogg": "audio/ogg",
        "a.wav": "audio/wav",
        "a.m4a": "audio/mp4",
        "a.weba": "audio/webm",
    }.items():
        assert mimetypes.guess_type(name)[0] == mime
