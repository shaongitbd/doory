import { msg } from '@/i18n/catalog'
import { CloudUpload, TriangleAlert } from 'lucide-react'
import { Button } from '@/ui'
import styles from './GuestBanner.module.css'

export interface GuestBannerProps {
  signedIn: boolean
  /** True when IndexedDB is unavailable and designs only live in memory. */
  memoryOnly: boolean
  busy?: boolean
  onSave(): void
}

/**
 * Sits in the editor top bar for `/local/:id`, just before Share: the way from a guest design to an account. The editor's
 * save indicator already says "Saved in this browser", so this is only the button, plus a warning when the browser
 * keeps nothing at all. Its button is secondary on purpose: the bar's one primary action is Share.
 */
export function GuestBanner({ signedIn, memoryOnly, busy, onSave }: GuestBannerProps) {
  return (
    <div className={styles.banner}>
      {memoryOnly ? (
        <p className={styles.warning} role="status" title={`This browser blocks storage, so closing the tab loses this design. ${signedIn ? 'Save it to your account.' : 'Sign up to keep it.'}`}>
          <TriangleAlert size={16} aria-hidden="true" />
          <span className={styles.label}>{msg("Won’t be kept")}</span>
          <span className={styles.srOnly}> {msg("· This browser blocks storage, so closing the tab loses this design.")}</span>
        </p>
      ) : null}
      <Button variant="secondary" size="sm" leftIcon={<CloudUpload size={16} />} onClick={onSave} loading={busy}>
        <span className={styles.buttonText}>{signedIn ? 'Save to account' : 'Sign up'}</span>
      </Button>
    </div>
  )
}
