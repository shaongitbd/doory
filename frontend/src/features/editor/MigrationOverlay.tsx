import { msg } from '@/i18n/catalog'
import { Dialog, Spinner } from '@/ui'
import type { MigrationProgress } from './adapters'
import styles from './MigrationOverlay.module.css'

function describe(progress: MigrationProgress | null): { text: string; value: number } {
  if (!progress) return { text: 'Getting started…', value: 0 }
  if (progress.phase === 'prepare') return { text: 'Preparing your design…', value: 2 }
  if (progress.phase === 'assets') {
    const share = progress.total === 0 ? 1 : progress.done / progress.total
    return { text: progress.total === 0 ? 'Preparing your design…' : `Uploading your images (${Math.min(progress.done + 1, progress.total)} of ${progress.total})…`, value: 5 + share * 75 }
  }
  if (progress.phase === 'design') return { text: 'Creating your design…', value: 85 }
  return { text: progress.done >= progress.total ? 'All done!' : 'Finishing up…', value: progress.done >= progress.total ? 100 : 95 }
}

/** Blocks the editor (non-dismissible) while a guest design is being moved to the account. */
export function MigrationOverlay({ open, progress }: { open: boolean; progress: MigrationProgress | null }) {
  const { text, value } = describe(progress)
  return (
    <Dialog open={open} onClose={() => undefined} dismissible={false} size="sm" title={msg("Saving to your account")} description={msg("Keep this tab open while we move your design and images over.")}>
      <div className={styles.body} role="status">
        <div className={styles.row}>
          <Spinner size={18} />
          <span>{text}</span>
        </div>
        <progress className={styles.progress} max={100} value={Math.round(value)} aria-label={msg("Upload progress")} />
      </div>
    </Dialog>
  )
}
