import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { AppProviders } from '@/app/AppProviders'
import { createBlankDocument } from '@/lib/document'
import { renderApp } from '@/test/app'
import { makeConfig, makeDesign, makeUser } from '@/test/factories'
import { server } from '@/test/msw'
import { createTestQueryClient } from '@/test/utils'
import type { EditorAppProps } from '@/types/adapter'
import { AuthModalProvider, useAuthModal } from './AuthModalProvider'

/** Stand-in for the editor, so a save can end the session while a design is open. */
vi.mock('@/editor', async () => {
  const react = await import('react')
  const EditorApp = react.forwardRef<unknown, EditorAppProps>(function FakeEditor(props, ref) {
    react.useImperativeHandle(ref, () => ({ saveNow: async () => undefined, getDocument: () => props.document, isDirty: () => false }))
    return react.createElement('button', { onClick: () => void props.adapter.save({ document: props.document, title: props.meta.title }).catch(() => undefined) }, 'fake save')
  })
  return { EditorApp }
})

const withSso = () => makeConfig({ oidc_button_label: 'Sign in with Authentik', features: { ...makeConfig().features, oidc_login: true } })
const start = (next: string) => `/api/v1/auth/oidc/start/?next=${encodeURIComponent(next)}`

describe('single sign-on on the sign-in pages', () => {
  it('offers the provider on the login page and comes back to where the user was going', async () => {
    renderApp(`/login?next=${encodeURIComponent('/design/abc')}`, { config: withSso() })
    const button = await screen.findByRole('link', { name: 'Sign in with Authentik' })
    expect(button).toHaveAttribute('href', start('/design/abc'))
    expect(screen.getByRole('separator')).toHaveTextContent('or')
  })

  it('offers it on the sign-up page too', async () => {
    renderApp('/signup', { config: withSso() })
    expect(await screen.findByRole('link', { name: 'Sign in with Authentik' })).toHaveAttribute('href', start('/dashboard'))
  })

  it('falls back to a generic label', async () => {
    renderApp('/login', { config: { ...withSso(), oidc_button_label: '' } })
    expect(await screen.findByRole('link', { name: 'Sign in with SSO' })).toBeInTheDocument()
  })

  it('is not there when the server has no provider', async () => {
    renderApp('/login', { config: makeConfig() })
    await screen.findByRole('heading', { name: 'Welcome back' })
    expect(screen.queryByRole('link', { name: /Sign in with/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  })

  it('explains what went wrong when the provider sends the user back with an error', async () => {
    renderApp('/login?sso_error=oidc_account_exists', { config: withSso() })
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email address already exists. Log in with your password, then connect single sign-on in Settings.')
  })

  it('has a generic message for codes it does not know', async () => {
    renderApp('/login?sso_error=something_new', { config: withSso() })
    expect(await screen.findByRole('alert')).toHaveTextContent('Signing in didn’t go through. Please try again.')
  })
})

function ModalProbe() {
  const { openAuthModal } = useAuthModal()
  return <button onClick={() => void openAuthModal({ reason: 'save' })}>ask</button>
}

describe('single sign-on in the sign-in dialog', () => {
  it('comes back to the page the dialog was opened on', async () => {
    server.use(
      http.get('*/api/v1/auth/me/', () => HttpResponse.json({ user: null })),
      http.get('*/api/v1/config/', () => HttpResponse.json(withSso())),
    )
    render(
      <AppProviders client={createTestQueryClient()}>
        <MemoryRouter initialEntries={['/local/l1?page=2']}>
          <AuthModalProvider>
            <ModalProbe />
          </AuthModalProvider>
        </MemoryRouter>
      </AppProviders>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'ask' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'Sign in with Authentik' })).toHaveAttribute('href', start('/local/l1?page=2'))
  })

  async function endSessionOverOpenDesign(user = makeUser()) {
    const detail = { ...makeDesign('d1', { title: 'Server design', revision: 3 }), document: createBlankDocument(1080, 1080) }
    const expired = () => HttpResponse.json({ error: { code: 'not_authenticated', message: 'Authentication credentials were not provided.' } }, { status: 401 })
    renderApp('/design/d1', {
      user,
      config: withSso(),
      handlers: [http.get('*/api/v1/designs/d1/', () => HttpResponse.json(detail)), http.patch('*/api/v1/designs/d1/', expired)],
    })
    await userEvent.click(await screen.findByRole('button', { name: 'fake save' }))
    return screen.findByRole('dialog', { name: 'Your session ended' })
  }

  it('is not offered to restore a session that ended over an open design, which it would leave', async () => {
    const dialog = await endSessionOverOpenDesign()
    expect(within(dialog).queryByRole('link', { name: 'Sign in with Authentik' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('separator')).not.toBeInTheDocument()
  })

  it('is offered there, below the password form, to an account without a password, saying that it leaves the page', async () => {
    const dialog = await endSessionOverOpenDesign(makeUser({ has_password: false, oidc_linked: true }))
    const button = within(dialog).getByRole('link', { name: 'Sign in with Authentik' })
    expect(button).toHaveAttribute('href', start('/design/d1'))
    expect(button).toHaveAccessibleDescription('This leaves the page, so changes that aren’t saved yet may be lost.')
    expect(within(dialog).getByRole('form', { name: 'Log in' }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(dialog).getByRole('separator')).toHaveTextContent('or')
  })
})
