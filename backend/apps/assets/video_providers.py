"""Stock-video providers (Pexels and Pixabay videos), next to the photo ones in `providers`.

They reuse everything the photo providers do: each network call goes through `providers` (so the same
counting, pausing, key redaction and host checks apply), the client only ever names a provider and a clip id,
and the file to download is resolved from the provider's API and must stay on its video CDN for every hop.

Each one has a key setting of its own (`PEXELS_VIDEO_API_KEY`, `PIXABAY_VIDEO_API_KEY`) that falls back to the
provider's photo key, so clip searches and photo searches can use separate quotas, and its own rate and cache
settings under its own name (`STOCK_PEXELS_VIDEO_RATE`, ...). A provider is on when it has a key and
`STOCK_VIDEO_PROVIDERS` lists it.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from django.conf import settings

from .providers import (
    _PEXELS_ID,
    _PIXABAY_ID,
    PIXABAY_LANGS,
    PexelsProvider,
    PixabayProvider,
    ProviderError,
    StockProvider,
    _as_int,
    _as_str,
    _dict,
    _https_link,
    _is_count,
    _next_page,
    check_https_host,
)

ORIENTATIONS = frozenset({"landscape", "portrait", "square"})
# Duration filters the editor offers: short (under 15 s), medium (15 to 60 s), long (over a minute).
DURATIONS = {"short": (0, 15), "medium": (15, 60), "long": (60, None)}
MAX_SIDE = 1080  # the clip we fetch: the largest rendition whose short side is at most this
PREVIEW_MIN_SIDE = 360
# When a filter is applied here rather than by the provider, a page asks for this many times more clips, so a
# filtered page isn't nearly empty. Paging stays on the provider's pages of that larger size.
OVERFETCH = 4


@dataclass(frozen=True)
class StockVideo:
    id: str
    provider: str
    thumb_url: str  # a still, shown in the grid
    preview_url: str  # a small rendition that plays on hover
    width: int
    height: int
    duration_ms: int
    author: str
    author_url: str
    source_url: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "provider": self.provider,
            "thumb_url": self.thumb_url,
            "preview_url": self.preview_url,
            "width": self.width,
            "height": self.height,
            "duration_ms": self.duration_ms,
            "author": self.author,
            "author_url": self.author_url,
            "source_url": self.source_url,
        }


@dataclass(frozen=True)
class VideoSearchPage:
    total: int
    next_page: int | None
    videos: list[StockVideo]

    @property
    def photos(self) -> list[StockVideo]:
        """The results under the name `stock.cached_search` reads, so one cache serves photos and clips."""
        return self.videos


@dataclass(frozen=True)
class ResolvedVideo:
    video: StockVideo
    download_url: str


def orientation_of(width: int, height: int) -> str:
    if not width or not height:
        return ""
    ratio = width / height
    return "square" if 0.9 <= ratio <= 1.1 else ("landscape" if ratio > 1 else "portrait")


def matches(video: StockVideo, options: Mapping[str, str]) -> bool:
    """Whether a clip passes the editor's filters (applied here for what a provider can't filter itself)."""
    orientation = options.get("orientation", "")
    if orientation and orientation_of(video.width, video.height) != orientation:
        return False
    low, high = DURATIONS.get(options.get("duration", ""), (0, None))
    seconds = video.duration_ms / 1000
    return seconds >= low and (high is None or seconds <= high)


class VideoProvider(StockProvider):
    """A provider of clips. `image_hosts` holds where its stills live, `video_hosts` where its clips do."""

    video_hosts: frozenset[str]

    @property
    def configured(self) -> bool:
        return bool(self._key()) and self.name in _enabled_names()

    def search_options(self, lang: str = "", filters: Mapping[str, str] | None = None) -> dict[str, str]:
        filters = filters or {}
        options = {}
        if filters.get("orientation") in ORIENTATIONS:
            options["orientation"] = filters["orientation"]
        if filters.get("duration") in DURATIONS:
            options["duration"] = filters["duration"]
        return options

    def _video_link(self, url: object) -> str | None:
        try:
            return check_https_host(url, self.video_hosts) if isinstance(url, str) else None
        except ProviderError:
            return None


class PexelsVideoProvider(VideoProvider, PexelsProvider):
    max_per_page = 80
    name = "pexels_video"
    label = "Pexels"
    attribution = "Videos provided by Pexels"
    video_hosts = frozenset({"videos.pexels.com"})

    def _key(self) -> str:
        return settings.PEXELS_VIDEO_API_KEY or settings.PEXELS_API_KEY

    def valid_id(self, video_id: str) -> bool:
        return _PEXELS_ID.fullmatch(video_id) is not None

    def _files(self, item: dict) -> list[tuple[int, int, str]]:
        """(short side, long side, link) of each MP4 rendition on the clip CDN."""
        files = []
        for entry in item.get("video_files") or []:
            entry = _dict(entry)
            link = self._video_link(entry.get("link"))
            width, height = _as_int(entry.get("width")), _as_int(entry.get("height"))
            if link and width and height and entry.get("file_type") == "video/mp4":
                files.append((min(width, height), max(width, height), link))
        return sorted(files)

    def _video(self, item: object) -> StockVideo | None:
        if not isinstance(item, dict) or not _is_count(item.get("id")):
            return None
        thumb = self._checked(item.get("image"))
        files = self._files(item)
        previews = [link for short, _, link in files if short >= PREVIEW_MIN_SIDE] or [f[2] for f in files]
        if not thumb or not previews:
            return None
        user = _dict(item.get("user"))
        return StockVideo(
            id=str(item["id"]),
            provider=self.name,
            thumb_url=thumb,
            preview_url=previews[0],
            width=_as_int(item.get("width")),
            height=_as_int(item.get("height")),
            duration_ms=_as_int(item.get("duration")) * 1000,
            author=_as_str(user.get("name")),
            author_url=_https_link(user.get("url")),
            source_url=_https_link(item.get("url")),
        )

    def search(
        self, query: str, page: int, per_page: int, options: Mapping[str, str] | None = None
    ) -> VideoSearchPage:
        options = options or {}
        low, high = DURATIONS.get(options.get("duration", ""), (0, None))
        # Search filters by orientation and the popular list by length; the other one is filtered here.
        filtered_here = bool(options.get("duration") if query else options.get("orientation"))
        asked = min(per_page * OVERFETCH, self.max_per_page) if filtered_here else per_page
        params: dict[str, Any] = {"page": page, "per_page": asked}
        if query:
            if options.get("orientation"):
                params["orientation"] = options["orientation"]
            data = self._api(f"{self.api}/videos/search", params={**params, "query": query})
        else:
            if low:
                params["min_duration"] = low
            if high:
                params["max_duration"] = high
            data = self._api(f"{self.api}/videos/popular", params=params)
        if not isinstance(data, dict) or not isinstance(data.get("videos"), list):
            raise ProviderError("Unexpected provider response.")
        videos = [v for v in map(self._video, data["videos"]) if v and matches(v, options)]
        if "total_results" in data:
            total = _as_int(data["total_results"])
            return VideoSearchPage(total, _next_page(total, page, asked), videos)
        more = page + 1 if data.get("next_page") else None
        return VideoSearchPage((page - 1) * asked + len(data["videos"]), more, videos)

    def resolve(self, video_id: str) -> ResolvedVideo:
        data = self._api(f"{self.api}/videos/videos/{video_id}")
        video = self._video(data)
        if video is None or video.id != video_id:
            raise ProviderError("Unexpected provider response.")
        files = self._files(_dict(data))
        fitting = [f for f in files if f[0] <= MAX_SIDE]
        chosen = fitting[-1] if fitting else files[0]
        return ResolvedVideo(video=video, download_url=chosen[2])


class PixabayVideoProvider(VideoProvider, PixabayProvider):
    """Pixabay's video API: the key is a query parameter (never logged), results must be cached for 24 h."""

    name = "pixabay_video"
    label = "Pixabay"
    attribution = "Videos from Pixabay"
    video_hosts = frozenset({"cdn.pixabay.com"})
    api = "https://pixabay.com/api/videos/"
    # Smallest first: the preview is the first that exists, the download the largest that fits MAX_SIDE.
    renditions = ("tiny", "small", "medium", "large")

    def _key(self) -> str:
        return settings.PIXABAY_VIDEO_API_KEY or settings.PIXABAY_API_KEY

    def valid_id(self, video_id: str) -> bool:
        return _PIXABAY_ID.fullmatch(video_id) is not None

    def search_options(self, lang: str = "", filters: Mapping[str, str] | None = None) -> dict[str, str]:
        use_lang = settings.STOCK_LANG_FROM_UI and lang in PIXABAY_LANGS
        return {
            "video_type": "film",
            "safesearch": "true" if self.config.safesearch else "false",
            "lang": lang if use_lang else "en",
            **VideoProvider.search_options(self, lang, filters),
        }

    def _files(self, item: dict) -> list[tuple[str, int, int, str]]:
        files = []
        videos = _dict(item.get("videos"))
        for name in self.renditions:
            entry = _dict(videos.get(name))
            link = self._video_link(entry.get("url"))
            width, height = _as_int(entry.get("width")), _as_int(entry.get("height"))
            if link and width and height:
                files.append((name, width, height, link))
        return files

    def _video(self, item: object) -> StockVideo | None:
        if not isinstance(item, dict) or not _is_count(item.get("id")):
            return None
        files = self._files(item)
        if not files:
            return None
        videos = _dict(item.get("videos"))
        thumbs = (self._checked(_dict(videos.get(name)).get("thumbnail")) for name in ("small", "tiny"))
        thumb = next((url for url in thumbs if url), None)
        if not thumb:
            return None
        _, width, height, _ = files[-1]
        user, user_id = _as_str(item.get("user"), 100), item.get("user_id")
        author_url = (
            f"https://pixabay.com/users/{quote(user, safe='')}-{user_id}/"
            if user and _is_count(user_id)
            else ""
        )
        return StockVideo(
            id=str(item["id"]),
            provider=self.name,
            thumb_url=thumb,
            preview_url=files[0][3],
            width=width,
            height=height,
            duration_ms=_as_int(item.get("duration")) * 1000,
            author=user,
            author_url=author_url,
            source_url=_https_link(item.get("pageURL")),
        )

    def search(
        self, query: str, page: int, per_page: int, options: Mapping[str, str] | None = None
    ) -> VideoSearchPage:
        options = self.search_options() if options is None else options
        # Pixabay filters clips by neither orientation nor length: both are applied here.
        filtered_here = bool(options.get("orientation") or options.get("duration"))
        wanted = per_page * OVERFETCH if filtered_here else per_page
        asked = min(max(wanted, self.min_per_page), self.max_per_page)
        sent = {key: value for key, value in options.items() if key not in ("orientation", "duration")}
        params: dict[str, Any] = {"page": page, "per_page": asked, **sent}
        if query:
            params["q"] = query[: self.max_query]
        data = self._api(self.api, params=params)
        if not isinstance(data, dict) or not isinstance(data.get("hits"), list):
            raise ProviderError("Unexpected provider response.")
        total = min(_as_int(data.get("totalHits")), self.max_results)
        videos = [v for v in map(self._video, data["hits"]) if v and matches(v, options)]
        if filtered_here:
            return VideoSearchPage(total, _next_page(total, page, asked), videos)
        # A page smaller than Pixabay's minimum is cut from a bigger one, so it can't be paged on from.
        more = _next_page(total, page, per_page) if asked == per_page else None
        return VideoSearchPage(total, more, videos[:per_page])

    def resolve(self, video_id: str) -> ResolvedVideo:
        data = self._api(self.api, params={"id": video_id})
        hits = data.get("hits") if isinstance(data, dict) else None
        item = hits[0] if isinstance(hits, list) and hits else None
        video = self._video(item)
        if video is None or video.id != video_id:
            raise ProviderError("Unexpected provider response.")
        files = self._files(_dict(item))
        fitting = [f for f in files if min(f[1], f[2]) <= MAX_SIDE]
        chosen = fitting[-1] if fitting else files[0]
        return ResolvedVideo(video=video, download_url=chosen[3])


VIDEO_PROVIDERS: dict[str, VideoProvider] = {
    p.name: p for p in (PexelsVideoProvider(), PixabayVideoProvider())
}


def _enabled_names() -> list[str]:
    names = (name.strip().lower() for name in settings.STOCK_VIDEO_PROVIDERS)
    return list(dict.fromkeys(name for name in names if name in VIDEO_PROVIDERS))


def configured_video_providers() -> list[VideoProvider]:
    """The clip providers that are on, in the order of `STOCK_VIDEO_PROVIDERS`."""
    return [VIDEO_PROVIDERS[name] for name in _enabled_names() if VIDEO_PROVIDERS[name].configured]
