import { msg } from '@/i18n/catalog'
import { useAssetUsage } from '@/lib/api/hooks'
import { formatBytes } from '@/lib/time'
import styles from './UsageMeter.module.css'

/** Storage used by the signed-in user's uploads. Hidden if the server does not report usage. */
export function UsageMeter() {
  const usage = useAssetUsage()
  if (!usage.data) return null
  const { used_bytes: used, quota_bytes: quota } = usage.data
  const percent = quota ? Math.min(100, Math.round((used / quota) * 100)) : null
  return (
    <div className={styles.meter}>
      <p className={styles.label}>
        {quota ? (
          <>
            <strong>{formatBytes(used)}</strong> {msg("of ")}{formatBytes(quota)} {msg("used")}</>
        ) : (
          <>
            <strong>{formatBytes(used)}</strong> {msg("used")}</>
        )}
      </p>
      {percent !== null ? <progress className={styles.bar} max={100} value={percent} data-high={percent >= 90 || undefined} aria-label={msg("Storage used")} /> : null}
    </div>
  )
}
