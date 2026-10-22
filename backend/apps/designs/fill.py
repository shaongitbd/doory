"""Filling a template by field key: `fill_design` (one design) and `bulk_fill` (one new design per row).

The values are turned into `update_object` / `replace_image` operations on every object tagged with the key
(see `doc.fields`) and applied like any other edit (`edits`), so a fill is one validated change: if any value
or operation is refused nothing is applied, and with `as_copy` no copy is left behind.
"""

from __future__ import annotations

import base64
import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any

from django.conf import settings
from django.db import transaction
from pydantic import TypeAdapter
from pydantic import ValidationError as PydanticValidationError
from rest_framework.exceptions import Throttled, ValidationError

from apps.assets.models import Asset

from . import services
from .doc import fields
from .doc.ops import EditError, Operation, Resolver
from .edits import _apply, _owned, apply_edit, read_current
from .exceptions import DesignTrashed
from .models import Design, Folder

OPERATIONS = TypeAdapter(list[Operation])
HEX_COLOR = re.compile(r"#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})")
IMAGE_KEYS = ("asset_id", "element_id", "url")
DEFAULT_NAME_PATTERN = "{title} - {n}"
_PLACEHOLDER = re.compile(r"\{([a-z][a-z0-9_]{0,39})\}")


class FillError(ValidationError):
    """Values that cannot be filled in, by key. Nothing was changed."""

    def __init__(self, problems: dict[str, str]) -> None:
        super().__init__(problems)
        self.problems = problems


@dataclass
class FillResult:
    design: Design
    filled: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    overflow: list[str] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        return {
            "design_id": str(self.design.pk),
            "title": self.design.title,
            "filled": self.filled,
            "skipped": self.skipped,
            "overflow": self.overflow,
        }


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _image_source(owner, value: Any) -> dict:
    """{asset_id | element_id | url, focal?} from a value: that dict, or a string that is a https link, an
    upload's id or an upload's name."""
    if isinstance(value, str):
        text = value.strip()
        if text.lower().startswith(("http://", "https://")):
            return {"url": text}
        try:
            return {"asset_id": str(uuid.UUID(text))}
        except ValueError:
            pass
        asset = (
            Asset.objects.filter(owner=owner, name__iexact=text)
            .filter(kind__in=Asset.PICTURE_KINDS)
            .order_by("-created_at")
            .first()
        )
        if asset is None:
            raise ValueError(f"There is no picture named {text!r} in your uploads.")
        return {"asset_id": str(asset.pk)}
    if not isinstance(value, dict):
        raise ValueError("An image value is a link, an upload's name or {asset_id | element_id | url}.")
    unknown = set(value) - {*IMAGE_KEYS, "focal"}
    if unknown:
        raise ValueError(f"Unknown image setting {sorted(unknown)[0]!r}.")
    if sum(value.get(key) is not None for key in IMAGE_KEYS) != 1:
        raise ValueError("Send exactly one of asset_id, element_id and url.")
    return {key: value[key] for key in (*IMAGE_KEYS, "focal") if value.get(key) is not None}


def _field_operations(entry: dict, value: Any, owner) -> list[dict]:
    key, field_type = entry["key"], entry["type"]
    if field_type == "text":
        if not isinstance(value, str | int | float) or isinstance(value, bool):
            raise ValueError("A text value is a string.")
        base = {"op": "update_object", "text": str(value)}
    elif field_type == "color":
        if not isinstance(value, str):
            raise ValueError("A color value is a #hex string.")
        if not HEX_COLOR.fullmatch(value.strip()):
            raise ValueError("A color value is a #hex string, e.g. #ff6600.")
        base = {"op": "update_object", "color": value.strip()}
    else:
        base = {"op": "replace_image", **_image_source(owner, value)}
    return [{**base, "object_id": object_id, "__key__": key} for object_id in entry["object_ids"]]


def _clean(ops: list[dict]) -> list[dict]:
    return [{k: v for k, v in op.items() if k != "__key__"} for op in ops]


