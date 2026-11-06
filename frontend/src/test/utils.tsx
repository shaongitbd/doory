import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { i18n as I18n } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { createUiI18n } from '@/i18n/instance'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '@/ui/ToastProvider'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
}

/** Renders with Query + Router + Toast providers (no auth). */
export function renderWithProviders(ui: ReactElement, options: { route?: string; client?: QueryClient; i18nInstance?: I18n } & Omit<RenderOptions, 'wrapper'> = {}) {
  const { route = '/', client = createTestQueryClient(), i18nInstance = createUiI18n(), ...rest } = options
  return {
    client,
    ...render(
      <I18nextProvider i18n={i18nInstance}>
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>
      </I18nextProvider>,
      rest,
    ),
  }
}

export interface CapturedRequest {
  url: URL
  method: string
  headers: Headers
  body: BodyInit | null | undefined
}

/**
 * Replaces `fetch` with a recorder. Use for multipart requests: jsdom's FormData cannot be read back through
 * MSW (which runs on Node's fetch), so the body is inspected directly.
 */
export function captureFetch(respond: (request: CapturedRequest) => Response | Promise<Response>): CapturedRequest[] {
  const calls: CapturedRequest[] = []
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init: RequestInit = {}) => {
    const request: CapturedRequest = {
      url: new URL(String(input), 'http://localhost:3000'),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body,
    }
    calls.push(request)
    return Promise.resolve().then(() => respond(request))
  })
  return calls
}
