"""What a clip is and what has to happen to it, from ffprobe's description (no ffmpeg needed here)."""

import pytest

from apps.assets import video


def described(**video_stream):
    stream = {
        "codec_type": "video",
        "codec_name": "h264",
        "pix_fmt": "yuv420p",
        "width": 1920,
        "height": 1080,
        "r_frame_rate": "30/1",
        "avg_frame_rate": "30/1",
        **video_stream,
    }
    return {
        "format": {"format_name": "mov,mp4,m4a,3gp,3g2,mj2", "duration": "12.5"},
        "streams": [stream, {"codec_type": "audio", "codec_name": "aac"}],
    }


def info(**video_stream):
    return video.read_probe(described(**video_stream), size=1000)


class TestReadProbe:
    def test_a_web_ready_clip_is_only_rewrapped(self):
        clip = info()
        assert clip.web_ready
        assert (clip.duration_ms, clip.width, clip.height, clip.fps, clip.has_audio) == (
            12500,
            1920,
            1080,
            30,
            True,
        )

    @pytest.mark.parametrize(
        "change",
        [
            {"codec_name": "hevc"},
            {"pix_fmt": "yuv420p10le"},
            {"width": 3840, "height": 2160},
            {"avg_frame_rate": "2997/125"},  # variable frame rate
            {"r_frame_rate": "120/1", "avg_frame_rate": "120/1"},
            {"color_transfer": "arib-std-b67"},  # HDR (HLG)
            {"side_data_list": [{"rotation": -90}]},
        ],
    )
    def test_anything_else_is_converted(self, change):
        assert not info(**change).web_ready

    def test_audio_that_is_not_aac_is_converted(self):
        data = described()
        data["streams"][1]["codec_name"] = "opus"
        assert not video.read_probe(data, 1).web_ready

    def test_a_portrait_clip_fits_the_same_box_turned(self):
        assert info(width=1080, height=1920).web_ready

    def test_rotation_swaps_the_shown_size(self):
        clip = info(width=1920, height=1080, side_data_list=[{"rotation": 90}])
        assert (clip.width, clip.height, clip.rotation) == (1080, 1920, 90)

    def test_rotation_from_an_old_tag(self):
        assert info(tags={"rotate": "270"}).rotation == 270

    def test_silent_clip(self):
        data = described()
        data["streams"].pop()
        clip = video.read_probe(data, 1)
        assert not clip.has_audio and clip.web_ready

    @pytest.mark.parametrize(
        ("data", "message"),
        [
            ({"format": {"format_name": "mp3", "duration": "3"}, "streams": []}, "not supported"),
            (
                {"format": {"format_name": "mov,mp4", "duration": "3"}, "streams": [{"codec_type": "audio"}]},
                "no video",
            ),
            (
                described(codec_name="gif") | {"format": {"format_name": "matroska", "duration": "2"}},
                "picture",
            ),
            (described(width=9000), "size"),
        ],
    )
    def test_refused(self, data, message):
        with pytest.raises(video.VideoError, match=message):
            video.read_probe(data, 1)

    @pytest.mark.parametrize(("real", "average"), [("1000/1", "0/0"), ("0/0", "0/0"), ("1000/1", "1000/1")])
    def test_a_browser_recording_is_converted_at_a_steady_rate(self, real, average):
        clip = info(codec_name="vp8", r_frame_rate=real, avg_frame_rate=average)
        assert (clip.fps, clip.constant_rate, clip.web_ready) == (30, False, False)
        args = video.transcode_args(video.Path("in"), video.Path("out.mp4"), clip)
        assert "fps=30.000" in args[args.index("-vf") + 1]

    def test_a_cover_picture_is_not_a_video_stream(self):
        data = {
            "format": {"format_name": "mov,mp4,m4a", "duration": "30"},
            "streams": [
                {"codec_type": "audio", "codec_name": "aac"},
                {"codec_type": "video", "codec_name": "mjpeg", "disposition": {"attached_pic": 1}},
            ],
        }
        with pytest.raises(video.VideoError, match="no video"):
            video.read_probe(data, 1)

    def test_too_long(self, settings):
        settings.MAX_VIDEO_DURATION_SECONDS = 10
        with pytest.raises(video.VideoError, match="too long"):
            info()

    def test_no_length(self):
        data = described()
        data["format"]["duration"] = "N/A"
        with pytest.raises(video.VideoError, match="no length"):
            video.read_probe(data, 1)


