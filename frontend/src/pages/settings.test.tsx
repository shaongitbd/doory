import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { CONTRAST_KEY, setContrastPreference } from '@/lib/contrast'
import { renderApp } from '@/test/app'
import { makeConfig, makeDesign, makeUser, page } from '@/test/factories'

const err = (code: string, message: string, status: number, extra: Record<string, unknown> = {}) => HttpResponse.json({ error: { code, message, ...extra } }, { status })

describe('settings: profile', () => {
  it('updates the display name', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser(),
      handlers: [
        http.patch('*/api/v1/auth/me/', async ({ request }) => {
          bodies.push(await request.json())
          return HttpResponse.json({ user: makeUser({ display_name: 'Ada B.' }) })
        }),
      ],
    })
    const input = await screen.findByLabelText('Display name')
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled()
    await userEvent.clear(input)
    await userEvent.type(input, 'Ada B.')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(bodies).toEqual([{ display_name: 'Ada B.' }]))
    expect(await screen.findByText('Name updated')).toBeInTheDocument()
  })

  it('rejects an empty name and shows server validation errors', async () => {
    renderApp('/settings', {
      user: makeUser(),
      handlers: [http.patch('*/api/v1/auth/me/', () => err('validation_error', 'Invalid input.', 400, { fields: { display_name: ['Too long.'] } }))],
    })
    const input = await screen.findByLabelText('Display name')
    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText('Enter the name you’d like to use.')).toBeInTheDocument()
    await userEvent.type(input, 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText('Too long.')).toBeInTheDocument()
  })

  it('validates avatar files before uploading and previews a valid choice', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => undefined }))
    renderApp('/settings', { user: makeUser(), config: makeConfig({ limits: { max_upload_bytes: 100, max_pages: 1, max_document_bytes: 1 } }) })
    const picker = await screen.findByLabelText('Choose a profile photo')
    await userEvent.upload(picker, new File(['x'], 'doc.pdf', { type: 'application/pdf' }), { applyAccept: false })
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a PNG, JPG or WebP image.')
    await userEvent.upload(picker, new File([new Uint8Array(500)], 'big.png', { type: 'image/png' }), { applyAccept: false })
    expect(await screen.findByRole('alert')).toHaveTextContent(/The limit is 100 B/)
    await userEvent.upload(picker, new File(['ok'], 'me.png', { type: 'image/png' }), { applyAccept: false })
    expect(await screen.findByRole('button', { name: 'Save photo' })).toBeInTheDocument()
    expect(document.querySelector('img[src="blob:preview"]')).not.toBeNull()
    vi.unstubAllGlobals()
  })

  it('removes the profile photo', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser({ avatar_url: '/media/a.png' }),
      handlers: [http.patch('*/api/v1/auth/me/', async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ user: makeUser({ avatar_url: null }) }) })],
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(bodies).toEqual([{ remove_avatar: true }]))
    expect(await screen.findByRole('button', { name: 'Upload photo' })).toBeInTheDocument()
  })
})

describe('settings: email', () => {
  it('shows verification status and can resend the email', async () => {
    let sent = 0
    renderApp('/settings', {
      user: makeUser({ is_email_verified: false }),
      config: makeConfig({ features: { stock_photos: false, server_pdf: false, google_login: false, email_verification: true } }),
      handlers: [http.post('*/api/v1/auth/email/resend/', () => { sent += 1; return new HttpResponse(null, { status: 204 }) })],
    })
    expect(await screen.findAllByText('Not verified')).not.toHaveLength(0)
    await userEvent.click(screen.getAllByRole('button', { name: 'Resend verification email' })[0])
    await waitFor(() => expect(sent).toBe(1))
    expect(await screen.findByText('Verification email sent')).toBeInTheDocument()
  })

  it('the email address is read-only', async () => {
    renderApp('/settings', { user: makeUser() })
    expect(await screen.findByLabelText('Email address')).toHaveAttribute('readonly')
    expect(screen.getByText('Verified')).toBeInTheDocument()
  })

  it('dashboard shows a verify banner only when the server sends verification emails', async () => {
    const unverified = makeUser({ is_email_verified: false })
    const on = renderApp('/dashboard', { user: unverified, config: makeConfig({ features: { stock_photos: false, server_pdf: false, google_login: false, email_verification: true } }) })
    expect(await screen.findByText('Verify your email.')).toBeInTheDocument()
    on.unmount()
    renderApp('/dashboard', { user: unverified })
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText('Verify your email.')).not.toBeInTheDocument()
  })
})

describe('settings: password', () => {
  it('changes the password using the current one', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser(),
      handlers: [http.post('*/api/v1/auth/password/change/', async ({ request }) => { bodies.push(await request.json()); return new HttpResponse(null, { status: 204 }) })],
    })
    await userEvent.type(await screen.findByLabelText('Current password'), 'old-secret')
    await userEvent.type(screen.getByLabelText(/^New password/, { selector: 'input' }), 'new-secret-123')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(bodies).toEqual([{ old_password: 'old-secret', new_password: 'new-secret-123' }]))
    expect(await screen.findByText('Password changed')).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveValue('')
  })

  it('shows a wrong-current-password error next to its field', async () => {
    renderApp('/settings', {
      user: makeUser(),
      handlers: [http.post('*/api/v1/auth/password/change/', () => err('validation_error', 'Invalid input.', 400, { fields: { old_password: ['Your current password is incorrect.'] } }))],
    })
    await userEvent.type(await screen.findByLabelText('Current password'), 'nope')
    await userEvent.type(screen.getByLabelText(/^New password/, { selector: 'input' }), 'new-secret-123')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Your current password is incorrect.')).toBeInTheDocument()
  })

  it('Google-only accounts set a first password without a current one', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser({ has_password: false, google_linked: true }),
      handlers: [http.post('*/api/v1/auth/password/change/', async ({ request }) => { bodies.push(await request.json()); return new HttpResponse(null, { status: 204 }) })],
    })
    expect(await screen.findByRole('heading', { name: 'Set a password' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/^New password/, { selector: 'input' }), 'first-password-1')
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }))
    await waitFor(() => expect(bodies).toEqual([{ new_password: 'first-password-1' }]))
  })
})

