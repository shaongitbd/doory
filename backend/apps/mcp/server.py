"""The Doory MCP server: tools for agents (Claude, Cursor…) to read and edit a user's designs.

Served over Streamable HTTP at `/mcp` by its own process (`doory.mcp_asgi`), stateless and JSON-only, so it
scales like the API. Every request carries a personal access token (`apps.apitokens`).
"""

from __future__ import annotations

from django.conf import settings
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.types import ASGIApp

from . import prompts
from .auth import TokenAuthMiddleware
from .registry import RESOURCES, TOOLS

INSTRUCTIONS = """\
Doory is a design editor (posters, social posts, slides, cards…). These tools act on the signed-in user's
designs.

Typical flow: list_designs or create_design → get_design (pages, object ids and boxes) → edit_design with a
list of operations → get_design again to check, or export_design to see the page as an image (it is drawn
exactly as in the editor). Coordinates are page pixels from the top-left corner; an
object's x, y is the top-left corner of its box. Text wraps at its box width and its height follows the text;
heights the server reports for new or changed text are estimates until the design is opened in the editor.

Pictures must be in the user's uploads (list_assets, import_stock_photo) or the element catalogue
(search_elements) before they can be placed. Fonts come from search_fonts. Every edit keeps the previous state
as a version (list_versions, restore_version), so mistakes can be undone; trashed designs come back with
restore_design. Designs open in someone's editor change live in front of them. Give the user the design's
editor_url to open it. Share links (create_share_link) let anyone with the URL in, so create one only when the
user asks for it."""


def _register() -> None:
    # Importing the modules runs their @tool and @resource decorators.
    from . import resources  # noqa: F401
    from .tools import assets, brand, catalog, comments, designs, export, history, organize, sharing  # noqa: F401


def _transport_security() -> TransportSecuritySettings:
    """Host checks from ALLOWED_HOSTS; browsers may only call from the site itself (agents send no Origin)."""
    hosts = list(settings.ALLOWED_HOSTS)
    if not hosts or any(host == "*" or host.startswith(".") for host in hosts):
        return TransportSecuritySettings(enable_dns_rebinding_protection=False)
    site = "/".join(settings.SITE_URL.split("/")[:3])
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[*hosts, *(f"{host}:*" for host in hosts)],
        allowed_origins=[site],
    )


def build_server() -> MCPServer:
    _register()
    server = MCPServer(
        "doory",
        title="Doory",
        description="Create and edit designs in Doory.",
        instructions=INSTRUCTIONS,
        website_url=settings.SITE_URL,
        version="1",
    )
    for spec in TOOLS:
        server.add_tool(spec.fn, name=spec.name, title=spec.title, annotations=spec.annotations)
    for res in RESOURCES:
        server.resource(res.uri, name=res.name, title=res.title, mime_type=res.mime_type)(res.fn)
    prompts.register(server)
    return server


def build_app(server: MCPServer | None = None) -> ASGIApp:
    app = (server or build_server()).streamable_http_app(
        streamable_http_path=settings.MCP_PATH,
        stateless_http=True,
        json_response=True,
        transport_security=_transport_security(),
        max_request_body_size=settings.MCP_MAX_REQUEST_BYTES,
    )
    return TokenAuthMiddleware(app)
