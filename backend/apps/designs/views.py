from uuid import UUID

from django.conf import settings
from django.db.models import F
from django.db.models.functions import Lower
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import generics, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assets.ordering import order_queryset
from apps.assets.uploads import reject_oversize_request

from . import fill as filling
from . import services
from .doc.fields import list_fields
from .edits import read_current
from .exceptions import RevisionConflict
from .models import Design, DesignVersion
from .parsers import DesignJSONParser
from .serializers import (
    DEFAULT_VERSION_LABEL,
    BulkFillSerializer,
    BulkSerializer,
    DesignCreateSerializer,
    DesignQuerySerializer,
    DesignSerializer,
    DesignSummarySerializer,
    DesignUpdateSerializer,
    FieldSerializer,
    FillSerializer,
    VersionCreateSerializer,
    VersionDetailSerializer,
    VersionSummarySerializer,
)
from .services import THUMBNAIL_MAX_BYTES
from .throttling import BulkFillImageRateThrottle, BulkFillRateThrottle, one_fill_at_a_time

UUID_REGEX = "[0-9a-fA-F-]{36}"
FULL_DOCUMENT_ACTIONS = {"retrieve", "restore", "duplicate", "fields", "fill", "bulk_fill"}
ORDERING = {
    "updated_at": F("updated_at"),
    "created_at": F("created_at"),
    "title": Lower("title"),
}


def _resolver(user, url_throttle=None):
    from apps.mcp.resolver import DjangoResolver  # the same picture lookups as the MCP tools

    return DjangoResolver(user, allow_urls=settings.URL_IMAGE_UPLOADS, url_throttle=url_throttle)


def conflict_response(conflict: RevisionConflict) -> Response:
    return Response(
        {
            "error": {
                "code": "revision_conflict",
                "message": "This design was changed elsewhere. Reload it or save your work as a copy.",
            },
            "current": {"revision": conflict.revision, "updated_at": conflict.updated_at},
        },
        status=status.HTTP_409_CONFLICT,
    )


