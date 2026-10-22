# Self-hosting overview

## The parts

| Part | What it is | Docker service | Without Docker | Needed |
|------|------------|----------------|----------------|--------|
| Web app | The built frontend (static files). nginx serves it and forwards `/api`, `/ws`, `/mcp`, `/admin` and `/media` | `web` | nginx + `deploy/nginx.conf` | Yes |
| API | Django REST API, the admin site, server-side export | `api` | `doory-api.service` (gunicorn) | Yes |
| Realtime | WebSockets for live co-editing (the same code, run by uvicorn) | `realtime` | `doory-realtime.service` | Yes, unless `REALTIME_ENABLED=false` |
| MCP | Model Context Protocol server for AI assistants | `mcp` (profile `mcp`) | `doory-mcp.service` | No, see [mcp.md](mcp.md) |
| Database | PostgreSQL 16 (SQLite works for development only) | `db` | your PostgreSQL | Yes |
| Cache | Shared cache for rate limits and stock search results | the database (`dbcache`) | the database (`dbcache`) | Yes in production |
| Redis | Channel layer for running realtime on more than one worker | `redis` (profile `redis`) | your Redis | No, see [realtime.md](realtime.md) |
| Chromium | Headless browser for server-side PDF and image export | inside the `api` and `mcp` images | Playwright's Chromium | No, see [image-export.md](image-export.md) |
| ffmpeg | Checks and converts video clips | inside the `api`, `realtime` and `mcp` images | the `ffmpeg` package | No, see [video.md](video.md) |
| Media storage | Uploads, fonts, element packs, audio, models | `media` volume | `MEDIA_ROOT` | Yes (local folder or [S3-compatible](../integrations/object-storage.md)) |

```
browser ──► web (nginx) ─┬─ /api, /admin ─► api ──────┐
                         ├─ /ws ──────────► realtime ─┼─► PostgreSQL, media, (Redis)
                         ├─ /mcp ─────────► mcp ──────┘
                         └─ /, /assets, /media (static files)
```

The browser only ever talks to one address, so you don't need CORS or extra subdomains.

## Choose how to install

- **[Docker](docker.md):** the quickest way, with every part in `docker-compose.yml`.
- **[Without Docker](manual.md):** Debian or Ubuntu with systemd and nginx, using the files in [`deploy/`](../../deploy).

Either way, next:

1. Go through [configuration.md](configuration.md), at least the *Required* and *HTTPS* sections.
2. Add the starter content: [content.md](content.md).
3. Set up the outside services you want: [email](../integrations/email.md), [stock photos](../integrations/stock-media.md), etc.
4. Plan backups: [backup.md](backup.md).

## The admin site

The admin site is at `/admin/` on your domain. Only staff accounts can open it; accounts that only signed up on the
site can't. There you manage templates and their categories, users, designs, uploads, fonts, element packs, audio
and size presets.

| To | Run (Docker) |
|----|--------------|
| Make an admin account | `docker compose exec api python manage.py createsuperuser` |
| Reset an admin's password | `docker compose exec api python manage.py changepassword you@example.com` |
| Make an existing account an admin | `docker compose exec api python manage.py shell -c "from django.contrib.auth import get_user_model as g; u = g().objects.get(email='you@example.com'); u.is_staff = u.is_superuser = True; u.save()"` |

Without Docker, run the same commands with the `manage` helper from [manual.md](manual.md).

## Scheduled tasks

Nothing runs these for you. Add them to cron (or a systemd timer) on the host:

| Command | What it does | Suggested |
|---------|--------------|-----------|
| `manage.py purge_trash` | Permanently deletes designs that have been in the trash for more than 30 days (`--days N` to change) | daily |
| `manage.py collab_maintenance` | Saves live edits left behind after a crash, compacts update logs, removes stale presence entries | daily |
| `manage.py purge_exports` | Deletes server-side exports whose download link has expired | hourly, optional |
| `manage.py sweep_video_jobs` | Marks video conversions whose process was stopped as failed and removes the temporary folders they left | hourly, optional |

Docker example (crontab on the host, run from the checkout):

```cron
0 3 * * * cd /opt/doory && docker compose exec -T api python manage.py purge_trash
15 3 * * * cd /opt/doory && docker compose exec -T api python manage.py collab_maintenance
```
