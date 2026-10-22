"""Stock videos: search, filters, key fallback, the clip CDN allow-list, and importing through ffmpeg."""

import pytest

from apps.assets import providers, video
from apps.assets.models import Asset

from .test_stock import FakeNetwork, FakeResponse
from .video_helpers import clip, needs_ffmpeg

SEARCH = "/api/v1/stock/videos/"
PROVIDERS = "/api/v1/stock/videos/providers/"
IMPORT = "/api/v1/stock/videos/import/"
PEXELS = "https://api.pexels.com/v1/videos"
PIXABAY = "https://pixabay.com/api/videos/"


@pytest.fixture
def net(monkeypatch):
    network = FakeNetwork()
    monkeypatch.setattr(providers, "http_get", network)
    return network


@pytest.fixture
def keys(settings):
    settings.PEXELS_VIDEO_API_KEY = "pexels-video-secret"
    settings.PIXABAY_VIDEO_API_KEY = "pixabay-video-secret"
    settings.VIDEO_ENABLED = True


@pytest.fixture(autouse=True)
def _ffmpeg_present(monkeypatch):
    monkeypatch.setattr(video, "available", lambda: True)


def pexels_video(video_id=101, width=1920, height=1080, duration=12, **overrides):
    files = [
        (640, 360, "sd"),
        (1280, 720, "hd"),
        (width, height, "hd"),
        (3840, 2160, "uhd"),
    ]
    item = {
        "id": video_id,
        "width": width,
        "height": height,
        "duration": duration,
        "url": f"https://www.pexels.com/video/{video_id}/",
        "image": f"https://images.pexels.com/videos/{video_id}/poster.jpeg",
        "user": {"name": "Ada Lovelace", "url": "https://www.pexels.com/@ada"},
        "video_files": [
            {
                "quality": q,
                "file_type": "video/mp4",
                "width": w,
                "height": h,
                "link": f"https://videos.pexels.com/video-files/{video_id}/{w}x{h}.mp4",
            }
            for w, h, q in files
        ],
    }
    item.update(overrides)
    return item


def pixabay_video(video_id=202, duration=20, large=(3840, 2160)):
    def rendition(name, w, h):
        return {
            "url": f"https://cdn.pixabay.com/video/2026/01/01/{video_id}_{name}.mp4",
            "width": w,
            "height": h,
            "thumbnail": f"https://cdn.pixabay.com/video/2026/01/01/{video_id}-{name}.jpg",
        }

    return {
        "id": video_id,
        "duration": duration,
        "pageURL": f"https://pixabay.com/videos/x-{video_id}/",
        "user": "grace",
        "user_id": 7,
        "videos": {
            "large": rendition("large", *large),
            "medium": rendition("medium", 1920, 1080),
            "small": rendition("small", 1280, 720),
            "tiny": rendition("tiny", 960, 540),
        },
    }


@pytest.mark.django_db
class TestProviders:
    def test_lists_the_providers_with_their_credit(self, api, keys):
        body = api.get(PROVIDERS).json()
        assert (
            body["enabled"] is True
            and body["default"] == "all"
            and body["all"] == ["pexels_video", "pixabay_video"]
        )
        assert [(p["label"], p["attribution"]) for p in body["providers"]] == [
            ("Pexels", "Videos provided by Pexels"),
            ("Pixabay", "Videos from Pixabay"),
        ]

    def test_falls_back_to_the_photo_keys(self, api, settings):
        settings.PEXELS_VIDEO_API_KEY = settings.PIXABAY_VIDEO_API_KEY = ""
        settings.PEXELS_API_KEY = "photo-key"
        assert [p["name"] for p in api.get(PROVIDERS).json()["providers"]] == ["pexels_video"]

    def test_none_without_ffmpeg(self, api, keys, monkeypatch):
        monkeypatch.setattr(video, "available", lambda: False)
        body = api.get(PROVIDERS).json()
        assert body["enabled"] is False and body["providers"] == []

    def test_listing_order_and_switches(self, api, keys, settings):
        settings.STOCK_VIDEO_PROVIDERS = ["pixabay_video"]
        assert [p["name"] for p in api.get(PROVIDERS).json()["providers"]] == ["pixabay_video"]


