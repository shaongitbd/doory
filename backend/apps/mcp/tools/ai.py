"""AI image tasks on a server model: background removal and upscaling."""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from django.conf import settings
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field
from rest_framework.exceptions import APIException

from apps.ai import catalog, quotas
from apps.ai import services as ai_services
from apps.ai.catalog import Option
from apps.ai.errors import AIProviderError, ModelNotAvailable, QuotaReached, RunsOnDevice, UnsupportedAsset
from apps.ai.tasks import TASKS
from apps.ai.throttling import AIRateThrottle
from apps.apitokens.scopes import ASSETS_WRITE
from apps.assets.models import Asset
from apps.assets.throttling import UploadRateThrottle

from ..context import current
from ..registry import throttle, tool

BACKGROUND_REMOVAL = "background-removal"
UPSCALE = "upscale"


def _server_default(user, task: str) -> Option | None:
    """The configured default when it is a server model; when the default runs in the browser, the first
    server model that keeps images on this installation. None when no model can be picked silently."""
    server = [o for o in catalog.options(user, task) if o.kind == "server"]
    wanted = settings.AI_TASK_DEFAULTS.get(task)
    chosen = next((o for o in server if o.id == wanted), None)
    return chosen or next((o for o in server if not o.sends_offsite), None)


def choose_model(user, model: str | None, task: str = BACKGROUND_REMOVAL) -> Option:
    """The server model to run: `model` (from list_ai_models) or the default. Raises `ToolError`."""
    if not settings.AI_PROVIDERS_ENABLED:
        raise ToolError("AI providers are not enabled on this installation.")
    if model:
        option = catalog.find(user, task, model)
        if option is None:
            raise ToolError(f"There is no AI model {model!r} available to you (see list_ai_models).")
        if option.kind == "device":
            raise ToolError(f"{model!r} runs in the browser; pick a server model (list_ai_models).")
        return option
    option = _server_default(user, task)
    if option is not None:
        return option
    if any(o.kind == "server" for o in catalog.options(user, task)):
        raise ToolError(
            "Every server model for this task sends images to an outside service. Ask the user, then pass "
            "`model` (see list_ai_models, `sends_offsite`)."
        )
    raise ToolError("No AI server is set up for this task (the in-browser model runs in the editor only).")


def reserve_run(user, option: Option) -> None:
    """Take the `ai` and `upload` throttles (as the REST endpoint does) and check the daily quota, before any
    work is done. Raises `ToolError`."""
    throttle(AIRateThrottle())
    throttle(UploadRateThrottle())
    try:
        quotas.check(user, option)
    except QuotaReached as exc:
        raise ToolError(_quota_message(exc)) from exc


def _quota_message(exc: QuotaReached) -> str:
    return f"You have used all of today's calls of this AI model (resets in {exc.wait} s)."


def model_info(option: Option) -> dict[str, Any]:
    return {"id": option.id, "label": option.label, "sends_offsite": option.sends_offsite}


def run_model(
    user, asset: Asset, option: Option, task: str = BACKGROUND_REMOVAL, options: dict[str, Any] | None = None
) -> Asset:
    """The new asset `option` makes from `asset` (one of `user`'s uploads). Raises `ToolError`."""
    try:
        return ai_services.run(user, task, asset, option.id, options)
    except QuotaReached as exc:
        raise ToolError(_quota_message(exc)) from exc
    except AIProviderError as exc:
        raise ToolError(f"The AI server failed: {exc}") from exc
    except (ModelNotAvailable, RunsOnDevice) as exc:
        raise ToolError("That AI model is not available on the server (see list_ai_models).") from exc
    except UnsupportedAsset as exc:
        raise ToolError("Only your own raster pictures (PNG, JPEG, WebP, GIF, AVIF) can be used.") from exc
    except APIException as exc:
        raise ToolError(str(getattr(exc, "detail", exc))) from exc


@tool(scope=ASSETS_WRITE, title="List AI models", read_only=True)
def list_ai_models(
    task: Annotated[str, Field(description="The AI task, e.g. 'background-removal'.")] = BACKGROUND_REMOVAL,
) -> dict[str, Any]:
    """The AI models you can pick for a task. 'device' models run in the user's browser and cannot be used
    here; tools use a 'server' one. `sends_offsite: true` means the image leaves this installation: tell the
    user before using it. `server_default` is what tools use when no `model` is given (null: pass one)."""
    if task not in TASKS:
        raise ToolError(f"Unknown task {task!r}. Available tasks: {', '.join(TASKS)}")
    user = current().user
    options = catalog.options(user, task)
    server_default = _server_default(user, task)
    return {
        "task": task,
        "default": catalog.default_option(task, options),
        "server_default": server_default.id if server_default else None,
        "models": [o.public() for o in options],
    }


def _own_picture(user, asset_id: str) -> Asset:
    try:
        pk = uuid.UUID(str(asset_id))
    except ValueError:
        pk = None
    asset = Asset.objects.filter(pk=pk, owner=user).first() if pk else None
    if asset is None or asset.kind not in Asset.PICTURE_KINDS:
        raise ToolError(f"There is no picture {asset_id!r} in your uploads (see list_assets).")
    return asset


@tool(scope=ASSETS_WRITE, title="Remove background from an upload")
def remove_asset_background(
    asset_id: Annotated[str, Field(description="A picture's id from list_assets or import_stock_photo.")],
    model: Annotated[
        str | None, Field(description="A server model from list_ai_models; omitted: `server_default`.")
    ] = None,
) -> dict[str, Any]:
    """Remove the background of a picture in your uploads; the transparent cut-out is saved as a new upload
    and returned, with the `model` used."""
    from .assets import _asset

    user = current().user
    asset = _own_picture(user, asset_id)
    option = choose_model(user, model)
    reserve_run(user, option)
    return {**_asset(run_model(user, asset, option)), "model": model_info(option)}


@tool(scope=ASSETS_WRITE, title="Upscale an upload")
def upscale_asset(
    asset_id: Annotated[str, Field(description="A picture's id from list_assets or import_stock_photo.")],
    scale: Annotated[Literal[2, 4], Field(description="How many times wider and taller the result is.")] = 2,
    model: Annotated[
        str | None,
        Field(description="A server model from list_ai_models(task='upscale'); omitted: `server_default`."),
    ] = None,
) -> dict[str, Any]:
    """Upscale a picture in your uploads with an AI server model: the result, `scale` times the size, is saved
    as a new upload and returned, with the `model` used. Put it in a design with the replace_image operation
    of edit_design."""
    from .assets import _asset

    user = current().user
    asset = _own_picture(user, asset_id)
    option = choose_model(user, model, UPSCALE)
    reserve_run(user, option)
    upscaled = run_model(user, asset, option, UPSCALE, {"scale": scale})
    return {**_asset(upscaled), "model": model_info(option)}
