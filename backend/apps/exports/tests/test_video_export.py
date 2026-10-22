"""`export_video`: MP4, WebM and GIF of a saved design, from the file the render page made (no browser)."""

import io
import json

import pytest

from apps.designs.tests.helpers import make_design, make_doc
from apps.exports import services
from apps.exports.exceptions import (
    ExportBusy,
    ExportFailed,
    ImageExportDisabled,
    InvalidExport,
    VideoExportDisabled,
)
from apps.exports.renderer import VideoResult, render_slot

RENDER_URL = "http://frontend.test:8080/render.html"
MIME = {"mp4": "video/mp4", "webm": "video/webm", "gif": "image/gif"}


@pytest.fixture(autouse=True)
def _export_settings(settings):
    settings.SERVER_IMAGE_EXPORT_ENABLED = True
    settings.SERVER_VIDEO_EXPORT_ENABLED = True
    settings.EXPORT_RENDER_PAGE_URL = RENDER_URL
    settings.EXPORT_VIDEO_TIMEOUT_SECONDS = 300
    settings.EXPORT_VIDEO_MAX_SECONDS = 120
    settings.EXPORT_VIDEO_MAX_RESOLUTION = 1080
    settings.EXPORT_VIDEO_MAX_BYTES = 1000


class FakeVideo:
    """The render page: answers `render_video` with a small file of the format asked for."""

    def __init__(self):
        self.calls: list[dict] = []
        self.warnings: tuple[str, ...] = ()
        self.placeholders = 0
        self.missing_fonts: tuple[str, ...] = ()
        self.page_indexes: list[int] | None = None

    def __call__(self, payload, *, render_url, timeout, max_bytes):
        self.calls.append(
            {
                "payload": json.loads(json.dumps(payload)),
                "render_url": render_url,
                "timeout": timeout,
                "max_bytes": max_bytes,
            }
        )
        pages = payload["document"]["pages"]
        indexes = self.page_indexes if self.page_indexes is not None else payload["pages"]
        data = b"video-" + payload["format"].encode()
        return VideoResult(
            file=io.BytesIO(data),
            size=len(data),
            mime=MIME[payload["format"]],
            width=1920,
            height=960,
            fps=payload["fps"],
            frames=450,
            duration_ms=15_000,
            video="GIF" if payload["format"] == "gif" else "H.264",
            audio=None,
            warnings=self.warnings,
            page_ids=tuple(pages[index]["id"] for index in indexes),
            page_indexes=tuple(indexes),
            placeholders=self.placeholders,
            missing_fonts=self.missing_fonts,
            blocked_total=1,
        )


@pytest.fixture
def made(monkeypatch) -> FakeVideo:
    fake = FakeVideo()
    monkeypatch.setattr(services, "render_video", fake)
    return fake


@pytest.fixture
def design(user):
    document = make_doc(pages=3, width=400, height=200)
    return make_design(user, title="Poster", document=document)


def test_an_mp4_of_all_pages_with_the_editor_defaults(design, made):
    bundle = services.export_images(design, format="mp4", pages="all")
    (call,) = made.calls
    assert (call["render_url"], call["timeout"], call["max_bytes"]) == (RENDER_URL, 300, 1000)
    payload = call["payload"]
    assert {key: value for key, value in payload.items() if key != "document"} == {
        "pages": [0, 1, 2],
        "format": "mp4",
        "resolution": "design",
        "fps": 30,
        "quality": "balanced",
        "fit": "fit",
        "sound": True,
        "loops": 0,
        "dither": True,
        "pageSeconds": None,
        "maxMs": 120_000,
        "maxBytes": 1000,
        "fonts": [],
    }
    assert (bundle.format, bundle.mime, bundle.filename) == ("mp4", "video/mp4", "Poster.mp4")
    assert bundle.data == b"" and bundle.file.read() == b"video-mp4" and bundle.size == 9
    assert bundle.filenames == ("Poster.mp4",) and bundle.images[0].bytes_before == 9
    assert bundle.options == {
        "format": "mp4",
        "resolution": "design",
        "fps": 30,
        "quality": "balanced",
        "fit": "fit",
        "sound": True,
        "page_seconds": None,
        "pages": [1, 2, 3],
        "duration_ms": 15_000,
        "frames": 450,
        "video": "H.264",
        "audio": None,
    }
    (video,) = bundle.images
    assert (video.width, video.height, video.page_index, video.page_width) == (1920, 960, 0, 400)
    assert bundle.warnings == ()


def test_a_gif_with_its_own_options_and_the_image_options_left_out(design, made):
    bundle = services.export_images(
        design,
        format="gif",
        pages=[2, 1],
        resolution=360,
        fps=10,
        quality="best",
        fit="fill",
        loop=3,
        dither=False,
        page_seconds=2,
        scale=2,
        transparent=True,
        optimize=True,
    )
    payload = made.calls[0]["payload"]
    assert (payload["pages"], payload["resolution"], payload["fps"], payload["quality"]) == (
        [2, 1],
        360,
        10,
        "high",
    )
    assert (payload["fit"], payload["loops"], payload["dither"], payload["pageSeconds"]) == (
        "fill",
        3,
        False,
        2,
    )
    assert (bundle.format, bundle.mime, bundle.filename) == ("gif", "image/gif", "Poster.gif")
    assert bundle.options["quality"] == "best" and bundle.options["pages"] == [3, 2]
    assert (bundle.options["loop"], bundle.options["dither"]) == (3, False) and "sound" not in bundle.options


