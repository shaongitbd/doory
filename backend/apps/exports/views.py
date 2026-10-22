import json

from django.conf import settings
from django.core.exceptions import SuspiciousOperation, TooManyFilesSent
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.http import content_disposition_header
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.settings import api_settings
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.designs.fill import charge
from apps.designs.models import Design

from . import delivery
from .exceptions import ExportDisabled, PayloadTooLarge
from .filenames import FILE_NAMES, pdf_filename, unix_now
from .serializers import (
    MAX_PAGES,
    MAX_TOTAL_BYTES,
    ImageExportSerializer,
    ImageOptimizeDocumentation,
    ImageOptimizeSerializer,
    PdfExportDocumentation,
    PdfExportSerializer,
    validate_page_files,
)
from .services import (
    PDF_MIME,
    SVG_MIME,
    VIDEO_FORMATS,
    ZIP_MIME,
    ExportRequest,
    export_images,
    export_pdf,
    optimize_image,
    page_index,
)
from .throttling import ExportRateThrottle, OffsiteOptimizeRateThrottle

MULTIPART_OVERHEAD_BYTES = 2 * 1024 * 1024
# An SVG may carry markup: never let it run as a page of this site, however it is opened.
SVG_SANDBOX_CSP = "sandbox; default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"


class AnyAcceptNegotiation(DefaultContentNegotiation):
    """Success responses are files and errors are JSON whatever the Accept header says (no 406)."""

    def select_renderer(self, request, renderers, format_suffix=None):
        return renderers[0], renderers[0].media_type


class PdfExportView(APIView):
    """Print the editor's SVG pages to a PDF with headless Chromium."""

    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]
    content_negotiation_class = AnyAcceptNegotiation
    throttle_classes = [*api_settings.DEFAULT_THROTTLE_CLASSES, ScopedRateThrottle]
    throttle_scope = "upload"

    @extend_schema(
        request={"multipart/form-data": PdfExportDocumentation},
        responses={(200, "application/pdf"): OpenApiTypes.BINARY},
        tags=["exports"],
    )
    def post(self, request):
        if not settings.SERVER_PDF_ENABLED:
            raise ExportDisabled()
        if int(request.META.get("CONTENT_LENGTH") or 0) > MAX_TOTAL_BYTES + MULTIPART_OVERHEAD_BYTES:
            raise PayloadTooLarge()
        try:
            files = request.FILES.getlist("pages")
            fields = request.data
        except TooManyFilesSent:
            raise ValidationError({"pages": [f"At most {MAX_PAGES} pages can be exported at once."]})
        except SuspiciousOperation:  # request data limits of the Django settings
            raise PayloadTooLarge()
        validate_page_files(files)
        serializer = PdfExportSerializer(data=fields, context={"page_count": len(files)})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = export_pdf(
            ExportRequest(
                pages=[file.read() for file in files],
                width=data["width"],
                height=data["height"],
                sizes=data["sizes"],
                bleed_mm=data["bleed_mm"],
                crop_marks=data["crop_marks"],
                title=data["title"],
                lang=data["lang"],
                fonts=data["fonts"],
                owner=request.user.pk,
            )
        )
        response = HttpResponse(result.pdf, content_type="application/pdf")
        response["Content-Disposition"] = content_disposition_header(True, pdf_filename(data["title"]))
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


def _file_headers(response: HttpResponse, filename: str, *, attachment: bool) -> HttpResponse:
    response["Content-Disposition"] = content_disposition_header(attachment, filename)
    response["Cache-Control"] = "no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


def _charge_pages(user, extra: int) -> None:
    """Each page after the first is one more render, counted against the `export` rate."""
    for _ in range(extra):
        charge(ExportRateThrottle(), user)


def _charge_offsite(user, files: int) -> None:
    """Each image sent to an optimizer off this server counts against the `optimize_offsite` rate."""
    for _ in range(files):
        charge(OffsiteOptimizeRateThrottle(), user)


