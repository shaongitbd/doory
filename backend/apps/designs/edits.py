"""The one way programmatic clients (the MCP server) change a design's content.

`apply_edit` runs a batch of `doc.ops` operations against the design's current content and saves the result:

* nobody has the design open: like a REST save, guarded by the revision;
* it is open in the editor (a live room): as a Y update on top of the live state, exactly as if one more
  collaborator had made the change. The room relays it to everyone and saves it with its next flush, so open
  editors keep their undo history and unsaved work (a REST save would replace their document instead).

Before an edit the starting state is kept as a version (at most one every two minutes), so a bad edit can be
undone with a version restore.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field

from django.conf import settings
from django.db import transaction
from django.http import Http404

from apps.collab import engine, schema, store
from apps.collab.notify import notify_design

from . import services
from .doc.kinds import object_kind
from .doc.ops import MAX_OPS, EditError, EditOutcome, Resolver, apply_ops
from .exceptions import DesignTrashed, RevisionConflict
from .models import Design
from .validators import validate_document

log = logging.getLogger("doory.designs")


@dataclass
class EditResult:
    document: dict
    results: list[dict] = field(default_factory=list)
    live: bool = False  # applied to the open editor session (saved to the design within seconds)
    revision: int | None = None  # the design's revision after the save; None while the live room saves it


def _owned(design_id: uuid.UUID, owner) -> Design:
    design = Design.objects.defer("document").filter(pk=design_id, owner=owner).first()
    if design is None:
        raise Http404
    if design.trashed_at is not None:
        raise DesignTrashed()
    return design


def _validated(outcome: EditOutcome) -> EditOutcome:
    validate_document(outcome.document, max_bytes=settings.MAX_DESIGN_DOCUMENT_BYTES)
    return outcome


def _prefetch_urls(ops: list, resolver: Resolver) -> None:
    """Resolve `url` picture sources before taking the design's row lock."""
    if len(ops) > MAX_OPS:
        raise EditError(MAX_OPS, f"At most {MAX_OPS} operations per call.")
    for index, op in enumerate(ops):
        url = getattr(op, "url", None)
        if url is not None and (getattr(op, "asset_id", None), getattr(op, "element_id", None)) == (
            None,
            None,
        ):
            try:
                resolver.image(asset_id=None, element_id=None, url=url)
            except LookupError as exc:
                raise EditError(index, str(exc)) from exc


def _prefetch_cutouts(document: dict, ops: list, resolver: Resolver) -> None:
    """Run the AI calls of `remove_background` operations before taking the design's row lock, against the
    pictures as they are now. Their calls and cut-outs are kept even when the edit fails later: the provider
    has done (and may have billed) the work, and the daily quota counts it."""
    pages = [page for page in document.get("pages") or [] if isinstance(page, dict)]
    objects = {
        obj.get("id"): obj
        for page in pages
        for obj in page.get("objects") or []
        if isinstance(obj, dict) and object_kind(obj) in ("image", "placeholder")
    }
    _refuse_changed_pictures(pages, ops)
    for index, op in enumerate(ops):
        if getattr(op, "op", None) == "remove_background" and op.object_id in objects:
            try:
                resolver.remove_background(obj=objects[op.object_id], model=op.model)
            except LookupError as exc:
                raise EditError(index, str(exc)) from exc


def _refuse_changed_pictures(pages: list[dict], ops: list) -> None:
    """Refuse, before any AI call, a `remove_background` of a picture an earlier operation of the same call
    changes, groups, deletes or removes the background of: its cut-out would be made from the picture as it
    was and then refused under the lock, after the provider has done (and billed) the work."""
    page_of = {
        obj.get("id"): page.get("id")
        for page in pages
        for obj in page.get("objects") or []
        if isinstance(obj, dict)
    }
    page_ids = [page.get("id") for page in pages]
    touched: set = set()
    deleted_pages: set = set()
    for index, op in enumerate(ops):
        kind = getattr(op, "op", None)
        if kind == "remove_background":
            if op.object_id in touched or page_of.get(op.object_id) in deleted_pages:
                raise EditError(
                    index,
                    "This picture is changed earlier in the same call: remove its background in a second "
                    "edit_design call.",
                )
            touched.add(op.object_id)
        elif kind == "delete_page":
            page = op.page
            if isinstance(page, int) and 0 <= page < len(page_ids):
                page = page_ids[page]
            deleted_pages.add(page)
        else:
            touched.update(getattr(op, "object_ids", None) or [])
            if getattr(op, "object_id", None) is not None:
                touched.add(op.object_id)


