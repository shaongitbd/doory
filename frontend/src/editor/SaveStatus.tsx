import { AlertTriangle, Check, CloudOff, Loader2, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCollabState, usePresenceState } from './collab/context'
import { useEditor, useEditorState } from './context'
import styles from './SaveStatus.module.css'

/** The pill while the design is edited live: who is here, or what is wrong with the connection. */
function LiveStatus() {
  const { t } = useTranslation('editor', { keyPrefix: 'collab.status' })
  const status = useCollabState((s) => s.status)
  const attempt = useCollabState((s) => s.attempt) ?? 0
  const canWrite = useCollabState((s) => s.canWrite)
  const others = usePresenceState((s) => new Set(s.peers.map((p) => p.userId)).size) ?? 0
  const people = others + 1
  switch (status) {
    case 'live':
      return (
        <span className={`${styles.pill} ${styles.live}`} role="status" aria-label={t('live', { count: people })} data-testid="collab-status" data-state="live">
          <span className={styles.liveDot} aria-hidden="true" />
          <span className={styles.text}>{t('live', { count: people })}</span>
        </span>
      )
    case 'read-only':
      return (
        <span className={`${styles.pill} ${styles.neutral}`} role="status" aria-label={t('viewing', { count: people })} data-testid="collab-status" data-state="read-only">
          <Eye size={14} aria-hidden="true" />
          <span className={styles.text}>{t('viewing', { count: people })}</span>
        </span>
      )
    case 'offline':
      return attempt >= 3 || (typeof navigator !== 'undefined' && navigator.onLine === false) ? (
        <span className={`${styles.pill} ${styles.warn}`} role="status" data-testid="collab-status" data-state="offline">
          <CloudOff size={14} aria-hidden="true" />
          <span className={styles.text}>{t('offline')}</span>
        </span>
      ) : (
        <span className={`${styles.pill} ${styles.neutral}`} role="status" data-testid="collab-status" data-state="reconnecting">
          <Loader2 size={14} className={styles.spin} aria-hidden="true" />
          <span className={styles.text}>{t('reconnecting')}</span>
        </span>
      )
    case 'busy':
      return (
        <span className={`${styles.pill} ${styles.warn}`} role="status" data-testid="collab-status" data-state="busy">
          <Loader2 size={14} className={styles.spin} aria-hidden="true" />
          <span className={styles.text}>{t('busy')}</span>
        </span>
      )
    case 'signed-out':
      return (
        <span className={`${styles.pill} ${styles.warn}`} role="status" data-testid="collab-status" data-state="signed-out">
          <AlertTriangle size={14} aria-hidden="true" />
          <span className={styles.text}>{t('signedOut')}</span>
        </span>
      )
    case 'forbidden':
    case 'not-found':
    case 'too-large':
    case 'unavailable':
      return (
        <span className={`${styles.pill} ${styles.error}`} role="alert" data-testid="collab-status" data-state={status}>
          <AlertTriangle size={14} aria-hidden="true" />
          <span className={styles.text}>{status === 'forbidden' ? t('forbidden') : status === 'not-found' ? t('notFound') : status === 'too-large' ? t('tooLarge') : t('unavailable')}</span>
        </span>
      )
    default:
      return (
        <span className={`${styles.pill} ${styles.neutral}`} role="status" data-testid="collab-status" data-state="connecting">
          <Loader2 size={14} className={styles.spin} aria-hidden="true" />
          <span className={styles.text}>{canWrite ? t('reconnecting') : t('connecting')}</span>
        </span>
      )
  }
}

/**
 * The one save indicator of the editor: Saving… / Saved / Saved in this browser (a guest's design, before and after its first save) /
 * Conflict / Error with retry; the live state while a room is connected.
 */
export function SaveStatus() {
  const { t } = useTranslation('editor', { keyPrefix: 'save' })
  const editor = useEditor()
  const save = useEditorState((s) => s.save)
  const readOnly = useEditorState((s) => s.readOnly)
  const guest = useEditorState((s) => s.mode === 'guest')
  const live = useCollabState((s) => s.status !== 'fallback')
  if (live) return <LiveStatus />
  if (readOnly) {
    return (
      <span className={`${styles.pill} ${styles.neutral}`} role="status">
        <Eye size={14} />
        <span className={styles.text}>{t('readOnly')}</span>
      </span>
    )
  }
  switch (save.status) {
    case 'saving':
      return (
        <span className={`${styles.pill} ${styles.neutral}`} role="status">
          <Loader2 size={14} className={styles.spin} />
          <span className={styles.text}>{t('saving')}</span>
        </span>
      )
    case 'dirty':
      return (
        <span className={`${styles.pill} ${styles.neutral}`} role="status">
          <span className={styles.dot} />
          <span className={styles.text}>{t('unsaved')}</span>
        </span>
      )
    case 'conflict':
      return (
        <span className={`${styles.pill} ${styles.warn}`} role="status">
          <AlertTriangle size={14} />
          <span className={styles.text}>{t('conflict')}</span>
        </span>
      )
    case 'error':
      return (
        <span className={`${styles.pill} ${styles.error}`} role="alert" title={save.message}>
          <CloudOff size={14} />
          <span className={styles.text}>{t('error')}</span>
          <button type="button" className={styles.retry} onClick={() => void editor.persistence.saveNow()}>
            {t('retry')}
          </button>
        </span>
      )
    case 'local':
      return (
        <span className={`${styles.pill} ${styles.ok}`} role="status" title={t('localHint')}>
          <Check size={14} />
          <span className={styles.text}>{t('local')}</span>
        </span>
      )
    case 'saved':
      return (
        <span className={`${styles.pill} ${styles.ok}`} role="status">
          <Check size={14} />
          <span className={styles.text}>{t('saved')}</span>
        </span>
      )
    default:
      return (
        <span className={`${styles.pill} ${styles.ok}`} role="status" title={guest ? t('localHint') : undefined}>
          <Check size={14} />
          <span className={styles.text}>{guest ? t('local') : t('saved')}</span>
        </span>
      )
  }
}
