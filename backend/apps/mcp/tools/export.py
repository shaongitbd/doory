"""See a design: render pages on the server with the editor's own engine and return them as images, or hand
them on as SVG files, a PDF or a video."""

from __future__ import annotations

import base64
import json
from typing import Annotated, Any, Literal

from django.conf import settings
from mcp_types import ImageContent, TextContent
from pydantic import Field

from apps.apitokens.scopes import DESIGNS_READ
from apps.designs.doc.ops import PageRef
from apps.exports.delivery import store_image
from apps.exports.filenames import FILE_NAMES, unix_now
from apps.exports.services import VIDEO_FORMATS, ImageBundle, ImageResult, export_images, page_index
from apps.exports.throttling import ExportRateThrottle, OffsiteOptimizeRateThrottle

from ..registry import charge_call, throttle, tool
from .designs import DesignId, _design, editor_url

ALWAYS_LINKED = ("avif", "svg", "pdf", "zip", *VIDEO_FORMATS)  # clients can't show these inline


def _charge_pages(extra: int) -> None:
    """Each page after the first is one more render: one more call, and one more use of the export rate."""
    for _ in range(extra):
        charge_call()
        throttle(ExportRateThrottle())


def _charge_offsite(files: int) -> None:
    """Each image sent to an optimizer off this server uses the `optimize_offsite` rate, as over REST."""
    for _ in range(files):
        throttle(OffsiteOptimizeRateThrottle())


def _page_info(image: ImageResult, filename: str) -> dict[str, Any]:
    optimized = (
        {
            "optimizer": image.options_used["optimizer"],
            "bytes_before_optimizing": image.options_used["bytes_before_optimizing"],
        }
        if "bytes_before_optimizing" in image.options_used
        else {}
    )
    return {
        "page": image.page_index + 1,
        "page_id": image.page_id,
        "format": image.format,
        "width": image.width,
        "height": image.height,
        "bytes": len(image.data),
        **optimized,
        "filename": filename,
        "options": image.options_used,
    }


def _pdf_info(bundle: ImageBundle) -> dict[str, Any]:
    pages = [
        {
            "page": image.page_index + 1,
            "page_id": image.page_id,
            "width": image.width,
            "height": image.height,
            **({"dpi": image.options_used["dpi"]} if "dpi" in image.options_used else {}),
        }
        for image in bundle.images
    ]
    return {
        "format": "pdf",
        "bytes": len(bundle.data),
        "filename": bundle.filename,
        "pages": pages,
        "options": bundle.options,
    }


def _video_info(bundle: ImageBundle) -> dict[str, Any]:
    video, options = bundle.images[0], bundle.options
    return {
        "format": bundle.format,
        "bytes": len(bundle.data),
        "width": video.width,
        "height": video.height,
        **{key: options[key] for key in ("fps", "duration_ms", "frames", "video", "audio", "pages")},
        "filename": bundle.filename,
        "options": {
            key: value
            for key, value in options.items()
            if key not in ("duration_ms", "frames", "video", "audio", "pages")
        },
    }