def _seal(resolver: Resolver, sealed: bool = True) -> None:
    seal = getattr(resolver, "seal", None)  # optional: resolvers that never do slow work need none
    if seal is not None:
        seal(sealed)


def apply_edit(
    design_id: uuid.UUID,
    owner,
    ops: list,
    *,
    resolver: Resolver,
    base_revision: int | None = None,
    label: str = "Before an edit through the API",
) -> EditResult:
    """Apply `ops` to the design. Raises `EditError` (bad operation), `RevisionConflict` (when `base_revision`
    is given and the design moved on), `Http404`, `DesignTrashed` or a validation error."""
    design = _owned(design_id, owner)
    if settings.REALTIME_ENABLED and store.room_is_live(design.pk):
        # The stored revision lags the live state by up to a flush, so `base_revision` is not checked here:
        # the edit merges into the session like one more collaborator's.
        _prefetch_urls(ops, resolver)
        live = _live_document(design.pk)
        if live is not None:
            _prefetch_cutouts(live[1], ops, resolver)
            _seal(resolver)
            result = _apply_live(design, owner, ops, resolver, label)
            if result is not None:
                return result
    if base_revision is not None and base_revision != design.revision:
        raise RevisionConflict(design.revision, design.updated_at)
    _prefetch_urls(ops, resolver)
    # Opened again when a live room fell through to here: the saved content is what gets edited now.
    _seal(resolver, False)
    _prefetch_cutouts(Design.objects.only("document").get(pk=design.pk).document, ops, resolver)
    _seal(resolver)
    return _apply_saved(design.pk, owner, ops, resolver, base_revision, label)


def read_current(design: Design) -> tuple[dict, bool]:
    """The design's content as editors see it now, and whether that is a live room's state (which can be up
    to a flush ahead of `design.document`)."""
    if settings.REALTIME_ENABLED and store.room_is_live(design.pk):
        live = _live_document(design.pk)
        if live is not None:
            return live[1], True
    return design.document, False


def current_document(design: Design) -> dict:
    """The design's content as editors see it now: the live room's state while the design is open in the
    editor, else the saved document."""
    return read_current(design)[0]


def _live_document(design_id: uuid.UUID):
    """The live room's Y document and its content, or None when the room has no state."""
    stored = store.load_current(design_id)
    if stored is None:
        return None
    doc = engine.open_doc(*stored).doc
    return doc, schema.read_document(doc)[0]


def _apply(document: dict, ops: list, resolver: Resolver) -> EditOutcome:
    return _validated(apply_ops(document, ops, resolver, max_pages=settings.MAX_DESIGN_PAGES))


def _apply_saved(design_id, owner, ops, resolver, base_revision, label) -> EditResult:
    with transaction.atomic():
        design = Design.objects.select_for_update().get(pk=design_id)
        if base_revision is not None and base_revision != design.revision:
            raise RevisionConflict(design.revision, design.updated_at)
        outcome = _apply(design.document, ops, resolver)
        services.record_version_before_edit(design, owner, design.document, label=label)
        saved = services.update_design(
            design.pk, owner, {"document": outcome.document, "base_revision": design.revision}
        )
    return EditResult(outcome.document, outcome.results, live=False, revision=saved.revision)


def _apply_live(design: Design, owner, ops, resolver, label) -> EditResult | None:
    """Apply the edit to the live state; None when there is no live state to apply it to after all."""
    live = _live_document(design.pk)
    if live is None:
        return None
    doc, current = live
    outcome = _apply(current, ops, resolver)
    if schema.json_equal(current, outcome.document):
        return EditResult(outcome.document, outcome.results, live=True)  # nothing changed
    before = doc.get_state()
    with doc.transaction():
        schema.write_changes(doc, current, outcome.document)
    # The state vector only counts insertions, so the delta is taken even when it looks unchanged: a
    # deletion lives in the delete set alone.
    delta = doc.get_update(before)
    services.record_version_before_edit(design, owner, current, label=label)
    version = store.append_update(design.pk, delta, owner.pk)
    # Rooms on a shared channel layer apply it at once; any other room picks it up from the store at its next
    # re-check (`Room._maybe_resync`).
    notify_design(design.pk, "collab.update", update=delta, version=version)
    if not store.room_is_live(design.pk):
        _flush(design.pk, doc, version, owner.pk)  # the room closed meanwhile: nobody else will save it
    log.info("live edit design=%s version=%s ops=%s", design.pk, version, len(ops))
    return EditResult(outcome.document, outcome.results, live=True)


def _flush(design_id: uuid.UUID, doc, version: int, editor_id) -> None:
    conversion = engine.convert(engine.full_state(doc))
    if conversion.document is not None:
        store.flush_document(design_id, conversion.document, version, editor_id)
