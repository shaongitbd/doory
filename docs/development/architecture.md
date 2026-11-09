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
| `i18n/` | UI translation resources, the i18next instance and browser-local language preference |
| `ui/`, `lib/`, `styles/` | Shared components, helpers and styles |
| `i18n/` | Browser locale selection and lazily loaded English/Chinese UI catalogs; see [frontend language catalogs](i18n.md) |

Besides `index.html`, the frontend builds two more entry pages: `presenter-view.html` (the second presenter
window) and `render.html` (server-side image export).

### UI internationalization

`i18n/instance.ts` creates an i18next instance with local English and German resources. English is the default
and fallback. The small `common` and `editor` catalogs are bundled for both languages, so a language change
cannot suspend a mounted editor. Settings and editor route boundaries load `UiLanguageProvider` with their
UI, keeping the runtime out of the initial public-page bundle. Split catalogs further before substantially
expanding editor translations; preserve the readiness boundary rather than suspending an active canvas.

The translated route boundaries and development editor harness initialize `i18n/preferences.ts` before rendering. An explicit
browser-local choice wins over the ordered browser language list; unsupported languages fall back to English.
Regional variants use the base language. Following the browser removes the override rather than storing the
detected language. Blocked storage keeps the choice in memory for the session. Storage and `languagechange`
listeners follow other tabs and the browser; initialization is idempotent and returns a disposer.

`UiLanguageProvider` supplies a stable translation instance and respects an outer isolated test instance. Components
subscribe through `useTranslation`. Preference controls use the stable instance from the provider context,
because the translation hook may return a different wrapper after a language change. The preference module
updates `<html lang>` and translations without touching editor stores, history, persistence or collaboration.
The language dialog uses local React state and preserves the mounted editor and canvas.

Translation coverage is incremental: the language controls, View menu and save/live indicators are translated.
Other settings cards, File/Share menus, panels, toolbars and the presenter window remain English. View command
labels are resolved during render using the existing label override; registry identities and registrations
stay unchanged. A later migration must add optional translation metadata for every registry consumer while
retaining literal labels for extensions, without re-registering commands on language changes.

The original editor string modules remain the source for migration and a compatibility API for remaining
consumers. They also contain starter text and object names: do not change them globally or translate all their
values mechanically. UI localization excludes templates, starter content and every stored design value.
Backend messages, headless rendering, machine-readable values and document text direction are unaffected.
See [the translation contributor guidance](README.md#translating-the-interface) and [testing](testing.md#ui-language-tests).

## Requests in development

`make dev-web` runs Vite on :5173 and forwards `/api`, `/ws`, `/media`, `/admin` and `/static` to `make dev-api`
on :8000. In production nginx does the same (`deploy/nginx.conf`, `frontend/nginx.conf`).