describe('settings: accessibility', () => {
  afterEach(() => setContrastPreference('system'))

  it('matches the device by default and switches high contrast on and off in this browser', async () => {
    renderApp('/settings', { user: makeUser() })
    const card = within(await screen.findByRole('region', { name: 'Accessibility' }))
    expect(card.getByRole('radio', { name: 'Match my device' })).toBeChecked()
    expect(card.getByRole('radio', { name: 'Match my device' })).toHaveAccessibleDescription('Uses high contrast when your device asks for more contrast.')
    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false)
    await userEvent.click(card.getByRole('radio', { name: 'High contrast' }))
    expect(document.documentElement.dataset.contrast).toBe('more')
    expect(localStorage.getItem(CONTRAST_KEY)).toBe('more')
    await userEvent.click(card.getByRole('radio', { name: 'Match my device' }))
    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false)
    expect(localStorage.getItem(CONTRAST_KEY)).toBeNull()
  })
})

describe('settings: sign out and account deletion', () => {
  it('requires the typed phrase and password before deleting the account', async () => {
    const bodies: unknown[] = []
    const { router, setUser } = renderApp('/settings', {
      user: makeUser(),
      handlers: [http.delete('*/api/v1/auth/me/', async ({ request }) => { bodies.push(await request.json()); setUser(null); return new HttpResponse(null, { status: 204 }) })],
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete my account…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'delete')
    expect(confirm).toBeDisabled()
    await userEvent.clear(within(dialog).getByLabelText('Type DELETE to confirm'))
    await userEvent.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'DELETE')
    await userEvent.type(within(dialog).getByLabelText('Your password', { selector: 'input' }), 'hunter2')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(bodies).toEqual([{ password: 'hunter2' }])
  })

  it('Google-only accounts confirm by typing their email', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser({ has_password: false, google_linked: true, email: 'g@example.com' }),
      handlers: [http.delete('*/api/v1/auth/me/', async ({ request }) => { bodies.push(await request.json()); return new HttpResponse(null, { status: 204 }) })],
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete my account…' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Type your email address to confirm'), 'g@example.com')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    await waitFor(() => expect(bodies).toEqual([{ confirm_email: 'g@example.com' }]))
  })

  it('shows the server error when deletion fails and keeps the dialog open', async () => {
    renderApp('/settings', { user: makeUser(), handlers: [http.delete('*/api/v1/auth/me/', () => err('validation_error', 'Invalid input.', 400, { fields: { password: ['Incorrect password.'] } }))] })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete my account…' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'DELETE')
    await userEvent.type(within(dialog).getByLabelText('Your password', { selector: 'input' }), 'bad')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    expect(await within(dialog).findByText('Incorrect password.')).toBeInTheDocument()
  })

  it('signs out from settings', async () => {
    const { router, setUser } = renderApp('/settings', {
      user: makeUser(),
      handlers: [http.post('*/api/v1/auth/logout/', () => { setUser(null); return new HttpResponse(null, { status: 204 }) })],
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('dashboard home and navigation', () => {
  it('opens on the sizes to create, without a greeting, and links to sections', async () => {
    renderApp('/dashboard', {
      user: makeUser(),
      handlers: [http.get('*/api/v1/designs/', ({ request }) => HttpResponse.json(page(new URL(request.url).searchParams.get('starred') ? [] : [makeDesign('d1', { title: 'Recent one' })])))],
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Create a design' })).toBeInTheDocument()
    expect(screen.queryByText(/Good (morning|afternoon|evening)|Working late/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Instagram Post/ })).toHaveAttribute('href', '/create?preset=instagram-post')
    expect(await screen.findByRole('link', { name: /Recent one/ })).toHaveAttribute('href', '/design/d1')
    const nav = screen.getByRole('navigation', { name: 'Dashboard' })
    for (const label of ['Home', 'Designs', 'Templates', 'Brand', 'Uploads', 'Trash', 'Settings']) expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows a first-run state for new accounts', async () => {
    renderApp('/dashboard', { user: makeUser() })
    expect(await screen.findByText('Designs you make show up here.')).toBeInTheDocument()
  })

  it('the create menu offers presets and the full size picker', async () => {
    renderApp('/dashboard', { user: makeUser() })
    await userEvent.click(await screen.findByRole('button', { name: 'Create a design' }))
    const menu = await screen.findByRole('menu', { name: 'Create a design' })
    expect(within(menu).getByRole('menuitem', { name: 'Presentation (16:9)' })).toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'More sizes…' }))
    expect(await screen.findByRole('dialog', { name: 'Create a design' })).toBeInTheDocument()
  })

  it('the top search jumps to the designs page with the query', async () => {
    const { router } = renderApp('/dashboard', { user: makeUser() })
    const box = await screen.findByRole('searchbox', { name: 'Search your designs' })
    await userEvent.type(box, 'logo{Enter}')
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe('/dashboard/designs?q=logo'))
    expect(await screen.findByRole('heading', { name: 'Results for “logo”' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search your designs' })).toHaveValue('logo')
  })
})
