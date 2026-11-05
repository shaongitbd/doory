import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '@/test/app'
import { makeConfig, makeUser } from '@/test/factories'

const err = (code: string, message: string, status: number, extra: Record<string, unknown> = {}) =>
  HttpResponse.json({ error: { code, message, ...extra } }, { status })

const PASSWORD_CHANGE_URL = '*/api/v1/auth/password/change/'

describe('settings: password', () => {
  it('existing user can change their password successfully', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser({ has_password: true }),
      config: makeConfig(),
      handlers: [
        http.post(PASSWORD_CHANGE_URL, async ({ request }) => {
          bodies.push(await request.json())
          return new HttpResponse(null, { status: 204 })
        }),
      ],
    })

    // Verify initial state: "Change password" title and button
    await screen.findByRole('heading', { name: 'Change password' })
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toBeInTheDocument()

    // Fill in current and new password
    await userEvent.type(screen.getByLabelText('Current password'), 'old-secret-123')
    await userEvent.type(screen.getByLabelText('New password'), 'new-strong-password-456')

    // Submit
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    // Verify API call
    await waitFor(() =>
      expect(bodies).toEqual([
        { old_password: 'old-secret-123', new_password: 'new-strong-password-456' },
      ])
    )

    // Verify success toast
    await screen.findByText('Password changed')

    // Fields should be cleared
    expect(screen.getByLabelText('Current password')).toHaveValue('')
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })

  it('user without a password can set one successfully', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser({ has_password: false }),
      handlers: [
        http.post(PASSWORD_CHANGE_URL, async ({ request }) => {
          bodies.push(await request.json())
          return new HttpResponse(null, { status: 204 })
        }),
      ],
    })

    // Verify initial state: "Set a password" title and button, no current password field
    await screen.findByRole('heading', { name: 'Set a password' })
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toBeInTheDocument()

    // Description for non-Google user
    expect(screen.getByText('Add a password to also log in with your email.')).toBeInTheDocument()

    // Fill in new password only
    await userEvent.type(screen.getByLabelText('New password'), 'first-password-789')

    // Submit
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }))

    // Verify API call - no old_password
    await waitFor(() => expect(bodies).toEqual([{ new_password: 'first-password-789' }]))

    // Verify success toast with description
    await screen.findByText('Password set')
    await screen.findByText('You can now sign in with your email and password.')

    // Field should be cleared
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })

  it('google-linked user sees the correct password setup description', async () => {
    renderApp('/settings', {
      user: makeUser({ has_password: false, google_linked: true }),
    })

    await screen.findByRole('heading', { name: 'Set a password' })
    expect(screen.getByText('You signed in with Google. Add a password to also log in with your email.')).toBeInTheDocument()
  })

  it('requires current password when has_password is true', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser({ has_password: true }),
      handlers: [http.post(PASSWORD_CHANGE_URL, async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({}) })],
    })

    await screen.findByRole('heading', { name: 'Change password' })

    // Leave current password empty, fill new password
    await userEvent.type(screen.getByLabelText('New password'), 'valid-new-password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    // Should show inline error, no API call
    await screen.findByText('Enter your current password.')
    expect(bodies).toEqual([])
  })

  it('rejects weak new password before making an API request', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser({ has_password: true }),
      handlers: [http.post(PASSWORD_CHANGE_URL, async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({}) })],
    })

    await screen.findByRole('heading', { name: 'Change password' })

    // Fill current password, but weak new password
    await userEvent.type(screen.getByLabelText('Current password'), 'old-secret-123')
    await userEvent.type(screen.getByLabelText('New password'), '12345678') // too common / only numbers
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    // Should show inline error, no API call
    await screen.findByText('Use at least 8 characters, and not only numbers.')
    expect(bodies).toEqual([])
  })

  it('displays server-side current password error correctly', async () => {
    renderApp('/settings', {
      user: makeUser({ has_password: true }),
      handlers: [
        http.post(PASSWORD_CHANGE_URL, () =>
          err('validation_error', 'Invalid input.', 400, { fields: { old_password: ['Incorrect password.'] } })
        ),
      ],
    })

    await screen.findByRole('heading', { name: 'Change password' })
    await userEvent.type(screen.getByLabelText('Current password'), 'wrong-password')
    await userEvent.type(screen.getByLabelText('New password'), 'valid-new-password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    // Should show field-level error inline
    await screen.findByText('Incorrect password.')
  })

  it('displays server-side new password error correctly', async () => {
    renderApp('/settings', {
      user: makeUser({ has_password: true }),
      handlers: [
        http.post(PASSWORD_CHANGE_URL, () =>
          err('validation_error', 'Invalid input.', 400, { fields: { new_password: ['This password is too common.'] } })
        ),
      ],
    })

    await screen.findByRole('heading', { name: 'Change password' })
    // Use a password that passes client-side validation (evaluatePassword acceptable = true)
    await userEvent.type(screen.getByLabelText('Current password'), 'correct-old-password')
    await userEvent.type(screen.getByLabelText('New password'), 'valid-new-password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await screen.findByText('This password is too common.')
  })

  it('displays server-side general error in the alert banner', async () => {
    renderApp('/settings', {
      user: makeUser({ has_password: true }),
      handlers: [
        http.post(PASSWORD_CHANGE_URL, () =>
          err('server_error', 'Something went wrong on our end.', 500)
        ),
      ],
    })

    await screen.findByRole('heading', { name: 'Change password' })
    await userEvent.type(screen.getByLabelText('Current password'), 'correct-old-password')
    await userEvent.type(screen.getByLabelText('New password'), 'valid-new-password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    // General error appears in form banner (p[role="alert"]) with the server's message
    await screen.findByText('Something went wrong on our end.')
  })

  it('shows loading state while the API request is pending', async () => {
    let resolveApi: (value: Response) => void
    const apiPromise = new Promise<Response>((resolve) => {
      resolveApi = resolve
    })

    renderApp('/settings', {
      user: makeUser({ has_password: true }),
      handlers: [
        http.post(PASSWORD_CHANGE_URL, () => apiPromise),
      ],
    })

    await screen.findByRole('heading', { name: 'Change password' })
    await userEvent.type(screen.getByLabelText('Current password'), 'old-secret-123')
    await userEvent.type(screen.getByLabelText('New password'), 'new-strong-password-456')

    // Click submit - button should show loading state
    const submitButton = screen.getByRole('button', { name: 'Change password' })
    await userEvent.click(submitButton)

    // Button should show loading: aria-busy="true" and aria-disabled="true" (Button sets these when loading=true)
    await waitFor(() => expect(submitButton).toHaveAttribute('aria-busy', 'true'))
    await waitFor(() => expect(submitButton).toHaveAttribute('aria-disabled', 'true'))

    // Resolve the API call
    await act(async () => {
      resolveApi!(new HttpResponse(null, { status: 204 }))
    })

    // Button should no longer have loading attributes after success
    await waitFor(() => expect(submitButton).not.toHaveAttribute('aria-busy'))
    await waitFor(() => expect(submitButton).not.toHaveAttribute('aria-disabled'))
  })
})