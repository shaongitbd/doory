import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { activateLocale } from '@/i18n/catalog'
import { setLocale } from '@/i18n/locale'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '@/test/app'
import { makeConfig, makeUser } from '@/test/factories'
import type { ApiToken } from '@/types/api'
import { claudeCodeCommand } from './mcp'

const MCP_ON = makeConfig({ features: { ...makeConfig().features, mcp: true } })

const SCOPES = [
  { id: 'designs:read', description: 'See your designs.' },
  { id: 'designs:write', description: 'Change your designs.' },
  { id: 'comments:write', description: 'Comment.' },
]

function token(overrides: Partial<ApiToken> = {}): ApiToken {
  return {
    id: 't1',
    name: 'Claude Desktop',
    prefix: 'abc123',
    scopes: ['designs:read', 'designs:write'],
    created_at: '2026-01-01T00:00:00Z',
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    ...overrides,
  }
}

describe('settings: AI assistant tokens', () => {
  it.each([
    ['en', 'never', 'Never expires'],
    ['de', 'nie', 'Läuft nie ab'],
    ['zh-CN', '从未', '永不到期'],
    ['zh-TW', '從未', '永不到期'],
  ] as const)('distinguishes unused tokens from tokens without expiry in %s', async (locale, unused, expiry) => {
    await activateLocale(locale)
    try {
      renderApp('/settings', { user: makeUser(), config: MCP_ON, handlers: [
        http.get('*/api/v1/auth/tokens/', () => HttpResponse.json([token({ name: 'User {name}' })])),
      ] })
      const row = (await screen.findByText('User {name}')).closest('li')!
      expect(row).toHaveTextContent(unused)
      expect(row).toHaveTextContent(expiry)
      expect(row).toHaveTextContent('doory_abc123_…')
    } finally {
      cleanup()
      setLocale('en')
    }
  })

  it('creates a token and shows it once with the Claude Code command', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser(),
      config: MCP_ON,
      handlers: [
        http.get('*/api/v1/auth/tokens/scopes/', () => HttpResponse.json(SCOPES)),
        http.post('*/api/v1/auth/tokens/', async ({ request }) => {
          bodies.push(await request.json())
          return HttpResponse.json({ ...token({ name: 'Cursor', scopes: ['designs:read'] }), token: 'doory_abc123_secret' }, { status: 201 })
        }),
      ],
    })
    await userEvent.type(await screen.findByLabelText('Token name'), 'Cursor')
    await userEvent.click(await screen.findByLabelText('designs:write'))
    await userEvent.selectOptions(screen.getByLabelText('Expires after'), '30')
    await userEvent.type(screen.getByLabelText('Your password'), 'hunter22')
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }))
    await waitFor(() => expect(bodies).toEqual([{ name: 'Cursor', scopes: ['designs:read'], expires_in_days: 30, password: 'hunter22' }]))
    expect(await screen.findByText('doory_abc123_secret')).toBeInTheDocument()
    expect(screen.getByText(claudeCodeCommand('doory_abc123_secret'))).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Your API tokens' })).getByText(/Cursor/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('doory_abc123_secret')).not.toBeInTheDocument()
  })

  it('asks for a name and at least one permission', async () => {
    renderApp('/settings', { user: makeUser(), config: MCP_ON, handlers: [http.get('*/api/v1/auth/tokens/scopes/', () => HttpResponse.json(SCOPES))] })
    await userEvent.click(await screen.findByLabelText('designs:read'))
    await userEvent.click(screen.getByLabelText('designs:write'))
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }))
    expect(await screen.findByText('Name the token after the assistant that will use it.')).toBeInTheDocument()
    expect(screen.getByText('Choose at least one permission.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  })

  it('asks unverified accounts to confirm their email first, where email is sent', async () => {
    const config = makeConfig({ features: { ...MCP_ON.features, email_verification: true } })
    renderApp('/settings', { user: makeUser({ is_email_verified: false }), config })
    expect(await screen.findByText(/Confirm your email address to create a token/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create token' })).not.toBeInTheDocument()
  })

  it('offers no token that never expires', async () => {
    renderApp('/settings', { user: makeUser(), config: MCP_ON })
    const options = Array.from((await screen.findByLabelText('Expires after')).querySelectorAll('option')).map((option) => option.textContent)
    expect(options).not.toContain('Never')
  })

  it('asks accounts without a password for their email address', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser({ has_password: false, email: 'g@example.com' }),
      config: MCP_ON,
      handlers: [
        http.post('*/api/v1/auth/tokens/', async ({ request }) => {
          bodies.push(await request.json())
          return HttpResponse.json({ ...token(), token: 'doory_abc123_secret' }, { status: 201 })
        }),
      ],
    })
    await userEvent.type(await screen.findByLabelText('Token name'), 'Cursor')
    await userEvent.type(screen.getByLabelText('Type your email address to confirm'), 'g@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }))
    await waitFor(() => expect(bodies).toEqual([{ name: 'Cursor', scopes: ['designs:read', 'designs:write'], expires_in_days: 90, confirm_email: 'g@example.com' }]))
  })

  it('is hidden when the server has MCP turned off', async () => {
    renderApp('/settings', { user: makeUser() })
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByText('AI assistants (MCP)')).not.toBeInTheDocument()
  })

  it('lists and revokes tokens', async () => {
    let revoked = ''
    renderApp('/settings', {
      user: makeUser(),
      config: MCP_ON,
      handlers: [
        http.get('*/api/v1/auth/tokens/', () => HttpResponse.json([token()])),
        http.delete('*/api/v1/auth/tokens/:id/', ({ params }) => {
          revoked = String(params.id)
          return new HttpResponse(null, { status: 204 })
        }),
      ],
    })
    expect(await screen.findByText(/doory_abc123_…/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Revoke Claude Desktop' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(revoked).toBe('t1'))
    expect(await screen.findByText('Token revoked')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Your API tokens' })).not.toBeInTheDocument()
  })
})
