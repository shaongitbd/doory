"""Editable project backups exposed through MCP."""

from __future__ import annotations

import base64
import io
import json
import zipfile
from urllib.parse import urlsplit

import pytest
from mcp.server.mcpserver.exceptions import ToolError

from apps.assets.models import Asset
from apps.assets.services import create_asset
from apps.assets.tests.helpers import image_bytes
from apps.designs.models import Design
from apps.designs.tests.helpers import image_object, make_design, make_doc
from apps.mcp.tools import project_backups

pytestmark = pytest.mark.django_db


def _design_with_upload(user):
    asset = create_asset(user, image_bytes(), name="Portrait.png")
    picture = image_object(asset.file.url)
    picture["assetId"] = str(asset.pk)
    return make_design(user, title="Café poster", document=make_doc(objects=[picture])), asset


def test_export_and_import_project_backup(as_caller, user, monkeypatch):
    design, original_asset = _design_with_upload(user)
    delivered: dict[str, object] = {}

    def store(source, mime):
        delivered["data"] = source.read()
        delivered["mime"] = mime
        return "https://doory.example/exports/project.doory"

    monkeypatch.setattr(project_backups, "store_image", store)
    result = project_backups.export_project_backup(str(design.pk))
    assert result["filename"] == "Cafe-poster.doory"
    assert result["url"].endswith("project.doory")
    assert delivered["mime"] == "application/vnd.doory.project+zip"

    with zipfile.ZipFile(io.BytesIO(delivered["data"])) as archive:
        manifest = json.loads(archive.read("project.json"))
        assert manifest["document"]["pages"][0]["objects"][0]["src"] == f"idb://{original_asset.pk}"
        assert archive.read(f"assets/{original_asset.pk}")

    restored = project_backups.import_project_backup(base64.b64encode(delivered["data"]).decode("ascii"))
    copy = Design.objects.get(pk=restored["id"])
    copied_picture = copy.document["pages"][0]["objects"][0]
    assert copy.title == "Café poster" and copy.pk != design.pk
    assert copied_picture["assetId"] != str(original_asset.pk)
    copied_asset = Asset.objects.get(pk=copied_picture["assetId"])
    assert copied_asset.owner == user and copied_picture["src"] == copied_asset.file.url


def test_export_project_backup_link_serves_the_doory_file(as_caller, user, client, settings, tmp_path):
    design, _asset = _design_with_upload(user)
    settings.EXPORT_STORAGE_ROOT = tmp_path
    result = project_backups.export_project_backup(str(design.pk))
    response = client.get(urlsplit(result["url"]).path)
    assert response.status_code == 200
    assert response["Content-Type"] == "application/vnd.doory.project+zip"
    assert b"".join(response.streaming_content).startswith(b"PK")


def test_project_backup_tools_refuse_other_users_and_bad_files(as_caller, user, other):
    theirs, _asset = _design_with_upload(other)
    with pytest.raises(ToolError, match="Not found"):
        project_backups.export_project_backup(str(theirs.pk))
    before = (Design.objects.filter(owner=user).count(), Asset.objects.filter(owner=user).count())
    with pytest.raises(ToolError, match="could not be opened"):
        project_backups.import_project_backup(base64.b64encode(b"not a zip").decode("ascii"))
    assert (Design.objects.filter(owner=user).count(), Asset.objects.filter(owner=user).count()) == before


def test_import_project_backup_requires_upload_scope(user):
    from apps.apitokens import services as tokens
    from apps.apitokens.scopes import DESIGNS_WRITE
    from apps.mcp import context

    issued = tokens.issue_token(user, name="Writer", scopes=[DESIGNS_WRITE], expires_in_days=30)
    bound = context.bind(context.Caller(user, issued.token))
    try:
        with pytest.raises(ToolError, match="assets:write"):
            project_backups.import_project_backup("eA==")
    finally:
        context.unbind(bound)
