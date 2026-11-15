import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { activateLocale, msg } from '@/i18n/catalog'
import { setLocale } from '@/i18n/locale'
import { renderApp } from '@/test/app'
import { makeDesign, makeUser, page } from '@/test/factories'

beforeEach(async () => { await activateLocale('de') })
afterEach(() => { cleanup(); setLocale('en') })

it('renders German login validation and password visibility labels', async () => {
  renderApp('/login')
  await userEvent.click(await screen.findByRole('button', { name: 'Anmelden' }))
  expect(await screen.findByText('Gib Deine E-Mail-Adresse ein.')).toBeInTheDocument()
  expect(screen.getByText('Gib Dein Passwort ein.')).toBeInTheDocument()
  const password = screen.getByLabelText(/^Passwort/, { selector: 'input' })
  fireEvent.change(password, { target: { value: 'Untouched{token}!' } })
  await userEvent.click(screen.getByRole('button', { name: 'Passwort anzeigen' }))
  expect(password).toHaveAttribute('type', 'text')
  expect(password).toHaveValue('Untouched{token}!')
  expect(screen.getByRole('button', { name: 'Passwort ausblenden' })).toBeInTheDocument()
})

it('renders German password reset validation', async () => {
  renderApp('/forgot-password')
  await userEvent.click(await screen.findByRole('button', { name: 'Link zum Zurücksetzen senden' }))
  expect(await screen.findByText('Gib Deine E-Mail-Adresse ein.')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText(/^E-Mail/, { selector: 'input' }), 'invalid')
  await userEvent.click(screen.getByRole('button', { name: 'Link zum Zurücksetzen senden' }))
  expect(await screen.findByText('Das sieht nicht wie eine E-Mail-Adresse aus.')).toBeInTheDocument()
})

it('renders signup validation and password strength in German without changing scoring', async () => {
  renderApp('/signup')
  await userEvent.click(await screen.findByRole('button', { name: 'Kostenloses Konto erstellen' }))
  expect(await screen.findByText('Gib Deine E-Mail-Adresse ein.')).toBeInTheDocument()
  expect(screen.getByText('Wähle ein Passwort.')).toBeInTheDocument()
  expect(screen.getByText('Mindestens 8 Zeichen, nicht nur Zahlen.')).toBeInTheDocument()
  const meter = screen.getByRole('meter', { name: 'Passwortstärke' })
  expect(meter).toHaveAttribute('aria-valuetext', 'Leer')
  const password = screen.getByLabelText(/^Passwort/, { selector: 'input' })
  await userEvent.type(password, 'abc')
  expect(meter).toHaveAttribute('aria-valuetext', 'Schwach')
  expect(screen.getByText('Schwach. Noch erforderlich: mindestens 8 Zeichen.')).toBeInTheDocument()
  await userEvent.clear(password)
  await userEvent.type(password, 'Sicheres!Passwort2026')
  expect(meter).toHaveAttribute('aria-valuenow', '4')
  expect(meter).toHaveAttribute('aria-valuetext', 'Stark')
})

it('renders German settings actions and preserves password request fields and values', async () => {
  const requests: unknown[] = []
  renderApp('/settings', { user: makeUser(), handlers: [
    http.post('*/api/v1/auth/password/change/', async ({ request }) => {
      requests.push(await request.json())
      return HttpResponse.json({ ok: true })
    }),
  ] })
  await screen.findByRole('heading', { name: 'Einstellungen' })
  expect(screen.getByText('Verwalte Dein Profil, Deine E-Mail-Adresse und Deine Sicherheitseinstellungen.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Foto hochladen' })).toBeInTheDocument()
  const change = screen.getByRole('button', { name: 'Passwort ändern' })
  await userEvent.click(change)
  expect(screen.getByText('Gib Dein aktuelles Passwort ein.')).toBeInTheDocument()
  expect(screen.getByText('Verwende mindestens 8 Zeichen, nicht nur Zahlen.')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Aktuelles Passwort', { selector: 'input' }), { target: { value: 'old{token}' } })
  await userEvent.type(screen.getByLabelText('Neues Passwort', { selector: 'input' }), 'NewPassword!2026')
  await userEvent.click(change)
  await waitFor(() => expect(requests).toEqual([{ old_password: 'old{token}', new_password: 'NewPassword!2026' }]))
  expect(await screen.findByText('Passwort geändert')).toBeInTheDocument()
})

it('translates account deletion instructions while retaining the DELETE token', async () => {
  renderApp('/settings', { user: makeUser() })
  await userEvent.click(await screen.findByRole('button', { name: 'Mein Konto löschen…' }))
  const dialog = screen.getByRole('dialog', { name: 'Dein Konto löschen?' })
  await userEvent.type(within(dialog).getByLabelText('Gib zur Bestätigung DELETE ein'), 'DELETE')
  await userEvent.type(within(dialog).getByLabelText('Dein Passwort', { selector: 'input' }), 'unchanged')
  expect(within(dialog).getByRole('button', { name: 'Konto löschen' })).toBeEnabled()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
})

it('translates dashboard confirmations without interpreting or translating user titles', async () => {
  const title = 'Keep {title} – source.doory'
  renderApp('/dashboard/trash', { user: makeUser(), handlers: [
    http.get('*/api/v1/designs/', () => HttpResponse.json(page([makeDesign('sentinel', { title, trashed_at: new Date().toISOString() })]))),
  ] })
  await userEvent.click(await screen.findByRole('button', { name: `${title} endgültig löschen` }))
  const dialog = screen.getByRole('alertdialog', { name: `„${title}“ endgültig löschen?` })
  expect(within(dialog).getByRole('button', { name: 'Endgültig löschen' })).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Dialog schließen' })).toBeInTheDocument()
  expect(msg('Type "{token}" to confirm', { token: 'DELETE{token}' })).toBe('Gib zur Bestätigung „DELETE{token}“ ein')
})

it('localizes design counts, accessible actions and undo notifications', async () => {
  const title = 'User {count}.png'
  renderApp('/dashboard/designs', { user: makeUser(), handlers: [
    http.get('*/api/v1/designs/', () => HttpResponse.json(page([makeDesign('d1', { title, page_count: 3 })]))),
    http.delete('*/api/v1/designs/d1/', () => new HttpResponse(null, { status: 204 })),
  ] })
  await userEvent.click(await screen.findByRole('button', { name: `Weitere Aktionen für ${title}` }))
  expect(screen.getByText(/3 Seiten/)).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Als Favorit markieren' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('menuitem', { name: 'In den Papierkorb verschieben' }))
  expect(await screen.findByText('In den Papierkorb verschoben')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeInTheDocument()
})

it.each([
  ['/contact', 'Wir freuen uns sehr, von Dir zu hören.'],
  ['/features', 'Alle Werkzeuge. Keine Bezahlschranken.'],
])('renders the complete German heading at %s', async (route, heading) => {
  renderApp(route)
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(heading)
})
