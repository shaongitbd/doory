import re
import unicodedata

DEFAULT_STEM = "design"
MAX_STEM_LENGTH = 80
_DISALLOWED = re.compile(r"[^\w\- .()]+", re.UNICODE)
_WHITESPACE = re.compile(r"\s+")
_SPACES = re.compile(r"[\s._]{2,}")


def pdf_filename(title: str | None) -> str:
    return export_filename(title, "pdf")


def export_filename(title: str | None, extension: str) -> str:
    """Download name from a user supplied title: letters, digits, spaces, dashes, dots and brackets only."""
    text = unicodedata.normalize("NFC", title or "")
    text = _WHITESPACE.sub(" ", text)
    text = "".join(ch for ch in text if unicodedata.category(ch)[0] != "C")
    text = _DISALLOWED.sub("", text)
    text = _SPACES.sub(" ", text).strip(" .-_")
    text = text[:MAX_STEM_LENGTH].strip(" .-_")
    return f"{text or DEFAULT_STEM}.{extension}"
