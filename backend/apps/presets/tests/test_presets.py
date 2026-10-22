import json
from io import StringIO

import pytest
from django.core.exceptions import ValidationError
from django.core.management import CommandError, call_command
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.presets.importer import PresetImportError, builtin_catalogue, parse
from apps.presets.models import SizePreset, SizePresetGroup

pytestmark = pytest.mark.django_db

URL = "/api/v1/size-presets/"

# The slugs the web app has used so far (both of its lists): designs and templates store them.
LEGACY_SLUGS = {
    "instagram-post", "instagram-portrait", "instagram-story", "instagram-reel", "facebook-post",
    "facebook-cover", "x-post", "twitter-post", "x-header", "linkedin-post", "linkedin-banner",
    "youtube-thumbnail", "youtube-banner", "pinterest-pin", "tiktok-video", "presentation",
    "presentation-4-3", "a4", "a5", "a3", "letter", "poster", "flyer", "brochure", "business-card",
    "postcard", "invitation", "greeting-card", "resume", "letterhead", "video-1080p", "video-4k",
    "web-banner", "logo",
}  # fmt: skip


def run(*args):
    out = StringIO()
    call_command(*args, stdout=out, stderr=StringIO())
    return out.getvalue()


def write_json(path, payload):
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def catalogue(*groups):
    return {"version": 1, "groups": list(groups)}


def preset(slug, width=1000, height=1250, **extra):
    return {"slug": slug, "label": slug.title(), "width": width, "height": height, **extra}


def served() -> dict:
    return APIClient().get(URL).json()


def flatten(groups, path=()):
    for group in groups:
        here = (*path, group["slug"])
        for item in group["presets"]:
            yield here, item
        yield from flatten(group["children"], here)


def served_presets() -> dict[str, dict]:
    return {item["slug"]: item for _, item in flatten(served()["groups"])}


# ---- built-ins ----


def test_the_migration_adds_the_built_in_catalogue():
    names = {slug for slug, aliases in SizePreset.objects.values_list("slug", "aliases")}
    aliases = {alias for row in SizePreset.objects.values_list("aliases", flat=True) for alias in row}
    assert names | aliases >= LEGACY_SLUGS  # designs and templates that name an old slug still find it
    assert SizePreset.objects.count() == len(builtin_catalogue().presets)


def test_built_in_pixel_sizes_match_what_the_web_app_stored():
    presets = served_presets()
    expected = {
        "instagram-post": (1080, 1080),
        "a4": (794, 1123),
        "a3": (1123, 1587),
        "letter": (816, 1056),
        "business-card": (336, 192),
        "greeting-card": (408, 528),
        "flyer": (528, 816),
    }
    for slug, size in expected.items():
        assert (presets[slug]["width_px"], presets[slug]["height_px"]) == size, slug


def test_seed_is_idempotent_and_keeps_staff_edits():
    SizePreset.objects.filter(slug="a4").update(label="A4 portrait")
    SizePreset.objects.filter(slug="logo").delete()

    out = run("seed_size_presets")

    assert "1 created" in out and "0 updated" in out
    assert SizePreset.objects.get(slug="a4").label == "A4 portrait"
    assert SizePreset.objects.filter(slug="logo").exists()


def test_seed_update_restores_the_defaults():
    SizePreset.objects.filter(slug="a4").update(label="A4 portrait", is_quick=False)

    out = run("seed_size_presets", "--update")

    a4 = SizePreset.objects.get(slug="a4")
    assert (a4.label, a4.is_quick) == ("A4 Document", True)
    assert "1 updated" in out


def test_seed_update_works_on_a_site_seeded_before_the_catalogue_grew():
    # Such a site has each of the old slugs as a preset of its own, `instagram-reel` among them.
    story = SizePreset.objects.get(slug="instagram-story")
    if not SizePreset.objects.filter(slug="instagram-reel").exists():
        reel = SizePreset.objects.get(pk=story.pk)
        reel.pk, reel.slug, reel.label, reel.aliases = None, "instagram-reel", "Instagram Reel", []
        reel.save()
    SizePreset.objects.filter(pk=story.pk).update(aliases=[])

    run("seed_size_presets", "--update")

    assert SizePreset.objects.filter(slug="instagram-reel", is_active=True).count() == 1
    assert "instagram-reel" not in SizePreset.objects.get(slug="instagram-story").aliases


# ---- API ----


