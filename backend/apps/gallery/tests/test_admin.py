import json
from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image

from apps.gallery.models import Template

from .factories import make_category, make_document, make_template

pytestmark = pytest.mark.django_db


def upload_json(payload, name="doc.json"):
    return SimpleUploadedFile(name, json.dumps(payload).encode(), content_type="application/json")


def png_upload(size=(900, 900)):
    buffer = BytesIO()
    Image.new("RGB", size, (10, 120, 200)).save(buffer, "PNG")
    return SimpleUploadedFile("thumb.png", buffer.getvalue(), content_type="image/png")


def form_data(**overrides):
    data = {
        "title": "Autumn Flyer",
        "slug": "autumn-flyer",
        "description": "",
        "category": "",
        "tags": "Autumn, Leaves",
        "preset": "",
        "is_published": "on",
    }
    data.update(overrides)
    return data


def test_changelists_render(staff_client):
    make_template("One", category=make_category("Cat"))
    for name in ("template", "templatecategory"):
        assert staff_client.get(reverse(f"admin:gallery_{name}_changelist")).status_code == 200


def test_staff_creates_a_template_from_a_json_upload(staff_client):
    category = make_category("Flyers")
    response = staff_client.post(
        reverse("admin:gallery_template_add"),
        form_data(category=str(category.id), document_file=upload_json(make_document(595, 842, pages=2))),
    )

    assert response.status_code == 302, response.context["adminform"].form.errors if response.context else ""
    template = Template.objects.get(slug="autumn-flyer")
    assert (template.width, template.height, template.page_count) == (595, 842, 2)
    assert template.tags == ["autumn", "leaves"]
    assert template.category == category
    assert template.created_by.email == "staff@example.com"


def test_add_requires_a_document(staff_client):
    response = staff_client.post(reverse("admin:gallery_template_add"), form_data())
    assert response.status_code == 200
    assert "document_file" in response.context["adminform"].form.errors


@pytest.mark.parametrize(
    "payload",
    [
        {"schemaVersion": 1, "width": 10, "height": 10, "pages": []},
        ["x"],
        {"pages": [{"id": "a", "objects": []}]},
    ],
)
def test_add_rejects_invalid_documents(staff_client, payload):
    response = staff_client.post(
        reverse("admin:gallery_template_add"), form_data(document_file=upload_json(payload))
    )
    assert response.status_code == 200
    assert "document_file" in response.context["adminform"].form.errors
    assert not Template.objects.exists()


def test_add_rejects_non_json_uploads(staff_client):
    junk = SimpleUploadedFile("doc.json", b"\xff\xfe not json", content_type="application/json")
    response = staff_client.post(reverse("admin:gallery_template_add"), form_data(document_file=junk))
    assert response.status_code == 200
    assert "document_file" in response.context["adminform"].form.errors


def test_thumbnail_upload_is_reencoded_as_webp(staff_client):
    staff_client.post(
        reverse("admin:gallery_template_add"),
        form_data(document_file=upload_json(make_document()), thumbnail=png_upload((2000, 1000))),
    )
    template = Template.objects.get()
    with template.thumbnail.open("rb") as handle:
        image = Image.open(handle)
        assert image.format == "WEBP" and image.size[0] == 720


def test_thumbnail_that_is_not_an_image_is_rejected(staff_client):
    fake = SimpleUploadedFile("thumb.png", b"<svg onload=alert(1)>", content_type="image/png")
    response = staff_client.post(
        reverse("admin:gallery_template_add"),
        form_data(document_file=upload_json(make_document()), thumbnail=fake),
    )
    assert response.status_code == 200 and not Template.objects.exists()


def test_replacing_a_thumbnail_removes_the_old_file_once_saved(
    staff_client, django_capture_on_commit_callbacks
):
    staff_client.post(
        reverse("admin:gallery_template_add"),
        form_data(document_file=upload_json(make_document()), thumbnail=png_upload()),
    )
    template = Template.objects.get()
    old_name, storage = template.thumbnail.name, template.thumbnail.storage
    assert storage.exists(old_name)

    with django_capture_on_commit_callbacks() as callbacks:
        staff_client.post(
            reverse("admin:gallery_template_change", args=[template.pk]),
            form_data(thumbnail=png_upload((500, 500))),
        )
    template.refresh_from_db()
    assert template.thumbnail.name != old_name
    # The old file stays until the change is committed, so a failed save cannot leave the template without one.
    assert storage.exists(old_name)

    for callback in callbacks:
        callback()
    assert not storage.exists(old_name) and storage.exists(template.thumbnail.name)


