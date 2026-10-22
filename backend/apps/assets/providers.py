"""Stock-photo providers. The only module that talks to the network.

The client only ever names a provider and a photo id. The download URL is resolved from the provider's
API and must stay on that provider's image CDN over https for every hop (redirects are followed manually
and re-checked), so a hostile response or client can never aim the server at an arbitrary host.
"""

from __future__ import annotations

import logging
import math
import re
import time
from abc import ABC, abstractmethod
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlsplit, urlunsplit

import requests
from django.conf import settings
from requests.structures import CaseInsensitiveDict

from . import stocklimits

API_TIMEOUT = (3.05, 10)
DOWNLOAD_TIMEOUT = (3.05, 10)
DOWNLOAD_DEADLINE_SECONDS = 25.0
MAX_REDIRECTS = 3
MAX_PER_PAGE = 30
USER_AGENT = "Doory-StockProxy/1.0"
UTM = {"utm_source": "doory", "utm_medium": "referral"}
_REDIRECT_CODES = frozenset({301, 302, 303, 307, 308})
_UNSAFE_URL_CHARS = re.compile(r"[\x00-\x20\x7f-\uffff\\]")
_UNSPLASH_ID = re.compile(r"[A-Za-z0-9_-]{5,40}")
_PEXELS_ID = re.compile(r"[0-9]{1,12}")
_PIXABAY_ID = re.compile(r"[0-9]{1,12}")
_KEY_IN_URL = re.compile(r"([?&]key=)[^&\s\"']+")

logger = logging.getLogger(__name__)


class _RedactKeys(logging.Filter):
    """urllib3 logs request URLs at DEBUG; Pixabay's key is a query parameter, so it is masked there."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if "key=" in message:
            record.msg, record.args = _KEY_IN_URL.sub(r"\1***", message), ()
        return True


logging.getLogger("urllib3.connectionpool").addFilter(_RedactKeys())

http_get: Callable[..., Any] = requests.get


class ProviderError(Exception):
    """The provider failed, answered nonsense, or pointed somewhere it must not."""


class PhotoTooLarge(ProviderError):
    """The photo exceeds the download cap."""


class ProviderBusy(ProviderError):
    """The provider's limit for our key is reached (by its own answer or our count); try again later."""

    def __init__(self, retry_after: int):
        super().__init__("The provider is busy.")
        self.retry_after = max(1, int(retry_after))


@dataclass(frozen=True)
class StockPhoto:
    id: str
    provider: str
    thumb_url: str
    preview_url: str
    width: int
    height: int
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
            "author": self.author,
            "author_url": self.author_url,
            "source_url": self.source_url,
        }


@dataclass(frozen=True)
class SearchPage:
    total: int
    next_page: int | None
    photos: list[StockPhoto]


@dataclass(frozen=True)
class ResolvedPhoto:
    photo: StockPhoto
    download_url: str
    track_url: str | None = None


def check_https_host(url: str, hosts: frozenset[str]) -> str:
    """Return `url` unchanged when it is plain https on an allow-listed host, else raise ProviderError."""
    if _UNSAFE_URL_CHARS.search(url):
        raise ProviderError("URL contains unsafe characters.")
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError as exc:
        raise ProviderError("Malformed URL from provider.") from exc
    if (
        parts.scheme != "https"
        or parts.hostname not in hosts
        or parts.username is not None
        or parts.password is not None
        or port not in (None, 443)
    ):
        raise ProviderError("URL is not on an allowed host.")
    return url


def _https_link(value: object) -> str:
    """A link rendered as an anchor in the UI: https only, otherwise dropped."""
    if not isinstance(value, str) or _UNSAFE_URL_CHARS.search(value):
        return ""
    try:
        return value if urlsplit(value).scheme == "https" else ""
    except ValueError:
        return ""


def _with_query(url: str, extra: dict[str, str]) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.update(extra)
    return urlunsplit(parts._replace(query=urlencode(query)))