@pytest.mark.django_db
class TestSearch:
    def test_pexels_search(self, api, keys, net):
        net.add(f"{PEXELS}/search", FakeResponse(payload={"total_results": 40, "videos": [pexels_video()]}))
        body = api.get(SEARCH, {"q": "sea", "provider": "pexels_video", "per_page": 10}).json()
        assert body["next_page"] == 2 and body["total"] == 40
        (result,) = body["results"]
        assert result == {
            "id": "101",
            "provider": "pexels_video",
            "thumb_url": "https://images.pexels.com/videos/101/poster.jpeg",
            "preview_url": "https://videos.pexels.com/video-files/101/640x360.mp4",
            "width": 1920,
            "height": 1080,
            "duration_ms": 12000,
            "author": "Ada Lovelace",
            "author_url": "https://www.pexels.com/@ada",
            "source_url": "https://www.pexels.com/video/101/",
        }
        call = net.calls[0]
        assert call["headers"]["Authorization"] == "pexels-video-secret"
        assert call["params"] == {"page": 1, "per_page": 10, "query": "sea"}

    def test_pexels_filters(self, api, keys, net):
        payload = {"total_results": 2, "videos": [pexels_video(1, duration=5), pexels_video(2, duration=30)]}
        net.add(f"{PEXELS}/search", FakeResponse(payload=payload))
        res = api.get(
            SEARCH, {"q": "sea", "provider": "pexels_video", "orientation": "landscape", "duration": "short"}
        )
        assert [r["id"] for r in res.json()["results"]] == ["1"]
        params = net.calls[0]["params"]
        assert params["orientation"] == "landscape" and params["per_page"] == 80  # length filtered here

    def test_pexels_popular_filters_length_itself(self, api, keys, net):
        net.add(f"{PEXELS}/popular", FakeResponse(payload={"total_results": 1, "videos": [pexels_video()]}))
        api.get(SEARCH, {"provider": "pexels_video", "duration": "medium", "per_page": 6})
        assert net.calls[0]["params"] == {"page": 1, "per_page": 6, "min_duration": 15, "max_duration": 60}

    def test_files_off_the_clip_cdn_are_ignored(self, api, keys, net):
        item = pexels_video()
        for entry in item["video_files"]:
            entry["link"] = entry["link"].replace("videos.pexels.com", "evil.example")
        net.add(f"{PEXELS}/search", FakeResponse(payload={"total_results": 1, "videos": [item]}))
        assert api.get(SEARCH, {"q": "x", "provider": "pexels_video"}).json()["results"] == []

    def test_pixabay_search_keeps_the_key_out_of_the_answer(self, api, keys, net):
        net.add(PIXABAY, FakeResponse(payload={"totalHits": 3, "hits": [pixabay_video()]}))
        res = api.get(SEARCH, {"q": "forest", "provider": "pixabay_video", "per_page": 5})
        (result,) = res.json()["results"]
        assert result["preview_url"].endswith("_tiny.mp4") and result["thumb_url"].endswith("-small.jpg")
        assert (result["width"], result["height"]) == (3840, 2160)
        params = net.calls[0]["params"]
        assert params["key"] == "pixabay-video-secret" and params["video_type"] == "film"
        assert "pixabay-video-secret" not in res.content.decode()

    def test_pixabay_orientation_is_filtered_here(self, api, keys, net):
        payload = {"totalHits": 2, "hits": [pixabay_video(1), pixabay_video(2, large=(2160, 3840))]}
        net.add(PIXABAY, FakeResponse(payload=payload))
        res = api.get(
            SEARCH, {"q": "x", "provider": "pixabay_video", "orientation": "portrait", "per_page": 5}
        )
        assert [r["id"] for r in res.json()["results"]] == ["2"]
        assert "orientation" not in net.calls[0]["params"] and net.calls[0]["params"]["per_page"] == 20

    def test_all_mixes_both(self, api, keys, net):
        net.add(f"{PEXELS}/search", FakeResponse(payload={"total_results": 1, "videos": [pexels_video()]}))
        net.add(PIXABAY, FakeResponse(payload={"totalHits": 1, "hits": [pixabay_video()]}))
        body = api.get(SEARCH, {"q": "x"}).json()
        assert body["provider"] == "all"
        assert [r["provider"] for r in body["results"]] == ["pexels_video", "pixabay_video"]

    def test_searches_are_cached(self, api, keys, net):
        net.add(f"{PEXELS}/search", FakeResponse(payload={"total_results": 1, "videos": [pexels_video()]}))
        for _ in range(2):
            api.get(SEARCH, {"q": "sea", "provider": "pexels_video"})
        assert len(net.calls) == 1

    def test_a_busy_provider_is_a_429(self, api, keys, net):
        net.add(f"{PEXELS}/search", FakeResponse(status=429, headers={"Retry-After": "30"}))
        res = api.get(SEARCH, {"q": "sea", "provider": "pexels_video"})
        assert res.status_code == 429


