"""Server-side validation of design documents.

The server stores documents opaquely, so this is a safety net, not a schema: it bounds size and shape,
refuses client-local image references and walks the tree iteratively so nothing can recurse the stack.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass

from .exceptions import DocumentTooLarge, InlineAssetNotAllowed, InvalidDocument

SUPPORTED_SCHEMA_VERSION = 1
MAX_PAGES = 100
MAX_DIMENSION = 20_000
MAX_OBJECTS_PER_PAGE = 5_000
MAX_DEPTH = 64
MAX_NODES = 2_500_000
MAX_DATA_URL_CHARS = 64 * 1024
MAX_PRESET_LENGTH = 64
MAX_NOTES_LENGTH = 5_000
MIN_PAGE_DURATION_SEC = 1
MAX_PAGE_DURATION_SEC = 600
ANIMATION_PRESET = re.compile(r"[a-z0-9-]{1,40}")
ANIMATION_SLOTS = ("enter", "exit", "emphasis")
ANIMATION_EASINGS = frozenset({"linear", "ease-in", "ease-out", "ease-in-out", "spring", "bounce"})
ANIMATION_DIRECTIONS = frozenset({"left", "right", "up", "down", "in", "out"})
ANIMATION_TEXT_UNITS = frozenset({"object", "line", "word", "letter"})
ANIMATION_DURATION_MS = (100, 10_000)
ANIMATION_DELAY_MS = (0, 60_000)
TRANSITION_DURATION_MS = (200, 3_000)
MAX_AUDIO_TRACKS = 32
MAX_AUDIO_ID_LENGTH = 64
MAX_AUDIO_NAME_LENGTH = 200
MAX_AUDIO_SRC_LENGTH = 2_048
AUDIO_KINDS = frozenset({"music", "voiceover", "sfx", "upload"})
AUDIO_SCOPES = frozenset({"design", "page"})
AUDIO_MS_RANGES = {
    "startMs": (0, 86_400_000),
    "trimStartMs": (0, 86_400_000),
    "trimEndMs": (0, 86_400_000),
    "durationMs": (0, 86_400_000),
    "fadeInMs": (0, 60_000),
    "fadeOutMs": (0, 60_000),
}
AUDIO_FLAGS = ("loop", "muted", "duckUnderVoiceover")

_LOCAL_REFERENCE = re.compile(r"\s*(?:blob:|idb://)\S*\s*", re.IGNORECASE)


@dataclass(frozen=True)
class DocumentInfo:
    width: int
    height: int
    page_count: int
    preset: str


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _check_dimension(doc: dict, key: str) -> int:
    value = doc.get(key)
    if not _is_int(value) or not 1 <= value <= MAX_DIMENSION:
        raise InvalidDocument(f"`{key}` must be an integer between 1 and {MAX_DIMENSION}.")
    return value


def _check_presentation(page: dict, index: int) -> None:
    """Speaker notes (text, at most 5000 characters) and the auto-advance time (1-600 seconds).

    Both are optional; `null` counts as not set. The range test is also what refuses NaN, infinities and
    integers too large for a float (comparing never raises, `math.isfinite` would).
    """
    notes = page.get("notes")
    if notes is not None and (not isinstance(notes, str) or len(notes) > MAX_NOTES_LENGTH):
        raise InvalidDocument(
            f"Page {index + 1} `notes` must be text of at most {MAX_NOTES_LENGTH} characters."
        )
    duration = page.get("durationSec")
    if duration is None:
        return
    is_number = isinstance(duration, int | float) and not isinstance(duration, bool)
    if not is_number or not MIN_PAGE_DURATION_SEC <= duration <= MAX_PAGE_DURATION_SEC:
        raise InvalidDocument(
            f"Page {index + 1} `durationSec` must be a number between "
            f"{MIN_PAGE_DURATION_SEC} and {MAX_PAGE_DURATION_SEC}."
        )


def _check_number(value: object, low: float, high: float, where: str, key: str) -> None:
    is_number = isinstance(value, int | float) and not isinstance(value, bool)
    if not is_number or not low <= value <= high:
        raise InvalidDocument(f"{where} `{key}` must be a number between {low:g} and {high:g}.")


def _check_motion(value: object, where: str, *, durations: tuple[int, int], transition: bool) -> None:
    """One entry of `animation` (enter / exit / emphasis) or a page `transition`.

    Light on purpose: the preset id must be a short slug (any slug is accepted, so presets added later
    round-trip) and every setting that is present must be inside its range. `null` counts as not set.
    """
    if not isinstance(value, dict):
        raise InvalidDocument(f"{where} must be an object.")
    preset = value.get("preset")
    if not isinstance(preset, str) or not ANIMATION_PRESET.fullmatch(preset):
        raise InvalidDocument(f"{where} `preset` must be 1 to 40 characters of a-z, 0-9 and hyphens.")
    for key, allowed in (("easing", ANIMATION_EASINGS), ("direction", ANIMATION_DIRECTIONS)):
        if value.get(key) is not None and value[key] not in allowed:
            raise InvalidDocument(f"{where} `{key}` is not one of {', '.join(sorted(allowed))}.")
    if value.get("durationMs") is not None:
        _check_number(value["durationMs"], *durations, where, "durationMs")
    if transition:
        return
    if value.get("delayMs") is not None:
        _check_number(value["delayMs"], *ANIMATION_DELAY_MS, where, "delayMs")
    if value.get("intensity") is not None:
        _check_number(value["intensity"], 0, 1, where, "intensity")
    if value.get("by") is not None and value["by"] not in ANIMATION_TEXT_UNITS:
        raise InvalidDocument(f"{where} `by` is not one of {', '.join(sorted(ANIMATION_TEXT_UNITS))}.")
    if value.get("loop") is not None and not isinstance(value["loop"], bool):
        raise InvalidDocument(f"{where} `loop` must be true or false.")


def _check_animation(page: dict, index: int) -> None:
    """A page `transition` and the `animation` of its objects."""
    transition = page.get("transition")
    if transition is not None:
        where = f"Page {index + 1} `transition`"
        _check_motion(transition, where, durations=TRANSITION_DURATION_MS, transition=True)
    for position, item in enumerate(page["objects"]):
        animation = item.get("animation")
        if animation is None:
            continue
        where = f"Page {index + 1} object {position + 1} `animation`"
        if not isinstance(animation, dict):
            raise InvalidDocument(f"{where} must be an object.")
        for slot in ANIMATION_SLOTS:
            if animation.get(slot) is not None:
                entry = f"{where}.{slot}"
                _check_motion(animation[slot], entry, durations=ANIMATION_DURATION_MS, transition=False)


def _check_audio_src(src: object, where: str) -> None:
    """A track's `src` is a same-origin `/media/...` path or an `https://` address.

    A client-local reference (`idb://`, `blob:`) is left to the document walk, which answers
    `inline_asset_not_allowed` for it exactly as it does for an image.
    """
    if not isinstance(src, str) or not src or len(src) > MAX_AUDIO_SRC_LENGTH:
        raise InvalidDocument(f"{where} `src` must be a link of at most {MAX_AUDIO_SRC_LENGTH} characters.")
    if _LOCAL_REFERENCE.fullmatch(src):
        return
    if not (src.startswith("https://") or (src.startswith("/") and not src.startswith("//"))):
        raise InvalidDocument(f"{where} `src` must be an https:// address or a path on this site.")


def _check_audio_track(track: object, index: int, seen: set[str]) -> None:
    where = f"Audio track {index + 1}"
    if not isinstance(track, dict):
        raise InvalidDocument(f"{where} must be an object.")
    track_id = track.get("id")
    if not isinstance(track_id, str) or not 1 <= len(track_id) <= MAX_AUDIO_ID_LENGTH or track_id in seen:
        raise InvalidDocument(
            f"{where} needs a unique string `id` of at most {MAX_AUDIO_ID_LENGTH} characters."
        )
    seen.add(track_id)
    if track.get("kind") not in AUDIO_KINDS:
        raise InvalidDocument(f"{where} `kind` is not one of {', '.join(sorted(AUDIO_KINDS))}.")
    name = track.get("name")
    if name is not None and (not isinstance(name, str) or len(name) > MAX_AUDIO_NAME_LENGTH):
        raise InvalidDocument(f"{where} `name` must be text of at most {MAX_AUDIO_NAME_LENGTH} characters.")
    _check_audio_src(track.get("src"), where)
    asset_id = track.get("assetId")
    if asset_id is not None and (not isinstance(asset_id, str) or len(asset_id) > MAX_AUDIO_ID_LENGTH):
        raise InvalidDocument(
            f"{where} `assetId` must be a string of at most {MAX_AUDIO_ID_LENGTH} characters."
        )
    scope = track.get("scope")
    if not isinstance(scope, dict) or scope.get("type") not in AUDIO_SCOPES:
        raise InvalidDocument(f"{where} `scope` must be {{type: 'design'}} or {{type: 'page', pageId}}.")
    if scope["type"] == "page":
        page_id = scope.get("pageId")
        if not isinstance(page_id, str) or not 1 <= len(page_id) <= MAX_AUDIO_ID_LENGTH:
            raise InvalidDocument(f"{where} `scope.pageId` must be a page id.")
    for key, (low, high) in AUDIO_MS_RANGES.items():
        if track.get(key) is not None:
            _check_number(track[key], low, high, where, key)
    if track.get("volume") is not None:
        _check_number(track["volume"], 0, 1, where, "volume")
    for key in AUDIO_FLAGS:
        if track.get(key) is not None and not isinstance(track[key], bool):
            raise InvalidDocument(f"{where} `{key}` must be true or false.")
    start, end = track.get("trimStartMs"), track.get("trimEndMs")
    if start is not None and end is not None and end < start:
        raise InvalidDocument(f"{where} `trimEndMs` cannot be before `trimStartMs`.")


def _check_audio_tracks(doc: dict) -> None:
    """`audioTracks`: at most 32 tracks, each inside its bounds."""
    tracks = doc.get("audioTracks")
    if tracks is None:
        return
    if not isinstance(tracks, list) or len(tracks) > MAX_AUDIO_TRACKS:
        raise InvalidDocument(f"`audioTracks` must be a list of at most {MAX_AUDIO_TRACKS} tracks.")
    seen: set[str] = set()
    for index, track in enumerate(tracks):
        _check_audio_track(track, index, seen)


def _check_structure(doc: object) -> DocumentInfo:
    if not isinstance(doc, dict):
        raise InvalidDocument("The document must be a JSON object.")
    version = doc.get("schemaVersion")
    if not _is_int(version) or version < 1:
        raise InvalidDocument("`schemaVersion` must be an integer of at least 1.")
    if version > SUPPORTED_SCHEMA_VERSION:
        raise InvalidDocument(f"Schema version {version} is newer than this server supports.")
    width, height = _check_dimension(doc, "width"), _check_dimension(doc, "height")

    pages = doc.get("pages")
    if not isinstance(pages, list) or not 1 <= len(pages) <= MAX_PAGES:
        raise InvalidDocument(f"`pages` must be a list of 1 to {MAX_PAGES} pages.")
    seen_page_ids: set[str] = set()
    for index, page in enumerate(pages):
        if not isinstance(page, dict):
            raise InvalidDocument(f"Page {index + 1} must be an object.")
        if not isinstance(page.get("id"), str) or not page["id"]:
            raise InvalidDocument(f"Page {index + 1} needs a string `id`.")
        # Pages are looked up by id (first match wins), so a repeated id would make
        # page references — including audio scope.pageId — ambiguous. Tracked like the
        # unique audio track ids in _check_audio_track.
        if page["id"] in seen_page_ids:
            raise InvalidDocument(f"Page {index + 1} `id` must be unique.")
        seen_page_ids.add(page["id"])
        for key in ("width", "height"):
            # A page may carry its own size (pages of one design can differ); absent means the document's.
            if key in page and (not _is_int(page[key]) or not 1 <= page[key] <= MAX_DIMENSION):
                raise InvalidDocument(
                    f"Page {index + 1} `{key}` must be an integer between 1 and {MAX_DIMENSION}."
                )
        objects = page.get("objects")
        if not isinstance(objects, list) or len(objects) > MAX_OBJECTS_PER_PAGE:
            raise InvalidDocument(
                f"Page {index + 1} `objects` must be a list of at most {MAX_OBJECTS_PER_PAGE}."
            )
        if not all(isinstance(item, dict) for item in objects):
            raise InvalidDocument(f"Every object on page {index + 1} must be a JSON object.")
        _check_presentation(page, index)
        _check_animation(page, index)

    _check_audio_tracks(doc)

    meta = doc.get("meta")
    if meta is not None and not isinstance(meta, dict):
        raise InvalidDocument("`meta` must be an object.")
    preset = (meta or {}).get("presetId")
    preset = preset if isinstance(preset, str) and len(preset) <= MAX_PRESET_LENGTH else ""
    return DocumentInfo(width=width, height=height, page_count=len(pages), preset=preset)


def _check_text(text: str) -> None:
    if "\x00" in text:
        raise InvalidDocument("The document contains a NUL character.")
    if not text.isascii():
        try:
            text.encode("utf-8")
        except UnicodeEncodeError as exc:
            raise InvalidDocument("The document contains invalid Unicode text.") from exc
    head = text[:32].lstrip().lower()
    if head.startswith(("blob:", "idb://")) and _LOCAL_REFERENCE.fullmatch(text):
        raise InlineAssetNotAllowed()
    if len(text) > MAX_DATA_URL_CHARS and (head.startswith("data:") or ";base64," in text):
        raise InlineAssetNotAllowed()


def _walk(root: object) -> None:
    """Iterative depth-limited traversal: node budget, text checks on every key and value."""
    stack: list[tuple[object, int]] = [(root, 0)]
    nodes = 0
    while stack:
        value, depth = stack.pop()
        nodes += 1
        if nodes > MAX_NODES:
            raise InvalidDocument("The document is too complex.")
        if isinstance(value, str):
            _check_text(value)
        elif isinstance(value, float):
            if not math.isfinite(value):  # `1e999` parses to infinity; the database cannot store it
                raise InvalidDocument("The document contains a number that is not finite.")
        elif isinstance(value, dict | list):
            if depth >= MAX_DEPTH:
                raise InvalidDocument(f"The document is nested deeper than {MAX_DEPTH} levels.")
            if isinstance(value, dict):
                for key, child in value.items():
                    _check_text(key)
                    stack.append((child, depth + 1))
            else:
                stack.extend((child, depth + 1) for child in value)


def validate_document(doc: object, *, max_bytes: int) -> None:
    """Raise an API error (400 `invalid_document` / `inline_asset_not_allowed`, 413 `document_too_large`)."""
    _check_structure(doc)
    _walk(doc)
    encoded = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > max_bytes:
        raise DocumentTooLarge(f"The design document is larger than {max_bytes / (1024 * 1024):g} MB.")


def describe_document(doc: object) -> DocumentInfo:
    """Size, page count and preset derived from an already-validated document."""
    return _check_structure(doc)
