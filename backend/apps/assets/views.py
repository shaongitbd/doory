from django.conf import settings
from django.db.models import F
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from . import video, video_jobs
from .models import Asset
from .ordering import order_queryset
from .parsers import BoundedJSONParser
from .serializers import (
    AssetQuerySerializer,
    AssetSerializer,
    AssetUpdateSerializer,
    AssetUploadSerializer,
)
from .services import create_asset, ingest_video_upload, looks_like_media, peek, read_upload, storage_used
from .throttling import UploadRateThrottle, VideoUploadRateThrottle
from .uploads import clean_name, reject_oversize_request

ORDERING = {"created_at": F("created_at"), "name": F("name"), "size": F("size")}


@extend_schema(tags=["assets"])
class AssetViewSet(
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = AssetSerializer
    parser_classes = [BoundedJSONParser, MultiPartParser]
    filter_backends: list = []
    lookup_value_regex = "[0-9a-fA-F-]{36}"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Asset.objects.none()
        return Asset.objects.filter(owner=self.request.user)

    def get_throttles(self):
        throttles = super().get_throttles()
        if self.action == "create":
            throttles.append(UploadRateThrottle())
        return throttles

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "kind",
                enum=["image", "svg", "audio", "video"],
                description="Without it the list holds images and SVG; audio and video only by their kind.",
            ),
            OpenApiParameter("q", str, description="Case-insensitive name search."),
            OpenApiParameter("ordering", str, description="created_at, name or size; prefix - to reverse."),
        ],
    )
    def list(self, request):
        query = AssetQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        params = query.validated_data
        queryset = self.get_queryset()
        if params.get("kind"):
            queryset = queryset.filter(kind=params["kind"])
        else:
            queryset = queryset.filter(kind__in=Asset.PICTURE_KINDS)
        if params.get("kind") == Asset.Kind.VIDEO:
            video_jobs.fail_stale(queryset)
        if params.get("q"):
            queryset = queryset.filter(name__icontains=params["q"].strip())
        queryset = order_queryset(queryset, params.get("ordering"), ORDERING, "-created_at")
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    def retrieve(self, request, *args, **kwargs):
        asset = self.get_object()
        if asset.status == Asset.Status.PROCESSING:
            video_jobs.fail_stale(self.get_queryset().filter(pk=asset.pk))
            asset.refresh_from_db()
        return Response(self.get_serializer(asset).data)

    @extend_schema(
        request=AssetUploadSerializer,
        responses={201: AssetSerializer, 202: AssetSerializer},
        description="A video that has to be converted answers 202 with `status: processing`; poll the asset.",
    )
    def create(self, request):
        takes_video = video.available()
        limit = max(settings.MAX_UPLOAD_BYTES, settings.MAX_VIDEO_UPLOAD_BYTES if takes_video else 0)
        reject_oversize_request(request, limit)
        upload = AssetUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        file = upload.validated_data["file"]
        name = clean_name(upload.validated_data.get("name") or file.name or "")
        tags = upload.validated_data.get("tags")
        if takes_video and looks_like_media(peek(file)):
            throttle = VideoUploadRateThrottle()
            if not throttle.allow_request(request, self):
                self.throttled(request, throttle.wait())
            asset = ingest_video_upload(request.user, file, name=name, tags=tags)
            if asset is not None:
                ready = asset.status == Asset.Status.READY
                return Response(
                    AssetSerializer(asset).data,
                    status=status.HTTP_201_CREATED if ready else status.HTTP_202_ACCEPTED,
                )
        asset = create_asset(request.user, read_upload(file), name=name, tags=tags)
        return Response(AssetSerializer(asset).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=AssetUpdateSerializer, responses=AssetSerializer)
    def partial_update(self, request, *args, **kwargs):
        asset = self.get_object()
        update = AssetUpdateSerializer(data=request.data, partial=True)
        update.is_valid(raise_exception=True)
        changed = []
        for field, value in update.validated_data.items():
            setattr(asset, field, value)
            changed.append(field)
        if changed:
            asset.save(update_fields=[*changed, "updated_at"])
        return Response(AssetSerializer(asset).data)

    @extend_schema(
        responses=inline_serializer(
            "AssetUsage",
            {"used_bytes": serializers.IntegerField(), "quota_bytes": serializers.IntegerField()},
        )
    )
    @action(detail=False, methods=["get"])
    def usage(self, request):
        return Response(
            {"used_bytes": storage_used(request.user), "quota_bytes": settings.USER_STORAGE_QUOTA_BYTES}
        )