def test_the_catalogue_is_public_cacheable_and_nested():
    res = APIClient().get(URL)
    assert res.status_code == 200
    assert res["Cache-Control"] == "public, max-age=60"
    body = res.json()
    assert body["version"] == 1
    paths = {item["slug"]: path for path, item in flatten(body["groups"])}
    assert paths["instagram-story"] == ("social", "instagram")
    assert paths["a4"] == ("print", "paper", "paper-iso-paper-a-b")
    assert paths["presentation"] == ("presentation", "presentation-screen-slides")


def test_preset_rows_carry_size_unit_pixels_and_extras():
    item = served_presets()["x-post"]
    assert item == {
        "slug": "x-post",
        "label": "X (Twitter) Post",
        "width": 1200,
        "height": 675,
        "unit": "px",
        "width_px": 1200,
        "height_px": 675,
        "icon": "rectangle-horizontal",
        "tags": ["16:9"],
        "is_quick": False,
        "aliases": ["twitter-post"],
        "meta": {},
    }
    assert served_presets()["flyer"]["width"] == 5.5


def test_inactive_presets_and_groups_are_hidden_and_empty_groups_dropped():
    SizePreset.objects.filter(group__slug="pinterest").update(is_active=False)
    SizePresetGroup.objects.filter(slug="print").update(is_active=False)

    body = served()
    presets = {item["slug"] for _, item in flatten(body["groups"])}
    assert "pinterest-pin" not in presets and "a4" not in presets and "poster" not in presets
    social = next(group for group in body["groups"] if group["slug"] == "social")
    assert "pinterest" not in [child["slug"] for child in social["children"]]
    assert "print" not in [group["slug"] for group in body["groups"]]


def test_the_catalogue_is_read_only():
    assert APIClient().post(URL, {}, format="json").status_code == 405


def test_the_schema_documents_the_endpoint():
    paths = APIClient().get("/api/v1/schema/", {"format": "json"}).json()["paths"]
    assert URL in paths


# ---- import ----


def test_import_extends_and_overrides_built_ins_by_slug(tmp_path):
    custom = catalogue(
        {
            "slug": "social",
            "label": "Social media",
            "children": [
                {
                    "slug": "platform-a",
                    "label": "Platform A",
                    "children": [
                        {
                            "slug": "platform-a-feed",
                            "label": "Feed",
                            "presets": [
                                preset(
                                    "example-portrait",
                                    tags=["4:5", "Paid"],
                                    meta={"safe_zone": {"top": 0.1, "bottom": 0.2}},
                                )
                            ],
                        }
                    ],
                }
            ],
        },
        {
            "slug": "print",
            "label": "Print",
            "presets": [preset("a4", 200, 290, unit="mm", label="A4 (ours)")],
        },
    )

    out = run("import_size_presets", str(write_json(tmp_path / "custom.json", custom)))

    presets = served_presets()
    assert presets["example-portrait"]["tags"] == ["4:5", "paid"]
    assert presets["example-portrait"]["meta"] == {"safe_zone": {"top": 0.1, "bottom": 0.2}}
    assert presets["a4"]["label"] == "A4 (ours)" and presets["a4"]["width"] == 200
    assert "instagram-post" in presets  # extend keeps the rest
    paths = {item["slug"]: path for path, item in flatten(served()["groups"])}
    assert paths["example-portrait"] == ("social", "platform-a", "platform-a-feed")
    assert paths["a4"] == ("print",)
    assert "Size presets:" in out and "created" in out


def test_naming_a_built_in_group_keeps_its_icon_and_place_unless_the_file_sets_them(tmp_path):
    social = SizePresetGroup.objects.get(slug="social")
    path = write_json(
        tmp_path / "c.json", catalogue({"slug": "social", "label": "Social media", "presets": [preset("p1")]})
    )
    run("import_size_presets", str(path))
    after = SizePresetGroup.objects.get(slug="social")
    assert (after.icon, after.sort_order) == (social.icon, social.sort_order)

    path = write_json(
        tmp_path / "c.json",
        catalogue({"slug": "social", "label": "Social", "icon": "", "order": 999, "presets": [preset("p1")]}),
    )
    run("import_size_presets", str(path))
    after = SizePresetGroup.objects.get(slug="social")
    assert (after.label, after.icon, after.sort_order) == ("Social", "", 999)


