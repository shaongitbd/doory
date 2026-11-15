import { msg } from '@/i18n/catalog'
import { getLocale } from '@/i18n/locale'
import { isApiError } from '@/lib/api'

export interface FormFailure {
  /** A message for the whole form (shown in an alert). */
  message: string
  /** Messages keyed by field name. */
  fields: Record<string, string>
}

/** "Too many attempts. Please try again in 45 seconds." (falls back to a generic wait when unknown). */
export function rateLimitMessage(retryAfter: number | null): string {
  if (!retryAfter) return msg('Too many attempts. Please wait a minute and try again.')
  if (retryAfter < 90) return retryAfter === 1 ? msg('Too many attempts. Please try again in {count} second.', { count: retryAfter }) : msg('Too many attempts. Please try again in {count} seconds.', { count: retryAfter })
  const minutes = Math.ceil(retryAfter / 60)
  return minutes === 1 ? msg('Too many attempts. Please try again in {count} minute.', { count: minutes }) : msg('Too many attempts. Please try again in {count} minutes.', { count: minutes })
}

const SSO_ERRORS: Record<string, string> = {
  oidc_account_exists: 'An account with this email address already exists. Log in with your password, then connect single sign-on in Settings.',
  oidc_email_unverified: 'Your sign-in provider hasn’t verified your email address, so it can’t be used with an existing account.',
  oidc_no_email: 'Your sign-in provider didn’t share an email address. Ask your administrator to include it.',
  oidc_identity_in_use: 'That account at your sign-in provider is already connected to another Doory account.',
  oidc_account_mismatch: 'Your Doory account is connected to a different account at your sign-in provider.',
  oidc_cancelled: 'Signing in was cancelled.',
  oidc_expired: 'That sign-in expired or was already used. Please start again.',
  oidc_unavailable: 'Couldn’t reach the sign-in provider. Please try again later.',
  account_disabled: 'This account has been disabled.',
}

/** The message for the `?sso_error=` code the server sends back after single sign-on. */
export function ssoErrorMessage(code: string): string {
  return msg(SSO_ERRORS[code] ?? 'Signing in didn’t go through. Please try again.')
}

/** Turns any thrown error into something a form can show. `known` lists the field names the form renders. */
export function describeFormError(error: unknown, known: readonly string[]): FormFailure {
  if (!isApiError(error)) return { message: msg('Something went wrong. Please try again.'), fields: {} }
  if (error.isRateLimited) return { message: rateLimitMessage(error.retryAfter), fields: {} }
  // The server supplies English copy already; retain it as the English fallback.
  if (error.code === 'invalid_credentials' && getLocale() !== 'en') return { message: msg('Incorrect email or password.'), fields: {} }
  const fields: Record<string, string> = {}
  const leftovers: string[] = []
  for (const [name, messages] of Object.entries(error.fields)) {
    const text = messages.map((message, index) => {
      const code = error.fieldCodes[name]?.[index]
      if (getLocale() === 'en') return message
      if (code === 'invalid_password') return msg('Incorrect password.')
      if (code === 'email_taken') return msg('An account with this email already exists.')
      return msg(message)
    }).join(' ')
    if (known.includes(name)) fields[name] = text
    else leftovers.push(text)
  }
  if (Object.keys(fields).length > 0 && leftovers.length === 0) return { message: '', fields }
  return { message: leftovers[0] ?? msg(error.message), fields }
}
