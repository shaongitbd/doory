# Install without Docker

These steps set up Doory on Debian 12 or Ubuntu 24.04 with nginx and systemd, using the files in
[`deploy/`](../../deploy). The code goes in `/opt/doory`, but you can change the paths. You need Python 3.12,
Node.js 22 (only to build the web app) and PostgreSQL.

For what each part does, see the [overview](README.md).

## 1. Packages, a user and the code

```bash
sudo apt install python3 python3-venv postgresql nginx git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install nodejs
sudo useradd --system --create-home --home-dir /var/lib/doory --shell /usr/sbin/nologin doory
sudo mkdir /opt/doory && sudo chown doory:doory /opt/doory
sudo -u doory git clone https://github.com/shaongitbd/doory /opt/doory
```

## 2. The database

```bash
sudo -u postgres createuser doory --pwprompt     # pick a password of letters and digits
sudo -u postgres createdb doory --owner doory
```

## 3. The API

```bash
cd /opt/doory/backend
sudo -u doory python3 -m venv .venv
sudo -u doory .venv/bin/pip install -r requirements.txt
sudo -u doory nano .env                          # paste the settings below
```

```ini
DJANGO_SECRET_KEY=           # openssl rand -base64 48
SITE_URL=https://design.example.com
DJANGO_ALLOWED_HOSTS=design.example.com    # add the server's IP to try it by address
DATABASE_URL=postgres://doory:YOUR_PASSWORD@127.0.0.1:5432/doory
CACHE_URL=dbcache://doory_cache
MEDIA_ROOT=/opt/doory/media
# Plain http:// while you try it out; remove both lines once HTTPS works.
SECURE_SSL_REDIRECT=false
SECURE_COOKIES=false
```

The full list of settings is in [configuration.md](configuration.md).

Then set up the database and add an admin account:

```bash
manage() { sudo -u doory .venv/bin/python manage.py "$@" --settings=doory.settings.prod; }
manage migrate
manage createcachetable
manage collectstatic --noinput
manage createsuperuser
```

Use the `manage` helper for every other command in these docs. For example, the starter content in
[content.md](content.md) is `manage seed_gallery`, `manage sync_fonts --popular 100`, and so on.

## 4. The web app

```bash
cd /opt/doory/frontend
sudo -u doory npm ci && sudo -u doory npm run build    # writes frontend/dist
```

## 5. Start everything

```bash
sudo cp /opt/doory/deploy/doory-api.service /opt/doory/deploy/doory-realtime.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now doory-api doory-realtime
sudo cp /opt/doory/deploy/nginx.conf /etc/nginx/conf.d/doory.conf    # set server_name in it
sudo rm -f /etc/nginx/sites-enabled/default
sudo -u doory mkdir -p /opt/doory/media       # uploads; nginx serves them from here
sudo nginx -t && sudo systemctl reload nginx
```

To use the MCP server as well, see [mcp.md](mcp.md).
For the reference AI server (self-hosted background removal), see [ai-providers.md](ai-providers.md).

## 6. HTTPS

```bash
sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx
```

Then remove the two `SECURE_` lines from `.env` and run `sudo systemctl restart doory-api doory-realtime`
(and `doory-mcp` or `doory-ai-server` if you use them).

## Optional: server-side export

Server-side PDF and image export needs a headless Chromium:

```bash
cd /opt/doory/backend
sudo .venv/bin/playwright install-deps chromium
sudo -u doory .venv/bin/playwright install chromium
```

If you don't install it, set `SERVER_PDF_ENABLED=false` in `.env`. See [image-export.md](image-export.md).

## Optional: video clips

Video clips (uploads and stock videos) need ffmpeg:

```bash
sudo apt install ffmpeg
```

Without it, the server takes no video. See [video.md](video.md).

## Updating

See [upgrading.md](upgrading.md).
