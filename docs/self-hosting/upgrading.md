# Upgrading

Back up first ([backup.md](backup.md)). Then read the [version notes](#version-notes) for everything newer than
what you run now.

## Docker

```bash
git pull
docker compose up -d --build
```

The `api` container runs the database migrations and `collectstatic` before it starts serving.

## Without Docker

```bash
cd /opt/doory
sudo -u doory git pull
cd backend
sudo -u doory .venv/bin/pip install -r requirements.txt
manage migrate
manage collectstatic --noinput
cd ../frontend
sudo -u doory npm ci && sudo -u doory npm run build
sudo systemctl restart doory-api doory-realtime    # and doory-mcp, doory-ai-server if you use them
```

(`manage` is the helper from [manual.md](manual.md#3-the-api).)

If `deploy/nginx.conf` or a file in `deploy/*.service` changed, copy it again. Keep your own edits, such as
`server_name`, then reload:

```bash
git diff ORIG_HEAD -- deploy/        # what changed in this pull
sudo systemctl daemon-reload && sudo nginx -t && sudo systemctl reload nginx
```

## Version notes

Changes that need you to do something, newest first. Changes that need nothing aren't listed here.

### 2026-10-21: server-side video export (opt-in)

- New settings `SERVER_VIDEO_EXPORT_ENABLED` (off) and `EXPORT_VIDEO_*`; see
  [image-export.md](image-export.md#video).
- **Without Docker:** `deploy/nginx.conf` waits 330 s for the image export endpoint (was 120 s) and for `/mcp`
  (was 300 s). Copy it again, keeping your own edits; a proxy of your own needs the same for video export.

### 2026-10-21: image optimizers

- **Docker:** the API image builds mozjpeg and installs oxipng (`INSTALL_IMAGE_OPTIMIZERS=true`, about 2 MB),
  so the first `docker compose up -d --build` takes a few minutes longer. Set it to `false` to leave them out.
- **Without Docker:** install mozjpeg's `cjpeg` and `oxipng` for the built-in optimizer, or leave it out; nothing
  breaks without them.
- New settings for TinyPNG, Kraken.io and a custom optimizer, all off until you set a key. See
  [image-optimization.md](../integrations/image-optimization.md).

### 2026-10-18: separate storage for server-side image exports

- **Docker:** a new `exports` volume and `EXPORT_STORAGE_ROOT=/app/exports`. `docker compose up -d` creates them.
- **Without Docker:** exports go to `backend/exports` (`EXPORT_STORAGE_ROOT`). Make sure the `doory` user can
  write there.

### 2026-10-18: server-side image export (opt-in)

- New settings `SERVER_IMAGE_EXPORT_ENABLED` and `EXPORT_RENDER_PAGE_URL`. The `web` service gets the network
  alias `doory-web`. Nothing changes unless you turn image export on; see [image-export.md](image-export.md).

### 2026-10-16: MCP server (opt-in)

- **Docker:** a new `mcp` service, started only with `COMPOSE_PROFILES=mcp`.
- **Without Docker:** a new `deploy/doory-mcp.service` and an `/mcp` block in `deploy/nginx.conf`. Copy the new
  `nginx.conf` even if you don't turn MCP on, so `/mcp` isn't served as the app's index page.
- See [mcp.md](mcp.md).

### Size presets from a file

- New settings `DOORY_SIZE_PRESETS_FILE` and `DOORY_SIZE_PRESETS_MODE`. Nothing to do unless you use them; see
  [content.md](content.md#size-presets).
