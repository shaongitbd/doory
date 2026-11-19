import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import * as appRouter from '@/app/router'
import { activateLocale } from '@/i18n/catalog'
import { LOCALE_KEY, setLocale } from '@/i18n/locale'
import zhCN from '@/i18n/zh-CN.json'
import zhTW from '@/i18n/zh-TW.json'
import { resetClientState } from '@/lib/api'
import { makeConfig, makeUser } from '@/test/factories'
import { server } from '@/test/msw'
import App from './App'

let router: ReturnType<typeof appRouter.createAppRouter> | undefined

beforeAll(async () => {
  await Promise.all([
    import('@/pages/dashboard/SettingsPage'),
    import('@/features/dashboard/DashboardLayout'),
    import('@/pages/auth/LoginPage'),
  ])
}, 120_000)

beforeEach(() => {
  resetClientState()
  setLocale('en')
  window.scrollTo = vi.fn()
  server.use(
    http.get('*/api/v1/auth/me/', () => HttpResponse.json({ user: makeUser() })),
    http.get('*/api/v1/config/', () => HttpResponse.json(makeConfig())),
    http.get('*/api/v1/auth/tokens/', () => HttpResponse.json([])),
    http.get('*/api/v1/auth/tokens/scopes/', () => HttpResponse.json([])),
    http.get('*/api/v1/folders/', () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
    http.get('*/api/v1/assets/usage/', () => HttpResponse.json({ used_bytes: 0, quota_bytes: 1000 })),
  )
})

afterEach(() => {
  cleanup()
  router?.dispose()
  setLocale('en')
  localStorage.removeItem(LOCALE_KEY)
  vi.restoreAllMocks()
})

function mount(path: string) {
  window.history.replaceState(null, '', path)
  const create = vi.spyOn(appRouter, 'createAppRouter')
  render(<App />)
  router = create.mock.results[0].value
}

it('updates routed settings and layout labels without losing an unsaved profile name or focus', async () => {
  mount('/settings')
  const input = await screen.findByLabelText('Display name')
  fireEvent.change(input, { target: { value: 'Unsaved profile name' } })
  input.focus()

  for (const [locale, catalog] of [['zh-CN', zhCN], ['zh-TW', zhTW]] as const) {
    await act(() => activateLocale(locale))
    expect(screen.getByLabelText(catalog['app.Display name'])).toBe(input)
    expect(input).toHaveValue('Unsaved profile name')
    expect(input).toHaveFocus()
    expect(screen.getByRole('heading', { name: catalog['app.Settings'], level: 1 })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: catalog['app.Trash'] })).toHaveLength(2)
  }

  await act(() => activateLocale('en'))
  expect(screen.getByLabelText('Display name')).toBe(input)
  expect(input).toHaveValue('Unsaved profile name')
  expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
})

it('updates a nested auth route without resetting its draft or navigating', async () => {
  server.use(http.get('*/api/v1/auth/me/', () => HttpResponse.json({ user: null })))
  mount('/login?next=%2Fdashboard')
  const input = await screen.findByRole('textbox', { name: /Email/ })
  fireEvent.change(input, { target: { value: 'draft@example.test' } })

  await act(() => activateLocale('zh-CN'))
  expect(screen.getByRole('textbox', { name: new RegExp(zhCN['app.Email']) })).toBe(input)
  expect(input).toHaveValue('draft@example.test')
  expect(screen.getByRole('heading', { name: zhCN['app.Welcome back'] })).toBeInTheDocument()
  expect(window.location.pathname + window.location.search).toBe('/login?next=%2Fdashboard')
})