@extend_schema(tags=["designs"])
class DesignViewSet(viewsets.GenericViewSet):
    parser_classes = [DesignJSONParser, MultiPartParser]
    filter_backends: list = []
    lookup_value_regex = UUID_REGEX
    serializer_class = DesignSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Design.objects.none()
        queryset = Design.objects.filter(owner=self.request.user)
        return queryset if self.action in FULL_DOCUMENT_ACTIONS else queryset.defer("document")

    @extend_schema(
        parameters=[
            OpenApiParameter("q", str, description="Title search (case-insensitive)."),
            OpenApiParameter("folder", str, description="A folder id, or `root` for the top level."),
            OpenApiParameter("starred", bool),
            OpenApiParameter("trashed", bool, description="List the trash instead of live designs."),
            OpenApiParameter(
                "ordering", str, description="updated_at, created_at or title; prefix - to reverse."
            ),
        ],
        responses=DesignSummarySerializer(many=True),
    )
    def list(self, request):
        query = DesignQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        params = query.validated_data
        queryset = self.get_queryset().filter(trashed_at__isnull=not params.get("trashed", False))
        if params.get("q", "").strip():
            queryset = queryset.filter(title__icontains=params["q"].strip())
        if params.get("starred") is not None:
            queryset = queryset.filter(starred=params["starred"])
        if params.get("folder") == "root":
            queryset = queryset.filter(folder__isnull=True)
        elif "folder" in params:
            queryset = queryset.filter(folder_id=UUID(params["folder"]))
        queryset = order_queryset(queryset, params.get("ordering"), ORDERING, "-updated_at")
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(DesignSummarySerializer(page, many=True).data)

    @extend_schema(request=DesignCreateSerializer, responses={201: DesignSerializer})
    def create(self, request):
        body = DesignCreateSerializer(data=request.data, context=self.get_serializer_context())
        body.is_valid(raise_exception=True)
        data = body.validated_data
        folder = data.get("folder")
        if "template" in data:
            design = services.create_from_template(
                request.user, data["template"], title=data.get("title"), folder=folder
            )
        else:
            preset = data.get("preset", "")
            document = data.get("document") or services.blank_document(data["width"], data["height"], preset)
            design = services.create_design(
                request.user,
                title=data.get("title", services.DEFAULT_TITLE),
                document=document,
                folder=folder,
            )
        return Response(DesignSerializer(design).data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        return Response(DesignSerializer(self.get_object()).data)

    @extend_schema(
        request=DesignUpdateSerializer,
        responses={200: DesignSerializer, 409: None},
        description="Saving `document` needs `base_revision`; a stale value answers 409 `revision_conflict`.",
    )
    def partial_update(self, request, *args, **kwargs):
        design = self.get_object()
        body = DesignUpdateSerializer(data=request.data, partial=True, context=self.get_serializer_context())
        body.is_valid(raise_exception=True)
        try:
            design = services.update_design(design.pk, request.user, body.validated_data)
        except RevisionConflict as conflict:
            return conflict_response(conflict)
        return Response(DesignSerializer(design).data)

    @extend_schema(
        parameters=[OpenApiParameter("permanent", bool, description="Hard-delete (only from the trash).")],
        responses={204: None},
    )
    def destroy(self, request, *args, **kwargs):
        design = self.get_object()
        if request.query_params.get("permanent", "").lower() in {"1", "true", "yes"}:
            services.delete_permanently(design)
        else:
            services.trash_design(design.pk, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses=DesignSerializer)
    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        return Response(DesignSerializer(services.restore_trashed(self.get_object())).data)

    @extend_schema(request=None, responses={201: DesignSerializer})
    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        copy = services.duplicate_design(self.get_object(), request.user)
        return Response(DesignSerializer(copy).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=None,
        responses=FieldSerializer(many=True),
        description="The template fields of the design: tagged objects, one entry per key, and photo "
        "placeholders without a tag (`key: null`).",
    )
    @action(detail=True, methods=["get"])
    def fields(self, request, pk=None):
        document, _live = read_current(self.get_object())
        return Response(list_fields(document))

    @extend_schema(
        request=FillSerializer,
        responses={200: OpenApiTypes.OBJECT, 201: OpenApiTypes.OBJECT},
        description="Fill the template fields by key ({key: value}); by default into a new copy (201). "
        "All or nothing: a bad value is a 400 naming its key. Image values may be public https URLs when "
        "URL_IMAGE_UPLOADS is on (the server copies them into your uploads).",
    )
    @action(detail=True, methods=["post"])
    def fill(self, request, pk=None):
        body = FillSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        with one_fill_at_a_time(request.user):
            result = filling.fill_design(
                self.get_object(),
                request.user,
                data["values"],
                resolver=_resolver(request.user),
                as_copy=data["as_copy"],
                name=data.get("name"),
                label="Before filling fields",
            )
        return Response(
            result.summary(), status=status.HTTP_201_CREATED if data["as_copy"] else status.HTTP_200_OK
        )

    @extend_schema(
        request=BulkFillSerializer,
        responses=OpenApiTypes.OBJECT,
        description="One new design per row, filled like `fill`; each row reports its design or its error. "
        "Each row counts against the `bulk_fill` rate, each new image URL against `bulk_fill_images` and "
        "each exported image against `export`; a row over a limit reports its error. Image URLs are "
        "fetched only when URL_IMAGE_UPLOADS is on. Many URL images or exports make a long request: keep "
        "it under the worker timeout with fewer rows. One fill or bulk fill per user runs at a time; another "
        "one meanwhile is a 429.",
    )
    @action(detail=True, methods=["post"], url_path="bulk-fill")
    def bulk_fill(self, request, pk=None):
        body = BulkFillSerializer(data=request.data, context={"request": request})
        body.is_valid(raise_exception=True)
        data = body.validated_data
        with one_fill_at_a_time(request.user):
            rows = filling.bulk_fill(
                self.get_object(),
                request.user,
                data["rows"],
                row_numbers=data.get("row_numbers"),
                resolver=_resolver(request.user, BulkFillImageRateThrottle),
                name_pattern=data.get("name_pattern"),
                folder=data.get("folder"),
                before_row=lambda: filling.charge(BulkFillRateThrottle(), request.user),
                after_row=filling.image_exporter(data.get("export"), request.user),
            )
        return Response({"created": sum(row["ok"] for row in rows), "rows": rows})

    @extend_schema(
        request={
            "multipart/form-data": inline_serializer("ThumbnailUpload", {"image": serializers.ImageField()})
        },
        responses=inline_serializer("ThumbnailUrl", {"thumbnail_url": serializers.CharField()}),
    )
    @action(detail=True, methods=["put"], parser_classes=[MultiPartParser])
    def thumbnail(self, request, pk=None):
        design = self.get_object()
        reject_oversize_request(request, THUMBNAIL_MAX_BYTES)
        image = request.data.get("image")
        if image is None or not hasattr(image, "read"):
            raise serializers.ValidationError({"image": ["Upload the thumbnail as the `image` file field."]})
        design = services.set_thumbnail(design, image)
        return Response({"thumbnail_url": design.thumbnail.url})

    @extend_schema(
        request=BulkSerializer,
        responses=inline_serializer("BulkResult", {"affected": serializers.IntegerField()}),
    )
    @action(detail=False, methods=["post"])
    def bulk(self, request):
        body = BulkSerializer(data=request.data, context=self.get_serializer_context())
        body.is_valid(raise_exception=True)
        data = body.validated_data
        affected = services.bulk_apply(request.user, data["ids"], data["action"], data.get("folder"))
        return Response({"affected": affected})

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=["delete"])
    def trash(self, request):
        services.empty_trash(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _own_design(request, design_pk) -> Design:
    return get_object_or_404(Design.objects.filter(owner=request.user).defer("document"), pk=design_pk)


@extend_schema(tags=["designs"])
class DesignVersionListView(generics.GenericAPIView):
    parser_classes = [DesignJSONParser]
    filter_backends: list = []
    serializer_class = VersionSummarySerializer

    @extend_schema(responses=VersionSummarySerializer(many=True))
    def get(self, request, design_pk):
        design = _own_design(request, design_pk)
        versions = (
            DesignVersion.objects.filter(design=design).defer("document").order_by("-created_at", "-pk")
        )
        page = self.paginate_queryset(versions)
        return self.get_paginated_response(VersionSummarySerializer(page, many=True).data)

    @extend_schema(request=VersionCreateSerializer, responses={201: VersionSummarySerializer})
    def post(self, request, design_pk):
        design = _own_design(request, design_pk)
        body = VersionCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        label = body.validated_data.get("label") or DEFAULT_VERSION_LABEL
        version = services.create_manual_version(design.pk, request.user, label)
        return Response(VersionSummarySerializer(version).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["designs"], responses=VersionDetailSerializer)
class DesignVersionDetailView(APIView):
    def get(self, request, design_pk, version_pk):
        design = _own_design(request, design_pk)
        version = get_object_or_404(DesignVersion, pk=version_pk, design=design)
        return Response(VersionDetailSerializer(version).data)


@extend_schema(tags=["designs"], request=None, responses=DesignSerializer)
class DesignVersionRestoreView(APIView):
    def post(self, request, design_pk, version_pk):
        design = _own_design(request, design_pk)
        restored = services.restore_version(design.pk, version_pk, request.user)
        return Response(DesignSerializer(restored).data)
