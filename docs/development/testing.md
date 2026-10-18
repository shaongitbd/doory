# Testing

## Unit tests

```bash
make test        # both suites
make test-api    # backend: pytest (backend/)
make test-web    # frontend: vitest (frontend/)
make lint        # ruff, TypeScript, ESLint, docs-check
```

- **Backend:** tests live next to the code in `backend/apps/<app>/tests/`. SQLite is the default; set
  `TEST_DATABASE_URL` to run them against PostgreSQL. The co-editing interop tests need
  `npm ci --prefix backend/apps/collab/tests/interop` once.
- **Frontend:** `*.test.ts(x)` files next to the code. Run them with Node.js 22.

### Real-Chromium export tests (backend)

Export tests that need a real browser run when `DOORY_TEST_CHROMIUM` points at a Chromium binary. On macOS, set
`EXPORT_WORK_DIR` (and `TMPDIR`) to short paths such as `/tmp/dxw`, because the default temp path is too long for
Chromium's socket. Image export tests also need the built frontend (`npm run build`).

## End-to-end tests (frontend, Playwright)

Each suite has its own config in `frontend/` and its own tests under `frontend/e2e/`:

| Command (in `frontend/`) | Suite |
|--------------------------|-------|
| `npm run e2e` | Default suite (`e2e/`) |
| `npm run e2e:editor` | Editor (`e2e/editor`) |
| `npm run e2e:app` / `e2e:app:prod` | App flows against the API (`e2e/app`), dev or production build |
| `npm run e2e:collab` | Live co-editing (`e2e/collab`) |
| `npm run e2e:comments` | Comments (`e2e/comments`) |
| `npm run e2e:print` | Print PDF export |
| `npm run e2e:bg` | Background removal |
| `npm run e2e:perf` | Performance |

Suites that need the API start it themselves (see `webServer` in each config).

## CI

`.github/workflows/ci.yml` only runs when started by hand (**Actions → CI → Run workflow**), with end-to-end
tests as an option. Run `make test` and `make lint` locally before you push.

`.github/workflows/docker-images.yml` publishes the backend and frontend images to ghcr.io, also only when a
maintainer starts it (**Actions → Docker images → Run workflow**) with a version such as `1.2.0` and, if it
should be, `latest`. It builds amd64 and arm64 and runs no tests, so test the commit first.
