import { msg } from '@/i18n/catalog'
import { LogOut, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { describeFormError } from '@/features/auth/errors'
import { PasswordInput } from '@/features/auth/PasswordInput'
import { authApi } from '@/lib/api'
import { Button, Dialog, Input, useToast } from '@/ui'
import { SettingsCard } from './SettingsCard'
import styles from './Settings.module.css'

const DELETE_PHRASE = 'DELETE'

export function DangerSection() {
  const { user, logout, clearSession } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  if (!user) return null

  async function signOut() {
    setSigningOut(true)
    try {
      await logout()
      navigate('/', { replace: true })
    } catch {
      toast({ title: msg("Couldn’t sign out"), description: msg("Please try again."), variant: 'error' })
      setSigningOut(false)
    }
  }

  return (
    <>
      <SettingsCard id="session" title={msg("Session")} description={msg("Sign out of Doory on this device.")}>
        <div>
          <Button variant="secondary" leftIcon={<LogOut size={16} />} loading={signingOut} onClick={() => void signOut()}>
            {msg("Sign out")}</Button>
        </div>
      </SettingsCard>
      <SettingsCard id="danger" title={msg("Delete account")} description={msg("Permanently deletes your account, designs, uploads and brand kits. This can’t be undone.")} tone="danger">
        <div>
          <Button variant="danger" leftIcon={<Trash2 size={16} />} onClick={() => setOpen(true)}>
            {msg("Delete my account…")}</Button>
        </div>
      </SettingsCard>
      <Dialog open={open} onClose={() => setOpen(false)} title={msg("Delete your account?")} description={msg("Everything you’ve made in Doory will be erased for good.")} size="sm">
        {open ? (
          <DeleteForm
            hasPassword={user.has_password}
            email={user.email}
            onCancel={() => setOpen(false)}
            onDeleted={() => {
              navigate('/', { replace: true })
              clearSession()
              toast({ title: msg("Your account was deleted"), description: msg("Thanks for trying Doory.") })
            }}
          />
        ) : null}
      </Dialog>
    </>
  )
}

function DeleteForm({ hasPassword, email, onCancel, onDeleted }: { hasPassword: boolean; email: string; onCancel(): void; onDeleted(): void }) {
  const [phrase, setPhrase] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const expected = hasPassword ? DELETE_PHRASE : email
  const ready = phrase.trim() === expected && (!hasPassword || password.length > 0)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      await authApi.deleteAccount(hasPassword ? { password } : { confirm_email: email })
      onDeleted()
    } catch (failure) {
      const described = describeFormError(failure, ['password', 'confirm_email'])
      setError(described.fields.password ?? described.fields.confirm_email ?? described.message)
      setBusy(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Input label={hasPassword ? `Type ${DELETE_PHRASE} to confirm` : 'Type your email address to confirm'} value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" spellCheck={false} autoFocus />
      {hasPassword ? <PasswordInput label={msg("Your password")} name="current-password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /> : null}
      <div className={styles.dialogFooter}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {msg("Cancel")}</Button>
        <Button type="submit" variant="danger" loading={busy} disabled={!ready}>
          {msg("Delete account")}</Button>
      </div>
    </form>
  )
}
