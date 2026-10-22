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

### 2026-10-23: more built-in size presets

- The migration adds about 1,600 new sizes (print, documents, books, screens, app and web design, merch, logos,
  social media, advertising, stores, video calls, web and email). Presets you edited keep your edits.
- Some old built-in sizes changed with current guidance (for example the Facebook page cover, the X post and the
  logo, now 512 × 512), and the old groups get new names and sub-groups. To move the built-ins to the new sizes,
  names and groups, run `python manage.py seed_size_presets --update`. It resets only the built-in presets; your
  own are left alone.

### 2026-10-23: video clips

- **Docker:** the `api`, `realtime` and `mcp` images now build ffmpeg in (`INSTALL_FFMPEG=true`, about 250 MB).
  Rebuild with `docker compose up -d --build`. Set `INSTALL_FFMPEG=false` in `.env` to leave video off.
- **Without Docker:** `sudo apt install ffmpeg` to turn video on, then copy the new `deploy/nginx.conf`. It
  allows 210 MB uploads on `/api/v1/assets/` (clips), and other requests keep the 30 MB limit.
- The site's Content-Security-Policy (`frontend/nginx/security-headers.conf`) now lists the Pexels and Pixabay
  video CDNs in `media-src`. If you mount your own copy, add them there.
- With S3-compatible storage, allow range requests in the bucket's CORS rule (see
  [object-storage.md](../integrations/object-storage.md)).
- See [video.md](video.md).

### 2026-10-21: server-side video export (opt-in)

- New settings `SERVER_VIDEO_EXPORT_ENABLED` (off) and `EXPORT_VIDEO_*`; see
  [image-export.md](image-export.md#video).
- **Without Docker:** `deploy/nginx.conf` waits 330 s (was 120 s) for the image export endpoint and for `/mcp`.
  Copy it again, keeping your own edits; a proxy of your own needs the same for video export.

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
