"""`/stock/videos/` — search and import clips from the configured video providers (Pexels, Pixabay).

The same machinery as stock photos (`stock`): per-provider caching with a stale fallback, a short lock against
bursts, and an "All" tab that searches the providers in parallel. A clip is imported by downloading it on the
server (never hotlinked) and running it through the same checks and conversion as an uploaded one.
"""

from __future__ import annotations

import shutil
from typing import Any

from django.conf import settings
from django.core.cache import cache
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import providers, video, video_jobs
from .exceptions import (
    FileTooLarge,
    InvalidFile,
    StockBusy,
    StockNotConfigured,
    StockUnavailable,
    VideoUnavailable,
)
from .models import Asset
from .serializers import AssetSerializer
from .stock import (
    ALL,
    DEFAULT_PER_PAGE,
    MAX_PAGE,
    RESOLVE_CACHE_SECONDS,
    _decode_cursor,
    _not_configured,
    cached_search,
    search_all,
)
from .throttling import StockRateThrottle, VideoUploadRateThrottle
from .uploads import clean_name
from .video_providers import (
    DURATIONS,
    ORIENTATIONS,
    VIDEO_PROVIDERS,
    ResolvedVideo,
    VideoProvider,
    configured_video_providers,
)

PROVIDER_CHOICES = tuple(VIDEO_PROVIDERS)


class VideoSearchSerializer(serializers.Serializer):
    q = serializers.CharField(max_length=100, required=False, allow_blank=True)
    page = serializers.IntegerField(min_value=1, max_value=MAX_PAGE, required=False)
    per_page = serializers.IntegerField(min_value=1, max_value=providers.MAX_PER_PAGE, required=False)
    provider = serializers.ChoiceField(choices=(*PROVIDER_CHOICES, ALL), required=False)
    cursor = serializers.CharField(
        max_length=300, required=False, help_text="`next_page` of an `all` search."
    )
    lang = serializers.RegexField(r"^[A-Za-z]{2}([-_][A-Za-z0-9]{1,8})*$", max_length=35, required=False)
    orientation = serializers.ChoiceField(choices=sorted(ORIENTATIONS), required=False)
    duration = serializers.ChoiceField(
        choices=tuple(DURATIONS), required=False, help_text="short, medium, long"
    )


class VideoImportSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=PROVIDER_CHOICES)
    id = serializers.CharField(max_length=64)


def enabled() -> list[VideoProvider]:
    """The clip providers to offer: none when this server can't convert clips."""
    return configured_video_providers() if video.available() else []


def search(
    requested: str | None,
    query: str,
    page: int = 1,
    per_page: int = DEFAULT_PER_PAGE,
    lang: str = "",
    cursor: str | None = None,
    filters: dict[str, str] | None = None,
) -> dict[str, Any]:
    """One page of clips; `requested="all"` mixes every enabled provider (paged by `cursor`)."""
    query, lang = query.strip(), lang[:2].lower()
    chosen = enabled()
    filters = {key: value for key, value in (filters or {}).items() if value}
    if requested == ALL or (requested is None and len(chosen) > 1):
        if not chosen:
            return _not_configured(ALL)
        names = [provider.name for provider in chosen]
        pages = _decode_cursor(cursor, names) if cursor else dict.fromkeys(names, 1)
        if not pages:
            raise serializers.ValidationError({"cursor": ["Not a valid cursor."]})
        picked = [p for p in chosen if p.name in pages]
        return search_all(picked, pages, query, per_page, lang, filters or None)

    provider = next((p for p in chosen if p.name == requested or requested is None), None)
    if provider is None:
        return _not_configured(requested or "")
    try:
        return cached_search(provider, query, page, per_page, lang, filters or None)
    except providers.ProviderBusy as exc:
        raise StockBusy(wait=exc.retry_after) from exc
    except providers.ProviderError as exc:
        raise StockUnavailable() from exc


class StockVideoSearchView(APIView):
    def get_throttles(self):
        return [*super().get_throttles(), StockRateThrottle()]

    @extend_schema(parameters=[VideoSearchSerializer], responses={200: dict}, tags=["stock"])
    def get(self, request):
        params = VideoSearchSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        data = params.validated_data
        payload = search(
            data.get("provider"),
            data.get("q", ""),
            data.get("page", 1),
            data.get("per_page", DEFAULT_PER_PAGE),
            data.get("lang", ""),
            data.get("cursor"),
            {"orientation": data.get("orientation", ""), "duration": data.get("duration", "")},
        )
        return Response(payload)


