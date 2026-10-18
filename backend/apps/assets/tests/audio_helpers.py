"""Builders for tiny, structurally valid audio files (no codec needed: the checks read headers only)."""

from __future__ import annotations

import struct

from apps.assets.audio import ogg_crc


def wav_bytes(seconds: float = 0.25, rate: int = 8000, channels: int = 1, bits: int = 16) -> bytes:
    frame = channels * bits // 8
    samples = int(seconds * rate)
    data = b"\x00" * (samples * frame)
    fmt = struct.pack("<HHIIHH", 1, channels, rate, rate * frame, frame, bits)
    body = b"WAVE" + b"fmt " + struct.pack("<I", 16) + fmt + b"data" + struct.pack("<I", len(data)) + data
    return b"RIFF" + struct.pack("<I", len(body)) + body


def mp3_bytes(
    frames: int = 6,
    *,
    id3: bool = False,
    trailer: bytes = b"",
    mono: bool = False,
    xing: tuple[bytes, int] | None = None,
) -> bytes:
    """MPEG-1 Layer III, 128 kbit/s, 44.1 kHz, joint stereo (or mono): every frame is 417 bytes (no padding).
    `xing=(b"Xing" or b"Info", frames)` puts that tag with its frame count in the first frame, where encoders
    write it: after the 4-byte header and the side information (32 bytes in stereo, 17 in mono)."""
    frame = b"\xff\xfb\x90" + (b"\xc4" if mono else b"\x44") + b"\x00" * 413
    first = frame
    if xing is not None:
        offset = 21 if mono else 36
        tag = xing[0] + struct.pack(">II", 1, xing[1])
        first = frame[:offset] + tag + frame[offset + len(tag) :]
    head = b""
    if id3:
        payload = b"TIT2" + struct.pack(">I", 6) + b"\x00\x00" + b"\x00hello"
        head = b"ID3\x03\x00\x00" + bytes([0, 0, 0, len(payload)]) + payload
    body = first + frame * (frames - 1) if frames else b""
    return head + body + trailer


def _ogg_page(packet: bytes, *, header_type: int, granule: int, sequence: int, serial: int = 7) -> bytes:
    segments: list[int] = []
    remaining = len(packet)
    while remaining >= 255:
        segments.append(255)
        remaining -= 255
    segments.append(remaining)
    head = b"OggS" + bytes([0, header_type]) + struct.pack("<qIII", granule, serial, sequence, 0)
    page = head + bytes([len(segments)]) + bytes(segments) + packet
    crc = struct.pack("<I", ogg_crc(page))
    return page[:22] + crc + page[26:]


def ogg_opus_bytes(seconds: float = 0.5, *, pre_skip: int = 312, channels: int = 2) -> bytes:
    head = b"OpusHead" + bytes([1, channels]) + struct.pack("<HIhB", pre_skip, 48000, 0, 0)
    tags = b"OpusTags" + struct.pack("<I", 5) + b"Doory" + struct.pack("<I", 0)
    granule = int(seconds * 48000) + pre_skip
    return (
        _ogg_page(head, header_type=2, granule=0, sequence=0)
        + _ogg_page(tags, header_type=0, granule=0, sequence=1)
        + _ogg_page(b"\xfc" * 40, header_type=4, granule=granule, sequence=2)
    )


def ogg_vorbis_bytes(seconds: float = 0.5, rate: int = 44100) -> bytes:
    ident = b"\x01vorbis" + struct.pack("<IBIiii", 0, 2, rate, 0, 128000, 0) + b"\xb8\x01"
    setup = b"\x05vorbis" + b"\x00" * 20
    return (
        _ogg_page(ident, header_type=2, granule=0, sequence=0)
        + _ogg_page(setup, header_type=0, granule=0, sequence=1)
        + _ogg_page(b"\x00" * 30, header_type=4, granule=int(seconds * rate), sequence=2)
    )


def ogg_theora_bytes() -> bytes:
    return _ogg_page(b"\x80theora" + b"\x00" * 30, header_type=2, granule=0, sequence=0) + _ogg_page(
        b"\x00" * 10, header_type=4, granule=1, sequence=1
    )


def _box(kind: bytes, body: bytes) -> bytes:
    return struct.pack(">I", 8 + len(body)) + kind + body


def m4a_bytes(
    handlers: tuple[bytes, ...] = (b"soun",), *, brand: bytes = b"M4A ", seconds: float = 1.5
) -> bytes:
    timescale = 1000
    mvhd = _box(
        b"mvhd",
        b"\x00\x00\x00\x00" + struct.pack(">IIII", 0, 0, timescale, int(seconds * timescale)) + b"\x00" * 80,
    )
    traks = b"".join(
        _box(
            b"trak", _box(b"mdia", _box(b"hdlr", b"\x00\x00\x00\x00" + b"\x00" * 4 + handler + b"\x00" * 13))
        )
        for handler in handlers
    )
    ftyp = _box(b"ftyp", brand + b"\x00\x00\x02\x00" + brand + b"isom")
    return ftyp + _box(b"moov", mvhd + traks) + _box(b"mdat", b"\x00" * 64)


def _vint_size(size: int) -> bytes:
    for length in range(1, 9):
        if size < (1 << (7 * length)) - 1:
            return (size | (1 << (7 * length))).to_bytes(length, "big")
    raise ValueError(size)


def _ebml(ident: int, body: bytes) -> bytes:
    id_bytes = ident.to_bytes((ident.bit_length() + 7) // 8, "big")
    return id_bytes + _vint_size(len(body)) + body


def webm_bytes(track_types: tuple[int, ...] = (2,), *, doctype: bytes = b"webm", live: bool = True) -> bytes:
    """A WebM the way MediaRecorder writes it: an unknown-size Segment, Tracks, then a Cluster."""
    header = _ebml(0x1A45DFA3, _ebml(0x4282, doctype))
    entries = b"".join(
        _ebml(0xAE, _ebml(0x83, bytes([kind])) + _ebml(0x86, b"A_OPUS" if kind == 2 else b"V_VP8"))
        for kind in track_types
    )
    info = _ebml(
        0x1549A966,
        _ebml(0x2AD7B1, struct.pack(">I", 1_000_000))
        + (b"" if live else _ebml(0x4489, struct.pack(">d", 2500.0))),
    )
    body = info + _ebml(0x1654AE6B, entries) + _ebml(0x1F43B675, _ebml(0xE7, b"\x00"))
    segment = (
        b"\x18\x53\x80\x67" + (b"\x01\xff\xff\xff\xff\xff\xff\xff" if live else _vint_size(len(body))) + body
    )
    return header + segment
