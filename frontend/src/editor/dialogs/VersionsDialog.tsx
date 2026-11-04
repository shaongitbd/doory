import { getLocale } from '@/i18n/locale'
import { RotateCcw, Save } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { VersionSummary } from '@/types/api'
import { useEditor } from '../context'
import { useResource } from '../hooks/useResource'
import { migrateDocument } from '../engine/migrations'
import { t } from '../strings'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Skeleton } from '../ui/Skeleton'
import dlg from './dialogs.module.css'
import styles from './Share.module.css'

const when = (iso: string): string => new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

/** Version history: named snapshots of the design (and the automatic ones), restorable as one undoable step. */
export function VersionsDialog() {
  const editor = useEditor()
  const versions = editor.adapter.services.versions
  const loadVersions = useCallback(() => (versions ? versions.list() : Promise.resolve<VersionSummary[]>([])), [versions])
  const resource = useResource(versions ? loadVersions : null)
  const list = resource.data
  const [failure, setError] = useState<string | null>(null)
  const error = failure ?? (resource.failed ? t.versions.loadFailed : null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const create = async (): Promise<void> => {
    if (!versions || busy) return
    setBusy('create')
    setError(null)
    try {
      await editor.persistence.saveNow()
      const made = await versions.create(label.trim() || t.versions.defaultLabel(when(new Date().toISOString())))
      resource.update((cur) => [made, ...cur])
      setLabel('')
      editor.toast(t.versions.saved, 'success')
    } catch {
      setError(t.versions.createFailed)
    } finally {
      setBusy(null)
    }
  }

  const restore = async (version: VersionSummary): Promise<void> => {
    if (!versions || busy) return
    setBusy(version.id)
    setError(null)
    try {
      const doc = migrateDocument(await versions.restore(version.id))
      editor.applyDocument(doc, { label: t.history.restoreVersion, activePageId: doc.pages[0].id })
      editor.toast(t.versions.restored(version.label), 'success', { label: t.versions.undo, run: () => void editor.undo() })
      editor.closeDialog()
    } catch {
      setError(t.versions.restoreFailed)
    } finally {
      setBusy(null)
      setConfirm(null)
    }
  }

  return (
    <Dialog title={t.versions.title} description={t.versions.description} width={560} onClose={() => editor.closeDialog()} footer={<Button onClick={() => editor.closeDialog()}>{t.dialog.close}</Button>}>
      <div className={dlg.stack} data-testid="versions-dialog">
        <div className={styles.row}>
          <input className={`${dlg.input} ${styles.grow}`} value={label} maxLength={120} placeholder={t.versions.labelPlaceholder} aria-label={t.versions.labelField} data-testid="version-label" onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} />
          <Button variant="primary" icon={<Save size={16} aria-hidden="true" />} disabled={!versions || busy !== null} onClick={() => void create()} data-testid="version-create">
            {t.versions.save}
          </Button>
        </div>
        {error ? (
          <p className={dlg.error} role="alert">
            {error}
          </p>
        ) : null}
        {!versions ? <p className={styles.empty}>{t.versions.unavailable}</p> : null}
        {versions && !list && !error ? <Skeleton height={120} radius={12} aria-busy="true" aria-label={t.versions.loading} /> : null}
        {list && list.length === 0 ? <p className={styles.empty}>{t.versions.empty}</p> : null}
        {list && list.length > 0 ? (
          <ul className={styles.versions} aria-label={t.versions.list}>
            {list.map((v) => (
              <li key={v.id} className={styles.version} data-testid="version-row">
                <span className={styles.versionThumb} style={v.thumbnail_url ? { backgroundImage: `url("${v.thumbnail_url}")` } : undefined} aria-hidden="true" />
                <span className={styles.versionText}>
                  <strong>{v.label}</strong>
                  <small>
                    {when(v.created_at)} · {t.versions.pages(v.page_count)}
                    {v.is_auto ? ` · ${t.versions.auto}` : ''}
                  </small>
                </span>
                {confirm === v.id ? (
                  <>
                    <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => void restore(v)} data-testid="version-restore-confirm">
                      {busy === v.id ? t.versions.restoring : t.versions.confirmRestore}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                      {t.dialog.cancel}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" icon={<RotateCcw size={14} aria-hidden="true" />} disabled={busy !== null} onClick={() => setConfirm(v.id)} data-testid="version-restore">
                    {t.versions.restore}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Dialog>
  )
}
