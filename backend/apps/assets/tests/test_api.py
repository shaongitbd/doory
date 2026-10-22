import uuid
from pathlib import Path

import pytest
from django.core.files.storage import default_storage

from apps.assets.models import Asset

from .helpers import image_bytes, upload

URL = "/api/v1/assets/"


def make_asset(api, name="pic.png", **extra) -> dict:
    res = api.post(URL, {"file": upload(image_bytes(), name), **extra}, format="multipart")
    assert res.status_code == 201
    return res.json()


@pytest.mark.django_db
class TestList:
    def test_lists_only_own_assets_newest_first(self, api, other_api):
        first, second = make_asset(api, "a.png"), make_asset(api, "b.png")
        make_asset(other_api, "theirs.png")
        res = api.get(URL)
        assert res.status_code == 200
        body = res.json()
        assert body["count"] == 2 and set(body) == {"count", "next", "previous", "results"}
        assert [a["id"] for a in body["results"]] == [second["id"], first["id"]]

    def test_filter_by_kind(self, api):
        make_asset(api, "a.png")
        svg = api.post(
            URL,
            {"file": upload(b'<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>', "v.svg")},
            format="multipart",
        ).json()
        assert [a["id"] for a in api.get(URL, {"kind": "svg"}).json()["results"]] == [svg["id"]]
        assert api.get(URL, {"kind": "image"}).json()["count"] == 1

    def test_invalid_kind_is_a_400(self, api):
        res = api.get(URL, {"kind": "movie"})
        assert res.status_code == 400 and res.json()["error"]["code"] == "validation_error"

    def test_search_by_name_case_insensitive(self, api):
        make_asset(api, "Summer-Logo.png")
        make_asset(api, "winter.png")
        names = [a["name"] for a in api.get(URL, {"q": "LOGO"}).json()["results"]]
        assert names == ["Summer-Logo.png"]

    def test_ordering_whitelist(self, api):
        make_asset(api, "b.png")
        make_asset(api, "a.png")
        names = [a["name"] for a in api.get(URL, {"ordering": "name"}).json()["results"]]
        assert names == ["a.png", "b.png"]
        names = [a["name"] for a in api.get(URL, {"ordering": "-name"}).json()["results"]]
        assert names == ["b.png", "a.png"]

    def test_unknown_ordering_is_a_400(self, api):
        res = api.get(URL, {"ordering": "owner__password"})
        assert res.status_code == 400 and "ordering" in res.json()["error"]["fields"]

    def test_pagination(self, api):
        for i in range(3):
            make_asset(api, f"{i}.png")
        body = api.get(URL, {"page_size": 2}).json()
        assert body["count"] == 3 and len(body["results"]) == 2 and body["next"]

    def test_list_query_count_is_constant(self, api, django_assert_max_num_queries):
        for i in range(5):
            make_asset(api, f"{i}.png")
        with django_assert_max_num_queries(3):
            assert api.get(URL).status_code == 200

    def test_requires_authentication(self, db):
        from rest_framework.test import APIClient

        assert APIClient().get(URL).status_code == 401


@pytest.mark.django_db
class TestDetailAndUpdate:
    def test_retrieve(self, api):
        asset = make_asset(api)
        assert api.get(f"{URL}{asset['id']}/").json()["id"] == asset["id"]

    def test_patch_name_and_tags(self, api):
        asset = make_asset(api)
        res = api.patch(
            f"{URL}{asset['id']}/",
            {"name": "  New name.png ", "tags": ["Hero", "hero", "Banner"]},
            format="json",
        )
        assert res.status_code == 200
        assert res.json()["name"] == "New name.png" and res.json()["tags"] == ["hero", "banner"]

    def test_patch_cannot_change_protected_fields(self, api, other):
        asset = make_asset(api)
        res = api.patch(
            f"{URL}{asset['id']}/",
            {
                "name": "ok.png",
                "kind": "svg",
                "size": 1,
                "owner": str(other.pk),
                "width": 1,
                "mime": "text/html",
                "url": "x",
            },
            format="json",
        )
        assert res.status_code == 200
        row = Asset.objects.get(pk=asset["id"])
        assert (row.kind, row.mime, row.width, row.owner_id) == ("image", "image/png", 64, row.owner_id)
        assert row.size == asset["size"] and row.owner != other

    def test_patch_empty_name_rejected(self, api):
        asset = make_asset(api)
        res = api.patch(f"{URL}{asset['id']}/", {"name": "‮ \x07"}, format="json")
        assert res.status_code == 400

    def test_patch_tag_limits(self, api):
        asset = make_asset(api)
        assert api.patch(f"{URL}{asset['id']}/", {"tags": ["x" * 41]}, format="json").status_code == 400
        too_many = [f"t{i}" for i in range(21)]
        assert api.patch(f"{URL}{asset['id']}/", {"tags": too_many}, format="json").status_code == 400
        twenty = [f"t{i}" for i in range(20)]
        assert api.patch(f"{URL}{asset['id']}/", {"tags": twenty}, format="json").status_code == 200

    def test_put_is_not_allowed(self, api):
        asset = make_asset(api)
        assert api.put(f"{URL}{asset['id']}/", {"name": "x"}, format="json").status_code == 405

    def test_nested_json_bomb_is_a_400_not_a_500(self, api):
        asset = make_asset(api)
        res = api.patch(f"{URL}{asset['id']}/", data="[" * 200_000, content_type="application/json")
        assert res.status_code == 400

    def test_unknown_asset_is_404(self, api):
        assert api.get(f"{URL}{uuid.uuid4()}/").status_code == 404
        assert api.get(f"{URL}not-a-uuid/").status_code == 404


@pytest.mark.django_db
class TestAuthorizationIsolation:
    def test_other_users_asset_is_404_everywhere(self, api, other_api):
        asset = make_asset(api)
        url = f"{URL}{asset['id']}/"
        assert other_api.get(url).status_code == 404
        assert other_api.patch(url, {"name": "hijack.png"}, format="json").status_code == 404
        assert other_api.delete(url).status_code == 404
        assert Asset.objects.get(pk=asset["id"]).name == "pic.png"


@pytest.mark.django_db
class TestDelete:
    def test_delete_removes_row_and_files(self, api, django_capture_on_commit_callbacks):
        asset = make_asset(api)
        row = Asset.objects.get(pk=asset["id"])
        paths = [Path(default_storage.path(row.file.name)), Path(default_storage.path(row.thumbnail.name))]
        assert all(p.exists() for p in paths)
        with django_capture_on_commit_callbacks(execute=True):
            assert api.delete(f"{URL}{asset['id']}/").status_code == 204
        assert not Asset.objects.filter(pk=asset["id"]).exists()
        assert not any(p.exists() for p in paths)
        assert api.get(f"{URL}{asset['id']}/").status_code == 404

    def test_files_survive_a_rolled_back_delete(self, api, django_capture_on_commit_callbacks):
        asset = make_asset(api)
        row = Asset.objects.get(pk=asset["id"])
        path = Path(default_storage.path(row.file.name))
        with django_capture_on_commit_callbacks(execute=False) as callbacks:
            row.delete()
        assert len(callbacks) == 1 and path.exists()

    def test_deleting_frees_quota(self, api):
        asset = make_asset(api)
        assert api.get(URL + "usage/").json()["used_bytes"] == asset["size"]
        api.delete(f"{URL}{asset['id']}/")
        assert api.get(URL + "usage/").json()["used_bytes"] == 0