class StockVideoProvidersView(APIView):
    @extend_schema(responses={200: dict}, tags=["stock"])
    def get(self, request):
        """Whether this server takes clips at all, and the clip providers in tab order with their credit."""
        chosen = enabled()
        names = [provider.name for provider in chosen]
        return Response(
            {
                "enabled": video.available(),
                "max_upload_bytes": settings.MAX_VIDEO_UPLOAD_BYTES,
                "max_duration_ms": settings.MAX_VIDEO_DURATION_SECONDS * 1000,
                "providers": [
                    {"name": p.name, "label": p.label, "attribution": p.attribution, "url": p.home_url}
                    for p in chosen
                ],
                "all": names if len(names) > 1 else [],
                "default": ALL if len(names) > 1 else (names[0] if names else ""),
            }
        )


def _resolve(provider: VideoProvider, video_id: str) -> ResolvedVideo:
    key = f"stock:resolve:{provider.name}:{video_id}"
    resolved = cache.get(key)
    if not isinstance(resolved, ResolvedVideo):
        resolved = provider.resolve(video_id)
        cache.set(key, resolved, RESOLVE_CACHE_SECONDS)
    return resolved


def import_video(owner, provider_name: str, video_id: str) -> tuple[Asset, bool]:
    """The owner's asset for a stock clip, downloaded and converted on first use; returns (asset, created)."""
    if not video.available():
        raise VideoUnavailable()
    provider = VIDEO_PROVIDERS[provider_name]
    if not provider.configured:
        raise StockNotConfigured("This stock video provider is not configured on this server.")
    if not provider.valid_id(video_id):
        raise serializers.ValidationError({"id": ["Not a valid video id for this provider."]})

    existing = Asset.objects.filter(
        owner=owner, kind=Asset.Kind.VIDEO, meta__provider=provider.name, meta__video_id=video_id
    ).exclude(status=Asset.Status.FAILED)
    if existing.exists():
        return existing.first(), False

    workdir = video.work_dir()
    source = workdir / "source"
    try:
        try:
            resolved = _resolve(provider, video_id)
            providers.download_to_file(
                resolved.download_url,
                source,
                hosts=provider.video_hosts,
                max_bytes=settings.MAX_VIDEO_UPLOAD_BYTES,
                deadline_seconds=settings.VIDEO_DOWNLOAD_DEADLINE_SECONDS,
            )
        except providers.PhotoTooLarge as exc:
            raise FileTooLarge("The video is too large.") from exc
        except providers.ProviderBusy as exc:
            raise StockBusy(wait=exc.retry_after) from exc
        except providers.ProviderError as exc:
            raise StockUnavailable(
                "The stock video provider could not be reached. Try again shortly."
            ) from exc
        try:
            info = video.probe(source)
        except video.VideoError as exc:
            raise InvalidFile(str(exc)) from exc
    except BaseException:
        shutil.rmtree(workdir, ignore_errors=True)
        raise

    clip = resolved.video
    asset = video_jobs.create_video_asset(
        owner,
        source,
        info,
        name=clean_name(f"Video by {clip.author}" if clip.author else f"{provider.label} video"),
        meta={
            "provider": provider.name,
            "video_id": video_id,
            "attribution": {
                "provider": provider.name,
                "author": clip.author,
                "author_url": clip.author_url,
                "source_url": clip.source_url,
            },
        },
    )
    return asset, True


class StockVideoImportView(APIView):
    def get_throttles(self):
        return [*super().get_throttles(), VideoUploadRateThrottle()]

    @extend_schema(
        request=VideoImportSerializer,
        responses={200: AssetSerializer, 201: AssetSerializer, 202: AssetSerializer},
        tags=["stock"],
    )
    def post(self, request):
        body = VideoImportSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        asset, created = import_video(
            request.user, body.validated_data["provider"], body.validated_data["id"]
        )
        if not created:
            code = status.HTTP_200_OK
        else:
            ready = asset.status == Asset.Status.READY
            code = status.HTTP_201_CREATED if ready else status.HTTP_202_ACCEPTED
        return Response(AssetSerializer(asset).data, status=code)
