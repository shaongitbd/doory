from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.core.cache import cache
from django.db.models import Exists, OuterRef
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.throttling import ScopedRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.core.pagination import StandardPagination

from .catalog import curated_fonts
from .filters import FontFilter
from .models import FontFamily, FontVariant
from .serializers import FontFamilySerializer, FontUploadSerializer, with_variants
from .sources import FamilyMeta, FamilyNotFound, FontsourceSource, SourceError
from .sync import AUTO_SKIPPED_SUBSETS, SyncOptions, is_permissive_license, sync_family
from .uploads import add_user_font

CACHE_CONTROL = "public, max-age=300"


def offered_weights(meta: FamilyMeta) -> list[tuple[int, str]]:
    """Only offer faces that the on-demand sync can actually import."""
    subsets = set(meta.subsets) - AUTO_SKIPPED_SUBSETS
    if not subsets:
        return []
    return sorted(
        (weight, style)
        for weight in meta.weights
        for style in meta.styles
        if weight in range(100, 1000, 100)
        and (meta.available is None or any((weight, style, subset) in meta.available for subset in subsets))
    )


class FontWeights(APIView):
    """Offer and install real catalog variants, one requested weight at a time. Anyone may ask which weights
    exist; only a signed-in user may add one, since it downloads files into the catalog everyone shares."""

    def get_permissions(self):
        return [IsAuthenticated() if self.request.method == "POST" else AllowAny()]

    def get_throttles(self):
        classes = [*api_settings.DEFAULT_THROTTLE_CLASSES]
        if self.request.method == "POST":
            classes.append(ScopedRateThrottle)
            self.throttle_scope = "font_download"
        return [throttle() for throttle in classes]

    def _family_id(self, name: str) -> str | None:
        row = FontFamily.objects.filter(owner__isnull=True, is_published=True, family__iexact=name).first()
        if row:
            return row.slug
        return next((font.id for font in curated_fonts() if font.family.casefold() == name.casefold()), None)

    def _metadata(self, font_id: str):
        key = f"font-weights:meta:{font_id}"
        meta = cache.get(key)
        if meta is None:
            meta = FontsourceSource().metadata(font_id)
            cache.set(key, meta, 3600)
        return meta

    def _request(self, request):
        name = (request.query_params if request.method == "GET" else request.data).get("family", "")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 120:
            return None, Response({"detail": "Choose a font family."}, status=400)
        font_id = self._family_id(name.strip())
        if not font_id:
            return None, Response({"detail": "This font is not in Doory's catalog."}, status=404)
        return font_id, None

    def get(self, request):
        if not settings.FONT_ON_DEMAND_ENABLED or not request.user.is_authenticated:
            return Response({"enabled": False, "weights": []})
        font_id, error = self._request(request)
        if error:
            return error
        try:
            meta = self._metadata(font_id)
        except FamilyNotFound:
            return Response({"detail": "The font source has no such family."}, status=404)
        except SourceError:
            return Response({"detail": "Font weights are unavailable right now."}, status=503)
        if not meta.is_font or not is_permissive_license(meta.license):
            return Response({"detail": "This font cannot be downloaded."}, status=404)
        weights = offered_weights(meta)
        return Response({"enabled": True, "weights": [{"weight": w, "style": s} for w, s in weights]})

    def post(self, request):
        if not settings.FONT_ON_DEMAND_ENABLED:
            return Response({"detail": "Font downloads are disabled on this site."}, status=403)
        font_id, error = self._request(request)
        if error:
            return error
        weight, style = request.data.get("weight"), request.data.get("style")
        if (
            type(weight) is not int
            or weight not in range(100, 1000, 100)
            or style not in ("normal", "italic")
        ):
            return Response({"detail": "Choose an available weight and style."}, status=400)
        try:
            meta = self._metadata(font_id)
        except FamilyNotFound:
            return Response({"detail": "The font source has no such family."}, status=404)
        except SourceError:
            return Response({"detail": "Font weights are unavailable right now."}, status=503)
        if not meta.is_font or not is_permissive_license(meta.license):
            return Response({"detail": "This font cannot be downloaded."}, status=404)
        if (weight, style) not in offered_weights(meta):
            return Response({"detail": "This font does not offer that weight."}, status=400)
        lock = f"font-weights:download:{font_id}:{weight}:{style}"
        if not cache.add(lock, 1, 120):
            return Response({"detail": "This font weight is already being added."}, status=409)
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                result = sync_family(
                    FontsourceSource(),
                    font_id,
                    SyncOptions(subsets=("auto",), weights=(weight,), styles=(style,), concurrency=2),
                    pool,
                )
        except SourceError:
            return Response({"detail": "The font could not be downloaded right now."}, status=503)
        finally:
            cache.delete(lock)
        if result.failed or result.skipped or not result.downloaded + result.existing:
            return Response({"detail": "The font weight could not be installed."}, status=503)
        family = (
            FontFamily.objects.filter(owner__isnull=True, slug=font_id)
            .prefetch_related(with_variants())
            .first()
        )
        return Response(FontFamilySerializer(family, context={"request": request}).data)


class FontPagination(StandardPagination):
    page_size = 50


class FontUploadThrottle(UserRateThrottle):
    scope = "upload"


class PublicFontList(generics.ListAPIView):
    """Built-in fonts that have at least one file. Identical for everyone, so no session lookup and
    shared caches may keep it."""

    serializer_class = FontFamilySerializer
    pagination_class = FontPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = FontFilter
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get_queryset(self):
        has_files = FontVariant.objects.filter(family=OuterRef("pk"))
        return (
            FontFamily.objects.filter(owner__isnull=True, is_published=True)
            .filter(Exists(has_files))
            .prefetch_related(with_variants())
            .order_by("popularity", "family", "id")
        )

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if request.method == "GET" and response.status_code == 200:
            response["Cache-Control"] = CACHE_CONTROL
        return response


class UserFontListCreate(generics.ListCreateAPIView):
    """The caller's uploaded font families (list) and uploading new ones (multipart `files`)."""

    permission_classes = [IsAuthenticated]
    pagination_class = FontPagination
    filter_backends: list = []
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = FontFamilySerializer

    def get_throttles(self):
        return [FontUploadThrottle()] if self.request.method == "POST" else super().get_throttles()

    def get_queryset(self):
        return (
            FontFamily.objects.filter(owner=self.request.user)
            .prefetch_related(with_variants())
            .order_by("family", "id")
        )

    @extend_schema(request=FontUploadSerializer, responses={201: FontFamilySerializer})
    def post(self, request, *args, **kwargs):
        upload = FontUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        family = add_user_font(
            request.user,
            upload.validated_data["files"],
            family=upload.validated_data.get("family"),
            category=upload.validated_data.get("category"),
        )
        return Response(
            FontFamilySerializer(family, context={"request": request}).data, status.HTTP_201_CREATED
        )


class UserFontDelete(generics.DestroyAPIView):
    """Remove one of the caller's uploaded families and its files. Other users' fonts are a 404."""

    permission_classes = [IsAuthenticated]
    serializer_class = FontFamilySerializer

    def get_queryset(self):
        return FontFamily.objects.filter(owner=self.request.user)