@pytest.mark.django_db
class TestImport:
    def test_unknown_id_shape_is_refused(self, api, keys, net):
        res = api.post(IMPORT, {"provider": "pexels_video", "id": "../x"}, format="json")
        assert res.status_code == 400 and net.calls == []

    def test_without_ffmpeg(self, api, keys, net, monkeypatch):
        monkeypatch.setattr(video, "available", lambda: False)
        res = api.post(IMPORT, {"provider": "pexels_video", "id": "101"}, format="json")
        assert res.status_code == 400 and res.json()["error"]["code"] == "video_unavailable"

    def test_a_redirect_off_the_cdn_is_refused(self, api, keys, net):
        net.add(f"{PEXELS}/videos/101", FakeResponse(payload=pexels_video()))
        file_url = "https://videos.pexels.com/video-files/101/1920x1080.mp4"
        net.add(file_url, FakeResponse(status=302, headers={"Location": "https://evil.example/x.mp4"}))
        res = api.post(IMPORT, {"provider": "pexels_video", "id": "101"}, format="json")
        assert res.status_code == 502 and not Asset.objects.exists()

    def test_the_size_cap(self, api, keys, net, settings):
        settings.MAX_VIDEO_UPLOAD_BYTES = 10
        net.add(f"{PEXELS}/videos/101", FakeResponse(payload=pexels_video()))
        net.add(
            "https://videos.pexels.com/video-files/101/1920x1080.mp4",
            FakeResponse(body=b"x" * 100, headers={"Content-Length": "100"}),
        )
        res = api.post(IMPORT, {"provider": "pexels_video", "id": "101"}, format="json")
        assert res.status_code == 413

    @needs_ffmpeg
    def test_imports_picks_the_1080p_file_and_dedupes(self, api, keys, net):
        net.add(f"{PEXELS}/videos/101", FakeResponse(payload=pexels_video()))
        net.add("https://videos.pexels.com/video-files/101/1920x1080.mp4", FakeResponse(body=clip("h264")))
        res = api.post(IMPORT, {"provider": "pexels_video", "id": "101"}, format="json")
        assert res.status_code == 201, res.content
        body = res.json()
        assert (body["kind"], body["status"], body["name"]) == ("video", "ready", "Video by Ada Lovelace")
        assert body["attribution"] == {
            "provider": "pexels_video",
            "author": "Ada Lovelace",
            "author_url": "https://www.pexels.com/@ada",
            "source_url": "https://www.pexels.com/video/101/",
        }
        again = api.post(IMPORT, {"provider": "pexels_video", "id": "101"}, format="json")
        assert again.status_code == 200 and again.json()["id"] == body["id"]

    @needs_ffmpeg
    def test_pixabay_takes_the_largest_rendition_that_fits(self, api, keys, net):
        net.add(PIXABAY, FakeResponse(payload={"totalHits": 1, "hits": [pixabay_video()]}))
        net.add("https://cdn.pixabay.com/video/2026/01/01/202_medium.mp4", FakeResponse(body=clip("h264")))
        res = api.post(IMPORT, {"provider": "pixabay_video", "id": "202"}, format="json")
        assert res.status_code == 201, res.content
