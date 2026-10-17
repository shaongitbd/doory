from django.conf import settings
from django.core.exceptions import SuspiciousOperation, TooManyFilesSent
from django.core.files.storage import default_storage
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

from apps.designs.models import Design

from . import delivery
from .exceptions import ExportDisabled, PayloadTooLarge
from .filenames import export_filename, pdf_filename
from .serializers import (
    MAX_PAGES,
    MAX_TOTAL_BYTES,
    ImageExportSerializer,
    PdfExportDocumentation,
    PdfExportSerializer,
    validate_page_files,
)
from .services import ExportRequest, export_image, export_pdf, page_index
from .throttling import ExportRateThrottle

MULTIPART_OVERHEAD_BYTES = 2 * 1024 * 1024


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


class ImageExportView(APIView):
    """Render one page of a saved design as PNG, JPG or WebP on the server, as the editor draws it."""

    permission_classes = [IsAuthenticated]
    content_negotiation_class = AnyAcceptNegotiation
    throttle_classes = [*api_settings.DEFAULT_THROTTLE_CLASSES, ExportRateThrottle]

    @extend_schema(
        request=ImageExportSerializer,
        responses={
            (200, "image/png"): OpenApiTypes.BINARY,
            (200, "image/jpeg"): OpenApiTypes.BINARY,
            (200, "image/webp"): OpenApiTypes.BINARY,
        },
        tags=["exports"],
    )
    def post(self, request, pk):
        design = get_object_or_404(Design.objects.filter(owner=request.user, trashed_at__isnull=True), pk=pk)
        body = ImageExportSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        result = export_image(
            design,
            page=page_index(data["page"]),
            format=data["format"],
            quality=data["quality"],
            scale=data["scale"],
            transparent=data["transparent"],
        )
        title = design.title if design.page_count <= 1 else f"{design.title} - page {result.page_index + 1}"
        response = HttpResponse(result.data, content_type=result.mime)
        response["X-Doory-Placeholders"] = str(result.placeholders)
        return _file_headers(response, export_filename(title, result.format), attachment=True)


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
        response = FileResponse(default_storage.open(name, "rb"), content_type=mime)
        return _file_headers(response, name.rsplit("/", 1)[-1], attachment=False)