@tool(scope=DESIGNS_READ, title="Export a design", read_only=True)
def export_design(
    design_id: DesignId,
    page: PageRef = None,
    pages: Annotated[
        Literal["all"] | list[str | int] | None,
        Field(
            description=(
                'Several pages instead of `page`: "all", or a list of page ids and numbers counting from 1. '
                "They come back as one ZIP (always a link); each page after the first counts as one call. "
                "A video plays all pages unless `page` or `pages` says otherwise."
            )
        ),
    ] = None,
    format: Annotated[
        Literal["png", "jpg", "webp", "avif", "auto", "svg", "pdf", "pdf-print", "mp4", "webm", "gif"],
        Field(
            description=(
                "auto: the smallest image of all formats (no JPG when transparent, no AVIF above 8 million "
                "pixels). svg: one vector file per page, with its pictures and fonts inside. pdf: one PDF of "
                "all pages, each a 300 dpi picture (as the editor's PDF download). pdf-print: one vector PDF "
                "for printing (the editor's print-quality PDF). mp4, webm, gif: a video of the pages one "
                "after another, with their animations, transitions and (mp4, webm) the design's sound, as "
                "the editor's video download; each started 10 s after the first counts as one more call. "
                "AVIF, SVG, PDF and videos are links; the image options (quality to optimize) do not apply "
                "to SVG, PDF and videos."
            )
        ),
    ] = "png",
    quality: Annotated[
        Annotated[int, Field(ge=1, le=100)] | Literal["small", "balanced", "best", "original"],
        Field(
            description=(
                "JPG, WebP and AVIF: 1-100, or small (65), balanced (82), best (95), original (100). Video: "
                "small, balanced or best (a number up to 70 is small, up to 90 balanced)."
            )
        ),
    ] = 90,
    max_bytes: Annotated[
        int | None,
        Field(
            ge=1, description="Largest file wanted: the highest quality up to `quality` that fits is used."
        ),
    ] = None,
    scale: Annotated[
        float, Field(ge=0.1, le=4, description="Output pixels per page pixel; below 1 for a quick look.")
    ] = 1.0,
    size: Annotated[
        str | None,
        Field(
            pattern=r"^\d+(?:\.\d+)?[xXwWhH]$",
            description='Instead of scale: "2x", "1080w" (that many pixels wide) or "1350h" (pixels high).',
        ),
    ] = None,
    transparent: Annotated[bool, Field(description="Leave the page background out (not for JPG).")] = False,
    png_colors: Annotated[
        Literal["full"] | Annotated[int, Field(ge=2, le=256)],
        Field(description="PNG: full colour, or a palette of this many colours (256 is usual) when smaller."),
    ] = "full",
    strip_metadata: Annotated[bool, Field(description="Leave text, time and Exif metadata out.")] = True,
    srgb: Annotated[bool, Field(description="Leave the colour profile out (the pixels are sRGB).")] = True,
    progressive: Annotated[bool, Field(description="JPG only: a progressive JPG.")] = False,
    optimize: Annotated[
        bool | Literal["builtin", "tinypng", "kraken", "custom"],
        Field(
            description=(
                "Make the file smaller after it is drawn: true (the server's default optimizer) or one by "
                "id. It never makes a file bigger; when an optimizer fails, the file comes back unoptimized "
                "with a warning. The result reports optimizer and bytes_before_optimizing."
            )
        ),
    ] = False,
    bleed_mm: Annotated[
        float,
        Field(ge=0, le=10, description="PDF: the bleed around every page, in mm (3 is usual for print)."),
    ] = 0,
    crop_marks: Annotated[bool, Field(description="PDF: crop marks in a margin around the bleed.")] = False,
    cmyk: Annotated[
        bool,
        Field(description="CMYK colours. Not offered: PDFs are RGB, as on screen; true is refused."),
    ] = False,
    resolution: Annotated[
        Literal["design", 240, 360, 480, 720, 1080, 2160] | None,
        Field(
            description=(
                "Video: the shorter side of the frame in px, or design (the first page's size, at most "
                "1920 px on its longer side; 720 for GIF). MP4 and WebM: design, 480-2160 (default "
                "design); GIF: 240-720 (default 480). The server may cap it lower."
            )
        ),
    ] = None,
    fps: Annotated[
        Literal[5, 10, 15, 20, 24, 30, 60] | None,
        Field(
            description="Video frame rate: MP4 and WebM 24, 30 (default) or 60; GIF 5, 10, 15 (default), 20."
        ),
    ] = None,
    fit: Annotated[
        Literal["fit", "fill"],
        Field(
            description="Video: a page of another shape than the first is fitted whole, or fills the frame."
        ),
    ] = "fit",
    sound: Annotated[bool, Field(description="MP4 and WebM: put the design's sound in the file.")] = True,
    loop: Annotated[int, Field(ge=0, le=65_535, description="GIF: how often it plays, 0 = forever.")] = 0,
    dither: Annotated[bool, Field(description="GIF: smoother gradients, larger file.")] = True,
    page_seconds: Annotated[
        float | None,
        Field(ge=1, le=600, description="Video: hold every page this long instead of its own time (5 s)."),
    ] = None,
    file_names: Annotated[
        Literal["simple", "detailed"] | None,
        Field(description="simple: the title and page; detailed: with platform, preset and size."),
    ] = None,
    delivery: Annotated[
        Literal["inline", "url"],
        Field(
            description=(
                "inline: the image itself, to look at. url: a download link that expires after a few "
                "minutes, for large images or to hand on. Images too large to send inline, AVIF images, SVG, "
                "PDF, ZIPs and videos become a link."
            )
        ),
    ] = "inline",
) -> list[ImageContent | TextContent]:
    """Render pages of a design as images, exactly as the editor draws them, to check how they look (after
    edit_design, for example) or to hand them on; or export them as SVG files, a PDF or a video (MP4, WebM,
    GIF), as the editor's Download makes them. It shows the live state when the design is open in the
    editor."""
    throttle(ExportRateThrottle())
    design = _design(design_id)
    if format in VIDEO_FORMATS and pages is None and page is None:
        pages = "all"
    bundle = export_images(
        design,
        pages=pages if pages == "all" else [page_index(p) for p in pages or [page]],
        filename_style=FILE_NAMES.get(file_names or ""),
        unix=unix_now() if settings.EXPORT_FILENAME_TIMESTAMP else None,
        charge=_charge_pages,
        charge_offsite=_charge_offsite,
        format=format,
        quality=quality,
        scale=scale,
        size=size,
        transparent=transparent,
        max_bytes=max_bytes,
        png_colors=None if png_colors == "full" else png_colors,
        strip_metadata=strip_metadata,
        srgb=srgb,
        progressive=progressive,
        optimize=optimize,
        bleed_mm=bleed_mm,
        crop_marks=crop_marks,
        cmyk=cmyk,
        resolution=resolution,
        fps=fps,
        fit=fit,
        sound=sound,
        loop=loop,
        dither=dither,
        page_seconds=page_seconds,
    )
    info: dict[str, Any] = {"design_id": str(design.pk)}
    if bundle.format in VIDEO_FORMATS:
        info |= _video_info(bundle)
    elif bundle.format == "pdf":
        info |= _pdf_info(bundle)
    elif bundle.format == "zip":
        info |= {
            "format": "zip",
            "bytes": len(bundle.data),
            "filename": bundle.filename,
            "pages": [
                _page_info(image, name) for image, name in zip(bundle.images, bundle.filenames, strict=True)
            ],
        }
    else:
        # The filename is what the editor's Download would call this file, with the instance's default naming.
        info |= _page_info(bundle.images[0], bundle.filename)
    info["editor_url"] = editor_url(design)
    if bundle.warnings:
        info["warnings"] = list(bundle.warnings)
    if delivery == "inline" and bundle.format in ALWAYS_LINKED:
        info["note"] = (
            "AVIF images, SVG files, PDFs, ZIPs of several pages and videos are always sent as a link."
        )
        delivery = "url"
    if delivery == "inline" and len(bundle.data) > settings.MCP_EXPORT_INLINE_MAX_BYTES:
        info["note"] = (
            f"The image is larger than {settings.MCP_EXPORT_INLINE_MAX_BYTES} bytes, so it is sent as a "
            "link. Use a smaller scale, or jpg/webp, to get it inline."
        )
        delivery = "url"
    if delivery == "url":
        info["url"] = store_image(bundle.data, bundle.mime)
        info["expires_in_seconds"] = settings.MCP_EXPORT_URL_TTL_SECONDS
        return [TextContent(text=json.dumps(info))]
    return [
        ImageContent(data=base64.b64encode(bundle.data).decode("ascii"), mime_type=bundle.mime),
        TextContent(text=json.dumps(info)),
    ]
