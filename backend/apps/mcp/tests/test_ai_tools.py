"""The AI tools (list_ai_models, remove_asset_background, remove_background on imports and in edit_design),
run end to end against a local stand-in for a provider: only its HTTP server is fake."""

from __future__ import annotations

import pytest
from django.core.cache import cache
from mcp.server.mcpserver.exceptions import ToolError

from apps.accounts.models import User
from apps.ai import catalog
from apps.ai.models import AICall, Provider
from apps.ai.tests.fakes import FakeServer
from apps.ai.throttling import AIRateThrottle
from apps.assets import remote, stock
from apps.assets.models import Asset
from apps.assets.services import create_asset
from apps.assets.tests.helpers import image_bytes
from apps.designs import edits
from apps.designs.models import Design
from apps.designs.tests.helpers import make_design, make_doc
from apps.gallery.models import Template
from apps.mcp.tools import ai, assets, designs

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _ai_on(settings, monkeypatch):
    settings.AI_PROVIDERS_ENABLED = True
    monkeypatch.setattr(catalog, "device_available", lambda task: False)
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def fake():
    server = FakeServer().start()
    yield server
    server.stop()


def make_provider(fake, *, name="Server X", sends_offsite=False, **fields) -> Provider:
    fields.setdefault("style_config", {"path": "/api/remove"})
    fields.setdefault("tasks", ["background-removal"])
    return Provider.objects.create(
        name=name, base_url=fake.url, style="multipart", sends_offsite=sends_offsite, **fields
    )


@pytest.fixture
def provider(fake):
    return make_provider(fake)


def picture(owner, name="Hero", size=(80, 40)) -> Asset:
    return create_asset(owner, image_bytes(size=size), name=name)


def image_obj(asset: Asset, **extra) -> dict:
    return {
        "id": "hero",
        "type": "image",
        "src": asset.file.url,
        "assetId": str(asset.pk),
        "left": 50,
        "top": 60,
        "width": 80,
        "height": 40,
        "scaleX": 2,
        "scaleY": 2,
        **extra,
    }


def remove(design, object_id="hero", **op):
    return designs.edit_design(str(design.pk), [{"op": "remove_background", "object_id": object_id, **op}])


def first_object(design) -> dict:
    return Design.objects.get(pk=design.pk).document["pages"][0]["objects"][0]


# list_ai_models


def test_list_ai_models_shows_public_data_and_the_server_default(as_caller, provider):
    listed = ai.list_ai_models()
    assert listed["server_default"].startswith(str(provider.pk))
    (model,) = listed["models"]
    assert model["sends_offsite"] is False
    assert not {"base_url", "url", "secret"} & set(model)


def test_list_ai_models_unknown_task_is_refused(as_caller):
    with pytest.raises(ToolError, match="Unknown task 'invalid-task'"):
        ai.list_ai_models(task="invalid-task")


def test_list_ai_models_requires_assets_write_scope(as_caller):
    as_caller.token.scopes = ["designs:read", "designs:write"]
    with pytest.raises(ToolError, match="`assets:write` scope"):
        ai.list_ai_models()


# Choosing the model


def test_the_configured_default_is_used(as_caller, user, fake, settings):
    make_provider(fake, name="First")
    second = make_provider(fake, name="Second")
    wanted = ai.list_ai_models()["models"][1]["id"]
    assert wanted.startswith(str(second.pk))
    settings.AI_TASK_DEFAULTS = {"background-removal": wanted}
    result = ai.remove_asset_background(str(picture(user).pk))
    assert result["model"]["id"] == wanted


def test_an_offsite_model_is_never_picked_silently(as_caller, user, fake):
    make_provider(fake, sends_offsite=True)
    hero = picture(user)
    with pytest.raises(ToolError, match="sends_offsite"):
        ai.remove_asset_background(str(hero.pk))
    model = ai.list_ai_models()["models"][0]["id"]
    result = ai.remove_asset_background(str(hero.pk), model=model)
    assert result["model"] == {"id": model, "label": result["model"]["label"], "sends_offsite": True}


# remove_asset_background


def test_remove_asset_background_runs_the_real_path(as_caller, user, provider, fake):
    hero = picture(user)
    result = ai.remove_asset_background(str(hero.pk))
    cutout = Asset.objects.get(pk=result["asset_id"], owner=user)
    assert cutout.pk != hero.pk and (cutout.width, cutout.height) == (80, 40)
    assert len(fake.requests) == 1
    assert AICall.objects.filter(user=user, status=AICall.Status.OK).count() == 1


def test_remove_asset_background_refuses_others_and_bad_ids(as_caller, user, provider, fake):
    others = picture(User.objects.create_user(email="eve@example.com", password="x-very-long-pass-1"))
    for asset_id in (str(others.pk), "not-a-uuid", "00000000-0000-0000-0000-000000000000"):
        with pytest.raises(ToolError, match="There is no picture"):
            ai.remove_asset_background(asset_id)
    assert fake.requests == []