def test_deleting_a_template_deletes_its_thumbnail(staff_client):
    staff_client.post(
        reverse("admin:gallery_template_add"),
        form_data(document_file=upload_json(make_document()), thumbnail=png_upload()),
    )
    template = Template.objects.get()
    name, storage = template.thumbnail.name, template.thumbnail.storage
    template.delete()
    assert not storage.exists(name)


def test_changing_the_document_updates_derived_fields(staff_client):
    template = make_template("Wide", width=1920, height=1080)

    staff_client.post(
        reverse("admin:gallery_template_change", args=[template.pk]),
        form_data(title="Wide", slug="wide", document_file=upload_json(make_document(500, 700, pages=4))),
    )

    template.refresh_from_db()
    assert (template.width, template.height, template.page_count) == (500, 700, 4)


def test_change_page_shows_the_document_read_only(staff_client):
    template = make_template("Wide", document=make_document(321, 123))
    response = staff_client.get(reverse("admin:gallery_template_change", args=[template.pk]))
    html = response.content.decode()
    assert response.status_code == 200
    assert "&quot;width&quot;: 321" in html
    assert 'name="document"' not in html


def test_bulk_publish_unpublish_feature_actions(staff_client):
    a = make_template("A", is_published=False)
    b = make_template("B", is_published=False)
    url = reverse("admin:gallery_template_changelist")

    staff_client.post(url, {"action": "publish", "_selected_action": [a.pk, b.pk]})
    assert Template.objects.filter(is_published=True).count() == 2
    staff_client.post(url, {"action": "unpublish", "_selected_action": [a.pk]})
    assert Template.objects.get(pk=a.pk).is_published is False
    staff_client.post(url, {"action": "feature", "_selected_action": [a.pk]})
    assert Template.objects.get(pk=a.pk).is_featured is True
    staff_client.post(url, {"action": "unfeature", "_selected_action": [a.pk]})
    assert Template.objects.get(pk=a.pk).is_featured is False


def test_duplicate_action_creates_unpublished_independent_copies(staff_client):
    original = make_template("Pitch", use_count=9, is_featured=True, tags=["deck"])
    staff_client.post(
        reverse("admin:gallery_template_changelist"),
        {"action": "duplicate", "_selected_action": [original.pk]},
    )
    staff_client.post(
        reverse("admin:gallery_template_changelist"),
        {"action": "duplicate", "_selected_action": [original.pk]},
    )

    copies = Template.objects.exclude(pk=original.pk).order_by("slug")
    assert [c.slug for c in copies] == ["copy-of-pitch", "copy-of-pitch-2"]
    copy_ = copies[0]
    assert (copy_.title, copy_.is_published, copy_.is_featured, copy_.use_count) == (
        "Copy of Pitch",
        False,
        False,
        0,
    )
    assert copy_.document == original.document and copy_.tags == ["deck"]


def test_validate_action_reports_each_template(staff_client):
    good = make_template("Good")
    bad = make_template("Bad")
    Template.objects.filter(pk=bad.pk).update(document={"schemaVersion": 1})

    response = staff_client.post(
        reverse("admin:gallery_template_changelist"),
        {"action": "validate_documents", "_selected_action": [good.pk, bad.pk]},
        follow=True,
    )
    messages = [str(m) for m in response.context["messages"]]
    assert any(m.startswith("Good: valid") for m in messages)
    assert any(m.startswith("Bad:") and "valid" not in m.split(":", 1)[1][:6] for m in messages)


def test_detail_validate_and_duplicate_actions(staff_client):
    template = make_template("Solo")
    base = reverse("admin:gallery_template_change", args=[template.pk])

    response = staff_client.get(
        reverse("admin:gallery_template_validate_document", args=[template.pk]), follow=True
    )
    assert response.status_code == 200
    assert any("valid" in str(m) for m in response.context["messages"])

    staff_client.get(reverse("admin:gallery_template_duplicate_template_detail", args=[template.pk]))
    assert Template.objects.count() == 2
    assert staff_client.get(base).status_code == 200


def test_non_staff_cannot_reach_the_admin(auth_client, user):
    from django.test import Client

    web = Client()
    web.force_login(user)
    assert web.get(reverse("admin:gallery_template_changelist")).status_code == 302


def test_category_admin_orders_by_sort_order(staff_client):
    make_category("B", sort_order=2)
    make_category("A", sort_order=1)
    response = staff_client.get(reverse("admin:gallery_templatecategory_changelist"))
    html = response.content.decode()
    assert html.index(">A<") < html.index(">B<")
