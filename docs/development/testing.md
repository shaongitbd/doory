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

### UI language tests

The unit-test setup fixes the default instance to English. Use `createUiI18n()` and `I18nextProvider` (or the
test render helpers' `i18nInstance` option) for isolated German or fallback tests. Initializing a preference
controller with `getLanguagePreferences(instance).init()` returns a disposer; always call it when a test ends.
Control browser languages explicitly instead of depending on the host machine.

`i18n/resources.test.ts` checks semantic key coverage, named parameters, language-specific plural categories
and unchanged English source wording. Test zero, one and multiple counts, formatting, missing translations
and English fallback when adding dynamic messages. Keep catalog fixtures isolated from the runtime instance.

`editor/language.test.tsx` protects document and canvas identity, dirty state, selection, history and live
collaboration. It uses controlled timers and a settled baseline to distinguish existing user saves from
language-switch side effects. Preserve that distinction when expanding coverage.

Run the browser coverage with `cd frontend && npm run e2e:editor -- language.spec.ts`. It checks German browser
detection, explicit preferences across reloads, guest/view-only access, focus, desktop/mobile layout, high
contrast and focused axe scans. Existing editor suites continue using English. Run `make test`, `make lint`,
`npm run build` and `npm run bundle:check` (the last two in `frontend/`) before finishing a translation PR.

### Suites

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
should be, `latest`. It builds amd64 and arm64 and runs no tests, so test the commit first. With a version it
also tags the commit `v<version>` and publishes a GitHub release with the pull commands and the merged pull
requests; a version that is already released is refused before anything is built.
