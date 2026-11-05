# Development

## Requirements

- Python 3.12
- Node.js 22. Newer versions can make some frontend tests fail.
- Optional: Docker, for PostgreSQL and Redis (`docker-compose.dev.yml`)
- Optional: Playwright's Chromium, for server-side export and the end-to-end tests

## Set up and run

```bash
make setup     # virtualenv in backend/.venv, dependencies, backend/.env, local SQLite database
make dev-api   # API on http://localhost:8000 (also serves WebSockets)
make dev-web   # app on http://localhost:5173, in a second terminal; proxies /api and /ws to the API
```

To reuse an existing virtualenv: `make <target> PY=/path/to/venv/bin/python`.

The local settings are in `backend/.env`, created from [`backend/.env.example`](../../backend/.env.example).
Every setting is described in [configuration.md](../self-hosting/configuration.md).

## Make targets

| Target | What it does |
|--------|--------------|
| `make help` | List the targets |
| `make setup` | Install dependencies and prepare the local database |
| `make dev-api`, `make dev-web` | Run the API and the frontend |
| `make migrate` | Apply migrations |
| `make content` | Install the first-run content (templates, elements, fonts, model, audio); downloads, takes minutes |
| `make seed ADMIN_PASSWORD=…` | `content`, plus an admin account (`ADMIN_EMAIL`, default `admin@doory.local`) |
| `make test` | Backend and frontend unit tests ([testing.md](testing.md)) |
| `make lint` | Ruff, TypeScript, ESLint and `docs-check` |
| `make fmt` | Format the backend code |
| `make docs-check` | Check that every setting is documented in configuration.md |
| `make docker-up`, `make docker-down` | Start and stop the full Docker stack |

## Optional local services

```bash
docker compose -f docker-compose.dev.yml up -d                    # PostgreSQL
docker compose -f docker-compose.dev.yml --profile redis up -d    # and Redis
```

Then set `DATABASE_URL` (and `REDIS_URL`) in `backend/.env`.

## Translating the interface

UI translations live in `frontend/src/i18n/locales/<language>/<namespace>.json`. English is the source language;
German is the first additional language. The runtime and migration boundary are described in
[architecture.md](architecture.md#ui-internationalization).

- Reuse English wording and semantic groups from `editor/strings.ts` and its related modules. Start with
  `common` for shared language controls and `editor` for editor UI. Add namespaces when their surfaces migrate.
- Translate in subscribed components with `useTranslation(namespace)`. Rebuild localized option arrays and
  include translation dependencies in memoized values and callbacks. Never change component keys or restart
  an editor to update labels. Registered labels captured at startup need an explicit display-time migration.
- Add complete messages with named parameters such as `{{language}}`. Use i18next plural categories with
  `count`, and `{{count, number}}` for a formatted count. Do not assume that future languages have two plural
  forms. Use the appropriate `Intl` API for other number, date, time and list displays; keep parsing and stored
  values independent of formatting.
- Review German word order, grammatical gender, noun capitalization and longer compound labels in context.
  Translate tooltips, accessible names and announcements with their visible controls. Keep language names
  recognizable as English and Deutsch.
- Translate only UI. Templates, starter text, canvas content, titles, names, notes, comments and other stored
  design values remain verbatim. Backend/provider messages can remain English. Never use user content as a
  translation key or render interpolated values as HTML.
- Preserve legacy string fields while other consumers need them; remove a field only after its UI consumers
  migrate and any content uses have been separated. Do not make the legacy dictionary mutable.
- Write comments and technical documentation in clear English. Explain non-obvious lifecycle, fallback and
  content-isolation decisions briefly, rather than narrating the code. Add the relevant
  [language tests](testing.md#ui-language-tests) in the same change.

## Next

- [architecture.md](architecture.md): how the code is organised
- [testing.md](testing.md): unit and end-to-end tests
- [CONTRIBUTING.md](../../CONTRIBUTING.md): pull requests and documentation rules
- [AGENTS.md](../../AGENTS.md): instructions for AI coding agents (`CLAUDE.md` loads the same file)
