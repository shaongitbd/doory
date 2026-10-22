# Architecture

## Overview

```
frontend/  React 19 + TypeScript + Vite. The editor draws with Fabric.js; live co-editing uses Yjs.
backend/   Django + Django REST Framework, served three ways:
             doory/wsgi.py      API and admin (gunicorn)          → /api/v1/, /admin/
             doory/asgi.py      realtime WebSockets (uvicorn)     → /ws/
             doory/mcp_asgi.py  MCP server (uvicorn)              → /mcp
deploy/    nginx config and systemd units for installs without Docker
```

All three backend entry points share the same code, settings and database. See the
[self-hosting overview](../self-hosting/README.md) for how they're deployed.

## Backend apps (`backend/apps/`)

| App | What it holds |
|-----|---------------|
| `accounts` | Users, sign-up and sign-in, email confirmation, Google sign-in |
| `ai` | AI image providers: API styles, the network policy for outgoing calls, encrypted keys, quotas (`reencrypt_ai_secrets`) |
| `apitokens` | Personal access tokens and their permissions (used by MCP) |
| `assets` | Uploads, per-user storage quota, stock photos, videos and sounds, video clips (`video.py` runs ffprobe/ffmpeg, `video_jobs.py` converts in the background), the audio library (`sync_audio`) |
| `brand` | Brand kits: colours, fonts, logos |
| `collab` | Realtime co-editing: rooms, Yjs updates, snapshots, presence (`collab_maintenance`) |
| `core` | Site-wide config endpoint, background-removal models (`sync_models`) |
| `designs` | Designs, folders, trash (`purge_trash`), version history |
| `elements` | Element library: shapes, icons, emoji, illustrations (`seed_elements`, `sync_element_packs`) |
| `exports` | Server-side PDF, image and SVG export with headless Chromium (`purge_exports`); image optimizers (built-in, TinyPNG, Kraken.io, custom) and the optimize endpoint for browser downloads |
| `fonts` | Font catalogue and user fonts (`sync_fonts`) |
| `gallery` | Templates and categories (`seed_gallery`, `seed_templates`, `import_template`) |
| `mcp` | The MCP server: tools, resources, prompts, token authentication |
| `presets` | Size presets (`seed_size_presets`, `import_size_presets`) |
| `sharing` | Share links, passwords, comments |

Settings are in `backend/doory/settings/` (`base.py`, plus `dev.py`, `prod.py` and `test.py`). Every setting
read from the environment must have a row in [configuration.md](../self-hosting/configuration.md).

## Frontend (`frontend/src/`)

| Folder | What it holds |
|--------|---------------|
| `app/` | App shell, routing, providers |
| `pages/` | Route-level pages |
| `features/` | Non-editor features: auth, dashboard, templates, settings, brand, uploads, … |
| `editor/` | The editor: `engine/` (drawing), `panels/`, `toolbar/`, `collab/`, `animation/`, `clips/` (video clips: timing, sources, sound), `presenter/`, `headless/` (the render page used by server-side image export), … |
| `ui/`, `lib/`, `styles/` | Shared components, helpers and styles |

Besides `index.html`, the frontend builds two more entry pages: `presenter-view.html` (the second presenter
window) and `render.html` (server-side image export).

## Requests in development

`make dev-web` runs Vite on :5173 and forwards `/api`, `/ws`, `/media`, `/admin` and `/static` to `make dev-api`
on :8000. In production nginx does the same (`deploy/nginx.conf`, `frontend/nginx.conf`).
