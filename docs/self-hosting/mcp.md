# MCP server (AI assistants)

Doory can run a [Model Context Protocol](https://modelcontextprotocol.io) server at `/mcp` on your domain. MCP
clients can then list, create and edit designs on a user's behalf, using a token that user creates.

## Requirements

- An MCP client that supports the HTTP transport.
- For `export_design` (an image, SVG, PDF or video of pages), [server-side export](image-export.md).
- Optional: Redis (`REDIS_URL`), so edits appear in open editors immediately instead of within a few seconds.

## Turn it on

It's off by default.

**Docker:** add both lines to `.env`, then run `docker compose up -d` (this starts the `mcp` service):

```ini
MCP_ENABLED=true
COMPOSE_PROFILES=mcp
```

**Without Docker:** add `MCP_ENABLED=true` to `backend/.env`, then:

```bash
sudo cp /opt/doory/deploy/doory-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now doory-mcp
sudo systemctl restart doory-api
```

The bundled `deploy/nginx.conf` already forwards `/mcp` to it and answers OAuth discovery under
`/.well-known/oauth-*` with 404, because authentication uses tokens rather than OAuth. If you use your own
proxy, do the same and turn off response buffering for `/mcp`. The service keeps no state, so you can run more
workers.

## Settings

See [MCP server in configuration.md](configuration.md#mcp-server): call rate per user, request size, copying
images from URLs, and how `export_design` returns large images. AVIF images, SVG files, PDFs and ZIPs always come
back as a download link, and each page after the first counts as one more call. The number of tokens per user is
`MAX_API_TOKENS_PER_USER`.

## Connect a client

1. In Doory, open **Settings → AI assistants (MCP)** and create a token. Choose what it may do (read designs, edit
   them, trash them, add images, comment, manage comments, change brand kits, manage share links), set when it
   expires (at most a year), and confirm with your password. The token is shown only once. A token never gains a
   permission it wasn't given, even when new tools are added.
2. Add the server to your client with the URL `https://your-domain/mcp` and the header
   `Authorization: Bearer <token>`. In a JSON configuration that is:

   ```json
   {"type": "http", "url": "https://your-domain/mcp", "headers": {"Authorization": "Bearer doory_…"}}
   ```

Revoke a token on the same settings page. Changing or resetting a password revokes all of that user's tokens.

## What assistants can do

Assistants can work with designs and their contents:

- **Designs:** list, read, create, rename, duplicate and edit them; star them, organise them in folders, trash
  and restore them.
- **On the page:** add text (with effects), shapes, custom vectors, lines, pictures, QR codes and pages;
  group objects; set backgrounds and speaker notes.
- **Search:** templates, elements, fonts and stock photos.

They can also handle comments, brand kits, share links and earlier versions, and export pages as PNG, JPG,
WebP or AVIF images, or several pages as a ZIP, optionally [optimized](../integrations/image-optimization.md),
or as SVG files, a PDF or a print PDF with bleed and crop marks, or as an MP4, WebM or GIF video if the server
makes videos (`export_design`, with the options in [image-export.md](image-export.md#image-options) and
[Video](image-export.md#video)). `export_project_backup` returns a short-lived link to an editable `.doory`
backup; `import_project_backup` restores a base64-encoded backup with new design and upload ids. Import needs
both **Edit designs** and **Add uploads**, and the encoded file must fit `MCP_MAX_REQUEST_BYTES`; larger local
backups can be restored in the editor. Designs are also available as MCP resources
(`doory://designs/{id}`), and the server offers two prompts.

For an original logo or illustration, use `add_vector` in `edit_design`. For example, this places a two-color
sailboat on the first page:

```json
{
  "design_id": "<design-id>",
  "operations": [
    {
      "op": "add_vector",
      "page": 1,
      "name": "Sailboat",
      "view_box": [0, 0, 100, 100],
      "x": 40,
      "y": 60,
      "width": 200,
      "paths": [
        {"name": "Hull", "commands": [["M", 12, 72], ["L", 90, 72], ["Q", 76, 92, 36, 92], ["Z"]], "fill": "#16324F"},
        {"name": "Sail", "commands": [["M", 48, 10], ["Q", 71, 37, 82, 66], ["L", 48, 66], ["Z"]], "fill": "#1B998B"}
      ]
    }
  ]
}
```

`x` and `y` place the top-left of the shared source view box in page pixels. The requested `width` scales all
paths together, preserving proportions and padding. Commands are absolute `M` (move), `L` (line), `Q`
(quadratic curve), `C` (cubic curve), and `Z` (close). Paths are painted from bottom to top. Each can use a
solid hex fill (black by default, or `null` for no fill), an optional hex stroke with width in source units,
and a `nonzero` or `evenodd` fill rule.

The result includes the artwork's `object_id` and a `paths` list with each layer's name and object ID.
Several paths are grouped so they can be moved or resized together. Use `ungroup` before editing a grouped
child by ID through MCP. When server rendering is available, use `export_design` to review the page as a
PNG or download it as an SVG.

See the results in the [vector artwork samples](../integrations/vector-artwork-samples.md).

For a folded PDF, call `export_design` with the design id and booklet options, for example:

```json
{"design_id": "<design-id>", "format": "pdf-print", "layout": "booklet", "binding": "left"}
```

The tool uses all pages when a folded layout is requested without `page` or `pages`. The result contains a
short-lived PDF download link and `sheet_sides`, the front and back page pairs in print order; `null` means a
blank leaf added to complete a sheet. Use `layout: "book"` with `signature_pages` (4–32, in multiples of four)
for separate signatures. `print_sides: "front"` or `"back"` makes one side set for manual duplex printing. The
pages must be portrait and the same size, and folded PDFs cannot use bleed or crop marks. Print the resulting
PDF as ordinary double-sided sheets with short-edge flipping, without a second booklet setting in the printer.

Some actions are protected:

- Creating or changing a share link is marked as destructive, so clients ask the user first.
- Comment text reaches the assistant labelled as untrusted.
- Every edit saves the previous state in the design's version history, so it can be undone.

## Check it works

- Docker: `docker compose ps mcp` shows the service as `healthy`. Without Docker:
  `curl http://127.0.0.1:8002/mcp/health` returns `{"status": "ok"}`. This health check isn't exposed through
  nginx.
- In the client, list the tools. Only the tools the token's permissions allow appear.

## Troubleshooting

- **`/mcp` returns 404 or 502:** check that `MCP_ENABLED=true` is set and that the `mcp` service (Docker) or
  `doory-mcp` (systemd) is running.
- **`export_design` fails:** see [image-export.md](image-export.md). In Docker, also check `MCP_MEM_LIMIT`.
- **Edits appear in the editor only after a delay:** set `REDIS_URL` (see [realtime.md](realtime.md)).
