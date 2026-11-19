import { defineConfig, devices } from '@playwright/test'

const WEB = Number(process.env.E2E_PRINT_PORT ?? 5430)
const API = Number(process.env.E2E_PRINT_API_PORT ?? 8130)
const RENDER = Number(process.env.E2E_PRINT_RENDER_PORT ?? 5431)
// The helpers shared with the co-editing specs (e2e/collab/helpers.ts) read their web port from this variable.
process.env.E2E_COLLAB_PORT = String(WEB)

/**
 * Print-quality PDF against the real backend: Django (SQLite, started by the co-editing specs' `api-server.mjs`) with its
 * headless Chromium print worker, and the Vite dev server. The downloaded file is read with pypdf, so `DOORY_PYTHON` must
 * name an interpreter with the backend requirements (default `backend/.venv/bin/python`). `PW_CHROMIUM` (default
 * `/opt/pw-browsers/chromium`) is the browser of the test and of the print worker. `npm run e2e:print`
 * ("Export" > Tests).
 */
const CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: './e2e/editor',
  testMatch: 'print-stack.spec.ts',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
    launchOptions: { executablePath: CHROMIUM },
  },
  webServer: [
    {
      command: 'node e2e/collab/api-server.mjs',
      url: `http://127.0.0.1:${API}/api/v1/health/`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        E2E_COLLAB_API_PORT: String(API),
        E2E_COLLAB_PORT: String(WEB),
        SERVER_PDF_ENABLED: 'true',
        EXPORT_RENDER_PAGE_URL: `http://localhost:${RENDER}/render.html`,
        EXPORT_CHROMIUM_PATH: CHROMIUM,
        // The sandbox needs more than a container running as root offers; the print worker is still process-isolated.
        EXPORT_CHROMIUM_NO_SANDBOX: 'true',
        EXPORT_WORK_DIR: process.env.EXPORT_WORK_DIR ?? '/tmp/doory-print-e2e',
      },
    },
    {
      command: `npx vite --port ${WEB} --strictPort`,
      url: `http://localhost:${WEB}/`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { VITE_API_PROXY: `http://127.0.0.1:${API}`, VITE_E2E: 'true' },
    },
    {
      // The render worker accepts the built /assets/ bundle, not Vite's development module URLs.
      command: `npm run build && npx vite preview --port ${RENDER} --strictPort`,
      url: `http://localhost:${RENDER}/render.html`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})