def test_the_daily_quota_is_checked_before_any_work(as_caller, user, fake):
    make_provider(fake, daily_quota=1)
    hero = picture(user)
    ai.remove_asset_background(str(hero.pk))
    with pytest.raises(ToolError, match="today's calls"):
        ai.remove_asset_background(str(picture(user, "Other").pk))
    assert len(fake.requests) == 1


# upscale_asset


def test_upscale_asset_runs_the_real_path(as_caller, user, fake):
    upscaler = make_provider(fake, name="Upscaler", tasks=["upscale"], style_config={"path": "/upscale"})
    hero = picture(user)
    listed = ai.list_ai_models(task="upscale")
    assert listed["server_default"] == f"{upscaler.pk}:"
    result = ai.upscale_asset(str(hero.pk), scale=4)
    bigger = Asset.objects.get(pk=result["asset_id"], owner=user)
    assert (bigger.width, bigger.height) == (320, 160) and bigger.name == "Hero (upscaled)"
    assert fake.requests[-1].form["scale"] == (None, b"4")
    assert result["model"]["id"] == f"{upscaler.pk}:"


def test_upscale_asset_needs_a_server_model_for_upscaling(as_caller, user, provider, fake):
    with pytest.raises(ToolError, match="No AI server"):
        ai.upscale_asset(str(picture(user).pk))
    assert fake.requests == []


# Imports with remove_background


def test_import_stock_photo_with_remove_background(as_caller, user, provider, monkeypatch):
    raw = picture(user, "Stock")
    monkeypatch.setattr(stock, "import_photo", lambda u, p, pid: (raw, True))
    result = assets.import_stock_photo("unsplash", "photo-1", remove_background=True)
    assert result["original_asset_id"] == str(raw.pk)
    assert result["asset_id"] != str(raw.pk) and result["model"]["sends_offsite"] is False


def test_nothing_is_imported_when_no_server_model_exists(as_caller, user, monkeypatch):
    called = []
    monkeypatch.setattr(stock, "import_photo", lambda *a: called.append(a))
    with pytest.raises(ToolError, match="No AI server"):
        assets.import_stock_photo("unsplash", "photo-1", remove_background=True)
    assert called == []


def test_nothing_is_imported_once_the_ai_throttle_is_used_up(as_caller, user, provider, monkeypatch):
    imported = []

    def import_photo(u, p, pid):
        imported.append(pid)
        return picture(user, pid), True

    monkeypatch.setattr(stock, "import_photo", import_photo)
    monkeypatch.setattr(AIRateThrottle, "THROTTLE_RATES", {"ai": "1/min"})
    assets.import_stock_photo("unsplash", "photo-1", remove_background=True)
    with pytest.raises(ToolError, match="Too many requests"):
        assets.import_stock_photo("unsplash", "photo-2", remove_background=True)
    assert imported == ["photo-1"]


def test_a_failed_removal_names_the_kept_original(as_caller, user, provider, fake, monkeypatch):
    fake.routes[("POST", "/api/remove")] = lambda request: (500, {}, b"")
    monkeypatch.setattr(remote, "fetch_image", lambda url, max_bytes: image_bytes())
    with pytest.raises(ToolError, match="kept in your uploads as asset_id") as caught:
        assets.upload_image_from_url("https://img.example/pic.png", remove_background=True)
    (raw,) = Asset.objects.filter(owner=user)
    assert str(raw.pk) in str(caught.value)


# edit_design with remove_background


def test_edit_design_swaps_the_picture_and_keeps_frame_crop_and_mask(as_caller, user, provider):
    hero = picture(user)
    mask = {"type": "circle", "radius": 20}
    design = make_design(user, document=make_doc(objects=[image_obj(hero, cropX=5, cropY=3, clipPath=mask)]))
    before = first_object(design)

    assert remove(design)["revision"] == 2

    after = first_object(design)
    assert after["assetId"] != str(hero.pk)
    assert after["src"] == Asset.objects.get(pk=after["assetId"]).file.url
    assert {k: v for k, v in after.items() if k not in ("src", "assetId")} == {
        k: v for k, v in before.items() if k not in ("src", "assetId")
    }


def test_edit_design_runs_the_ai_call_before_locking_the_design(as_caller, user, provider, monkeypatch):
    hero = picture(user)
    design = make_design(user, document=make_doc(objects=[image_obj(hero)]))
    order = []
    real_run, real_saved = ai.run_model, edits._apply_saved
    monkeypatch.setattr(ai, "run_model", lambda *a, **k: order.append("ai") or real_run(*a, **k))
    monkeypatch.setattr(edits, "_apply_saved", lambda *a, **k: order.append("lock") or real_saved(*a, **k))
    remove(design)
    assert order == ["ai", "lock"]


def test_a_failing_later_op_keeps_the_call_and_the_cutout(as_caller, user, provider):
    hero = picture(user)
    design = make_design(user, document=make_doc(objects=[image_obj(hero)]))
    with pytest.raises(ToolError, match="no object"):
        designs.edit_design(
            str(design.pk),
            [
                {"op": "remove_background", "object_id": "hero"},
                {"op": "delete_objects", "object_ids": ["nope"]},
            ],
        )
    assert first_object(design)["assetId"] == str(hero.pk)
    assert AICall.objects.filter(user=user).count() == 1  # the quota counts the paid call
    assert Asset.objects.filter(owner=user).count() == 2


