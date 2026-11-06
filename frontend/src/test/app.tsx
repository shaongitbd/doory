import { QueryClient } from '@tanstack/react-query'
import type { i18n as I18n } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { createUiI18n } from '@/i18n/instance'
import { render } from '@testing-library/react'
import { http, HttpResponse, type RequestHandler } from 'msw'
import { RouterProvider } from 'react-router-dom'
import { AppProviders } from '@/app/AppProviders'
import { createTestRouter } from '@/app/router'
import { resetClientState } from '@/lib/api'
import type { ApiUser, AppConfig } from '@/types/api'
import { makeConfig } from './factories'
import { server } from './msw'
import { createTestQueryClient } from './utils'

export interface AppHarnessOptions {
  /** Signed-in user, or null/undefined for an anonymous visitor. */
  user?: ApiUser | null
  config?: AppConfig
  client?: QueryClient
  i18nInstance?: I18n
  /** Test-specific handlers; they take priority over the defaults below. */
  handlers?: RequestHandler[]
}

/**
 * The route table loads every page with `lazy(() => import(...))`. The first render of a route would otherwise
 * wait for vitest to transform that page and everything it imports, which takes longer than a `findBy` waits when
 * the machine is busy. Importing the pages once, before the first test of a file, turns that wait into an
 * explicit step with its own budget instead of a race with the 1 s of every assertion that follows.
 */
const pageModules = import.meta.glob(['/src/pages/**/*Page.tsx', '/src/features/dashboard/DashboardLayout.tsx'])
const PRELOAD_TIMEOUT_MS = 120_000
beforeAll(async () => {
  await Promise.all(Object.values(pageModules).map((load) => load()))
  // The first request through MSW sets up its interceptors; take that cost here as well, not in a test.
  server.use(http.get('*/api/v1/warm-up/', () => HttpResponse.json({ ok: true })))
  await fetch(`${window.location.origin}/api/v1/warm-up/`)
  server.resetHandlers()
}, PRELOAD_TIMEOUT_MS)

const empty = () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })

/** Harmless defaults so pages that list things render an empty state instead of failing. */
const defaultHandlers: RequestHandler[] = [
  http.get('*/api/v1/designs/', empty),
  http.get('*/api/v1/folders/', empty),
  http.get('*/api/v1/templates/', empty),
  http.get('*/api/v1/template-categories/', () => HttpResponse.json([])),
  http.get('*/api/v1/assets/', empty),
  http.get('*/api/v1/assets/usage/', () => HttpResponse.json({ used_bytes: 0, quota_bytes: 1000 })),
  http.get('*/api/v1/brand-kits/', () => HttpResponse.json([])),
  http.get('*/api/v1/fonts/', empty),
  http.get('*/api/v1/fonts/mine/', empty),
  http.get('*/api/v1/auth/tokens/', () => HttpResponse.json([])),
  http.get('*/api/v1/auth/tokens/scopes/', () => HttpResponse.json([])),
]

/** Renders the real route table inside the real providers, with `/auth/me/` and `/config/` stubbed. */
export function renderApp(route: string, options: AppHarnessOptions = {}) {
  window.scrollTo = vi.fn()
  resetClientState()
  document.cookie = 'csrftoken=test-token; path=/'
  let currentUser = options.user ?? null
  server.use(
    ...(options.handlers ?? []),
    http.get('*/api/v1/auth/me/', () => HttpResponse.json({ user: currentUser })),
    http.get('*/api/v1/config/', () => HttpResponse.json(options.config ?? makeConfig())),
    ...defaultHandlers,
  )
  const router = createTestRouter([route])
  const client = options.client ?? createTestQueryClient()
  const utils = render(
    <I18nextProvider i18n={options.i18nInstance ?? createUiI18n()}>
      <AppProviders client={client}>
        <RouterProvider router={router} />
      </AppProviders>
    </I18nextProvider>,
  )
  return {
    ...utils,
    router,
    client,
    setUser(next: ApiUser | null) {
      currentUser = next
    },
  }
}
