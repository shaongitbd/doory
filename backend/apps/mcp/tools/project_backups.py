"""Import and export editable `.doory` project backups."""

from __future__ import annotations

import base64
import binascii
from typing import Annotated, Any

from django.conf import settings
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from apps.apitokens.scopes import ASSETS_WRITE, DESIGNS_READ, DESIGNS_WRITE
from apps.designs.project_archive import MIME, export_project, import_project
from apps.exports.delivery import store_image

from ..context import current
from ..registry import tool
from .designs import DesignId, _design, _folder, _with_summary


@tool(scope=DESIGNS_READ, title="Export a project backup", read_only=True)
def export_project_backup(design_id: DesignId) -> dict[str, Any]:
    """Download an editable `.doory` backup of one account design, including its referenced uploads. The
    temporary link expires; download it before calling import_project_backup or handing it to the user."""
    design = _design(design_id)
    with export_project(design) as backup:
        url = store_image(backup.file, MIME)
        return {
            "design_id": str(design.pk),
            "filename": backup.filename,
            "bytes": backup.size,
            "url": url,
            "expires_in_seconds": settings.MCP_EXPORT_URL_TTL_SECONDS,
        }


@tool(scope=DESIGNS_WRITE, title="Import a project backup")
def import_project_backup(
    project_base64: Annotated[
        str,
        Field(
            min_length=1,
            description=(
                "The complete `.doory` file encoded as base64. The MCP request-size limit applies, so "
                "larger backups should be restored through the editor."
            ),
        ),
    ],
    folder_id: Annotated[
        str | None, Field(description="Put the new design in this folder (from list_folders).")
    ] = None,
) -> dict[str, Any]:
    """Restore a base64-encoded `.doory` backup as a new account design. It never overwrites an existing
    design or upload. The token needs both `designs:write` and `assets:write`."""
    caller = current()
    if not caller.has(ASSETS_WRITE):
        raise ToolError(
            "This token lacks the `assets:write` scope. Create a token with it in Doory: "
            "Account settings > API tokens."
        )
    try:
        data = base64.b64decode(project_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ToolError("project_base64 is not valid base64. Nothing was imported.") from exc
    design = import_project(data, caller.user, folder=_folder(folder_id))
    return _with_summary(design)
