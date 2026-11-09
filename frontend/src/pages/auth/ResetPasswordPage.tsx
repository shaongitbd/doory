import { msg } from '@/i18n/catalog'
import { LinkIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { describeFormError } from '@/features/auth/errors'
import { evaluatePassword } from '@/features/auth/password'
import { PasswordInput } from '@/features/auth/PasswordInput'
import { authApi } from '@/lib/api'
import { usePageMeta } from '@/lib/usePageMeta'
import { Button, useToast } from '@/ui'
import formStyles from '@/features/auth/AuthForms.module.css'
import styles from './AuthPage.module.css'

export default function ResetPasswordPage() {
  usePageMeta({ title: msg("Choose a new password"), noindex: true })
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const uid = params.get('uid') ?? ''
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')

  if (!uid || !token) {
    return (
      <div role="alert">
        <div className={styles.stateIcon} aria-hidden="true">
          <LinkIcon size={28} />
        </div>
        <h1 className={styles.title}>{msg("This link isn’t valid")}</h1>
        <p className={styles.lead}>{msg("The password reset link is incomplete. Request a new one and use the link from the latest email.")}</p>
        <div className={styles.actions}>
          <Link to="/forgot-password">{msg("Request a new link")}</Link>
        </div>
      </div>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!evaluatePassword(password).acceptable) {
      setError('Use at least 8 characters, and not only numbers.')
      return
    }
    setError('')
    setFormError('')
    setBusy(true)
    try {
      await authApi.confirmPasswordReset({ uid, token, new_password: password })
      toast({ title: msg("Password updated"), description: msg("You can now log in with your new password."), variant: 'success' })
      navigate('/login', { replace: true })
    } catch (failure) {
      const described = describeFormError(failure, ['new_password', 'password'])
      setError(described.fields.new_password ?? described.fields.password ?? '')
      setFormError(described.message || (described.fields.new_password || described.fields.password ? '' : 'This link has expired or was already used. Request a new one.'))
      setBusy(false)
    }
  }

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>{msg("Choose a new password")}</h1>
        <p className={styles.lead}>{msg("Pick something you haven’t used before.")}</p>
      </div>
      <form className={formStyles.form} onSubmit={submit} noValidate>
        {formError ? (
          <div className={formStyles.alert} role="alert">
            {formError} <Link to="/forgot-password">{msg("Request a new link")}</Link>
          </div>
        ) : null}
        <PasswordInput label={msg("New password")} name="new-password" autoComplete="new-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} error={error} showStrength required />
        <Button type="submit" fullWidth loading={busy}>
          {msg("Update password")}</Button>
      </form>
    </>
  )
}
