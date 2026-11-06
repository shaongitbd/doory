import { msg } from '@/i18n/catalog'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { describeFormError, ssoErrorMessage } from '@/features/auth/errors'
import { PasswordInput } from '@/features/auth/PasswordInput'
import { authApi } from '@/lib/api'
import { Badge, Button, Dialog, Input, useToast } from '@/ui'
import { SettingsCard } from './SettingsCard'
import styles from './Settings.module.css'

/** Connects the account to the server's OpenID Connect provider, or disconnects it. */
export function SsoSection() {
  const { user, config, setUser } = useAuth()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Connecting ends back here, with `?sso=connected` or `?sso_error=<code>`: shown once, then taken off the address.
  const [error, setError] = useState(() => {
    const code = params.get('sso_error')
    return code ? ssoErrorMessage(code) : ''
  })
  const handled = useRef(false)
  const label = config.oidc_button_label || 'Sign in with SSO'

  useEffect(() => {
    if (handled.current || (!params.has('sso') && !params.has('sso_error'))) return
    handled.current = true
    if (params.get('sso') === 'connected') toast({ title: msg("Single sign-on connected"), description: `You can now log in with the “${label}” button.`, variant: 'success' })
    const rest = new URLSearchParams(params)
    rest.delete('sso')
    rest.delete('sso_error')
    setParams(rest, { replace: true })
  }, [params, setParams, toast, label])

  if (!user || (!config.features.oidc_login && !user.oidc_linked)) return null
  const linked = user.oidc_linked
  const canDisconnect = user.has_password || user.google_linked

  async function disconnect() {
    setBusy(true)
    setError('')
    try {
      setUser((await authApi.oidcDisconnect()).user)
      toast({ title: msg("Single sign-on disconnected"), variant: 'success' })
    } catch (failure) {
      setError(describeFormError(failure, []).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SettingsCard id="sso" title={msg("Single sign-on")} description={linked ? `You can log in with the “${label}” button.` : `Connect your account to log in with the “${label}” button.`}>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.inline}>
          {linked ? <Badge tone="success">{msg("Connected")}</Badge> : <Badge>{msg("Not connected")}</Badge>}
          {linked && canDisconnect ? (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => void disconnect()}>
              {msg("Disconnect")}</Button>
          ) : null}
          {!linked ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setError('')
                setOpen(true)
              }}
            >
              {msg("Connect…")}</Button>
          ) : null}
        </div>
        {linked && !canDisconnect ? <p className={styles.hint}>{msg("Set a password to be able to disconnect: it’s your only way to log in.")}</p> : null}
      </SettingsCard>
      <Dialog open={open} onClose={() => setOpen(false)} title={msg("Connect single sign-on")} description={msg("Confirm it’s you, then log in at your sign-in provider. You’ll come back here.")} size="sm">
        {open ? <ConnectForm hasPassword={user.has_password} onCancel={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  )
}

function ConnectForm({ hasPassword, onCancel }: { hasPassword: boolean; onCancel(): void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!value.trim()) return
    setBusy(true)
    setError('')
    try {
      const { redirect_url } = await authApi.oidcConnect(hasPassword ? { password: value } : { confirm_email: value.trim() })
      window.location.assign(redirect_url) // the provider sends the browser back to Settings
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
      {hasPassword ? (
        <PasswordInput label={msg("Your password")} name="current-password" autoComplete="current-password" value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
      ) : (
        <Input label={msg("Type your email address to confirm")} value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" spellCheck={false} autoFocus />
      )}
      <div className={styles.dialogFooter}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {msg("Cancel")}</Button>
        <Button type="submit" loading={busy} disabled={!value.trim()}>
          {msg("Continue")}</Button>
      </div>
    </form>
  )
}
