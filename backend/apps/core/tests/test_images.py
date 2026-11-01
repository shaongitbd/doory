from io import BytesIO

import pytest
from PIL import Image

from apps.core import images
from apps.core.images import ImageBusy, ImageError, make_thumbnail, process_image_upload, strip_webp_metadata


def _img(fmt="PNG", size=(40, 20), mode="RGB", **save):
    buf = BytesIO()
    Image.new(mode, size, (200, 30, 60) if mode == "RGB" else (200, 30, 60, 128)).save(buf, fmt, **save)
    return BytesIO(buf.getvalue())


def test_accepts_png_jpeg_webp_gif():
    for fmt, mime in (
        ("PNG", "image/png"),
        ("JPEG", "image/jpeg"),
        ("WEBP", "image/webp"),
        ("GIF", "image/gif"),
    ):
        out = process_image_upload(_img(fmt), max_bytes=1_000_000)
        assert out.mime == mime and (out.width, out.height) == (40, 20)


def _mpo() -> BytesIO:
    """Two pictures in one MPO file, the first with Exif: a GPS position and an orientation that turns it."""
    exif = Image.Exif()
    exif[0x0112] = 6
    exif.get_ifd(0x8825)[1] = "N"
    first, second = Image.new("RGB", (40, 20), (200, 30, 60)), Image.new("RGB", (40, 20), (0, 0, 0))
    buf = BytesIO()
    first.save(buf, "MPO", save_all=True, append_images=[second], exif=exif)
    return BytesIO(buf.getvalue())


def test_an_mpo_photo_is_stored_as_a_plain_jpeg_of_its_first_picture():
    source = _mpo()
    assert Image.open(BytesIO(source.getvalue())).format == "MPO"
    out = process_image_upload(source, max_bytes=1_000_000)
    assert (out.mime, out.ext) == ("image/jpeg", "jpg")
    stored = Image.open(BytesIO(out.data))
    assert stored.format == "JPEG" and getattr(stored, "n_frames", 1) == 1
    assert not stored.getexif() and b"GPS" not in out.data
    assert stored.size == (20, 40)  # the orientation was applied
    assert stored.convert("RGB").getpixel((10, 20))[0] > 150  # the first picture, not the black second one


def test_rejects_garbage_and_non_images_even_with_image_names():
    with pytest.raises(ImageError):
        process_image_upload(BytesIO(b"<svg/>"), max_bytes=1000)
    with pytest.raises(ImageError):
        process_image_upload(BytesIO(b"\x89PNG\r\n\x1a\nnot really"), max_bytes=1000)
    with pytest.raises(ImageError):
        process_image_upload(BytesIO(b""), max_bytes=1000)


def test_rejects_oversize_bytes_and_dimensions():
    with pytest.raises(ImageError):
        process_image_upload(_img("PNG", (400, 400)), max_bytes=100)
    huge = _img("PNG", (12_001, 2))
    with pytest.raises(ImageError):
        process_image_upload(huge, max_bytes=10_000_000)


def test_jpeg_exif_is_stripped_and_orientation_applied():
    img = Image.new("RGB", (40, 20), (10, 20, 30))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90° CW on display
    exif[0x010F] = "SecretCamera"
    buf = BytesIO()
    img.save(buf, "JPEG", exif=exif)
    out = process_image_upload(BytesIO(buf.getvalue()), max_bytes=1_000_000)
    assert (out.width, out.height) == (20, 40)
    assert not Image.open(BytesIO(out.data)).getexif()


def test_thumbnail_is_webp_and_bounded_with_alpha():
    thumb = make_thumbnail(_img("PNG", (2000, 1000), "RGBA").getvalue(), 480)
    im = Image.open(BytesIO(thumb))
    assert im.format == "WEBP" and max(im.size) == 480 and "A" in im.getbands()


def _exif_image(size=(40, 20)):
    img = Image.new("RGB", size, (10, 200, 30))
    exif = img.getexif()
    exif[0x010F] = "SecretCamera"
    exif.get_ifd(0x8825)[1] = "N"
    return img, exif


def test_animated_webp_loses_exif_and_xmp_but_keeps_its_frames():
    _, exif = _exif_image((32, 32))
    frames = [Image.new("RGB", (32, 32), (index * 60, 0, 0)) for index in range(3)]
    buf = BytesIO()
    frames[0].save(
        buf,
        "WEBP",
        save_all=True,
        append_images=frames[1:],
        exif=exif,
        xmp=b"<x:xmpmeta>SecretXmp</x:xmpmeta>",
        duration=80,
    )
    assert b"SecretCamera" in buf.getvalue()
    out = process_image_upload(BytesIO(buf.getvalue()), max_bytes=1_000_000)
    assert b"SecretCamera" not in out.data and b"SecretXmp" not in out.data
    assert out.mime == "image/webp"
    reloaded = Image.open(BytesIO(out.data))
    assert reloaded.n_frames == 3 and reloaded.size == (32, 32)
    assert not reloaded.info.get("exif") and not reloaded.info.get("xmp")


def test_static_webp_with_only_xmp_is_stripped_without_re_encoding():
    img = Image.new("RGB", (32, 32), (10, 200, 30))
    buf = BytesIO()
    img.save(buf, "WEBP", lossless=True, xmp=b"<x:xmpmeta>SecretXmp</x:xmpmeta>")
    out = process_image_upload(BytesIO(buf.getvalue()), max_bytes=1_000_000)
    assert b"SecretXmp" not in out.data
    assert list(Image.open(BytesIO(out.data)).convert("RGB").getdata()) == list(img.getdata())


def test_avif_with_exif_is_written_again_without_it():
    img, exif = _exif_image()
    buf = BytesIO()
    img.save(buf, "AVIF", exif=exif)
    assert b"SecretCamera" in buf.getvalue()
    out = process_image_upload(BytesIO(buf.getvalue()), max_bytes=1_000_000)
    assert b"SecretCamera" not in out.data
    assert out.mime == "image/avif" and (out.width, out.height) == (40, 20)
    assert not Image.open(BytesIO(out.data)).info.get("exif")


def test_clean_avif_and_webp_are_stored_as_they_came():
    for fmt in ("AVIF", "WEBP"):
        original = _img(fmt).getvalue()
        assert process_image_upload(BytesIO(original), max_bytes=1_000_000).data == original


def test_a_file_that_only_pretends_to_be_a_webp_is_refused():
    with pytest.raises(ImageError):
        strip_webp_metadata(b"RIFF\x04\x00\x00\x00WAVE")
    with pytest.raises(ImageError):
        strip_webp_metadata(b"RIFF\xff\xff\x00\x00WEBPVP8X\xff\xff\xff\x00")


def test_large_images_take_turns_decoding(monkeypatch):
    monkeypatch.setattr(images, "LARGE_IMAGE_PIXELS", 100)
    monkeypatch.setattr(images, "LARGE_DECODE_WAIT_SECONDS", 0.05)
    held = [images._large_decodes.acquire() for _ in range(images.LARGE_DECODE_SLOTS)]
    try:
        with pytest.raises(ImageBusy):
            process_image_upload(_img("PNG", (40, 20)), max_bytes=1_000_000)
        with images.decode_slot(50):  # a small image never waits
            pass
    finally:
        for _ in held:
            images._large_decodes.release()
    assert process_image_upload(_img("PNG", (40, 20)), max_bytes=1_000_000).width == 40
