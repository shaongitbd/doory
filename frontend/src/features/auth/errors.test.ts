import { loadLocale } from '@/i18n/catalog'
import { setLocale } from '@/i18n/locale'
import { ApiError } from '@/lib/api'
import { describeFormError, rateLimitMessage } from './errors'

describe('describeFormError', () => {
  it('maps known fields and keeps the rest as a form message', () => {
    const error = new ApiError({ status: 400, code: 'validation_error', message: 'Invalid input.', fields: { email: 'Taken', non_field_errors: ['Try again later'] } })
    expect(describeFormError(error, ['email', 'password'])).toEqual({ message: 'Try again later', fields: { email: 'Taken' } })
  })

  it('shows only field errors when every field is rendered by the form', () => {
    const error = new ApiError({ status: 400, code: 'validation_error', message: 'Invalid input.', fields: { password: ['Too short', 'Too common'] } })
    expect(describeFormError(error, ['password'])).toEqual({ message: '', fields: { password: 'Too short Too common' } })
  })

  it('uses the server message for form-level problems such as invalid credentials', () => {
    const error = new ApiError({ status: 400, code: 'invalid_credentials', message: 'That email and password don’t match.' })
    expect(describeFormError(error, ['email']).message).toBe('That email and password don’t match.')
  })

  it('explains rate limits using retry_after and generic errors without leaking details', () => {
    const limited = new ApiError({ status: 429, code: 'throttled', message: 'x', retryAfter: 30 })
    expect(describeFormError(limited, []).message).toBe('Too many attempts. Please try again in 30 seconds.')
    expect(describeFormError(new Error('boom'), []).message).toBe('Something went wrong. Please try again.')
  })
})

describe('rateLimitMessage', () => {
  it('formats seconds, minutes and unknown waits', () => {
    expect(rateLimitMessage(1)).toBe('Too many attempts. Please try again in 1 second.')
    expect(rateLimitMessage(120)).toBe('Too many attempts. Please try again in 2 minutes.')
    expect(rateLimitMessage(null)).toBe('Too many attempts. Please wait a minute and try again.')
  })
})


describe('German authentication messages', () => {
  beforeAll(async () => { await loadLocale('de') })
  beforeEach(() => setLocale('de'))
  afterEach(() => setLocale('en'))

  it('localizes a known credentials code without displaying internal details', () => {
    const error = new ApiError({ status: 400, code: 'invalid_credentials', message: 'PRIVATE authentication detail' })
    expect(describeFormError(error, []).message).toBe('E-Mail-Adresse oder Passwort falsch.')
  })

  it('uses validation codes while preserving machine field names', () => {
    const error = new ApiError({ status: 400, code: 'validation_error', message: 'PRIVATE', fields: { password: ['PRIVATE'], email: ['PRIVATE'] }, fieldCodes: { password: ['invalid_password'], email: ['email_taken'] } })
    expect(describeFormError(error, ['password', 'email'])).toEqual({ message: '', fields: { password: 'Passwort falsch.', email: 'Ein Konto mit dieser E-Mail-Adresse existiert bereits.' } })
  })

  it.each([
    [0, 'Zu viele Versuche. Warte eine Minute und versuche es erneut.'],
    [1, 'Zu viele Versuche. Versuche es in 1 Sekunde erneut.'],
    [2, 'Zu viele Versuche. Versuche es in 2 Sekunden erneut.'],
    [120, 'Zu viele Versuche. Versuche es in 2 Minuten erneut.'],
  ])('formats retry value %s', (seconds, expected) => {
    expect(rateLimitMessage(seconds)).toBe(expected)
  })
})
