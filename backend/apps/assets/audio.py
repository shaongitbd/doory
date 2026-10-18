"""Audio uploads: recognise the container from its bytes and check that it really is audio.

No codec library is needed (and none is allowed to be GPL): every check below reads headers. A file is
accepted only when its structure is coherent for one of the five formats Doory takes: MP3, Ogg (Opus,
Vorbis, FLAC), WAVE, M4A (ISO base media with an audio track and no video track) and WebM (EBML with an
audio track and no video track). The filename and the client's MIME type are never consulted. The file
is stored as it came (re-encoding would need a decoder); it is served from `/media/` with `nosniff` and a
sandboxing CSP, as every upload is.

`looks_like_audio` says whether the first bytes claim to be audio (so the caller does not try Pillow on them);
`parse_audio` is the strict check and raises `AudioError` for anything that is not a coherent file.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

MAX_ID3_BYTES = 4 * 1024 * 1024
MAX_FRAME_WALK = 400_000
MAX_DURATION_MS = 24 * 60 * 60 * 1000  # the longest track a design may hold
MAX_CHUNKS = 256
MAX_BOX_DEPTH = 8
MAX_BOXES = 50_000
MAX_EBML_ELEMENTS = 4096
EBML_SCAN_BYTES = 2 * 1024 * 1024

MP3_MIME, OGG_MIME, WAV_MIME, M4A_MIME, WEBM_MIME = (
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/mp4",
    "audio/webm",
)
EXTENSIONS = {MP3_MIME: "mp3", OGG_MIME: "ogg", WAV_MIME: "wav", M4A_MIME: "m4a", WEBM_MIME: "weba"}

#: Brands that mean "audio in an ISO base media file". Image brands (avif, heic, mif1 ...) belong to Pillow.
_AUDIO_BRANDS = frozenset(
    {
        b"M4A ",
        b"M4B ",
        b"M4P ",
        b"F4A ",
        b"mp41",
        b"mp42",
        b"isom",
        b"iso2",
        b"iso4",
        b"iso5",
        b"iso6",
        b"dash",
    }
    | {b"3gp4", b"3gp5", b"3gp6", b"3g2a", b"qt  "}
)


class AudioError(ValueError):
    """The bytes are not a coherent audio file of a supported kind."""


@dataclass(frozen=True)
class AudioInfo:
    mime: str
    codec: str
    channels: int | None = None
    sample_rate: int | None = None
    #: Best effort: absent when the container does not say (a WebM written while recording, for example).
    duration_ms: int | None = None

    @property
    def ext(self) -> str:
        return EXTENSIONS[self.mime]

    def as_meta(self) -> dict:
        info: dict = {"codec": self.codec}
        for key, value in (
            ("channels", self.channels),
            ("sample_rate", self.sample_rate),
            ("duration_ms", self.duration_ms),
        ):
            if value is not None:
                info[key] = value
        return info


# ---- recognising ---------------------------------------------------------------------------------


def looks_like_audio(data: bytes) -> bool:
    """True when the first bytes are the signature of one of the supported containers."""
    head = data[:16]
    if head[:3] == b"ID3" or head[:4] in (b"OggS", b"\x1a\x45\xdf\xa3"):
        return True
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return True
    if len(head) >= 2 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0:
        return True
    return head[4:8] == b"ftyp" and head[8:12] in _AUDIO_BRANDS


def parse_audio(data: bytes) -> AudioInfo:
    """Check `data` and describe it. Raises `AudioError` unless it is a coherent audio file."""
    head = data[:16]
    if head[:4] == b"OggS":
        return _parse_ogg(data)
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return _parse_wav(data)
    if head[4:8] == b"ftyp":
        return _parse_isobmff(data)
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return _parse_webm(data)
    if head[:3] == b"ID3" or (len(head) >= 2 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0):
        return _parse_mp3(data)
    raise AudioError("The file is not a supported audio file.")


# ---- MP3 -----------------------------------------------------------------------------------------

_MPEG_BITRATES = {
    # (version, layer) -> kbps by index 1..14
    (1, 1): (32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448),
    (1, 2): (32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384),
    (1, 3): (32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320),
    (2, 1): (32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256),
    (2, 2): (8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160),
    (2, 3): (8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160),
}
_MPEG_RATES = {1: (44100, 48000, 32000), 2: (22050, 24000, 16000), 25: (11025, 12000, 8000)}


@dataclass(frozen=True)
class _Mp3Frame:
    length: int
    sample_rate: int
    channels: int
    samples: int
    layer: int
    side_info_end: int  # offset of the first byte after the side information (where a Xing tag sits)


def _mp3_frame(data: bytes, pos: int) -> _Mp3Frame | None:
    if pos + 4 > len(data):
        return None
    b1, b2, b3, b4 = data[pos : pos + 4]
    if b1 != 0xFF or b2 & 0xE0 != 0xE0:
        return None
    version_bits, layer_bits = (b2 >> 3) & 3, (b2 >> 1) & 3
    if version_bits == 1 or layer_bits == 0:
        return None
    version = {3: 1, 2: 2, 0: 25}[version_bits]
    layer = 4 - layer_bits
    bitrate_index, rate_index, padding = b3 >> 4, (b3 >> 2) & 3, (b3 >> 1) & 1
    if bitrate_index in (0, 15) or rate_index == 3:
        return None
    table = _MPEG_BITRATES.get((1 if version == 1 else 2, layer))
    if table is None:
        return None
    bitrate = table[bitrate_index - 1] * 1000
    sample_rate = _MPEG_RATES[version][rate_index]
    channels = 1 if (b4 >> 6) == 3 else 2
    if layer == 1:
        length, samples = (12 * bitrate // sample_rate + padding) * 4, 384
    elif layer == 3 and version != 1:
        length, samples = 72 * bitrate // sample_rate + padding, 576
    else:
        length, samples = 144 * bitrate // sample_rate + padding, 1152
    if length < 8:
        return None
    # Where a Xing/Info tag starts, counted from the frame start: the 4-byte header plus the side information.
    side = 36 if (version == 1 and channels == 2) else 21 if version == 1 else 21 if channels == 2 else 13
    return _Mp3Frame(length, sample_rate, channels, samples, layer, pos + side)


def _skip_id3(data: bytes) -> int:
    pos = 0
    while data[pos : pos + 3] == b"ID3":
        if len(data) < pos + 10:
            raise AudioError("The ID3 tag is cut short.")
        size_bytes = data[pos + 6 : pos + 10]
        if any(b & 0x80 for b in size_bytes):
            raise AudioError("The ID3 tag has an invalid size.")
        size = (size_bytes[0] << 21) | (size_bytes[1] << 14) | (size_bytes[2] << 7) | size_bytes[3]
        footer = 10 if data[pos + 5] & 0x10 else 0
        if size > MAX_ID3_BYTES:
            raise AudioError("The ID3 tag is too large.")
        pos += 10 + size + footer
    return pos


def _parse_mp3(data: bytes) -> AudioInfo:
    pos = _skip_id3(data)
    # Some encoders pad the tag with zeros before the first frame.
    limit = min(len(data), pos + 64 * 1024)
    while pos < limit and data[pos] == 0:
        pos += 1
    first = _mp3_frame(data, pos)
    if first is None:
        raise AudioError("No MP3 audio frame follows the header.")
    frames, cursor = 0, pos
    while cursor < len(data) and frames < MAX_FRAME_WALK:
        frame = _mp3_frame(data, cursor)
        if frame is None:
            break
        if cursor + frame.length > len(data):
            if frames == 0:
                raise AudioError("The MP3 is cut short.")
            break
        cursor += frame.length
        frames += 1
    rest = data[cursor:]
    tagged = rest[:3] == b"TAG" or rest[:8] == b"APETAGEX" or rest[:9] == b"LYRICSBEG"
    if not tagged and (cursor - pos) < 0.8 * (len(data) - pos):
        raise AudioError("The MP3 frames are not consecutive.")
    samples = frames * first.samples
    info_tag = data[first.side_info_end : first.side_info_end + 4]
    if info_tag in (b"Xing", b"Info") and len(data) >= first.side_info_end + 12:
        flags = struct.unpack(">I", data[first.side_info_end + 4 : first.side_info_end + 8])[0]
        declared = (
            struct.unpack(">I", data[first.side_info_end + 8 : first.side_info_end + 12])[0] * first.samples
        )
        # The tag's frame count is what makes long VBR files right; a count past a day is not believed.
        if flags & 1 and declared * 1000 <= MAX_DURATION_MS * first.sample_rate:
            samples = declared
    return AudioInfo(
        mime=MP3_MIME,
        codec="mp3",
        channels=first.channels,
        sample_rate=first.sample_rate,
        duration_ms=round(samples * 1000 / first.sample_rate),
    )


# ---- Ogg -----------------------------------------------------------------------------------------


def _ogg_crc_table() -> tuple[int, ...]:
    table = []
    for i in range(256):
        value = i << 24
        for _ in range(8):
            value = ((value << 1) ^ 0x04C11DB7) if value & 0x80000000 else value << 1
            value &= 0xFFFFFFFF
        table.append(value)
    return tuple(table)


_OGG_CRC = _ogg_crc_table()


def ogg_crc(page: bytes) -> int:
    """The Ogg page checksum (CRC-32, polynomial 0x04C11DB7, not reflected) of a page with its CRC zeroed."""
    crc = 0
    for byte in page:
        crc = ((crc << 8) & 0xFFFFFFFF) ^ _OGG_CRC[((crc >> 24) & 0xFF) ^ byte]
    return crc


def _ogg_page(data: bytes, pos: int) -> tuple[int, int, int, bytes] | None:
    """(header type, granule, page end, start of the first packet) of the page at `pos`; None if malformed."""
    if data[pos : pos + 4] != b"OggS" or pos + 27 > len(data) or data[pos + 4] != 0:
        return None
    segments = data[pos + 26]
    table_end = pos + 27 + segments
    if table_end > len(data):
        return None
    body = sum(data[pos + 27 : table_end])
    end = table_end + body
    if end > len(data):
        return None
    granule = struct.unpack("<q", data[pos + 6 : pos + 14])[0]
    return data[pos + 5], granule, end, data[table_end : min(end, table_end + 64)]


def _parse_ogg(data: bytes) -> AudioInfo:
    first = _ogg_page(data, 0)
    if first is None or not first[0] & 0x02:
        raise AudioError("The Ogg file does not start with a first page.")
    _, _, first_end, packet = first
    stored = struct.unpack("<I", data[22:26])[0]
    if ogg_crc(data[:22] + b"\x00\x00\x00\x00" + data[26:first_end]) != stored:
        raise AudioError("The first Ogg page is damaged.")
    pre_skip = 0
    if packet.startswith(b"OpusHead") and len(packet) >= 19 and packet[8] >> 4 == 0 and packet[9] > 0:
        codec, channels, rate, divisor = "opus", packet[9], 48000, 48000
        pre_skip = struct.unpack("<H", packet[10:12])[0]
    elif packet.startswith(b"\x01vorbis") and len(packet) >= 16:
        codec, channels = "vorbis", packet[11]
        rate = struct.unpack("<I", packet[12:16])[0]
        divisor = rate
        if channels == 0 or not 4000 <= rate <= 192000:
            raise AudioError("The Vorbis header is not valid.")
    elif packet.startswith(b"\x7fFLAC") and len(packet) >= 13:
        codec, channels, rate, divisor = "flac", None, None, 0
    else:
        raise AudioError("Only Opus, Vorbis and FLAC audio in Ogg is supported.")
    pos, pages, last_granule, saw_second = first_end, 1, -1, False
    while pos < len(data) and pages < MAX_FRAME_WALK:
        page = _ogg_page(data, pos)
        if page is None:
            raise AudioError("The Ogg file is damaged or cut short.")
        if not saw_second:
            saw_second = True
            if page[0] & 0x02:
                raise AudioError("The Ogg file holds more than one stream.")
        if page[1] >= 0:
            last_granule = page[1]
        pos, pages = page[2], pages + 1
    if not saw_second:
        raise AudioError("The Ogg file has no audio data.")
    duration = None
    if divisor and last_granule > pre_skip:
        duration = round((last_granule - pre_skip) * 1000 / divisor)
    return AudioInfo(mime=OGG_MIME, codec=codec, channels=channels, sample_rate=rate, duration_ms=duration)


# ---- WAVE ----------------------------------------------------------------------------------------

_WAV_TAGS = {1: "pcm", 3: "float", 6: "alaw", 7: "mulaw", 0xFFFE: "pcm"}


def _parse_wav(data: bytes) -> AudioInfo:
    pos, chunks = 12, 0
    fmt: tuple[int, int, int, int, int] | None = None
    data_size = None
    while pos + 8 <= len(data) and chunks < MAX_CHUNKS:
        chunk_id, size = data[pos : pos + 4], struct.unpack("<I", data[pos + 4 : pos + 8])[0]
        body = pos + 8
        if chunk_id == b"fmt ":
            if size < 16 or body + 16 > len(data):
                raise AudioError("The WAVE format chunk is damaged.")
            tag, channels, rate, byte_rate, _, bits = struct.unpack("<HHIIHH", data[body : body + 16])
            if tag == 0xFFFE and size >= 26 and body + 26 <= len(data):
                tag = struct.unpack("<H", data[body + 24 : body + 26])[0]
            fmt = (tag, channels, rate, byte_rate, bits)
        elif chunk_id == b"data":
            data_size = min(size, len(data) - body)
            break
        pos = body + size + (size & 1)
        chunks += 1
    if fmt is None or data_size is None or data_size <= 0:
        raise AudioError("The WAVE file has no format or no audio data.")
    tag, channels, rate, byte_rate, bits = fmt
    if tag not in _WAV_TAGS or not 1 <= channels <= 8 or not 8000 <= rate <= 192000:
        raise AudioError("The WAVE format is not supported.")
    if bits not in (8, 16, 24, 32, 64) or byte_rate <= 0:
        raise AudioError("The WAVE sample size is not supported.")
    return AudioInfo(
        mime=WAV_MIME,
        codec=_WAV_TAGS[tag],
        channels=channels,
        sample_rate=rate,
        duration_ms=round(data_size * 1000 / byte_rate),
    )


# ---- ISO base media (M4A) ------------------------------------------------------------------------


def _boxes(data: bytes, start: int, end: int, budget: list[int]):
    """(type, body start, body end) of each box in data[start:end]; raises when a box overruns its parent.

    `budget` holds the number of boxes the whole file may still have: a file of 8-byte boxes would otherwise
    keep the interpreter busy for seconds.
    """
    pos = start
    while pos + 8 <= end:
        budget[0] -= 1
        if budget[0] < 0:
            raise AudioError("The media file has too many boxes.")
        size, kind = struct.unpack(">I4s", data[pos : pos + 8])
        header = 8
        if size == 1:
            if pos + 16 > end:
                raise AudioError("A box is cut short.")
            size, header = struct.unpack(">Q", data[pos + 8 : pos + 16])[0], 16
        elif size == 0:
            size = end - pos
        if size < header or pos + size > end:
            raise AudioError("A box is larger than its container.")
        yield kind, pos + header, pos + size
        pos += size


def _parse_isobmff(data: bytes) -> AudioInfo:
    brand = data[8:12]
    if brand not in _AUDIO_BRANDS:
        raise AudioError("The media file is not an audio file.")
    handlers: list[bytes] = []
    duration_ms = None
    seen: set[bytes] = set()
    moov: tuple[int, int] | None = None
    budget = [MAX_BOXES]
    for kind, body, end in _boxes(data, 0, len(data), budget):
        seen.add(kind)
        if kind == b"moov":
            moov = (body, end)
    if moov is None or not seen & {b"mdat", b"moof"}:
        raise AudioError("The media file has no audio data.")

    def walk(start: int, end: int, depth: int) -> None:
        nonlocal duration_ms
        if depth > MAX_BOX_DEPTH:
            raise AudioError("The media boxes are nested too deeply.")
        for kind, body, box_end in _boxes(data, start, end, budget):
            if kind in (b"trak", b"mdia"):
                walk(body, box_end, depth + 1)
            elif kind == b"hdlr" and box_end - body >= 12:
                handlers.append(data[body + 8 : body + 12])
            elif kind == b"mvhd" and depth == 0 and duration_ms is None:
                duration_ms = _mvhd_duration(data, body, box_end)

    walk(moov[0], moov[1], 0)
    if b"vide" in handlers or b"auxv" in handlers:
        raise AudioError("The media file contains video, not just audio.")
    if b"soun" not in handlers:
        raise AudioError("The media file has no audio track.")
    return AudioInfo(mime=M4A_MIME, codec="aac", duration_ms=duration_ms)


def _mvhd_duration(data: bytes, body: int, end: int) -> int | None:
    if end - body < 20:
        return None
    version = data[body]
    if version == 1 and end - body >= 32:
        timescale, duration = struct.unpack(">IQ", data[body + 20 : body + 32])
    elif version == 0:
        timescale, duration = struct.unpack(">II", data[body + 12 : body + 20])
    else:
        return None
    if timescale == 0 or duration in (0xFFFFFFFF, 0xFFFFFFFFFFFFFFFF):
        return None
    return round(duration * 1000 / timescale)


# ---- WebM (EBML) ---------------------------------------------------------------------------------

_EBML_HEADER, _SEGMENT, _INFO, _TRACKS, _TRACK_ENTRY = 0x1A45DFA3, 0x18538067, 0x1549A966, 0x1654AE6B, 0xAE
_TRACK_TYPE, _CODEC_ID, _DOC_TYPE, _TIMECODE_SCALE, _DURATION, _CLUSTER = (
    0x83,
    0x86,
    0x4282,
    0x2AD7B1,
    0x4489,
    0x1F43B675,
)
_EBML_CONTAINERS = {_EBML_HEADER, _SEGMENT, _INFO, _TRACKS, _TRACK_ENTRY}
_WEBM_AUDIO_CODECS = (b"A_OPUS", b"A_VORBIS")


def _vint(data: bytes, pos: int, *, keep_marker: bool) -> tuple[int, int, bool] | None:
    """(value, length, unknown size) of the EBML variable-length integer at `pos`."""
    if pos >= len(data):
        return None
    first = data[pos]
    length = 1
    while length <= 8 and not first & (0x80 >> (length - 1)):
        length += 1
    if length > 8 or pos + length > len(data):
        return None
    value = first if keep_marker else first & (0xFF >> length)
    for byte in data[pos + 1 : pos + length]:
        value = (value << 8) | byte
    unknown = not keep_marker and value == (1 << (7 * length)) - 1
    return value, length, unknown


def _parse_webm(data: bytes) -> AudioInfo:
    data = data[:EBML_SCAN_BYTES]
    track_types: list[int] = []
    codecs: list[bytes] = []
    state = {"doctype": b"", "scale": 1_000_000, "duration": None, "elements": 0}

    def walk(start: int, end: int, depth: int) -> bool:
        """Returns False once the first cluster is reached (everything needed comes before it)."""
        pos = start
        while pos < end:
            state["elements"] += 1
            if state["elements"] > MAX_EBML_ELEMENTS or depth > MAX_BOX_DEPTH:
                raise AudioError("The WebM file is too complex.")
            ident = _vint(data, pos, keep_marker=True)
            if ident is None:
                return True
            size = _vint(data, pos + ident[1], keep_marker=False)
            if size is None:
                return True
            body = pos + ident[1] + size[1]
            body_end = end if size[2] else min(end, body + size[0])
            element = ident[0]
            if element == _CLUSTER:
                return False
            if element in _EBML_CONTAINERS:
                if not walk(body, body_end, depth + 1):
                    return False
            elif element == _DOC_TYPE:
                state["doctype"] = data[body:body_end]
            elif element == _TRACK_TYPE and body_end > body:
                track_types.append(int.from_bytes(data[body:body_end], "big"))
            elif element == _CODEC_ID:
                codecs.append(data[body:body_end])
            elif element == _TIMECODE_SCALE and body_end > body:
                state["scale"] = int.from_bytes(data[body:body_end], "big") or 1_000_000
            elif element == _DURATION and body_end - body in (4, 8):
                fmt = ">f" if body_end - body == 4 else ">d"
                state["duration"] = struct.unpack(fmt, data[body:body_end])[0]
            if size[2]:
                return True
            pos = body_end
        return True

    walk(0, len(data), 0)
    if state["doctype"] != b"webm":
        raise AudioError("The file is not a WebM file.")
    if 1 in track_types or 3 in track_types:
        raise AudioError("The WebM file contains video, not just audio.")
    if 2 not in track_types or not any(c in _WEBM_AUDIO_CODECS for c in codecs):
        raise AudioError("The WebM file has no Opus or Vorbis audio track.")
    duration = state["duration"]
    duration_ms = (
        round(duration * state["scale"] / 1_000_000) if isinstance(duration, float) and duration > 0 else None
    )
    return AudioInfo(
        mime=WEBM_MIME, codec="opus" if b"A_OPUS" in codecs else "vorbis", duration_ms=duration_ms
    )
