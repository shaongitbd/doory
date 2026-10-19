# Install with Docker

You need Docker with the Compose plugin.

```bash
git clone https://github.com/shaongitbd/doory && cd doory
cp .env.example .env     # set DJANGO_SECRET_KEY (openssl rand -base64 48) and POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec api python manage.py createsuperuser   # your admin account; nothing creates one for you
```

Open <http://localhost:8080>. The `web` container serves the app and forwards `/api`, `/ws` and `/mcp` to the
backend.

A new site has no content yet. Add it next: see [content.md](content.md).

## Services

| Service | Starts | Notes |
|---------|--------|-------|
| `db` | always | PostgreSQL 16, data in the `pgdata` volume |
| `api` | always | Runs migrations and `collectstatic` on start, then gunicorn. Uploads go in the `media` volume, exports in `exports` |
| `realtime` | always | Live co-editing (uvicorn). Settings: `REALTIME_WORKERS`, `REALTIME_MEM_LIMIT` |
| `web` | always | nginx with the built frontend, published on `WEB_BIND:WEB_PORT` |
| `mcp` | with `COMPOSE_PROFILES=mcp` | See [mcp.md](mcp.md) |
| `redis` | with `COMPOSE_PROFILES=redis` | See [realtime.md](realtime.md) |

To start optional services, set the profiles in `.env`, e.g. `COMPOSE_PROFILES=mcp,redis`, then
`docker compose up -d`.

## Pre-built images

Instead of building, you can pull the published images (amd64 and arm64):

- `ghcr.io/shaongitbd/doory-backend` for `api`, `realtime` and `mcp`. It includes the headless Chromium that
  server-side export needs.
- `ghcr.io/shaongitbd/doory-frontend` for `web`.

Tags are a version (the first is `0.1.0`), `latest`, and `sha-<commit>`. Pin a version. To use them, put
this in a `docker-compose.override.yml` next to `docker-compose.yml`:

```yaml
services:
  api:
    image: ghcr.io/shaongitbd/doory-backend:0.1.0
    pull_policy: always
  realtime:
    image: ghcr.io/shaongitbd/doory-backend:0.1.0
    pull_policy: always
  mcp:
    image: ghcr.io/shaongitbd/doory-backend:0.1.0
    pull_policy: always
  web:
    image: ghcr.io/shaongitbd/doory-frontend:0.1.0
    pull_policy: always
```

Then `docker compose pull && docker compose up -d`. To upgrade, change the version and run the same commands.
Tools that can only pull (some NAS and container managers) need a copy of `docker-compose.yml` with the
`build:` blocks replaced by these `image:` lines.

## HTTPS

The stack serves plain HTTP. Put it behind a reverse proxy that handles TLS (a web server with a TLS
certificate, or a load balancer), then:

1. Set `WEB_BIND=127.0.0.1` if the proxy runs on the same host.
2. Set `SITE_URL=https://your-domain` and `DJANGO_ALLOWED_HOSTS=your-domain`.
3. Set `SECURE_SSL_REDIRECT=true` and `SECURE_COOKIES=true`.
4. If the proxy reaches nginx from a public address (not a private network or the same host), add
   `set_real_ip_from <proxy address>;` to `frontend/nginx.conf`. Otherwise rate limits and the login lockout
   count every user as the proxy.
5. Make sure the proxy forwards WebSockets on `/ws/`.

Then run `docker compose up -d` to apply the changes. `frontend/nginx.conf` is built into the `web` image, so
after changing it run `docker compose up -d --build web`.

## Running commands

Run any `manage.py` command through the `api` service:

```bash
docker compose exec api python manage.py <command>
```

Logs: `docker compose logs -f api realtime web`.

## Your own size presets file

Mount the file into the `api` container (there's a commented-out line in `docker-compose.yml`), then set
`DOORY_SIZE_PRESETS_FILE` to its path inside the container. See [content.md](content.md#size-presets).