@pytest.mark.parametrize(
    ("quality", "level"),
    [
        ("small", "small"),
        ("balanced", "balanced"),
        ("original", "high"),
        (65, "small"),
        (90, "balanced"),
        (95, "high"),
    ],
)
def test_image_qualities_become_the_video_presets(design, made, quality, level):
    services.export_video(design, format="webm", quality=quality)
    assert made.calls[0]["payload"]["quality"] == level


def test_the_pipeline_notes_become_warnings_beside_the_drawing_ones(design, made):
    made.warnings = ("audio-fallback", "something-new")
    made.placeholders, made.missing_fonts = 2, ("Gone Sans",)
    bundle = services.export_video(design, format="mp4")
    assert len(bundle.warnings) == 3
    assert "grey boxes" in bundle.warnings[0] and "Gone Sans" in bundle.warnings[1]
    assert bundle.warnings[2].startswith("The sound is Opus, not AAC")


@pytest.mark.parametrize(
    ("options", "code"),
    [
        ({"format": "mov"}, "invalid_format"),
        ({"fps": 25}, "invalid_fps"),
        ({"format": "gif", "fps": 30}, "invalid_fps"),
        ({"resolution": 1440}, "invalid_resolution"),
        ({"resolution": 2160}, "invalid_resolution"),  # offered, but above EXPORT_VIDEO_MAX_RESOLUTION
        ({"format": "gif", "resolution": 1080}, "invalid_resolution"),
        ({"fit": "stretch"}, "invalid_fit"),
        ({"format": "gif", "loop": -1}, "invalid_loop"),
        ({"page_seconds": 0.5}, "invalid_page_seconds"),
        ({"page_seconds": True}, "invalid_page_seconds"),
        ({"page_seconds": 50}, "too_long"),  # 3 pages x 50 s
    ],
)
def test_options_the_editor_does_not_offer_are_refused_before_drawing(design, made, options, code):
    with pytest.raises(InvalidExport) as caught:
        services.export_video(design, **({"format": "mp4"} | options))
    assert caught.value.get_codes() == code
    assert made.calls == []


def test_a_large_design_at_its_own_size_is_above_the_resolution_limit(user, made, settings):
    design = make_design(user, document=make_doc(pages=1, width=3000, height=3000))
    with pytest.raises(InvalidExport) as caught:
        services.export_video(design, format="mp4", resolution="design")
    assert "1920 px" in str(caught.value.detail)
    settings.EXPORT_VIDEO_MAX_RESOLUTION = 2160
    assert services.export_video(design, format="mp4", resolution="design").format == "mp4"


def test_every_started_10_seconds_after_the_first_is_charged_before_drawing(design, made):
    charged = []
    services.export_video(design, format="mp4", charge=charged.append)  # 3 pages x 5 s
    services.export_video(design, format="mp4", page_seconds=30, charge=charged.append)
    services.export_video(design, format="mp4", pages=[0, 1], charge=charged.append)  # 10 s
    assert charged == [1, 8]


def test_a_page_with_its_own_time_counts_that_time():
    pages = [{"durationSec": 12}, {"durationSec": 900}, {"durationSec": True}, {}]
    assert services.hold_seconds(pages, None) == 12 + 5 + 5 + 5
    assert services.hold_seconds(pages, 2) == 8


def test_a_video_is_not_held_to_the_image_page_limit(design, made, settings):
    settings.EXPORT_IMAGE_MAX_PAGES = 1
    assert services.export_video(design, format="webm").options["pages"] == [1, 2, 3]


def test_structured_names_carry_the_first_page_size(design, made):
    bundle = services.export_video(design, format="mp4", filename_style="structured", unix=1700000000)
    assert bundle.filename.endswith("_400x200_1700000000.mp4")


def test_the_switches(design, made, settings):
    settings.SERVER_VIDEO_EXPORT_ENABLED = False
    with pytest.raises(VideoExportDisabled):
        services.export_video(design, format="mp4")
    settings.SERVER_VIDEO_EXPORT_ENABLED = True
    settings.SERVER_IMAGE_EXPORT_ENABLED = False
    with pytest.raises(ImageExportDisabled):
        services.export_video(design, format="mp4")
    assert made.calls == []


def test_a_render_page_that_made_other_pages_is_a_failure(design, made):
    made.page_indexes = [0]
    with pytest.raises(ExportFailed):
        services.export_video(design, format="mp4")


def test_the_owner_holds_one_render_slot(design, made):
    with render_slot(design.owner_id), pytest.raises(ExportBusy):
        services.export_video(design, format="mp4")
