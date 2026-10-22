"""`/stock/` — search and import photos from the configured providers (Unsplash, Pexels, Pixabay).

Searches are cached per provider (its own cache time), with a stale copy kept twice as long that is served,
marked `stale`, when the provider fails or is over its limit. A short lock makes a burst of identical
searches cost one upstream call. `provider=all` searches the "All" tab's providers in parallel and mixes them.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor, wait
from itertools import zip_longest
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.db import connections
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import providers
from .exceptions import FileTooLarge, StockBusy, StockNotConfigured, StockUnavailable
from .models import Asset
from .serializers import AssetSerializer
from .services import create_asset
from .throttling import StockRateThrottle, UploadRateThrottle
from .uploads import clean_name

ALL = "all"
EMPTY_CACHE_SECONDS = 5 * 60  # a typo shouldn't stay empty for a day
RESOLVE_CACHE_SECONDS = 10 * 60
LOCK_SECONDS = 15
LOCK_WAIT_SECONDS = 3.0
LOCK_POLL_SECONDS = 0.1
SEARCH_THREADS = 8  # shared by every "All" search in this process; more requests wait their turn
DEFAULT_PER_PAGE = 24
MAX_PAGE = 100
PROVIDER_CHOICES = tuple(providers.PROVIDERS)


class StockSearchSerializer(serializers.Serializer):
    q = serializers.CharField(max_length=100, required=False, allow_blank=True)
    page = serializers.IntegerField(min_value=1, max_value=MAX_PAGE, required=False)
    per_page = serializers.IntegerField(min_value=1, max_value=providers.MAX_PER_PAGE, required=False)
    provider = serializers.ChoiceField(choices=(*PROVIDER_CHOICES, ALL), required=False)
    cursor = serializers.CharField(
        max_length=300, required=False, help_text="`next_page` of an `all` search."
    )
    lang = serializers.RegexField(r"^[A-Za-z]{2}([-_][A-Za-z0-9]{1,8})*$", max_length=35, required=False)


class StockImportSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=PROVIDER_CHOICES)
    id = serializers.CharField(max_length=64)


def _pick_provider(requested: str | None) -> providers.StockProvider | None:
    if requested:
        provider = providers.PROVIDERS[requested]
        return provider if provider.configured else None
    configured = providers.configured_providers()
    return configured[0] if configured else None


def all_tab_providers() -> list[providers.StockProvider]:
    """The providers the "All" tab searches: `STOCK_ALL_PROVIDERS`, or every configured one."""
    configured = providers.configured_providers()
    wanted = {name.strip().lower() for name in settings.STOCK_ALL_PROVIDERS if name.strip()}
    return [p for p in configured if p.name in wanted] if wanted else configured


def _cache_key(provider: str, options: dict[str, str], query: str, page: int, per_page: int) -> str:
    settings_hash = hashlib.sha256(json.dumps(options, sort_keys=True).encode()).hexdigest()[:12]
    digest = hashlib.sha256(query.lower().encode()).hexdigest()[:32]
    return f"stock:v2:{provider}:{settings_hash}:{digest}:{page}:{per_page}"


def _wait_for(key: str) -> dict[str, Any] | None:
    deadline = time.monotonic() + LOCK_WAIT_SECONDS
    while time.monotonic() < deadline:
        time.sleep(LOCK_POLL_SECONDS)
        payload = cache.get(key)
        if payload is not None:
            return payload
    return None


def cached_search(
    provider: providers.StockProvider,
    query: str,
    page: int,
    per_page: int,
    lang: str = "",
    filters: dict[str, str] | None = None,
) -> dict[str, Any]:
    """One provider's page, from the cache when possible. Raises ProviderError (or ProviderBusy) only when
    neither a fresh nor a stale copy can be served. `filters` are the editor's own (clips: orientation and
    length); they become part of the provider's search options and so of the cache key."""
    options = provider.search_options(lang, filters) if filters else provider.search_options(lang)
    key = _cache_key(provider.name, options, query, page, per_page)
    payload = cache.get(key)
    if payload is not None:
        return payload
    # Never keep results, fresh or stale, past the lifetime of the image URLs in them.
    lifetime = provider.url_lifetime_seconds
    seconds = min(provider.config.cache_seconds, lifetime or provider.config.cache_seconds)
    # Without caching there is nothing to wait for; otherwise one request asks and the others read its answer.
    locked = bool(seconds) and cache.add(f"{key}:lock", 1, LOCK_SECONDS)
    if seconds and not locked:
        payload = _wait_for(key)  # someone else is asking the provider for exactly this
        if payload is not None:
            return payload
    try:
        try:
            found = provider.search(query, page, per_page, options)
        except providers.ProviderError:
            stale = cache.get(f"{key}:stale")
            if stale is not None:
                return {**stale, "stale": True}
            raise
        payload = {
            "configured": True,
            "provider": provider.name,
            "total": found.total,
            "next_page": found.next_page,
            "results": [photo.as_dict() for photo in found.photos],
        }
        if seconds and found.photos:
            cache.set(key, payload, seconds)
            stale_seconds = min(seconds * 2, lifetime or seconds * 2)
            if stale_seconds > seconds:
                cache.set(f"{key}:stale", payload, stale_seconds)
        elif seconds:
            cache.set(key, payload, min(seconds, EMPTY_CACHE_SECONDS))
        return payload
    finally:
        if locked:  # only the holder releases it; a waiter that gave up must not free someone else's lock
            cache.delete(f"{key}:lock")


