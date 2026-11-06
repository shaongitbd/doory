import { msg } from '@/i18n/catalog'
import { type FormEvent, useState } from 'react'
import { Button, Input } from '@/ui'
import type { ApiUser } from '@/types/api'
import { useAuth } from './AuthProvider'
import { describeFormError } from './errors'
import { GoogleButton } from './GoogleButton'
import { SignInDivider } from './LoginForm'
import { evaluatePassword } from './password'
import { PasswordInput } from './PasswordInput'
import { SsoButton } from './SsoButton'
import styles from './AuthForms.module.css'

export interface SignupFormProps {
  onSuccess(user: ApiUser): void
  autoFocus?: boolean
  /** The optional name field is left out of the compact modal version. */
  showName?: boolean
  /** Where single sign-on comes back to (by default, this page). */
  ssoNext?: string
}

const FIELDS = ['email', 'password', 'display_name'] as const

export function SignupForm({ onSuccess, autoFocus = true, showName = true, ssoNext }: SignupFormProps) {
  const { signup, google } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function submit(event: FormEvent) {
    event.preventDefault()
    const errors: Record<string, string> = {}
    if (!email.trim()) errors.email = 'Enter your email address.'
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = 'That doesn’t look like an email address.'
    if (!password) errors.password = 'Choose a password.'
    else if (!evaluatePassword(password).acceptable) errors.password = 'Use at least 8 characters, and not only numbers.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return
    setBusy(true)
    try {
      onSuccess(await signup({ email: email.trim(), password, display_name: name.trim() || undefined }))
    } catch (error) {
      const failure = describeFormError(error, FIELDS)
      setFormError(failure.message)
      setFieldErrors(failure.fields)
      setBusy(false)
    }
  }

  async function handleGoogle(credential: string) {
    setFormError('')
    try {
      onSuccess(await google(credential))
    } catch (error) {
      setFormError(describeFormError(error, FIELDS).message)
    }
  }

  return (
    <div className={styles.stack}>
      <form className={styles.form} onSubmit={submit} noValidate aria-label={msg("Sign up")}>
        {formError ? (
          <div className={styles.alert} role="alert">
            {formError}
          </div>
        ) : null}
        {showName ? <Input label={msg("Name")} hint={msg("Optional. Shown on designs you share.")} name="name" autoComplete="name" autoFocus={autoFocus} value={name} onChange={(event) => setName(event.target.value)} error={fieldErrors.display_name} maxLength={80} /> : null}
        <Input label={msg("Email")} type="email" name="email" autoComplete="email" inputMode="email" autoFocus={autoFocus && !showName} value={email} onChange={(event) => setEmail(event.target.value)} error={fieldErrors.email} required />
        <PasswordInput label={msg("Password")} name="new-password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} error={fieldErrors.password} showStrength required />
        <Button type="submit" fullWidth loading={busy}>
          {msg("Create free account")}</Button>
      </form>
      <SignInDivider />
      <SsoButton next={ssoNext} />
      <GoogleButton onCredential={handleGoogle} text="signup_with" />
    </div>
  )
}
