"""Uploading clips: the real ffprobe and ffmpeg (skipped without them), the conversion in the background."""

import io
from datetime import timedelta
from pathlib import Path

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image, features

from apps.assets import video, video_jobs
from apps.assets.models import Asset
from apps.assets.services import looks_like_media

from .audio_helpers import webm_bytes
from .video_helpers import clip, needs_ffmpeg

URL = "/api/v1/assets/"


def post(api, data: bytes, name="clip.mp4", **extra):
    return api.post(URL, {"file": SimpleUploadedFile(name, data), **extra}, format="multipart")


def stored(asset: Asset, field: str) -> bytes:
    with getattr(asset, field).open("rb") as handle:
        return handle.read()


@pytest.fixture
def inline_jobs(monkeypatch):
    """Run background conversions right away, in the test's thread."""
    monkeypatch.setattr(video_jobs, "submit", video_jobs.run)
    monkeypatch.setattr(video_jobs.connections, "close_all", lambda: None)


@needs_ffmpeg
@pytest.mark.django_db
class TestReadyClips:
    def test_a_web_ready_clip_is_stored_at_once(self, api, user):
        res = post(api, clip("h264"), "Beach day.mp4", tags=["sea"])
        assert res.status_code == 201, res.content
        body = res.json()
        assert (body["kind"], body["status"], body["mime"], body["name"]) == (
            "video",
            "ready",
            "video/mp4",
            "Beach day.mp4",
        )
        assert (body["width"], body["height"]) == (320, 240)
        assert 1900 <= body["duration_ms"] <= 2100
        assert body["url"].endswith(".mp4") and body["poster_url"].endswith(".webp")
        assert body["thumb_url"].endswith(".webp") and body["audio_url"].endswith(".m4a")
        strip = body["video"]["filmstrip"]
        assert strip["frames"] == 4 and strip["interval_ms"] == 500 and strip["tile_height"] == 90
        assert body["video"]["has_audio"] is True and body["video"]["fps"] == 25

        asset = Asset.objects.get(pk=body["id"])
        files = ("file", "poster", "thumbnail", "filmstrip", "audio")
        assert asset.size == sum(len(stored(asset, field)) for field in files)
        assert stored(asset, "file")[4:8] == b"ftyp"
        moov, mdat = stored(asset, "file").find(b"moov"), stored(asset, "file").find(b"mdat")
        assert 0 < moov < mdat  # faststart: the index comes before the media

    def test_a_silent_clip_has_no_sound_file(self, api):
        body = post(api, clip("h264", audio=False)).json()
        assert body["audio_url"] == "" and body["video"]["has_audio"] is False

    def test_listed_only_by_kind(self, api):
        post(api, clip("h264"))
        assert api.get(URL).json()["count"] == 0
        assert api.get(URL, {"kind": "video"}).json()["count"] == 1

    def test_deleting_removes_every_file(self, api, django_capture_on_commit_callbacks):
        body = post(api, clip("h264")).json()
        asset = Asset.objects.get(pk=body["id"])
        names = [getattr(asset, f).name for f in ("file", "poster", "thumbnail", "filmstrip", "audio")]
        with django_capture_on_commit_callbacks(execute=True):
            assert api.delete(f"{URL}{asset.pk}/").status_code == 204
        assert not any(asset.file.storage.exists(name) for name in names)

    def test_quota(self, api, settings):
        settings.USER_STORAGE_QUOTA_BYTES = 1000
        res = post(api, clip("h264"))
        assert res.status_code == 413 and res.json()["error"]["code"] == "quota_exceeded"
        assert not Asset.objects.exists()

    def test_too_long(self, api, settings):
        settings.MAX_VIDEO_DURATION_SECONDS = 1
        res = post(api, clip("h264"))
        assert res.status_code == 400 and "too long" in res.json()["error"]["message"]

    def test_too_large(self, api, settings):
        settings.MAX_VIDEO_UPLOAD_BYTES = 1000
        res = post(api, clip("h264"))
        assert res.status_code == 413 and res.json()["error"]["code"] == "file_too_large"

    def test_garbage_in_a_video_box_is_refused(self, api):
        res = post(api, b"\x00\x00\x00\x18ftypqt  " + b"\x00" * 200, "x.mov")
        assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_file"

    def test_sound_only_files_are_still_audio(self, api):
        res = post(api, clip("m4a"), "song.m4a")
        assert res.status_code == 201, res.content
        assert res.json()["kind"] == "audio"

    def test_no_work_directory_is_left_behind(self, api, settings, tmp_path):
        settings.VIDEO_WORK_DIR = str(tmp_path)
        post(api, clip("h264"))
        post(api, b"\x1a\x45\xdf\xa3" + b"\x00" * 100, "x.webm")
        assert list(tmp_path.iterdir()) == []


