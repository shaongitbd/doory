"""Recognising audio containers from their bytes (apps/assets/audio.py)."""

import struct

import pytest

from apps.assets.audio import AudioError, looks_like_audio, ogg_crc, parse_audio

from .audio_helpers import (
    m4a_bytes,
    mp3_bytes,
    ogg_opus_bytes,
    ogg_theora_bytes,
    ogg_vorbis_bytes,
    wav_bytes,
    webm_bytes,
)
from .helpers import SAFE_SVG, image_bytes


class TestRecognising:
    @pytest.mark.parametrize(
        "data",
        [
            wav_bytes(),
            mp3_bytes(id3=True),
            mp3_bytes(),
            ogg_opus_bytes(),
            m4a_bytes(),
            webm_bytes(),
        ],
    )
    def test_audio_signatures(self, data):
        assert looks_like_audio(data)

    @pytest.mark.parametrize(
        "data",
        [
            image_bytes("PNG"),
            image_bytes("JPEG"),
            image_bytes("WEBP"),
            image_bytes("GIF"),
            SAFE_SVG,
            b"<html></html>",
            b"",
            b"RIFF\x24\x00\x00\x00WEBPVP8 ",
            b"\x00\x00\x00\x1cftypavif\x00\x00\x00\x00avifmif1",
            b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00heicmif1",
        ],
    )
    def test_other_files_are_not_audio(self, data):
        assert not looks_like_audio(data)


class TestWave:
    def test_describes_the_file(self):
        info = parse_audio(wav_bytes(seconds=0.5, rate=22050, channels=2, bits=16))
        assert (info.mime, info.ext, info.codec, info.channels, info.sample_rate) == (
            "audio/wav",
            "wav",
            "pcm",
            2,
            22050,
        )
        assert info.duration_ms == 500

    @pytest.mark.parametrize("bits", [8, 24, 32])
    def test_sample_sizes(self, bits):
        assert parse_audio(wav_bytes(bits=bits)).sample_rate == 8000

    def test_no_data_chunk(self):
        data = wav_bytes()
        cut = data.index(b"data")
        with pytest.raises(AudioError):
            parse_audio(data[:cut])

    def test_empty_data_chunk(self):
        with pytest.raises(AudioError):
            parse_audio(wav_bytes(seconds=0))

    def test_absurd_sample_rate(self):
        with pytest.raises(AudioError):
            parse_audio(wav_bytes(rate=1))

    def test_too_many_channels(self):
        with pytest.raises(AudioError):
            parse_audio(wav_bytes(channels=9))

    def test_declared_size_beyond_the_file_is_clamped(self):
        data = bytearray(wav_bytes(seconds=0.25))
        index = data.index(b"data")
        data[index + 4 : index + 8] = struct.pack("<I", 0xFFFFFFFF)
        assert parse_audio(bytes(data)).duration_ms == 250


class TestMp3:
    def test_frames_without_a_tag(self):
        info = parse_audio(mp3_bytes(frames=10))
        assert (info.mime, info.ext, info.codec, info.channels, info.sample_rate) == (
            "audio/mpeg",
            "mp3",
            "mp3",
            2,
            44100,
        )
        assert info.duration_ms == round(10 * 1152 * 1000 / 44100)

    @pytest.mark.parametrize("mono", [False, True])
    @pytest.mark.parametrize("name", [b"Xing", b"Info"])
    def test_the_frame_count_of_a_xing_or_info_tag(self, name, mono):
        # 288,000 frames of 1152 samples at 44.1 kHz, about 2 h 05 min, declared in a single frame.
        data = mp3_bytes(frames=1, mono=mono, xing=(name, 288_000), trailer=b"TAG" + b"\x00" * 125)
        info = parse_audio(data)
        assert info.channels == (1 if mono else 2)
        assert info.duration_ms == round(288_000 * 1152 * 1000 / 44100)

    def test_a_xing_count_past_a_day_is_not_believed(self):
        info = parse_audio(mp3_bytes(frames=3, xing=(b"Xing", 0xFFFFFFFF)))
        assert info.duration_ms == round(3 * 1152 * 1000 / 44100)

    def test_with_an_id3_tag(self):
        assert parse_audio(mp3_bytes(frames=4, id3=True)).codec == "mp3"

    def test_an_id3v1_trailer_is_fine(self):
        assert parse_audio(mp3_bytes(frames=4, trailer=b"TAG" + b"\x00" * 125)).codec == "mp3"

    def test_an_id3_tag_without_frames(self):
        with pytest.raises(AudioError):
            parse_audio(mp3_bytes(frames=0, id3=True))

    def test_a_single_header_followed_by_text(self):
        with pytest.raises(AudioError):
            parse_audio(mp3_bytes(frames=1) + b"<script>alert(1)</script>" * 100)

    def test_a_cut_first_frame(self):
        with pytest.raises(AudioError):
            parse_audio(mp3_bytes(frames=1)[:200])

    def test_a_cut_last_frame_is_tolerated(self):
        assert parse_audio(mp3_bytes(frames=6)[:-100]).codec == "mp3"

    def test_oversized_id3_tag(self):
        with pytest.raises(AudioError):
            parse_audio(b"ID3\x03\x00\x00\x7f\x7f\x7f\x7f" + b"\x00" * 100)

    def test_invalid_id3_size(self):
        with pytest.raises(AudioError):
            parse_audio(b"ID3\x03\x00\x00\xff\xff\xff\xff" + b"\x00" * 100)

    @pytest.mark.parametrize(
        "header", [b"\xff\xe0\x00\x00", b"\xff\xfb\xf0\x00", b"\xff\xfb\x00\x00", b"\xff\xfb\x9c\x00"]
    )
    def test_invalid_frame_headers(self, header):
        with pytest.raises(AudioError):
            parse_audio(header + b"\x00" * 600)