def _edit_error(exc: EditError, ops: list[dict]) -> FillError:
    key = ops[exc.index]["__key__"] if 0 <= exc.index < len(ops) else "values"
    return FillError({key: str(exc).split(": ", 1)[-1]})


def fill_design(
    template: Design,
    owner,
    values: dict[str, Any],
    *,
    resolver: Resolver,
    as_copy: bool = True,
    name: str | None = None,
    folder: Folder | None = None,
    label: str = "Before filling template fields",
) -> FillResult:
    """Fill `template`'s fields with `values` ({key: value}); with `as_copy` (the default) into a new design,
    leaving the template as it is. Raises `FillError` (bad values, nothing applied), `DesignTrashed`,
    `Http404` or a document validation error."""
    if template.trashed_at is not None:
        raise DesignTrashed()
    document, _live = read_current(template)
    raw = _raw_operations(document, values, owner)
    if as_copy:
        return _fill_copy(template, owner, document, raw, resolver, name, folder)
    ops = _clean(raw.ops)
    design = _owned(template.pk, owner)
    try:
        result = apply_edit(design.pk, owner, OPERATIONS.validate_python(ops), resolver=resolver, label=label)
    except EditError as exc:
        raise _edit_error(exc, raw.ops) from exc
    if name:
        design = services.update_design(design.pk, owner, {"title": name})
    else:
        design = Design.objects.defer("document").get(pk=design.pk)
    return FillResult(design, raw.filled, raw.skipped, _overflow(result.document, raw.filled))


@dataclass
class _Raw:
    ops: list[dict]
    filled: list[str]
    skipped: list[str]


def _raw_operations(document: dict, values: dict[str, Any], owner) -> _Raw:
    if not isinstance(values, dict):
        raise FillError({"values": "Send an object of {field key: value}."})
    by_key = {entry["key"]: entry for entry in fields.list_fields(document) if entry["key"]}
    problems: dict[str, str] = {}
    ops: list[dict] = []
    filled: list[str] = []
    for key, value in values.items():
        entry = by_key.get(key)
        if entry is None:
            problems[str(key)] = "This design has no field with this key (see list_fields)."
            continue
        if _is_blank(value):
            continue
        try:
            ops.extend(_field_operations(entry, value, owner))
        except ValueError as exc:
            problems[key] = str(exc)
            continue
        filled.append(key)
    for op in ops:
        try:
            OPERATIONS.validate_python([{k: v for k, v in op.items() if k != "__key__"}])
        except PydanticValidationError as exc:
            # A value the operation itself refuses (e.g. text longer than a text box takes).
            problems.setdefault(op["__key__"], exc.errors()[0]["msg"])
    if problems:
        raise FillError(problems)
    return _Raw(ops, filled, [key for key in by_key if key not in filled])


def _fill_copy(template, owner, document, raw: _Raw, resolver, name, folder) -> FillResult:
    """Apply the edit to the template's content in memory, then save the result as a new design: a refused
    value leaves nothing behind."""
    try:
        outcome = _apply(document, OPERATIONS.validate_python(_clean(raw.ops)), resolver)
    except EditError as exc:
        raise _edit_error(exc, raw.ops) from exc
    with transaction.atomic():
        copy = services.create_design(
            owner,
            title=(name or f"Copy of {template.title}")[:200],
            document=outcome.document,
            folder=folder if folder is not None else template.folder,
        )
    return FillResult(copy, raw.filled, raw.skipped, _overflow(outcome.document, raw.filled))


def _overflow(document: dict, filled: list[str]) -> list[str]:
    return [
        entry["key"] for entry in fields.list_fields(document) if entry["key"] in filled and entry["overflow"]
    ]


def row_name(pattern: str, template: Design, number: int, values: dict[str, Any]) -> str:
    """`pattern` with {title} (the template's), {n} (the row number) and {key} (a text value of the row)."""
    known = {"title": template.title, "n": str(number)}

    def substitute(match: re.Match) -> str:
        word = match.group(1)
        if word in known:
            return known[word]
        value = values.get(word)
        return str(value) if isinstance(value, str | int | float) and not isinstance(value, bool) else ""

    name = _PLACEHOLDER.sub(substitute, pattern).strip()
    return (name or f"{template.title} - {number}")[:200]