def _encode_cursor(pages: dict[str, int]) -> str | None:
    if not pages:
        return None
    raw = json.dumps(pages, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_cursor(cursor: str, names: list[str]) -> dict[str, int]:
    invalid = serializers.ValidationError({"cursor": ["Not a valid cursor."]})
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
    except (ValueError, binascii.Error) as exc:
        raise invalid from exc
    if not isinstance(data, dict):
        raise invalid
    pages = {}
    for name, page in data.items():
        if (
            name not in names
            or not isinstance(page, int)
            or isinstance(page, bool)
            or not 1 <= page <= MAX_PAGE
        ):
            raise invalid
        pages[name] = page
    return pages


_POOL = ThreadPoolExecutor(max_workers=SEARCH_THREADS, thread_name_prefix="stock-search")


def _search_in_thread(provider: providers.StockProvider, *args: Any) -> dict[str, Any]:
    try:
        return cached_search(provider, *args)
    finally:
        connections.close_all()  # this thread's own connections (the database cache uses one)


def search_all(
    chosen: list[providers.StockProvider],
    pages: dict[str, int],
    query: str,
    per_page: int,
    lang: str,
    filters: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Search `chosen` (each at its page) in parallel and mix the results in turn: U1, Px1, Pb1, U2, …"""
    futures = {
        _POOL.submit(
            _search_in_thread, provider, query, pages[provider.name], per_page, lang, filters
        ): provider
        for provider in chosen
    }
    done, _ = wait(futures, timeout=settings.STOCK_ALL_TIMEOUT_SECONDS)
    for future in futures:
        # One still queued is dropped; one already running finishes in the background and fills the cache.
        future.cancel()
    found: dict[str, dict[str, Any]] = {}
    skipped: list[dict[str, Any]] = []
    for future, provider in futures.items():
        if future not in done:
            skipped.append({"provider": provider.name, "reason": "timeout", "retry_after": None})
            continue
        try:
            found[provider.name] = future.result()
        except providers.ProviderBusy as exc:
            skipped.append({"provider": provider.name, "reason": "busy", "retry_after": exc.retry_after})
        except providers.ProviderError:
            skipped.append({"provider": provider.name, "reason": "unavailable", "retry_after": None})
    if not found:
        waits = [s["retry_after"] for s in skipped if s["reason"] == "busy"]
        if waits:
            raise StockBusy(wait=min(waits))
        raise StockUnavailable()

    seen: set[tuple[str, str]] = set()
    results = []
    for row in zip_longest(*(page["results"] for page in found.values())):
        for photo in row:
            if photo is not None and (photo["provider"], photo["id"]) not in seen:
                seen.add((photo["provider"], photo["id"]))
                results.append(photo)
    caps = {provider.name: provider.max_results for provider in chosen}
    # A busy or slow provider keeps the page it was asked for, so "Load more" asks it again.
    next_pages = {n: p["next_page"] for n, p in found.items() if p["next_page"]}
    # Not one that failed outright (a revoked key, say): asking it again would only fail again.
    next_pages.update({s["provider"]: pages[s["provider"]] for s in skipped if s["reason"] != "unavailable"})
    payload: dict[str, Any] = {
        "configured": True,
        "provider": ALL,
        "total": sum(min(page["total"], caps[name] or page["total"]) for name, page in found.items()),
        "next_page": _encode_cursor(next_pages),
        "results": results,
        "skipped": skipped,
    }
    if any(page.get("stale") for page in found.values()):
        payload["stale"] = True
    return payload


def _not_configured(provider: str) -> dict[str, Any]:
    return {"configured": False, "provider": provider, "total": 0, "next_page": None, "results": []}


def search(
    requested_provider: str | None,
    query: str,
    page: int = 1,
    per_page: int = DEFAULT_PER_PAGE,
    lang: str = "",
    cursor: str | None = None,
) -> dict[str, Any]:
    """One page of stock photos, cached per provider. `requested_provider="all"` mixes the "All" tab's
    providers (paged by `cursor`). Raises `StockBusy` or `StockUnavailable` when nothing can be served."""
    query, lang = query.strip(), lang[:2].lower()
    if requested_provider == ALL:
        chosen = all_tab_providers()
        if not chosen:
            return _not_configured(ALL)
        names = [provider.name for provider in chosen]
        pages = _decode_cursor(cursor, names) if cursor else dict.fromkeys(names, 1)
        if not pages:
            raise serializers.ValidationError({"cursor": ["Not a valid cursor."]})
        return search_all([p for p in chosen if p.name in pages], pages, query, per_page, lang)

    provider = _pick_provider(requested_provider)
    if provider is None:
        return _not_configured(requested_provider or "")
    try:
        return cached_search(provider, query, page, per_page, lang)
    except providers.ProviderBusy as exc:
        raise StockBusy(wait=exc.retry_after) from exc
    except providers.ProviderError as exc:
        raise StockUnavailable() from exc


class StockSearchView(APIView):
    def get_throttles(self):
        return [*super().get_throttles(), StockRateThrottle()]

    @extend_schema(parameters=[StockSearchSerializer], responses={200: dict}, tags=["stock"])
    def get(self, request):
        params = StockSearchSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        data = params.validated_data
        payload = search(
            data.get("provider"),
            data.get("q", ""),
            data.get("page", 1),
            data.get("per_page", DEFAULT_PER_PAGE),
            data.get("lang", ""),
            data.get("cursor"),
        )
        return Response(payload)


class StockProvidersView(APIView):
    @extend_schema(responses={200: dict}, tags=["stock"])
    def get(self, request):
        """The configured providers in tab order, with the credit each one asks for, and the default tab."""
        configured = providers.configured_providers()
        names = [provider.name for provider in configured]
        in_all = [provider.name for provider in all_tab_providers()] if len(configured) > 1 else []
        in_all = in_all if len(in_all) > 1 else []
        default = settings.STOCK_DEFAULT_TAB.strip().lower()
        if not (default == ALL and in_all) and default not in names:
            default = ALL if in_all else (names[0] if names else "")
        return Response(
            {
                "providers": [
                    {"name": p.name, "label": p.label, "attribution": p.attribution, "url": p.home_url}
                    for p in configured
                ],
                "all": in_all,
                "default": default,
            }
        )


def _resolve(provider: providers.StockProvider, photo_id: str) -> providers.ResolvedPhoto:
    """Cached briefly, so a double click or a retry doesn't cost another call."""
    key = f"stock:resolve:{provider.name}:{photo_id}"
    resolved = cache.get(key)
    if not isinstance(resolved, providers.ResolvedPhoto):
        resolved = provider.resolve(photo_id)
        cache.set(key, resolved, RESOLVE_CACHE_SECONDS)
    return resolved


def import_photo(owner, provider_name: str, photo_id: str) -> tuple[Asset, bool]:
    """The owner's asset for a stock photo, downloaded on first use; returns (asset, created)."""
    provider = providers.PROVIDERS[provider_name]
    if not provider.configured:
        raise StockNotConfigured()
    if not provider.valid_id(photo_id):
        raise serializers.ValidationError({"id": ["Not a valid photo id for this provider."]})

    existing = Asset.objects.filter(
        owner=owner, meta__provider=provider.name, meta__photo_id=photo_id
    ).first()
    if existing:
        return existing, False

    try:
        resolved = _resolve(provider, photo_id)
        data = providers.download_image(
            resolved.download_url, hosts=provider.image_hosts, max_bytes=settings.MAX_UPLOAD_BYTES
        )
    except providers.PhotoTooLarge as exc:
        raise FileTooLarge() from exc
    except providers.ProviderBusy as exc:
        raise StockBusy(wait=exc.retry_after) from exc
    except providers.ProviderError as exc:
        raise StockUnavailable() from exc

    photo = resolved.photo
    asset = create_asset(
        owner,
        data,
        name=clean_name(f"Photo by {photo.author}" if photo.author else f"{provider.name.title()} photo"),
        meta={
            "provider": provider.name,
            "photo_id": photo_id,
            "attribution": {
                "provider": provider.name,
                "author": photo.author,
                "author_url": photo.author_url,
                "source_url": photo.source_url,
            },
        },
    )
    provider.track_download(resolved)
    return asset, True


class StockImportView(APIView):
    def get_throttles(self):
        return [*super().get_throttles(), UploadRateThrottle()]

    @extend_schema(
        request=StockImportSerializer, responses={200: AssetSerializer, 201: AssetSerializer}, tags=["stock"]
    )
    def post(self, request):
        body = StockImportSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        asset, created = import_photo(
            request.user, body.validated_data["provider"], body.validated_data["id"]
        )
        return Response(
            AssetSerializer(asset).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )
