# Troubleshooting

Problems specific to one part are on that part's page: [realtime](realtime.md#troubleshooting),
[MCP](mcp.md#troubleshooting), [server-side export](image-export.md#troubleshooting).

## Where the logs are

- Docker: `docker compose logs -f api realtime web` (and `mcp`). Set `LOG_LEVEL=DEBUG` for more detail.
- Without Docker: `journalctl -u doory-api -u doory-realtime -f`, and `/var/log/nginx/error.log`.

## Common problems

**The stack doesn't start, with "Set DJANGO_SECRET_KEY in .env" (or `POSTGRES_PASSWORD`, `SITE_URL`).**
Set these in `.env`; see [Required](configuration.md#required).

**The API is "unhealthy" for minutes on the first start.**
The `DOORY_SYNC_*` downloads run before it starts serving. Wait, or turn them off and run the commands by hand
([content.md](content.md)).

**"Bad Request (400)".**
The host name isn't in `DJANGO_ALLOWED_HOSTS`.

**"CSRF verification failed", or you can't stay signed in.**
`SITE_URL` must match the address in the browser exactly, including `https://`. When you only try Doory on your
own machine over plain http, set `SECURE_COOKIES=false` and `SECURE_SSL_REDIRECT=false`. Don't do this on a public
server: set up HTTPS instead ([docker.md](docker.md#https)).

**Everyone hits the rate limit or the login lockout at once.**
The limits key on the client address that nginx sees. If your TLS proxy has a public address, nginx doesn't trust
its `X-Forwarded-For` and every request looks like it comes from the proxy. Add `set_real_ip_from <proxy address>;`
to the nginx config (`frontend/nginx.conf` for Docker, then `docker compose up -d --build web`;
`deploy/nginx.conf` without it).

**Endless redirects.**
`SECURE_SSL_REDIRECT=true`, but the proxy in front doesn't send `X-Forwarded-Proto: https`.

**Emails don't arrive.**
Without `EMAIL_URL` they're printed to the API log. See [email.md](../integrations/email.md).

**No icons, fonts or templates.**
A new site starts empty; see [content.md](content.md).

**Stock photo tabs are missing.**
A provider only appears when its key is set; see [stock-media.md](../integrations/stock-media.md).

**Uploads fail with "quota".**
Each user gets `USER_STORAGE_QUOTA_BYTES` (2 GB by default).

## Checking a setting

Print the value the API actually uses:

```bash
docker compose exec api python manage.py shell -c "from django.conf import settings; print(settings.SITE_URL)"
```