class TestPlans:
    @pytest.mark.parametrize(
        ("width", "height", "expected"),
        [
            (3840, 2160, (1920, 1080)),
            (2160, 3840, (1080, 1920)),
            (1000, 1000, (1000, 1000)),  # never scaled up
            (641, 361, (640, 360)),  # odd sizes become even
            (4000, 1000, (1920, 480)),
        ],
    )
    def test_output_size(self, width, height, expected):
        assert video.output_size(info(width=width, height=height)) == expected

    @pytest.mark.parametrize(
        ("duration_ms", "expected"),
        [(800, (2, 500)), (10_000, (20, 500)), (60_000, (60, 1000)), (600_000, (60, 10_000))],
    )
    def test_strip_plan(self, duration_ms, expected):
        assert video.strip_plan(duration_ms) == expected

    def test_transcode_keeps_key_frames_close_together(self):
        clip = info(codec_name="hevc")
        args = video.transcode_args(video.Path("in"), video.Path("out.mp4"), clip)
        assert args[args.index("-g") + 1] == "60" and "+faststart" in args and "libx264" in args

    def test_a_conversion_is_bounded_in_length_size_threads_and_cpu_time(self, settings, monkeypatch):
        settings.MAX_VIDEO_DURATION_SECONDS, settings.MAX_VIDEO_UPLOAD_BYTES = 300, 1000
        settings.VIDEO_FFMPEG_THREADS, settings.VIDEO_TRANSCODE_TIMEOUT_SECONDS = 3, 100
        monkeypatch.setattr(video.os, "cpu_count", lambda: 8)
        args = video.transcode_args(video.Path("in"), video.Path("out.mp4"), info(codec_name="hevc"))
        bounds = " ".join(args[args.index("+faststart") + 1 : -1])
        assert bounds == "-t 300 -fs 2000 -threads 3 -filter_threads 3 -timelimit 800"
        assert args[-1] == "out.mp4"

    def test_a_conversion_cut_short_by_the_size_cap_is_refused(self, settings, tmp_path, monkeypatch):
        settings.MAX_VIDEO_UPLOAD_BYTES = 10
        target = tmp_path / "clip.mp4"
        monkeypatch.setattr(video, "_run", lambda args, **kwargs: target.write_bytes(b"x" * 20))
        monkeypatch.setattr(video, "probe", lambda path: pytest.fail("probed a clip that was cut short"))
        with pytest.raises(video.VideoError, match="too large"):
            video.normalize(tmp_path / "source", target, info(codec_name="hevc"))

    def test_the_slot_raises_busy_when_every_one_is_taken(self, settings):
        settings.VIDEO_MAX_CONCURRENCY = 1
        with video.slot(), pytest.raises(video.VideoBusy), video.slot(wait=0):
            pass


class TestInputs:
    """ffprobe and ffmpeg read every input as a local file in a clip container, never a URL or a playlist."""

    @staticmethod
    def guarded(args: list[str]) -> bool:
        guard = list(video.INPUT_GUARD)
        return (
            all(args[i - len(guard) : i] == guard for i, arg in enumerate(args) if arg == "-i")
            and "-i" in args
        )

    def test_conversions(self):
        clip = info(codec_name="hevc")
        assert self.guarded(video.remux_args(video.Path("in"), video.Path("out.mp4")))
        assert self.guarded(video.transcode_args(video.Path("in"), video.Path("out.mp4"), clip))

    def test_probe_sound_and_stills(self, monkeypatch, tmp_path):
        commands = []

        def run(args, **kwargs):
            commands.append(args)
            raise video.Unreadable("stop here")

        monkeypatch.setattr(video, "_run", run)
        clip = tmp_path / "clip.mp4"
        clip.write_bytes(b"x")
        for call in (lambda: video.probe(clip), lambda: video.make_stills(clip, info())):
            with pytest.raises(video.VideoError):
                call()
        assert video.extract_audio(clip, tmp_path / "sound.m4a") is False
        assert len(commands) == 3 and all(self.guarded(args) for args in commands)