@needs_ffmpeg
@pytest.mark.django_db
class TestConvertedClips:
    def test_other_clips_are_converted_in_the_background(
        self, api, inline_jobs, django_capture_on_commit_callbacks
    ):
        with django_capture_on_commit_callbacks(execute=False) as callbacks:
            res = post(api, clip("mpeg4", size="640x360"), "talk.mov")
        assert res.status_code == 202, res.content
        body = res.json()
        assert (body["status"], body["url"], body["poster_url"]) == ("processing", "", "")
        asset = Asset.objects.get(pk=body["id"])
        assert asset.size == len(clip("mpeg4", size="640x360"))  # the source size is held against the quota

        for callback in callbacks:
            callback()
        done = api.get(f"{URL}{asset.pk}/").json()
        assert (
            done["status"] == "ready" and done["url"].endswith(".mp4") and done["audio_url"].endswith(".m4a")
        )
        converted = Asset.objects.get(pk=asset.pk)
        info = video.probe(Path(converted.file.path))
        assert (info.codec, info.width, info.height, info.audio_codec) == ("h264", 640, 360, "aac")

    def test_a_failed_conversion_says_so(
        self, api, inline_jobs, monkeypatch, django_capture_on_commit_callbacks
    ):
        def broken(*args, **kwargs):
            raise video.VideoError("The video could not be converted.")

        monkeypatch.setattr(video_jobs.video, "normalize", broken)
        with django_capture_on_commit_callbacks(execute=True):
            body = post(api, clip("mpeg4")).json()
        done = api.get(f"{URL}{body['id']}/").json()
        assert done["status"] == "failed" and done["error"] == "The video could not be converted."

    def test_a_clip_deleted_while_converting_does_not_come_back(
        self, api, inline_jobs, django_capture_on_commit_callbacks
    ):
        with django_capture_on_commit_callbacks(execute=False) as callbacks:
            body = post(api, clip("mpeg4")).json()
        Asset.objects.filter(pk=body["id"]).delete()
        for callback in callbacks:
            callback()
        assert not Asset.objects.exists()


@pytest.mark.django_db
class TestStale:
    def test_an_interrupted_conversion_turns_failed_when_looked_at(self, api, user):
        asset = Asset.objects.create(owner=user, kind="video", mime="video/mp4", status="processing")
        Asset.objects.filter(pk=asset.pk).update(updated_at=timezone.now() - timedelta(hours=2))
        body = api.get(f"{URL}{asset.pk}/").json()
        assert body["status"] == "failed" and body["error"] == video_jobs.INTERRUPTED

    def test_a_recent_one_keeps_processing(self, api, user):
        asset = Asset.objects.create(owner=user, kind="video", mime="video/mp4", status="processing")
        assert api.get(f"{URL}{asset.pk}/").json()["status"] == "processing"

    def test_the_sweep_command(self, user):
        from django.core.management import call_command

        asset = Asset.objects.create(owner=user, kind="video", mime="video/mp4", status="processing")
        Asset.objects.filter(pk=asset.pk).update(updated_at=timezone.now() - timedelta(hours=2))
        call_command("sweep_video_jobs")
        assert Asset.objects.get(pk=asset.pk).status == "failed"


@pytest.mark.django_db
class TestWithoutFfmpeg:
    def test_a_video_upload_is_handled_as_before(self, api, settings):
        settings.VIDEO_ENABLED = False
        res = post(api, webm_bytes((1, 2)), "clip.webm")
        assert res.status_code == 400 and "video" in res.json()["error"]["message"]

    def test_pictures_are_unaffected(self, api, settings):
        from .helpers import image_bytes

        settings.VIDEO_ENABLED = False
        assert post(api, image_bytes(), "a.png").json()["kind"] == "image"


@pytest.mark.parametrize(
    "head",
    [
        b"\x00\x00\x00\x1cftypavif\x00\x00\x00\x00avifmif1",
        b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic",
        b"\x00\x00\x00\x18ftypmif1\x00\x00\x00\x00mif1avif",
    ],
)
def test_still_pictures_in_a_media_box_are_not_taken_for_clips(head):
    assert not looks_like_media(head)


@pytest.mark.parametrize(
    "head", [b"\x00\x00\x00\x18ftypisom", b"\x00\x00\x00\x18ftypmp42", b"\x00\x00\x00\x14ftypqt  "]
)
def test_clips_in_a_media_box_are(head):
    assert looks_like_media(head)


@pytest.mark.django_db
def test_an_avif_picture_stays_a_picture_on_a_server_that_takes_clips(api, monkeypatch):
    if not features.check("avif"):
        pytest.skip("Pillow was built without AVIF")
    out = io.BytesIO()
    Image.new("RGB", (32, 24), (120, 80, 200)).save(out, "AVIF")
    monkeypatch.setattr(video, "available", lambda: True)

    def never(*args, **kwargs):
        raise AssertionError("a picture went down the video path")

    monkeypatch.setattr("apps.assets.views.ingest_video_upload", never)
    res = post(api, out.getvalue(), "photo.avif")
    assert res.status_code == 201, res.content
    assert res.json()["kind"] == "image"
