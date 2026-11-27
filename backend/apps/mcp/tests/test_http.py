"""The MCP endpoint over HTTP: authentication, the protocol handshake and a real tool call."""

from __future__ import annotations

import json

import httpx
import pytest
from asgiref.sync import async_to_sync

from apps.apitokens import services as tokens
from apps.apitokens.scopes import DESIGNS_READ
from apps.designs.models import Design, DesignVersion
from apps.designs.tests.helpers import make_doc
from apps.mcp.server import build_app

pytestmark = pytest.mark.django_db(transaction=True)  # tools run on worker threads with their own connections

HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
PROTOCOL = "2025-06-18"


def rpc(
    token: str | None, method: str, params: dict | None = None, *, host: str = "localhost"
) -> httpx.Response:
    app = build_app()

    async def send() -> httpx.Response:
        inner = app.app
        async with inner.router.lifespan_context(inner):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url=f"http://{host}") as client:
                headers = {**HEADERS, "MCP-Protocol-Version": PROTOCOL}
                if token:
                    headers["Authorization"] = f"Bearer {token}"
                body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
                return await client.post("/mcp", json=body, headers=headers)

    return async_to_sync(send)()


def call(token: str, name: str, arguments: dict) -> dict:
    response = rpc(token, "tools/call", {"name": name, "arguments": arguments})
    assert response.status_code == 200, response.text
    return response.json()["result"]


def test_requests_without_a_token_are_refused():
    response = rpc(None, "tools/list")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == 'Bearer realm="Doory"'
    response = rpc("doory_nope_nope", "tools/list")
    assert response.status_code == 401
    assert 'error="invalid_token"' in response.headers["www-authenticate"]


def test_a_revoked_token_is_refused(issued):
    tokens.revoke(issued.token)
    assert rpc(issued.plaintext, "tools/list").status_code == 401


