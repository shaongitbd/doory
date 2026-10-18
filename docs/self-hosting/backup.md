# Backup and restore

## What to back up

| What | Docker | Without Docker | Needed |
|------|--------|----------------|--------|
| Database | `pgdata` volume | your PostgreSQL database | Yes |
| Media (uploads, fonts, element packs, audio, models) | `media` volume | `MEDIA_ROOT` | Yes, unless you use [S3-compatible storage](../integrations/object-storage.md) |
| Settings | `.env` | `backend/.env` | Yes, and keep it secret |
| Pending exports | `exports` volume | `EXPORT_STORAGE_ROOT` | No: they expire within minutes |

Fonts, element packs, audio and models can be downloaded again ([content.md](content.md)), but uploads can't.

## Docker

```bash
# Database
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > doory-$(date +%F).dump
# Media
docker compose run --rm -v "$PWD":/backup --entrypoint tar api czf /backup/media-$(date +%F).tgz -C /app media
```

Restore into a fresh stack:

```bash
docker compose up -d db
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < doory-YYYY-MM-DD.dump
docker compose run --rm -v "$PWD":/backup --entrypoint tar api xzf /backup/media-YYYY-MM-DD.tgz -C /app
docker compose up -d
```

## Without Docker

```bash
sudo -u postgres pg_dump -Fc doory > doory-$(date +%F).dump
sudo tar czf media-$(date +%F).tgz -C /opt/doory media
```

Restore with `pg_restore -d doory --clean --if-exists` and by unpacking the archive into `/opt/doory`, then
restart the services.

## Notes

- Keep `DJANGO_SECRET_KEY` together with the backup. If it changes, everyone is signed out and existing tokens
  stop working. Stored AI provider keys can't be read either, unless `AI_SECRETS_KEY` is set (keep that one
  with the backup too).
- After restoring onto a newer version, migrations run on start (Docker) or with `manage migrate`.
