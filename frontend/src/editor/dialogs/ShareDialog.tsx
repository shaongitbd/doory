import { getLocale } from '@/i18n/locale'
import { Check, Copy, Trash2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import type { ShareLinkPatch } from '@/types/adapter'
import type { ShareLink, ShareRole } from '@/types/api'
import { useEditor } from '../context'
import { useResource } from '../hooks/useResource'
import { t } from '../strings'
import { Button, IconButton } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { Skeleton } from '../ui/Skeleton'
import { Switch } from '../ui/Switch'
import { copyText } from './copyText'
import { EXPIRIES, type Expiry, SHARE_ROLES, absoluteUrl, expiryDate, linkStatus, validPassword } from './shareOps'
import dlg from './dialogs.module.css'
import styles from './Share.module.css'

const when = (iso: string): string => new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

function LinkRow({ link, now, onChange, onRemove, onCopy }: { link: ShareLink; now: number; onChange: (patch: ShareLinkPatch) => Promise<void>; onRemove: () => Promise<void>; onCopy: (url: string) => Promise<void> }) {
  const url = absoluteUrl(link.url, window.location.origin)
  const status = linkStatus(link, now)
  const [confirm, setConfirm] = useState(false)
  const [password, setPassword] = useState('')
  const [setting, setSetting] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <li className={styles.link} data-status={status} data-testid="share-link">
      <div className={styles.row}>
        <input ref={input} className={styles.url} readOnly value={url} aria-label={t.share.linkAddress} onFocus={(e) => e.currentTarget.select()} />
        <Button size="sm" icon={<Copy size={14} aria-hidden="true" />} onClick={() => void onCopy(url).then(() => input.current?.select())} data-testid="share-copy">
          {t.share.copy}
        </Button>
      </div>
      <div className={styles.row}>
        <Select value={link.role} aria-label={t.share.roleOf} onChange={(e) => void onChange({ role: e.target.value as ShareRole })}>
          {SHARE_ROLES.map((r) => (
            <option key={r} value={r}>
              {t.share.roles[r]}
            </option>
          ))}
        </Select>
        <span className={styles.grow} />
        <Switch label={t.share.enabled} checked={link.is_active} onChange={(on) => void onChange({ is_active: on })} />
      </div>
      <div className={styles.meta}>
        <span className={`${styles.chip} ${status === 'active' ? '' : styles.chipMuted}`}>{t.share.status[status]}</span>
        {link.expires_at ? <span>{t.share.expires(when(link.expires_at))}</span> : <span>{t.share.neverExpires}</span>}
        {link.has_password ? <span>{t.share.passwordProtected}</span> : null}
      </div>
      <div className={styles.row}>
        {link.has_password ? (
          <Button size="sm" variant="ghost" onClick={() => void onChange({ password: null })}>
            {t.share.removePassword}
          </Button>
        ) : setting ? (
          <>
            <input className={`${dlg.input} ${styles.grow}`} type="password" autoComplete="new-password" value={password} placeholder={t.share.passwordPlaceholder} aria-label={t.share.password} maxLength={128} onChange={(e) => setPassword(e.target.value)} />
            <Button
              size="sm"
              variant="primary"
              disabled={!validPassword(password)}
              onClick={() => {
                void onChange({ password }).then(() => {
                  setPassword('')
                  setSetting(false)
                })
              }}
            >
              {t.share.setPassword}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setSetting(true)}>
            {t.share.addPassword}
          </Button>
        )}
        <span className={styles.grow} />
        {confirm ? (
          <>
            <Button size="sm" variant="danger" onClick={() => void onRemove()} data-testid="share-delete-confirm">
              {t.share.deleteConfirm}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              {t.dialog.cancel}
            </Button>
          </>
        ) : (
          <IconButton label={t.share.delete} size="sm" onClick={() => setConfirm(true)} data-testid="share-delete">
            <Trash2 size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>
    </li>
  )
}

/** Share dialog: create links with a role, an optional password and expiry; copy, change or turn off the links that exist. */
export function ShareDialog() {
  const editor = useEditor()
  const sharing = editor.adapter.services.sharing ?? null
  const loadLinks = useCallback(() => (sharing ? sharing.list() : Promise.resolve<ShareLink[]>([])), [sharing])
  const resource = useResource(sharing ? loadLinks : null)
  const links = resource.data
  const [now] = useState(() => Date.now())
  const [failure, setFailure] = useState<string | null>(null)
  const error = failure ?? (resource.failed ? t.share.loadFailed : null)
  const setError = setFailure
  const [role, setRole] = useState<ShareRole>('view')
  const [expiry, setExpiry] = useState<Expiry>('never')
  const [protect, setProtect] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (url: string): Promise<void> => {
    const ok = await copyText(url)
    setCopied(ok ? url : null)
    editor.toast(ok ? t.share.copied : t.share.copyManually, ok ? 'success' : 'info')
  }

  const create = async (): Promise<void> => {
    if (!sharing || busy) return
    setBusy(true)
    setError(null)
    try {
      const made = await sharing.create({ role, expires_at: expiryDate(expiry, Date.now()), ...(protect ? { password } : {}) })
      resource.update((cur) => [made, ...cur])
      setPassword('')
      setProtect(false)
      await copy(absoluteUrl(made.url, window.location.origin))
    } catch {
      setError(t.share.createFailed)
    } finally {
      setBusy(false)
    }
  }

  const update = (id: string) => async (patch: ShareLinkPatch): Promise<void> => {
    if (!sharing) return
    try {
      const next = await sharing.update(id, patch)
      resource.update((cur) => cur.map((l) => (l.id === id ? next : l)))
    } catch {
      setError(t.share.updateFailed)
    }
  }

  const remove = (id: string) => async (): Promise<void> => {
    if (!sharing) return
    try {
      await sharing.revoke(id)
      resource.update((cur) => cur.filter((l) => l.id !== id))
    } catch {
      setError(t.share.updateFailed)
    }
  }

  return (
    <Dialog title={t.share.title} description={t.share.description} width={560} onClose={() => editor.closeDialog()} footer={<Button onClick={() => editor.closeDialog()}>{t.dialog.close}</Button>}>
      <div className={dlg.stack} data-testid="share-dialog">
        <div className={styles.create}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={dlg.muted}>{t.share.access}</span>
              <Select className={styles.full} value={role} aria-label={t.share.access} data-testid="share-role" onChange={(e) => setRole(e.target.value as ShareRole)}>
                {SHARE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t.share.roles[r]}
                  </option>
                ))}
              </Select>
            </label>
            <label className={styles.field}>
              <span className={dlg.muted}>{t.share.expiry}</span>
              <Select className={styles.full} value={expiry} aria-label={t.share.expiry} data-testid="share-expiry" onChange={(e) => setExpiry(e.target.value as Expiry)}>
                {EXPIRIES.map((x) => (
                  <option key={x} value={x}>
                    {t.share.expiries[x]}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <Switch label={t.share.requirePassword} checked={protect} onChange={setProtect} />
          {protect ? <input className={dlg.input} type="password" autoComplete="new-password" value={password} placeholder={t.share.passwordPlaceholder} aria-label={t.share.password} maxLength={128} data-testid="share-password" onChange={(e) => setPassword(e.target.value)} /> : null}
          <Button variant="primary" icon={copied ? <Check size={16} aria-hidden="true" /> : undefined} disabled={busy || !sharing || (protect && !validPassword(password))} onClick={() => void create()} data-testid="share-create">
            {busy ? t.share.creating : t.share.create}
          </Button>
        </div>

        {error ? (
          <p className={dlg.error} role="alert">
            {error}
          </p>
        ) : null}
        {!sharing ? <p className={styles.empty}>{t.share.unavailable}</p> : null}
        {sharing && !links && !error ? <Skeleton height={96} radius={12} aria-busy="true" aria-label={t.share.loading} /> : null}
        {links && links.length === 0 ? <p className={styles.empty}>{t.share.empty}</p> : null}
        {links && links.length > 0 ? (
          <ul className={styles.links} aria-label={t.share.links}>
            {links.map((l) => (
              <LinkRow key={l.id} link={l} now={now} onChange={update(l.id)} onRemove={remove(l.id)} onCopy={copy} />
            ))}
          </ul>
        ) : null}
      </div>
    </Dialog>
  )
}