def test_the_mcp_handshake_works(issued):
    response = rpc(
        issued.plaintext,
        "initialize",
        {"protocolVersion": PROTOCOL, "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}},
    )
    assert response.status_code == 200
    result = response.json()["result"]
    assert result["serverInfo"]["name"] == "doory"
    assert "edit_design" in result["instructions"]


def test_tools_are_listed_with_schemas(issued):
    tools = {tool["name"]: tool for tool in rpc(issued.plaintext, "tools/list").json()["result"]["tools"]}
    assert {
        "list_designs",
        "get_design",
        "create_design",
        "edit_design",
        "search_fonts",
        "export_project_backup",
        "import_project_backup",
    } <= set(tools)
    assert tools["list_designs"]["annotations"]["readOnlyHint"] is True
    ops = json.dumps(tools["edit_design"]["inputSchema"])
    assert all(name in ops for name in ("add_text", "add_vector", "set_background"))


def test_designs_are_resources_and_prompts_are_listed(issued, user):
    design = Design.objects.create(owner=user, title="Poster", document={"version": 1, "pages": []})
    templates = rpc(issued.plaintext, "resources/templates/list").json()["result"]["resourceTemplates"]
    assert [t["uriTemplate"] for t in templates] == ["doory://designs/{design_id}"]
    read = rpc(issued.plaintext, "resources/read", {"uri": f"doory://designs/{design.pk}"}).json()
    assert json.loads(read["result"]["contents"][0]["text"])["title"] == "Poster"
    missing = rpc(issued.plaintext, "resources/read", {"uri": "doory://designs/nope"}).json()
    assert "Not found" in missing["error"]["message"]
    prompts = rpc(issued.plaintext, "prompts/list").json()["result"]["prompts"]
    assert {p["name"] for p in prompts} == {"make_design", "review_design"}
    got = rpc(
        issued.plaintext, "prompts/get", {"name": "make_design", "arguments": {"brief": "A sale"}}
    ).json()
    assert "A sale" in got["result"]["messages"][0]["content"]["text"]


def test_a_tool_call_creates_and_edits_a_design(issued, user):
    created = call(issued.plaintext, "create_design", {"title": "Poster", "width": 800, "height": 1000})
    assert created["isError"] is False
    design_id = created["structuredContent"]["id"]
    edited = call(
        issued.plaintext,
        "edit_design",
        {"design_id": design_id, "operations": [{"op": "add_text", "text": "Hello", "preset": "heading"}]},
    )
    assert edited["isError"] is False, edited
    assert edited["structuredContent"]["revision"] == 2
    design = Design.objects.get(pk=design_id)
    assert design.owner == user and design.document["pages"][0]["objects"][0]["text"] == "Hello"


def _vector(**overrides):
    return {
        "op": "add_vector",
        "id": "boat",
        "name": "Sailboat",
        "view_box": [-10, -20, 100, 100],
        "x": 40,
        "y": 60,
        "width": 200,
        "paths": [
            {"name": "Hull", "commands": [["M", 12, 50], ["L", 72, 50], ["Q", 60, 70, 20, 70], ["Z"]]},
            {
                "name": "Sail",
                "commands": [["M", 32, 40], ["C", 50, 10, 60, 10, 52, 40], ["Z"]],
                "fill": "#1B998B",
            },
        ],
    } | overrides


def test_mcp_adds_editable_vector_paths_and_returns_their_ids(issued, user):
    original = make_doc(width=800, height=600)
    design = Design.objects.create(owner=user, title="Logos", width=800, height=600, document=original)
    edited = call(issued.plaintext, "edit_design", {"design_id": str(design.pk), "operations": [_vector()]})
    assert edited["isError"] is False, edited
    result = edited["structuredContent"]["results"][0]
    design.refresh_from_db()
    (group,) = design.document["pages"][0]["objects"]
    assert (group["type"], group["name"], result["object_id"]) == ("group", "Sailboat", "boat")
    assert [path["type"] for path in group["objects"]] == ["path", "path"]
    assert result["paths"] == [{"name": path["name"], "object_id": path["id"]} for path in group["objects"]]
    assert [path["fill"] for path in group["objects"]] == ["#000000", "#1B998B"]
    assert DesignVersion.objects.filter(design=design).exists()

    sail = result["paths"][1]["object_id"]
    edited = call(
        issued.plaintext,
        "edit_design",
        {
            "design_id": str(design.pk),
            "operations": [
                {
                    "op": "update_object",
                    "object_id": "boat",
                    "width": group["width"] * 1.25,
                    "height": group["height"] * 1.25,
                },
                {"op": "ungroup", "object_id": "boat"},
                {"op": "update_object", "object_id": sail, "color": "#E0842C"},
            ],
        },
    )
    assert edited["isError"] is False, edited
    design.refresh_from_db()
    resized_sail = design.document["pages"][0]["objects"][1]
    assert resized_sail["id"] == sail
    assert resized_sail["fill"] == "#E0842C"
    assert resized_sail["scaleX"] == resized_sail["scaleY"] == 1.25


@pytest.mark.parametrize(
    ("layer", "error"),
    [
        ({"commands": [["M", 0, 0], ["Q", 1, 2]]}, "commands"),
        ({"commands": [["M", 0, 0], ["L", True, 2]]}, "commands"),
        ({"commands": [["L", 2, 2], ["L", 4, 5]]}, "Sail"),
        ({"fill": "red"}, "fill"),
    ],
)
def test_mcp_rejects_bad_vector_paths_without_applying_earlier_operations(issued, user, layer, error):
    document = make_doc(width=800, height=600)
    design = Design.objects.create(owner=user, title="Logos", width=800, height=600, document=document)
    operation = _vector()
    operation["paths"][1].update(layer)
    edited = call(
        issued.plaintext,
        "edit_design",
        {"design_id": str(design.pk), "operations": [{"op": "add_shape", "shape": "rect"}, operation]},
    )
    assert edited["isError"] is True and error in edited["content"][0]["text"], edited
    design.refresh_from_db()
    assert design.document == document and design.revision == 1
    assert not DesignVersion.objects.filter(design=design).exists()


def test_mcp_refuses_a_vector_over_the_total_command_budget(issued, user):
    from apps.designs.doc.ops import MAX_COMMANDS_PER_PATH, MAX_VECTOR_COMMANDS

    design = Design.objects.create(owner=user, title="Logos", document=make_doc())
    commands = [["M", 0, 0]] + [["L", 1, 1]] * (MAX_COMMANDS_PER_PATH - 1)
    paths = [
        {"name": f"Path {index}", "commands": commands}
        for index in range(MAX_VECTOR_COMMANDS // MAX_COMMANDS_PER_PATH + 1)
    ]
    edited = call(
        issued.plaintext,
        "edit_design",
        {"design_id": str(design.pk), "operations": [_vector(paths=paths)]},
    )
    assert edited["isError"] is True and "commands across all paths" in edited["content"][0]["text"], edited
    design.refresh_from_db()
    assert design.revision == 1


def test_scopes_are_enforced(user):
    read_only = tokens.issue_token(user, name="Reader", scopes=[DESIGNS_READ], expires_in_days=30)
    result = call(read_only.plaintext, "create_design", {"title": "x"})
    assert result["isError"] is True
    assert "designs:write" in result["content"][0]["text"]
    assert call(read_only.plaintext, "list_designs", {})["isError"] is False
    design = Design.objects.create(
        owner=user, title="T", width=10, height=10, document=make_doc(width=10, height=10)
    )
    assert call(read_only.plaintext, "list_fields", {"design_id": str(design.pk)})["isError"] is False
    refused = call(read_only.plaintext, "bulk_fill", {"design_id": str(design.pk), "rows": [{}]})
    assert refused["isError"] is True and "designs:write" in refused["content"][0]["text"]


def test_bad_arguments_are_explained(issued):
    result = call(issued.plaintext, "edit_design", {"design_id": "x", "operations": [{"op": "explode"}]})
    assert result["isError"] is True


def test_unknown_hosts_are_refused(issued, settings):
    settings.ALLOWED_HOSTS = ["doory.example"]
    assert rpc(issued.plaintext, "tools/list", host="evil.example").status_code in (400, 421)
    assert rpc(issued.plaintext, "tools/list", host="doory.example").status_code == 200


def test_the_server_can_be_switched_off(issued, settings):
    settings.MCP_ENABLED = False
    assert rpc(issued.plaintext, "tools/list").status_code == 404


def test_the_health_probe_needs_no_token():
    app = build_app()

    async def probe() -> httpx.Response:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://localhost"
        ) as client:
            return await client.get("/mcp/health")

    response = async_to_sync(probe)()
    assert response.status_code == 200 and response.json() == {"status": "ok"}