class TestOgg:
    def test_opus(self):
        info = parse_audio(ogg_opus_bytes(seconds=0.5))
        assert (info.mime, info.ext, info.codec, info.channels, info.sample_rate) == (
            "audio/ogg",
            "ogg",
            "opus",
            2,
            48000,
        )
        assert info.duration_ms == 500

    def test_vorbis(self):
        info = parse_audio(ogg_vorbis_bytes(seconds=1.0, rate=44100))
        assert (info.codec, info.channels, info.sample_rate, info.duration_ms) == ("vorbis", 2, 44100, 1000)

    def test_video_in_ogg_is_refused(self):
        with pytest.raises(AudioError, match="Opus, Vorbis and FLAC"):
            parse_audio(ogg_theora_bytes())

    def test_a_damaged_first_page(self):
        data = bytearray(ogg_opus_bytes())
        data[40] ^= 0xFF
        with pytest.raises(AudioError, match="damaged"):
            parse_audio(bytes(data))

    def test_cut_short(self):
        with pytest.raises(AudioError):
            parse_audio(ogg_opus_bytes()[:-10])

    def test_not_a_first_page(self):
        data = bytearray(ogg_opus_bytes())
        data[5] = 0
        with pytest.raises(AudioError):
            parse_audio(bytes(data))

    def test_a_second_stream_is_refused(self):
        first, second = ogg_opus_bytes(), ogg_opus_bytes()
        with pytest.raises(AudioError):
            parse_audio(first[: first.index(b"OggS", 4)] + second)

    def test_crc_of_a_known_page(self):
        assert ogg_crc(b"") == 0
        assert ogg_crc(b"OggS") != 0


class TestM4a:
    def test_audio_only(self):
        info = parse_audio(m4a_bytes(seconds=1.5))
        assert (info.mime, info.ext, info.codec, info.duration_ms) == ("audio/mp4", "m4a", "aac", 1500)

    def test_a_video_track_is_refused(self):
        with pytest.raises(AudioError, match="video"):
            parse_audio(m4a_bytes((b"soun", b"vide"), brand=b"mp42"))

    def test_no_audio_track(self):
        with pytest.raises(AudioError, match="no audio track"):
            parse_audio(m4a_bytes((b"text",)))

    def test_no_media_data(self):
        data = m4a_bytes()
        with pytest.raises(AudioError):
            parse_audio(data[: data.index(b"mdat") - 4])

    def test_a_box_larger_than_the_file(self):
        data = bytearray(m4a_bytes())
        data[0:4] = struct.pack(">I", 99999)
        with pytest.raises(AudioError):
            parse_audio(bytes(data))

    def test_an_image_brand_is_not_audio(self):
        with pytest.raises(AudioError):
            parse_audio(b"\x00\x00\x00\x18ftypavif\x00\x00\x00\x00avifmif1" + b"\x00" * 40)


class TestWebm:
    def test_audio_only_as_written_while_recording(self):
        info = parse_audio(webm_bytes())
        assert (info.mime, info.ext, info.codec, info.duration_ms) == ("audio/webm", "weba", "opus", None)

    def test_with_a_duration(self):
        assert parse_audio(webm_bytes(live=False)).duration_ms == 2500

    def test_a_video_track_is_refused(self):
        with pytest.raises(AudioError, match="video"):
            parse_audio(webm_bytes((1, 2)))

    def test_only_webm_documents(self):
        with pytest.raises(AudioError, match="not a WebM"):
            parse_audio(webm_bytes(doctype=b"matroska"))

    def test_no_tracks(self):
        with pytest.raises(AudioError):
            parse_audio(webm_bytes(()))

    def test_just_the_signature(self):
        with pytest.raises(AudioError):
            parse_audio(b"\x1a\x45\xdf\xa3" + b"\x00" * 20)


def test_nothing_else_is_accepted():
    with pytest.raises(AudioError):
        parse_audio(b"MZ\x90\x00" + b"\x00" * 100)


class TestBoxBudget:
    def test_a_file_of_millions_of_tiny_boxes_is_refused_quickly(self):
        import time

        honest = m4a_bytes()
        free = struct.pack(">I4s", 8, b"free")
        started = time.perf_counter()
        with pytest.raises(AudioError, match="too many boxes"):
            parse_audio(
                honest[: honest.index(b"moov") - 4] + free * 400_000 + honest[honest.index(b"moov") - 4 :]
            )
        assert time.perf_counter() - started < 2

    def test_an_ordinary_file_is_far_below_the_budget(self):
        assert parse_audio(m4a_bytes()).codec == "aac"
