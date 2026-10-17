"""`apply_edit` on designs nobody has open (saved like a REST save)."""

from __future__ import annotations

import pytest
from django.http import Http404
from django.utils import timezone
from pydantic import TypeAdapter

from apps.designs.doc.ops import EditError, ImageSource, Operation
from apps.designs.edits import apply_edit, current_document
from apps.designs.exceptions import DesignTrashed, RevisionConflict
from apps.designs.models import Design, DesignVersion

from .helpers import make_design, make_doc, text_object

OPS = TypeAdapter(list[Operation])


class NoPictures:
    def image(self, *, asset_id, element_id) -> ImageSource:
        raise LookupError("no pictures here")

    def font_category(self, family):
        return None


def edit(design, owner, *ops, **kwargs):
    return apply_edit(design.pk, owner, OPS.validate_python(list(ops)), resolver=NoPictures(), **kwargs)


@pytest.fixture
def design(user):
    return make_design(user, document=make_doc(objects=[text_object("Hello")]))


def test_an_edit_is_saved_and_bumps_the_revision(design, user):
    result = edit(design, user, {"op": "add_shape", "shape": "rect", "id": "box"})
    assert result.live is False and result.revision == 2
    saved = Design.objects.get(pk=design.pk)
    assert saved.revision == 2
    assert [obj["id"] for obj in saved.document["pages"][0]["objects"]][-1] == "box"


def test_the_state_before_an_edit_is_kept_once_per_burst(design, user):
    edit(design, user, {"op": "set_notes", "notes": "one"}, label="Before Claude's edit")
    edit(design, user, {"op": "set_notes", "notes": "two"})
    versions = list(DesignVersion.objects.filter(design=design))
    assert [version.label for version in versions] == ["Before Claude's edit"]
    assert "notes" not in versions[0].document["pages"][0]
    DesignVersion.objects.update(created_at=timezone.now() - timezone.timedelta(minutes=5))
    edit(design, user, {"op": "set_notes", "notes": "three"})
    assert DesignVersion.objects.filter(design=design).count() == 2


def test_a_stale_base_revision_is_refused(design, user):
    with pytest.raises(RevisionConflict):
        edit(design, user, {"op": "set_notes", "notes": "x"}, base_revision=5)
    edit(design, user, {"op": "set_notes", "notes": "x"}, base_revision=1)


def test_a_failing_operation_changes_nothing(design, user):
    with pytest.raises(EditError):
        edit(
            design, user, {"op": "set_notes", "notes": "x"}, {"op": "delete_objects", "object_ids": ["nope"]}
        )
    saved = Design.objects.get(pk=design.pk)
    assert saved.revision == 1 and "notes" not in saved.document["pages"][0]
    assert not DesignVersion.objects.exists()


def test_only_the_owner_can_edit_and_not_in_the_trash(design, user, other):
    with pytest.raises(Http404):
        edit(design, other, {"op": "set_notes", "notes": "x"})
    Design.objects.filter(pk=design.pk).update(trashed_at=timezone.now())
    with pytest.raises(DesignTrashed):
        edit(design, user, {"op": "set_notes", "notes": "x"})


def test_the_current_document_of_a_design_nobody_has_open_is_the_saved_one(design, settings):
    settings.REALTIME_ENABLED = True
    assert current_document(design) == design.document
    edit(design, design.owner, {"op": "set_notes", "notes": "saved"})
    assert current_document(Design.objects.get(pk=design.pk))["pages"][0]["notes"] == "saved"
