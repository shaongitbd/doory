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
- **On the page:** add text (with effects), shapes, lines, pictures, QR codes and pages; group objects; set
  backgrounds and speaker notes.
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