def test_import_is_idempotent(tmp_path):
    path = write_json(
        tmp_path / "c.json", catalogue({"slug": "ours", "label": "Ours", "presets": [preset("p1")]})
    )
    run("import_size_presets", str(path))

    out = run("import_size_presets", str(path))

    assert "0 created, 0 updated, 2 unchanged" in out


def test_replace_mode_deactivates_everything_the_file_does_not_name(tmp_path):
    path = write_json(
        tmp_path / "c.json", catalogue({"slug": "ours", "label": "Ours", "presets": [preset("p1")]})
    )

    out = run("import_size_presets", str(path), "--mode", "replace")

    body = served()
    assert [group["slug"] for group in body["groups"]] == ["ours"]
    assert list(served_presets()) == ["p1"]
    assert SizePreset.objects.filter(slug="a4", is_active=False).exists()  # kept, not deleted
    assert "deactivated" in out


def test_replace_mode_lets_a_custom_preset_take_a_built_in_alias(tmp_path):
    path = write_json(
        tmp_path / "c.json", catalogue({"slug": "ours", "label": "Ours", "presets": [preset("twitter-post")]})
    )
    run("import_size_presets", str(path), "--mode", "replace")
    assert list(served_presets()) == ["twitter-post"]


def test_a_slug_that_is_already_an_active_alias_is_refused_and_nothing_changes(tmp_path):
    path = write_json(
        tmp_path / "c.json",
        catalogue({"slug": "ours", "label": "Ours", "presets": [preset("p1"), preset("twitter-post")]}),
    )

    with pytest.raises(CommandError, match="twitter-post"):
        run("import_size_presets", str(path))

    assert not SizePreset.objects.filter(slug="p1").exists()


def test_dry_run_changes_nothing(tmp_path):
    path = write_json(
        tmp_path / "c.json", catalogue({"slug": "ours", "label": "Ours", "presets": [preset("p1")]})
    )

    out = run("import_size_presets", str(path), "--dry-run", "--mode", "replace")

    assert "Dry run" in out and "2 created" in out
    assert not SizePreset.objects.filter(slug="p1").exists()
    assert SizePreset.objects.get(slug="a4").is_active


def test_a_directory_imports_every_file_and_refuses_duplicates_across_them(tmp_path):
    write_json(tmp_path / "a.json", catalogue({"slug": "ga", "label": "A", "presets": [preset("p1")]}))
    write_json(tmp_path / "b.json", catalogue({"slug": "gb", "label": "B", "presets": [preset("p2")]}))
    run("import_size_presets", str(tmp_path))
    assert {"p1", "p2"} <= set(served_presets())

    write_json(tmp_path / "c.json", catalogue({"slug": "gc", "label": "C", "presets": [preset("p1")]}))
    with pytest.raises(CommandError, match="more than once"):
        run("import_size_presets", str(tmp_path))


def test_a_served_catalogue_imports_as_it_is(tmp_path):
    path = write_json(tmp_path / "served.json", served())
    out = run("import_size_presets", str(path))
    assert "0 created, 0 updated" in out


def test_import_reports_a_missing_path():
    with pytest.raises(CommandError, match="no such file"):
        run("import_size_presets", "/nonexistent/presets.json")


@pytest.mark.parametrize(
    ("document", "message"),
    [
        ([], "groups"),
        ({"version": 2, "groups": []}, "version"),
        ({"groups": [], "extra": 1}, "Unknown key"),
        (catalogue({"slug": "Bad Slug", "label": "X"}), "slug"),
        (catalogue({"slug": "g", "label": ""}), "label"),
        (catalogue({"slug": "g", "label": "G", "colour": "red"}), "colour"),
        (catalogue({"slug": "g", "label": "G", "presets": [preset("p", unit="pt")]}), "unit"),
        (catalogue({"slug": "g", "label": "G", "presets": [preset("p", width=0)]}), "greater than 0"),
        (catalogue({"slug": "g", "label": "G", "presets": [preset("p", width=10.5)]}), "whole number"),
        (catalogue({"slug": "g", "label": "G", "presets": [preset("p", width=30000)]}), "20000"),
        (catalogue({"slug": "g", "label": "G", "presets": [preset("p", width=300, unit="in")]}), "20000"),
        (catalogue({"slug": "g", "label": "G", "presets": [preset("p p")]}), "slug"),
        (catalogue({"slug": "g", "label": "G", "presets": [preset("p", aliases=["p"])]}), "alias"),
        (catalogue({"slug": "g", "label": "G", "presets": [preset("p", aliases=["a b"])]}), "alias"),
        (catalogue({"slug": "g", "label": "G", "presets": [preset("p", is_quick="yes")]}), "is_quick"),
        (catalogue({"slug": "g", "label": "G", "presets": [preset("p", meta=[])]}), "Meta"),
        (
            catalogue(
                {"slug": "g", "label": "G", "presets": [preset("p", meta={"safe_zone": {"top": 0.7}})]}
            ),
            "safe_zone.top",
        ),
        (catalogue({"slug": "g", "label": "G"}, {"slug": "g", "label": "G2"}), "more than once"),
    ],
)
def test_parse_rejects_bad_catalogues_with_a_clear_message(document, message):
    with pytest.raises(PresetImportError, match=message):
        parse(document)


