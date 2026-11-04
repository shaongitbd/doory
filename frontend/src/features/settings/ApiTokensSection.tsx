import { msg } from '@/i18n/catalog'
import { getLocale } from '@/i18n/locale'
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { describeFormError } from '@/features/auth/errors'
import { PasswordInput } from '@/features/auth/PasswordInput'
import { tokensApi } from '@/lib/api'
import type { ApiToken, ApiTokenScope, IssuedApiToken } from '@/types/api'
import { Button, Checkbox, ConfirmDialog, Input, Select, useToast } from '@/ui'
import { claudeCodeCommand, mcpUrl } from './mcp'
import { SettingsCard } from './SettingsCard'
import styles from './Settings.module.css'

const DEFAULT_SCOPES = ['designs:read', 'designs:write']
const EXPIRY_OPTIONS = [
  { value: '30', label: msg("30 days") },
  { value: '90', label: msg("90 days") },
  { value: '365', label: msg("1 year") },
]

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function when(iso: string | null, fallback: string): string {
  return iso ? new Date(iso).toLocaleDateString(getLocale(), { year: 'numeric', month: 'short', day: 'numeric' }) : fallback
}

export function ApiTokensSection() {
  const { toast } = useToast()
  const { user, config } = useAuth()
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [scopes, setScopes] = useState<ApiTokenScope[]>([])
  const [issued, setIssued] = useState<IssuedApiToken | null>(null)
  const [revoking, setRevoking] = useState<ApiToken | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([tokensApi.list(controller.signal), tokensApi.scopes(controller.signal)])
      .then(([list, catalogue]) => {
        setTokens(list)
        setScopes(catalogue)
      })
      .catch(() => {
        if (!controller.signal.aborted) setTokens([])
      })
    return () => controller.abort()
  }, [])

  async function revoke(token: ApiToken) {
    setBusy(true)
    try {
      await tokensApi.revoke(token.id)
      setTokens((list) => (list ?? []).filter((item) => item.id !== token.id))
      toast({ title: msg("Token revoked"), description: `${token.name} can no longer reach your designs.` })
    } catch {
      toast({ title: msg("Couldn’t revoke the token"), description: msg("Please try again."), variant: 'error' })
    } finally {
      setBusy(false)
      setRevoking(null)
    }
  }

  return (
    <SettingsCard
      id="api-tokens"
      title={msg("AI assistants (MCP)")}
      description={msg("Let Claude, Cursor or another MCP client create and edit your designs. Each token works like your password for those tools: keep it secret and revoke it when you stop using it.")}
    >
      {issued ? <IssuedToken issued={issued} onDone={() => setIssued(null)} /> : null}
      {user?.is_email_verified === false && config.features.email_verification ? (
        <p className={styles.hint}>{msg("Confirm your email address to create a token. You can resend the link under Email.")}</p>
      ) : (
        <CreateTokenForm
          scopes={scopes}
          onCreated={(token) => {
            setIssued(token)
            setTokens((list) => [token, ...(list ?? [])])
          }}
        />
      )}
      {tokens && tokens.length > 0 ? (
        <ul className={styles.tokenList} aria-label={msg("Your API tokens")}>
          {tokens.map((token) => (
            <li key={token.id} className={styles.tokenRow}>
              <div>
                <p className={styles.tokenName}>
                  <KeyRound size={14} aria-hidden /> {token.name} <code className={styles.tokenPrefix}>{msg("doory_")}{token.prefix}_…</code>
                </p>
                <p className={styles.hint}>
                  {token.scopes.join(', ')} {msg("· last used ")}{when(token.last_used_at, 'never')} {msg("· expires ")}{when(token.expires_at, 'never')}
                </p>
              </div>
              <Button variant="ghost" size="sm" leftIcon={<Trash2 size={14} />} onClick={() => setRevoking(token)} aria-label={`Revoke ${token.name}`}>
                {msg("Revoke")}</Button>
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmDialog
        open={revoking !== null}
        title={msg("Revoke this token?")}
        description={revoking ? `Assistants using “${revoking.name}” will lose access at once.` : undefined}
        confirmLabel="Revoke"
        tone="danger"
        loading={busy}
        onConfirm={() => (revoking ? revoke(revoking) : undefined)}
        onCancel={() => setRevoking(null)}
      />
    </SettingsCard>
  )
}

function CreateTokenForm({ scopes, onCreated }: { scopes: ApiTokenScope[]; onCreated(token: IssuedApiToken): void }) {
  const { user } = useAuth()
  const hasPassword = user?.has_password !== false
  const [name, setName] = useState('')
  const [secret, setSecret] = useState('') // the password, or the email address for accounts without one
  const [chosen, setChosen] = useState<string[]>(DEFAULT_SCOPES)
  const [expiry, setExpiry] = useState('90')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Name the token after the assistant that will use it.'
    if (chosen.length === 0) found.scopes = 'Choose at least one permission.'
    if (!secret) found[hasPassword ? 'password' : 'confirm_email'] = hasPassword ? 'Enter your password.' : 'Type your email address.'
    setErrors(found)
    setFormError('')
    if (Object.keys(found).length > 0) return
    setBusy(true)
    try {
      const proof = hasPassword ? { password: secret } : { confirm_email: secret }
      onCreated(await tokensApi.create({ name: name.trim(), scopes: chosen, expires_in_days: Number(expiry), ...proof }))
      setName('')
      setSecret('')
    } catch (error) {
      const failure = describeFormError(error, ['name', 'scopes', 'expires_in_days', 'password', 'confirm_email'])
      setErrors(failure.fields)
      setFormError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string, on: boolean) => setChosen((list) => (on ? [...list, id] : list.filter((item) => item !== id)))

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {formError ? (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      ) : null}
      <Input label={msg("Token name")} placeholder={msg("Claude Desktop")} value={name} onChange={(event) => setName(event.target.value)} error={errors.name} maxLength={80} autoComplete="off" />
      {scopes.length > 0 ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{msg("Permissions")}</legend>
          {scopes.map((scope) => (
            <Checkbox key={scope.id} label={scope.id} description={scope.description} checked={chosen.includes(scope.id)} onChange={(event) => toggle(scope.id, event.target.checked)} />
          ))}
          {errors.scopes ? <p className={styles.error}>{errors.scopes}</p> : null}
        </fieldset>
      ) : null}
      <Select label={msg("Expires after")} options={EXPIRY_OPTIONS} value={expiry} onChange={(event) => setExpiry(event.target.value)} />
      {hasPassword ? (
        <PasswordInput label={msg("Your password")} name="current-password" autoComplete="current-password" value={secret} onChange={(event) => setSecret(event.target.value)} error={errors.password} />
      ) : (
        <Input label={msg("Type your email address to confirm")} value={secret} onChange={(event) => setSecret(event.target.value)} error={errors.confirm_email} autoComplete="off" spellCheck={false} />
      )}
      <div>
        <Button type="submit" loading={busy}>
          {msg("Create token")}</Button>
      </div>
    </form>
  )
}

function IssuedToken({ issued, onDone }: { issued: IssuedApiToken; onDone(): void }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState('')

  async function copyValue(label: string, text: string) {
    if (await copy(text)) setCopied(label)
    else toast({ title: msg("Couldn’t copy"), description: msg("Select the text and copy it yourself."), variant: 'error' })
  }

  return (
    <div className={styles.issued} role="status">
      <p>
        <strong>{msg("Copy your new token now.")}</strong> {msg("It won’t be shown again.")}</p>
      <div className={styles.inline}>
        <code className={styles.secret}>{issued.token}</code>
        <Button size="sm" variant="secondary" leftIcon={copied === 'token' ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copyValue('token', issued.token)}>
          {copied === 'token' ? 'Copied' : 'Copy token'}
        </Button>
      </div>
      <p className={styles.hint}>
        {msg("Server URL: ")}<code>{mcpUrl()}</code>{msg(", with the header ")}<code>{msg("Authorization: Bearer &lt;token&gt;")}</code>{msg(". In Claude Code:")}</p>
      <div className={styles.inline}>
        <code className={styles.secret}>{claudeCodeCommand(issued.token)}</code>
        <Button size="sm" variant="secondary" leftIcon={copied === 'command' ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copyValue('command', claudeCodeCommand(issued.token))}>
          {copied === 'command' ? 'Copied' : 'Copy command'}
        </Button>
      </div>
      <div>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {msg("Done")}</Button>
      </div>
    </div>
  )
}
