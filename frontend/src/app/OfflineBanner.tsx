import { msg } from '@/i18n/catalog'
import { WifiOff } from 'lucide-react'
import { useOnline } from '@/lib/useOnline'
import styles from './OfflineBanner.module.css'

/** Appears while the browser reports no connection. Local (guest) designs keep saving to this browser. */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div className={styles.banner} role="status">
      <WifiOff size={16} aria-hidden="true" />
      <span>{msg("You’re offline. Changes to guest designs keep saving in this browser; account designs sync when you’re back.")}</span>
    </div>
  )
}