def test_parse_names_where_the_problem_is():
    document = catalogue(
        {"slug": "g", "label": "G", "children": [{"slug": "h", "label": "H", "presets": [{}]}]}
    )
    with pytest.raises(PresetImportError, match=r"groups\[0\] \(g\)\.children\[0\] \(h\)\.presets\[0\]"):
        parse(document)


def test_parse_limits_the_depth():
    group = {"slug": "g9", "label": "G"}
    for level in range(8, 0, -1):
        group = {"slug": f"g{level}", "label": "G", "children": [group]}
    with pytest.raises(PresetImportError, match="levels deep"):
        parse(catalogue(group))


# ---- models and admin ----


def test_a_group_cannot_be_moved_inside_itself():
    social = SizePresetGroup.objects.get(slug="social")
    social.parent = SizePresetGroup.objects.get(slug="instagram")
    with pytest.raises(ValidationError, match="inside itself"):
        social.full_clean()


def test_model_validation_checks_size_and_name_clashes():
    group = SizePresetGroup.objects.get(slug="etc")
    bad_size = SizePreset(slug="huge", label="Huge", group=group, width=30000, height=10, unit="px")
    with pytest.raises(ValidationError, match="20000"):
        bad_size.full_clean()
    clash = SizePreset(slug="mine", label="Mine", group=group, width=10, height=10, aliases=["a4"])
    with pytest.raises(ValidationError, match="another preset"):
        clash.full_clean()
    clash.is_active = False
    clash.full_clean()  # an inactive preset resolves nothing, so it may share names


@pytest.fixture
def staff_client():
    from django.test import Client

    staff = User.objects.create_superuser(email="staff@example.com", password="pw-12345-abc")
    web = Client()
    web.force_login(staff)
    return web


def test_admin_pages_render(staff_client):
    for name in ("sizepreset", "sizepresetgroup"):
        assert staff_client.get(reverse(f"admin:presets_{name}_changelist")).status_code == 200
        assert staff_client.get(reverse(f"admin:presets_{name}_add")).status_code == 200
    a4 = SizePreset.objects.get(slug="a4")
    assert staff_client.get(reverse("admin:presets_sizepreset_change", args=[a4.pk])).status_code == 200


def test_admin_creates_a_preset_from_comma_separated_tags_and_aliases(staff_client):
    group = SizePresetGroup.objects.get(slug="etc")
    res = staff_client.post(
        reverse("admin:presets_sizepreset_add"),
        {
            "label": "Banner",
            "slug": "banner-x",
            "group": str(group.pk),
            "width": "1200",
            "height": "300",
            "unit": "px",
            "icon": "",
            "tags": "4:1, Paid, paid",
            "aliases": "old-banner",
            "meta": "{}",
            "is_active": "on",
        },
    )
    assert res.status_code == 302, res.content[:2000]
    banner = SizePreset.objects.get(slug="banner-x")
    assert (banner.tags, banner.aliases) == (["4:1", "paid"], ["old-banner"])


def test_admin_bulk_activate_refuses_a_name_clash(staff_client):
    group = SizePresetGroup.objects.get(slug="etc")
    clash = SizePreset.objects.create(
        slug="mine", label="Mine", group=group, width=10, height=10, aliases=["a4"], is_active=False
    )
    staff_client.post(
        reverse("admin:presets_sizepreset_changelist"),
        {"action": "activate", "_selected_action": [str(clash.pk)]},
    )
    clash.refresh_from_db()
    assert not clash.is_active