def bulk_fill(
    template: Design,
    owner,
    rows: list[dict[str, Any]],
    *,
    row_numbers: list[int] | None = None,
    resolver: Resolver,
    name_pattern: str | None = None,
    folder: Folder | None = None,
    before_row: Callable[[], None] | None = None,
    after_row: Callable[[Design], dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """One new design per row, each filled like `fill_design(as_copy=True)`. A bad row reports its error and
    the others go on. `before_row` may raise to refuse a row (e.g. a rate limit); `after_row` adds to a row's
    result (e.g. an export)."""
    limit = settings.BULK_FILL_MAX_ROWS
    if len(rows) > limit:
        raise ValidationError({"rows": f"At most {limit} rows at a time."})
    if template.trashed_at is not None:
        raise DesignTrashed()
    pattern = name_pattern or DEFAULT_NAME_PATTERN
    out: list[dict[str, Any]] = []
    for i, values in enumerate(rows):
        number = row_numbers[i] if row_numbers and i < len(row_numbers) else i + 1
        try:
            if before_row is not None:
                before_row()
            result = fill_design(
                template,
                owner,
                values,
                resolver=resolver,
                name=row_name(pattern, template, number, values if isinstance(values, dict) else {}),
                folder=folder,
            )
        except Exception as exc:  # each row reports its own failure
            out.append({"row": number, "ok": False, "error": _message(exc)})
            continue
        row = {"row": number, "ok": True, **result.summary()}
        if after_row is not None:
            try:
                row.update(after_row(result.design))
            except Exception as exc:
                row["export_error"] = _message(exc)
        out.append(row)
    return out


def charge(rate_throttle, user) -> None:
    """Count one use of a per-user REST throttle (e.g. `UploadRateThrottle()`) for `user`; raises Throttled
    when its budget is spent, so work done many times in one request still pays for each time."""
    if not rate_throttle.allow_request(SimpleNamespace(user=user), None):
        raise Throttled(wait=rate_throttle.wait())


def image_exporter(export: str | None, user) -> Callable[[Design], dict[str, Any]] | None:
    """An `after_row` that adds the first page as a png/jpg (`apps.exports.services.export_image`). Each
    render counts against the `export` rate, like the export endpoint and the export_design tool."""
    if export is None:
        return None
    try:
        from apps.exports.delivery import store_image
        from apps.exports.services import export_image
        from apps.exports.throttling import ExportRateThrottle
    except ImportError as exc:
        raise ValidationError({"export": "Image export is not available on this server."}) from exc

    def run(design: Design) -> dict[str, Any]:
        charge(ExportRateThrottle(), user)
        image = export_image(
            Design.objects.get(pk=design.pk), page=1, format=export, quality=90, scale=1, transparent=False
        )
        inline_limit = settings.MCP_EXPORT_INLINE_MAX_BYTES
        if len(image.data) > inline_limit:
            return {
                "image": {
                    "mime": image.mime,
                    "url": store_image(image.data, image.mime),
                    "bytes": len(image.data),
                    "expires_in_seconds": settings.MCP_EXPORT_URL_TTL_SECONDS,
                }
            }
        return {
            "image": {
                "mime": image.mime,
                "data_base64": base64.b64encode(image.data).decode(),
                "bytes": len(image.data),
            }
        }

    return run


def _message(exc: Exception) -> str:
    if isinstance(exc, FillError):
        return "; ".join(f"{key}: {message}" for key, message in exc.problems.items())
    detail = getattr(exc, "detail", None)
    if detail is not None:
        if isinstance(detail, dict):
            return "; ".join(f"{key}: {value}" for key, value in detail.items())
        return str(detail)
    if isinstance(exc, ValueError | LookupError):
        return str(exc)
    if exc.__class__.__name__ in ("Http404", "ToolError"):
        return str(exc) or "Not found."
    return "Something went wrong with this row."
