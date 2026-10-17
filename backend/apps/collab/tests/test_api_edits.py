"""Edits made through `apps.designs.edits` (the MCP server) while the design is open in the editor."""

from __future__ import annotations

import pytest
from pydantic import TypeAdapter

from apps.collab import store
from apps.designs.doc.ops import ImageSource, Operation
from apps.designs.edits import apply_edit, current_document, read_current
from apps.designs.models import Design, DesignVersion

from .peer import settle
from .test_sync import first_object

pytestmark = pytest.mark.django_db
OPS = TypeAdapter(list[Operation])


class NoPictures:
    def image(self, *, asset_id, element_id) -> ImageSource:
        raise LookupError("no pictures here")

    def font_category(self, family):
        return None


def edit(env, *ops):
    return env.db(
        lambda: apply_edit(env.design.pk, env.owner, OPS.validate_python(list(ops)), resolver=NoPictures())
    )


def first_id(env) -> str:
    return env.design.document["pages"][0]["objects"][0]["id"]


async def test_an_api_edit_reaches_open_editors_as_a_normal_update(env):
    peer = await env.open(env.owner)
    result = await edit(env, {"op": "update_object", "object_id": first_id(env), "opacity": 0.25})
    assert result.live is True and result.revision is None
    await peer.until(lambda: peer.document["pages"][0]["objects"][0]["opacity"] == 0.25)
    assert peer.texts_of("replaced") == []  # nobody's undo history or unsaved work is thrown away


async def test_concurrent_editor_changes_survive_an_api_edit(env):
    peer = await env.open(env.owner)
    await peer.edit(lambda doc: first_object(peer).__setitem__("top", 77))
    await peer.barrier()
    second = env.design.document["pages"][0]["objects"][1]["id"]
    await edit(env, {"op": "update_object", "object_id": second, "props": {"flipX": True}})
    await settle(peer)
    objects = peer.document["pages"][0]["objects"]
    assert objects[0]["top"] == 77 and objects[1]["flipX"] is True


async def test_deletions_reach_open_editors(env):
    peer = await env.open(env.owner)
    doomed = first_id(env)
    await edit(env, {"op": "delete_objects", "object_ids": [doomed]}, {"op": "delete_page", "page": 2})
    await peer.until(lambda: len(peer.document["pages"]) == 1)
    assert doomed not in [obj["id"] for obj in peer.document["pages"][0]["objects"]]


async def test_new_objects_and_pages_arrive_in_order(env):
    peer = await env.open(env.owner)
    await edit(
        env,
        {"op": "add_text", "text": "Hello from the API", "id": "api-text"},
        {"op": "add_page", "after": 1, "id": "api-page"},
        {"op": "arrange_object", "object_id": "api-text", "to": "back"},
    )
    await peer.until(lambda: len(peer.document["pages"]) == 3)
    document = peer.document
    assert document["pages"][0]["objects"][0]["id"] == "api-text"
    assert document["pages"][1]["id"] == "api-page"


async def test_the_room_saves_the_api_edit_to_the_design(env, settings):
    settings.REALTIME_FLUSH_INTERVAL_SECONDS = 0.05
    peer = await env.open(env.owner)
    await edit(env, {"op": "set_notes", "notes": "Saved by the room"})

    def saved_notes():
        return Design.objects.get(pk=env.design.pk).document["pages"][0].get("notes")

    await peer.until(lambda: peer.texts_of("saved"), timeout=5)
    assert await env.db(saved_notes) == "Saved by the room"


async def test_the_starting_state_is_kept_as_a_version(env):
    await env.open(env.owner)
    await edit(env, {"op": "delete_objects", "object_ids": [first_id(env)]})
    versions = await env.db(lambda: list(DesignVersion.objects.filter(design=env.design)))
    assert len(versions) == 1 and versions[0].label.startswith("Before an edit")
    assert len(versions[0].document["pages"][0]["objects"]) == 3


async def test_an_edit_that_changes_nothing_writes_nothing(env):
    await env.open(env.owner)
    before = await env.db(store.current_version, env.design.pk)
    await edit(env, {"op": "update_object", "object_id": first_id(env), "name": "Layer 0"})
    assert await env.db(store.current_version, env.design.pk) == before


async def test_an_edit_saves_itself_when_the_room_closed_meanwhile(env, monkeypatch):
    peer = await env.open(env.owner)
    answers = iter([True, False])  # live when the edit starts, gone when it is stored
    monkeypatch.setattr(store, "room_is_live", lambda design_id: next(answers))
    await edit(env, {"op": "set_notes", "notes": "Nobody else will save this"})
    design = await env.db(lambda: Design.objects.get(pk=env.design.pk))
    assert design.document["pages"][0]["notes"] == "Nobody else will save this"
    assert design.revision == 2
    await peer.disconnect()


async def test_reading_while_live_sees_the_live_state(env):
    peer = await env.open(env.owner)
    await peer.edit(lambda doc: first_object(peer).__setitem__("top", 123))
    await peer.barrier()

    def read():
        return read_current(Design.objects.get(pk=env.design.pk))

    document, live = await env.db(read)
    assert live is True and document["pages"][0]["objects"][0]["top"] == 123
    current = await env.db(lambda: current_document(Design.objects.get(pk=env.design.pk)))
    assert current == document
    stored = await env.db(lambda: Design.objects.get(pk=env.design.pk).document)
    assert stored["pages"][0]["objects"][0]["top"] != 123  # not flushed yet: the database copy lags


async def test_a_base_revision_is_not_checked_against_the_lagging_database_while_live(env):
    await env.open(env.owner)
    result = await env.db(
        lambda: apply_edit(
            env.design.pk,
            env.owner,
            OPS.validate_python([{"op": "set_notes", "notes": "x"}]),
            resolver=NoPictures(),
            base_revision=env.design.revision - 1,  # would be a conflict on a saved design
        )
    )
    assert result.live is True