def _dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _is_count(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _as_int(value: object, default: int = 0) -> int:
    return value if _is_count(value) else default


def _as_str(value: object, limit: int = 200) -> str:
    return value[:limit] if isinstance(value, str) else ""


def _get_json(
    url: str,
    *,
    headers: dict[str, str],
    params: dict[str, Any] | None = None,
    on_response: Callable[[int, Mapping[str, str]], None] | None = None,
) -> Any:
    try:
        response = http_get(
            url,
            params=params,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json", **headers},
            timeout=API_TIMEOUT,
            allow_redirects=False,
        )
    except requests.RequestException:
        # Not chained: a requests error repeats the URL, and some providers take the key as a query parameter.
        raise ProviderError("Provider request failed.") from None
    try:
        if on_response is not None:
            on_response(response.status_code, CaseInsensitiveDict(response.headers or {}))
        if response.status_code != 200:
            raise ProviderError(f"Provider answered {response.status_code}.")
        return response.json()
    except ValueError as exc:
        raise ProviderError("Provider returned invalid JSON.") from exc
    finally:
        response.close()


def _next_page(total: int, page: int, per_page: int) -> int | None:
    return page + 1 if page * per_page < total else None


def _seconds(value: object) -> float | None:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number >= 0 else None


class StockProvider(ABC):
    name: str
    label: str
    attribution: str
    home_url: str
    image_hosts: frozenset[str]
    max_results: int | None = None  # the most a search can page through, when the provider caps it
    url_lifetime_seconds: int | None = None  # how long the image URLs in a search answer keep working
    pause_fallback_seconds = 60  # how long to back off when the provider says "stop" without saying how long

    @property
    def configured(self) -> bool:
        """On: it has a key and `STOCK_PROVIDERS` lists it."""
        return bool(self._key()) and self.name in _enabled_names()

    @property
    def config(self) -> stocklimits.StockConfig:
        return stocklimits.config_for(self.name)

    def search_options(self, lang: str = "") -> dict[str, str]:
        """Settings that change what a search returns; part of the search cache key."""
        return {}

    def _reset_seconds(self, headers: Mapping[str, str]) -> float | None:
        """Seconds until the quota renews, from the provider's rate-limit headers."""
        return None

    def wait_from(self, status: int, headers: Mapping[str, str]) -> float | None:
        """How long to pause after this answer: on a 429, or when the quota left reaches zero."""
        remaining = _seconds(headers.get("X-RateLimit-Remaining"))
        if status != 429 and not (status == 200 and remaining == 0):
            return None
        return (
            _seconds(headers.get("Retry-After"))
            or self._reset_seconds(headers)
            or self.pause_fallback_seconds
        )

    def _note_response(self, status: int, headers: Mapping[str, str]) -> None:
        wait = self.wait_from(status, headers)
        if wait:
            stocklimits.pause(self.name, wait)
            if status == 429:
                raise ProviderBusy(int(min(wait, stocklimits.MAX_PAUSE_SECONDS)))

    def _api(self, url: str, params: dict[str, Any] | None = None) -> Any:
        """One counted call to the provider's API: refused up front when the key's budget is spent."""
        wait = stocklimits.acquire(self.name, self.config.rate)
        if wait:
            raise ProviderBusy(wait)
        return _get_json(url, headers=self._headers(), params=params, on_response=self._note_response)

    @abstractmethod
    def _key(self) -> str: ...

    @abstractmethod
    def valid_id(self, photo_id: str) -> bool: ...

    @abstractmethod
    def search(
        self, query: str, page: int, per_page: int, options: Mapping[str, str] | None = None
    ) -> SearchPage: ...

    @abstractmethod
    def resolve(self, photo_id: str) -> ResolvedPhoto: ...

    @abstractmethod
    def _headers(self) -> dict[str, str]: ...

    def track_download(self, resolved: ResolvedPhoto) -> None:
        """Report a download to providers that require it (they set `track_url`); never fails the import."""
        if not resolved.track_url:
            return
        try:
            _get_json(resolved.track_url, headers=self._headers())
        except ProviderError:
            logger.warning("Could not report a %s download.", self.name)

    def _checked(self, url: object) -> str | None:
        try:
            return check_https_host(url, self.image_hosts) if isinstance(url, str) else None
        except ProviderError:
            return None


class UnsplashProvider(StockProvider):
    name = "unsplash"
    label = "Unsplash"
    attribution = "Photos from Unsplash"
    home_url = _with_query("https://unsplash.com/", UTM)
    pause_fallback_seconds = 10 * 60  # Unsplash's window is an hour and it sends no reset time
    image_hosts = frozenset({"images.unsplash.com"})
    api_hosts = frozenset({"api.unsplash.com"})
    api = "https://api.unsplash.com"

    def _key(self) -> str:
        return settings.UNSPLASH_ACCESS_KEY

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Client-ID {self._key()}", "Accept-Version": "v1"}

    def valid_id(self, photo_id: str) -> bool:
        return _UNSPLASH_ID.fullmatch(photo_id) is not None

    def search_options(self, lang: str = "") -> dict[str, str]:
        # Off sends nothing, exactly the request Doory made before the setting existed.
        return {"content_filter": "high"} if self.config.safesearch else {}

    def _photo(self, item: object) -> StockPhoto | None:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            return None
        urls, user, links = _dict(item.get("urls")), _dict(item.get("user")), _dict(item.get("links"))
        user_links = _dict(user.get("links"))
        thumb, preview = self._checked(urls.get("small")), self._checked(urls.get("regular"))
        if not thumb or not preview or not self.valid_id(item["id"]):
            return None
        author_url, source_url = _https_link(user_links.get("html")), _https_link(links.get("html"))
        return StockPhoto(
            id=item["id"],
            provider=self.name,
            thumb_url=thumb,
            preview_url=preview,
            width=_as_int(item.get("width")),
            height=_as_int(item.get("height")),
            author=_as_str(user.get("name")),
            author_url=_with_query(author_url, UTM) if author_url else "",
            source_url=_with_query(source_url, UTM) if source_url else "",
        )

    def search(
        self, query: str, page: int, per_page: int, options: Mapping[str, str] | None = None
    ) -> SearchPage:
        params: dict[str, Any] = {"page": page, "per_page": per_page}
        if query:
            options = self.search_options() if options is None else options
            data = self._api(f"{self.api}/search/photos", params={**params, "query": query, **options})
            if not isinstance(data, dict) or not isinstance(data.get("results"), list):
                raise ProviderError("Unexpected provider response.")
            total = _as_int(data.get("total"))
            return SearchPage(total, _next_page(total, page, per_page), self._photos(data["results"]))
        data = self._api(f"{self.api}/photos", params=params)
        if not isinstance(data, list):
            raise ProviderError("Unexpected provider response.")
        more = page + 1 if len(data) == per_page else None
        return SearchPage((page - 1) * per_page + len(data), more, self._photos(data))

    def _photos(self, items: list[Any]) -> list[StockPhoto]:
        return [photo for photo in map(self._photo, items) if photo]

    def resolve(self, photo_id: str) -> ResolvedPhoto:
        data = self._api(f"{self.api}/photos/{photo_id}")
        photo = self._photo(data)
        if photo is None:
            raise ProviderError("Unexpected provider response.")
        urls, links = _dict(data.get("urls")), _dict(data.get("links"))
        raw = self._checked(urls.get("raw"))
        download = _with_query(raw, {"w": "2400", "q": "85", "fm": "jpg", "fit": "max"}) if raw else None
        download = download or self._checked(urls.get("regular"))
        if not download:
            raise ProviderError("The provider gave no downloadable image.")
        track = links.get("download_location")
        try:
            track_url = check_https_host(track, self.api_hosts) if isinstance(track, str) else None
        except ProviderError:
            track_url = None
        return ResolvedPhoto(photo=photo, download_url=download, track_url=track_url)


class PexelsProvider(StockProvider):
    name = "pexels"
    label = "Pexels"
    attribution = "Photos provided by Pexels"
    home_url = "https://www.pexels.com/"
    image_hosts = frozenset({"images.pexels.com"})
    api = "https://api.pexels.com/v1"

    def _key(self) -> str:
        return settings.PEXELS_API_KEY

    def _headers(self) -> dict[str, str]:
        return {"Authorization": self._key()}

    def valid_id(self, photo_id: str) -> bool:
        return _PEXELS_ID.fullmatch(photo_id) is not None

    def _reset_seconds(self, headers: Mapping[str, str]) -> float | None:
        reset = _seconds(headers.get("X-RateLimit-Reset"))  # the Unix time the monthly quota renews
        return reset - time.time() if reset and reset > time.time() else None

    def _photo(self, item: object) -> StockPhoto | None:
        if not isinstance(item, dict) or not _is_count(item.get("id")):
            return None
        src = _dict(item.get("src"))
        thumb, preview = self._checked(src.get("medium")), self._checked(src.get("large"))
        if not thumb or not preview:
            return None
        return StockPhoto(
            id=str(item["id"]),
            provider=self.name,
            thumb_url=thumb,
            preview_url=preview,
            width=_as_int(item.get("width")),
            height=_as_int(item.get("height")),
            author=_as_str(item.get("photographer")),
            author_url=_https_link(item.get("photographer_url")),
            source_url=_https_link(item.get("url")),
        )

    def search(
        self, query: str, page: int, per_page: int, options: Mapping[str, str] | None = None
    ) -> SearchPage:
        params: dict[str, Any] = {"page": page, "per_page": per_page}
        if query:
            data = self._api(f"{self.api}/search", params={**params, "query": query})
        else:
            data = self._api(f"{self.api}/curated", params=params)
        if not isinstance(data, dict) or not isinstance(data.get("photos"), list):
            raise ProviderError("Unexpected provider response.")
        photos = [photo for photo in map(self._photo, data["photos"]) if photo]
        if "total_results" in data:
            total = _as_int(data["total_results"])
            return SearchPage(total, _next_page(total, page, per_page), photos)
        more = page + 1 if data.get("next_page") else None
        return SearchPage((page - 1) * per_page + len(data["photos"]), more, photos)

    def resolve(self, photo_id: str) -> ResolvedPhoto:
        data = self._api(f"{self.api}/photos/{photo_id}")
        photo = self._photo(data)
        if photo is None:
            raise ProviderError("Unexpected provider response.")
        src = _dict(data.get("src"))
        download = self._checked(src.get("large2x")) or self._checked(src.get("original"))
        if not download:
            raise ProviderError("The provider gave no downloadable image.")
        return ResolvedPhoto(photo=photo, download_url=download)


PIXABAY_IMAGE_TYPES = frozenset({"photo", "illustration", "vector", "all"})
PIXABAY_LANGS = frozenset(
    [
        "cs",
        "da",
        "de",
        "en",
        "es",
        "fr",
        "id",
        "it",
        "hu",
        "nl",
        "no",
        "pl",
        "pt",
        "ro",
        "sk",
        "fi",
        "sv",
        "tr",
        "vi",
        "th",
        "bg",
        "ru",
        "el",
        "ja",
        "ko",
        "zh",
    ]
)


class PixabayProvider(StockProvider):
    """Pixabay takes its key as a query parameter, so it must never be logged or shown (see `_get_json`)."""

    name = "pixabay"
    label = "Pixabay"
    attribution = "Images from Pixabay"
    home_url = "https://pixabay.com/"
    image_hosts = frozenset({"cdn.pixabay.com", "pixabay.com"})
    api = "https://pixabay.com/api/"
    max_results = 500  # the API pages through at most 500 hits per query
    url_lifetime_seconds = 24 * 60 * 60  # webformatURL, our thumbnail and preview, expires after 24 h
    min_per_page, max_per_page, max_query = 3, 200, 100

    def _key(self) -> str:
        return settings.PIXABAY_API_KEY

    def _headers(self) -> dict[str, str]:
        return {}

    def _api(self, url: str, params: dict[str, Any] | None = None) -> Any:
        return super()._api(url, {"key": self._key(), **(params or {})})

    def valid_id(self, photo_id: str) -> bool:
        return _PIXABAY_ID.fullmatch(photo_id) is not None

    def _reset_seconds(self, headers: Mapping[str, str]) -> float | None:
        return _seconds(headers.get("X-RateLimit-Reset"))  # seconds left in the 60 s window

    def search_options(self, lang: str = "") -> dict[str, str]:
        image_type = settings.STOCK_PIXABAY_IMAGE_TYPE
        use_lang = settings.STOCK_LANG_FROM_UI and lang in PIXABAY_LANGS
        return {
            "image_type": image_type if image_type in PIXABAY_IMAGE_TYPES else "photo",
            "safesearch": "true" if self.config.safesearch else "false",
            "lang": lang if use_lang else "en",
        }

    def _checked(self, url: object) -> str | None:
        checked = super()._checked(url)
        if (
            checked
            and urlsplit(checked).hostname == "pixabay.com"
            and not urlsplit(checked).path.startswith("/get/")
        ):
            return None
        return checked

    def _photo(self, item: object) -> StockPhoto | None:
        if not isinstance(item, dict) or not _is_count(item.get("id")):
            return None
        web = item.get("webformatURL")
        smaller = web.replace("_640.", "_340.") if isinstance(web, str) else None
        preview = self._checked(web)
        thumb = self._checked(smaller) or self._checked(item.get("previewURL")) or preview
        if not thumb or not preview:
            return None
        user, user_id = _as_str(item.get("user"), 100), item.get("user_id")
        author_url = (
            f"https://pixabay.com/users/{quote(user, safe='')}-{user_id}/"
            if user and _is_count(user_id)
            else ""
        )
        return StockPhoto(
            id=str(item["id"]),
            provider=self.name,
            thumb_url=thumb,
            preview_url=preview,
            width=_as_int(item.get("imageWidth")),
            height=_as_int(item.get("imageHeight")),
            author=user,
            author_url=author_url,
            source_url=_https_link(item.get("pageURL")),
        )

    def search(
        self, query: str, page: int, per_page: int, options: Mapping[str, str] | None = None
    ) -> SearchPage:
        options = self.search_options() if options is None else options
        asked = min(max(per_page, self.min_per_page), self.max_per_page)
        params: dict[str, Any] = {"page": page, "per_page": asked, **options}
        if query:
            params["q"] = query[: self.max_query]
        data = self._api(self.api, params=params)
        if not isinstance(data, dict) or not isinstance(data.get("hits"), list):
            raise ProviderError("Unexpected provider response.")
        total = min(_as_int(data.get("totalHits")), self.max_results)
        photos = [photo for photo in map(self._photo, data["hits"]) if photo][:per_page]
        # A page smaller than Pixabay's minimum is cut from a bigger one, so it can't be paged on from.
        return SearchPage(total, _next_page(total, page, per_page) if asked == per_page else None, photos)

    def resolve(self, photo_id: str) -> ResolvedPhoto:
        data = self._api(self.api, params={"id": photo_id})
        hits = data.get("hits") if isinstance(data, dict) else None
        item = hits[0] if isinstance(hits, list) and hits else None
        photo = self._photo(item)
        if photo is None or photo.id != photo_id:
            raise ProviderError("Unexpected provider response.")
        item = _dict(item)
        # fullHDURL / imageURL only come with Pixabay's full API access.
        download = self._checked(item.get("fullHDURL")) or self._checked(item.get("largeImageURL"))
        if not download:
            raise ProviderError("The provider gave no downloadable image.")
        return ResolvedPhoto(photo=photo, download_url=download)


PROVIDERS: dict[str, StockProvider] = {
    p.name: p for p in (UnsplashProvider(), PexelsProvider(), PixabayProvider())
}


def _enabled_names() -> list[str]:
    names = (name.strip().lower() for name in settings.STOCK_PROVIDERS)
    return list(dict.fromkeys(name for name in names if name in PROVIDERS))


def configured_providers() -> list[StockProvider]:
    """The providers that are on, in the order of `STOCK_PROVIDERS`."""
    return [PROVIDERS[name] for name in _enabled_names() if PROVIDERS[name].configured]


def _redirect_target(current: str, location: str, hosts: frozenset[str]) -> str:
    try:
        return check_https_host(urljoin(current, location), hosts)
    except ValueError as exc:
        raise ProviderError("Malformed redirect target.") from exc


def _stream(response: Any, deadline: float) -> Iterator[bytes]:
    for chunk in response.iter_content(chunk_size=64 * 1024):
        if time.monotonic() > deadline:
            raise ProviderError("The download took too long.")
        yield chunk


def _download(
    url: str,
    *,
    hosts: frozenset[str],
    max_bytes: int,
    accept: str,
    deadline_seconds: float,
    write: Callable[[bytes], object],
) -> int:
    """Stream `url` (https, allow-listed host on every redirect hop) into `write` with a byte cap and a
    deadline. Returns the number of bytes written."""
    deadline = time.monotonic() + deadline_seconds
    current = check_https_host(url, hosts)
    for _ in range(MAX_REDIRECTS + 1):
        try:
            response = http_get(
                current,
                stream=True,
                timeout=DOWNLOAD_TIMEOUT,
                allow_redirects=False,
                headers={"User-Agent": USER_AGENT, "Accept": accept},
            )
        except requests.RequestException as exc:
            raise ProviderError("The download failed.") from exc
        try:
            if response.status_code in _REDIRECT_CODES:
                location = response.headers.get("Location")
                if not location:
                    raise ProviderError("The provider redirected without a target.")
                current = _redirect_target(current, location, hosts)
                continue
            if response.status_code != 200:
                raise ProviderError(f"The image host answered {response.status_code}.")
            declared = response.headers.get("Content-Length", "")
            if declared.isdigit() and int(declared) > max_bytes:
                raise PhotoTooLarge("The photo is too large.")
            written = 0
            try:
                for chunk in _stream(response, deadline):
                    written += len(chunk)
                    if written > max_bytes:
                        raise PhotoTooLarge("The photo is too large.")
                    write(chunk)
            except requests.RequestException as exc:
                raise ProviderError("The download was interrupted.") from exc
            return written
        finally:
            response.close()
    raise ProviderError("Too many redirects.")


def download_image(url: str, *, hosts: frozenset[str], max_bytes: int, accept: str = "image/*") -> bytes:
    """Fetch `url` (https, allow-listed host on every redirect hop) with a byte cap and a deadline."""
    buffer = bytearray()
    _download(
        url,
        hosts=hosts,
        max_bytes=max_bytes,
        accept=accept,
        deadline_seconds=DOWNLOAD_DEADLINE_SECONDS,
        write=buffer.extend,
    )
    return bytes(buffer)


def download_to_file(
    url: str, target: Path, *, hosts: frozenset[str], max_bytes: int, deadline_seconds: float
) -> int:
    """Like `download_image`, but into a file (a clip can be hundreds of megabytes). Returns its size."""
    with target.open("wb") as out:
        return _download(
            url,
            hosts=hosts,
            max_bytes=max_bytes,
            accept="video/*",
            deadline_seconds=deadline_seconds,
            write=out.write,
        )
