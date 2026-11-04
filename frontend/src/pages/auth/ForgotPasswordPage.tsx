import { msg } from '@/i18n/catalog'
import { MailCheck } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { describeFormError } from '@/features/auth/errors'
import { authApi } from '@/lib/api'
import { usePageMeta } from '@/lib/usePageMeta'
import { Button, Input } from '@/ui'
import formStyles from '@/features/auth/AuthForms.module.css'
import styles from './AuthPage.module.css'

export default function ForgotPasswordPage() {
  usePageMeta({ title: msg("Reset your password"), noindex: true })
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email address you signed up with.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await authApi.requestPasswordReset(email.trim())
      setSent(true)
    } catch (failure) {
      setError(describeFormError(failure, ['email']).fields.email ?? describeFormError(failure, ['email']).message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div role="status">
        <div className={styles.stateIcon} aria-hidden="true">
          <MailCheck size={28} />
        </div>
        <h1 className={styles.title}>{msg("Check your inbox")}</h1>
        <p className={styles.lead}>{msg("If an account exists for ")}{email.trim()}{msg(", we’ve sent a link to choose a new password. It can take a minute to arrive.")}</p>
        <div className={styles.actions}>
          <Link to="/login">{msg("Back to log in")}</Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>{msg("Forgot your password?")}</h1>
        <p className={styles.lead}>{msg("Enter your email and we’ll send you a link to reset it.")}</p>
      </div>
      <form className={formStyles.form} onSubmit={submit} noValidate>
        <Input label={msg("Email")} type="email" name="email" autoComplete="email" inputMode="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} error={error} required />
        <Button type="submit" fullWidth loading={busy}>
          {msg("Send reset link")}</Button>
      </form>
      <p className={styles.footer}>
        <Link to="/login">{msg("Back to log in")}</Link>
      </p>
    </>
  )
}