def test_edit_design_refuses_another_users_picture(as_caller, user, provider, fake):
    eve = User.objects.create_user(email="eve@example.com", password="x-very-long-pass-1")
    theirs = picture(eve, "Private")
    design = make_design(user, document=make_doc(objects=[image_obj(theirs)]))
    with pytest.raises(ToolError, match="Only pictures from your uploads or a template"):
        remove(design)
    assert fake.requests == [] and not Asset.objects.filter(owner=user).exists()


def test_edit_design_never_reads_a_file_by_its_path(as_caller, user, provider, fake):
    eve = User.objects.create_user(email="eve@example.com", password="x-very-long-pass-1")
    theirs = picture(eve, "Private")
    obj = image_obj(theirs)
    del obj["assetId"]
    design = make_design(user, document=make_doc(objects=[obj]))
    with pytest.raises(ToolError, match="Only pictures from your uploads or a template"):
        remove(design)
    assert fake.requests == [] and not Asset.objects.filter(owner=user).exists()


def test_a_published_templates_picture_is_copied_once(as_caller, user, provider):
    author = User.objects.create_user(email="author@example.com", password="x-very-long-pass-1")
    shared = picture(author, "Template photo")
    Template.objects.create(
        title="Poster",
        width=800,
        height=600,
        is_published=True,
        created_by=author,
        document=make_doc(objects=[image_obj(shared)]),
    )
    for _ in range(2):
        design = make_design(user, document=make_doc(objects=[image_obj(shared)]))
        remove(design)
    copies = Asset.objects.filter(owner=user, meta__copied_from=str(shared.pk))
    assert copies.count() == 1


@pytest.mark.parametrize(
    "earlier",
    [
        {"op": "update_object", "object_id": "hero", "opacity": 0.5},
        {"op": "remove_background", "object_id": "hero"},
        {"op": "delete_objects", "object_ids": ["hero"]},
        {"op": "delete_page", "page": 0},
    ],
)
def test_a_picture_changed_earlier_in_the_call_is_refused_before_any_ai_call(
    as_caller, user, provider, fake, earlier
):
    hero = picture(user)
    doc = make_doc(objects=[image_obj(hero)])
    doc["pages"].append({**doc["pages"][0], "id": "page-2", "objects": []})
    design = make_design(user, document=doc)
    with pytest.raises(ToolError, match="second edit_design call"):
        designs.edit_design(str(design.pk), [earlier, {"op": "remove_background", "object_id": "hero"}])
    assert fake.requests == [] and not AICall.objects.exists()
    assert first_object(design)["assetId"] == str(hero.pk)


def test_a_live_room_without_stored_state_falls_back_to_the_saved_design(
    as_caller, user, provider, settings, monkeypatch
):
    hero = picture(user)
    design = make_design(user, document=make_doc(objects=[image_obj(hero)]))
    settings.REALTIME_ENABLED = True
    monkeypatch.setattr(edits.store, "room_is_live", lambda pk: True)
    monkeypatch.setattr(edits, "_live_document", lambda pk: None)
    remove(design)
    assert first_object(design)["assetId"] != str(hero.pk)


def test_a_template_picture_is_not_copied_once_the_ai_throttle_is_used_up(
    as_caller, user, provider, fake, monkeypatch
):
    author = User.objects.create_user(email="author@example.com", password="x-very-long-pass-1")
    shared = picture(author, "Template photo")
    Template.objects.create(
        title="Poster",
        width=800,
        height=600,
        is_published=True,
        created_by=author,
        document=make_doc(objects=[image_obj(shared)]),
    )
    monkeypatch.setattr(AIRateThrottle, "THROTTLE_RATES", {"ai": "0/min"})
    design = make_design(user, document=make_doc(objects=[image_obj(shared)]))
    with pytest.raises(ToolError, match="Too many requests"):
        remove(design)
    assert fake.requests == [] and not Asset.objects.filter(owner=user).exists()


def test_edit_design_needs_assets_write_scope(as_caller, user, provider):
    design = make_design(user, document=make_doc(objects=[image_obj(picture(user))]))
    as_caller.token.scopes = ["designs:read", "designs:write"]
    with pytest.raises(ToolError, match="`assets:write` scope"):
        remove(design)


def test_edit_design_refuses_non_pictures(as_caller, user):
    text = {"id": "t", "type": "textbox", "text": "Hi", "left": 0, "top": 0, "width": 100, "height": 50}
    design = make_design(user, document=make_doc(objects=[text]))
    with pytest.raises(ToolError, match="Only pictures can have their background removed"):
        remove(design, object_id="t")


def test_a_provider_error_changes_nothing(as_caller, user, provider, fake):
    fake.routes[("POST", "/api/remove")] = lambda request: (500, {}, b"")
    hero = picture(user)
    design = make_design(user, document=make_doc(objects=[image_obj(hero)]))
    with pytest.raises(ToolError, match="Nothing was changed"):
        remove(design)
    assert first_object(design)["assetId"] == str(hero.pk)