class ImageExportView(APIView):
    """Render pages of a saved design as PNG, JPG, WebP, AVIF or SVG on the server, as the editor draws them
    (several pages come back as one ZIP), as one PDF of pictures (`pdf`) or vector pages (`pdf-print`), or as
    a video: MP4, WebM or GIF (all pages unless `pages` or `page` says otherwise)."""

    permission_classes = [IsAuthenticated]
    content_negotiation_class = AnyAcceptNegotiation
    throttle_classes = [*api_settings.DEFAULT_THROTTLE_CLASSES, ExportRateThrottle]

    @extend_schema(
        request=ImageExportSerializer,
        responses={
            (200, "image/png"): OpenApiTypes.BINARY,
            (200, "image/jpeg"): OpenApiTypes.BINARY,
            (200, "image/webp"): OpenApiTypes.BINARY,
            (200, "image/avif"): OpenApiTypes.BINARY,
            (200, SVG_MIME): OpenApiTypes.BINARY,
            (200, PDF_MIME): OpenApiTypes.BINARY,
            (200, ZIP_MIME): OpenApiTypes.BINARY,
            **{(200, mime): OpenApiTypes.BINARY for mime in VIDEO_FORMATS.values()},
        },
        tags=["exports"],
    )
    def post(self, request, pk):
        design = get_object_or_404(Design.objects.filter(owner=request.user, trashed_at__isnull=True), pk=pk)
        body = ImageExportSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        pages = data["pages"]
        if data["format"] in VIDEO_FORMATS and pages is None and data["page"] is None:
            pages = "all"
        style = (
            data.get("filename_style")
            or FILE_NAMES.get(data.get("file_names"))
            or settings.EXPORT_FILENAME_STYLE
        )
        stamp = data.get("filename_timestamp", settings.EXPORT_FILENAME_TIMESTAMP)
        result = export_images(
            design,
            pages=pages if pages == "all" else [page_index(p) for p in pages or [data["page"]]],
            filename_style=style,
            unix=unix_now() if stamp else None,
            charge=lambda extra: _charge_pages(request.user, extra),
            charge_offsite=lambda files: _charge_offsite(request.user, files),
            format=data["format"],
            quality=data["quality"],
            scale=data["scale"],
            size=data["size"],
            transparent=data["transparent"],
            max_bytes=data["max_bytes"],
            png_colors=data["png_colors"],
            strip_metadata=data["strip_metadata"],
            srgb=data["srgb"],
            progressive=data["progressive"],
            optimize=data["optimize"],
            bleed_mm=data["bleed_mm"],
            crop_marks=data["crop_marks"],
            cmyk=data["cmyk"],
            resolution=data["resolution"],
            fps=data["fps"],
            fit=data["fit"],
            sound=data["sound"],
            loop=data["loop"],
            dither=data["dither"],
            page_seconds=data["page_seconds"],
        )
        if result.file is not None:  # a video: streamed from its file, deleted when the response closes it
            response = FileResponse(result.file, content_type=result.mime)
        else:
            response = HttpResponse(result.data, content_type=result.mime)
        response["X-Doory-Placeholders"] = str(result.placeholders)
        if result.mime == SVG_MIME:
            response["Content-Security-Policy"] = SVG_SANDBOX_CSP
        return _file_headers(response, result.filename, attachment=True)


OPTIMIZE_OVERHEAD_BYTES = 64 * 1024  # the multipart framing and the option fields


class ImageOptimizeView(APIView):
    """Convert a page the browser drew (PNG) to the format asked for and optimize it, for downloads from the
    editor: AVIF, WebP where the browser can't make it, and the optimizers (`apps.exports.optimizers`).

    The answer is the file, with `X-Doory-Format`, `X-Doory-Width`, `X-Doory-Height`, `X-Doory-Quality`
    (lossy formats, after a `max_bytes` search), `X-Doory-Bytes-Before` (the converted file before
    optimizing), `X-Doory-Optimizer` (the optimizer asked, empty for none), `X-Doory-Optimized` (whether its
    smaller file was kept) and `X-Doory-Warnings` (a JSON list)."""

    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]
    content_negotiation_class = AnyAcceptNegotiation
    throttle_classes = [*api_settings.DEFAULT_THROTTLE_CLASSES, ScopedRateThrottle]
    throttle_scope = "optimize"

    @extend_schema(
        request={"multipart/form-data": ImageOptimizeDocumentation},
        responses={
            (200, "image/png"): OpenApiTypes.BINARY,
            (200, "image/jpeg"): OpenApiTypes.BINARY,
            (200, "image/webp"): OpenApiTypes.BINARY,
            (200, "image/avif"): OpenApiTypes.BINARY,
        },
        tags=["exports"],
    )
    def post(self, request):
        limit = settings.IMAGE_OPTIMIZER_MAX_BYTES
        if int(request.META.get("CONTENT_LENGTH") or 0) > limit + OPTIMIZE_OVERHEAD_BYTES:
            raise PayloadTooLarge(f"The image must be at most {limit} bytes.")
        try:
            file = request.FILES.get("file")
            fields = request.data
        except SuspiciousOperation:  # request data limits of the Django settings
            raise PayloadTooLarge()
        if file is None or file.size == 0:
            raise ValidationError({"file": ["Send the image (a PNG) in the file field."]})
        if file.size > limit:
            raise PayloadTooLarge(f"The image must be at most {limit} bytes.")
        body = ImageOptimizeSerializer(data=fields)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        result = optimize_image(
            file.read(),
            owner=request.user.pk,
            charge_offsite=lambda files: _charge_offsite(request.user, files),
            **data,
        )
        response = HttpResponse(result.data, content_type=result.mime)
        response["X-Doory-Format"] = result.format
        response["X-Doory-Width"] = str(result.width)
        response["X-Doory-Height"] = str(result.height)
        if "quality" in result.options_used:
            response["X-Doory-Quality"] = str(result.options_used["quality"])
        response["X-Doory-Bytes-Before"] = str(result.bytes_before_optimizing)
        response["X-Doory-Optimizer"] = result.optimizer
        response["X-Doory-Optimized"] = "true" if result.optimized else "false"
        response["X-Doory-Warnings"] = json.dumps(list(result.warnings))
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class ImageDownloadView(APIView):
    """An exported image behind a signed, expiring link (`apps.exports.delivery`); the link is the key."""

    authentication_classes = []
    permission_classes = []
    content_negotiation_class = AnyAcceptNegotiation

    @extend_schema(exclude=True)
    def get(self, request, token):
        found = delivery.open_link(token)
        if found is None:
            raise Http404
        name, mime = found
        try:
            stream = delivery.export_storage().open(name, "rb")
        except FileNotFoundError as exc:
            raise Http404 from exc
        response = FileResponse(stream, content_type=mime)
        if mime == SVG_MIME:
            response["Content-Security-Policy"] = SVG_SANDBOX_CSP
        return _file_headers(response, name, attachment=mime in (ZIP_MIME, SVG_MIME))
