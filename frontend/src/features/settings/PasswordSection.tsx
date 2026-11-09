import { msg } from '@/i18n/catalog'
import { useState, type FormEvent } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { describeFormError } from '@/features/auth/errors'
import { evaluatePassword } from '@/features/auth/password'
import { PasswordInput } from '@/features/auth/PasswordInput'
import { authApi } from '@/lib/api'
import { Button, useToast } from '@/ui'
import { SettingsCard } from './SettingsCard'
import styles from './Settings.module.css'

export function PasswordSection() {
  const { user, refresh } = useAuth()
  const { toast } = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  if (!user) return null
  const hasPassword = user.has_password

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (hasPassword && !current) found.old_password = 'Enter your current password.'
    if (!evaluatePassword(next).acceptable) found.new_password = 'Use at least 8 characters, and not only numbers.'
    setErrors(found)
    setFormError('')
    if (Object.keys(found).length > 0) return
    setBusy(true)
    try {
      await authApi.changePassword({ ...(hasPassword ? { old_password: current } : {}), new_password: next })
      setCurrent('')
      setNext('')
      toast({ title: hasPassword ? 'Password changed' : 'Password set', description: hasPassword ? undefined : 'You can now sign in with your email and password.', variant: 'success' })
      if (!hasPassword) await refresh().catch(() => null)
    } catch (error) {
      const failure = describeFormError(error, ['old_password', 'new_password'])
      setErrors(failure.fields)
      setFormError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard id="password" title={hasPassword ? 'Change password' : 'Set a password'} description={hasPassword ? 'Use a long, unique password.' : user.google_linked ? 'You signed in with Google. Add a password to also log in with your email.' : 'Add a password to also log in with your email.'}>
      <form className={styles.form} onSubmit={submit} noValidate>
        {formError ? (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        ) : null}
        {hasPassword ? <PasswordInput label={msg("Current password")} name="current-password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} error={errors.old_password} /> : null}
        <PasswordInput label={msg("New password")} name="new-password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} error={errors.new_password} showStrength />
        <div>
          <Button type="submit" loading={busy}>
            {hasPassword ? 'Change password' : 'Set password'}
          </Button>
        </div>
      </form>
    </SettingsCard>
  )
}
