import { msg } from '@/i18n/catalog'
import { useEffect } from 'react'
import { Button } from '@/ui'
import { useAuthModal } from './AuthModalProvider'
import { useAuth } from './AuthProvider'
import styles from './SessionEndedBar.module.css'

/**
 * Shown over an open editor whose session ended. The editor is not unmounted (that would throw away what was typed since
 * the last save): the sign-in dialog opens once, and this bar brings it back after it was dismissed. With live co-editing the
 * editor has a banner of its own for this, so the bar only appears when that is off.
 */
export function SessionEndedBar() {
  const { lostSession, config } = useAuth()
  const { openAuthModal } = useAuthModal()

  useEffect(() => {
    void openAuthModal({ reason: 'session-expired', tab: 'login' })
  }, [openAuthModal])

  if (config.features.realtime === true) return null
  return (
    <div className={styles.bar} role="alert">
      <p className={styles.text}>
        <strong>{msg("Your session ended.")}</strong> {msg("Changes are kept on this page but can’t be saved until you sign in")}{lostSession ? ` as ${lostSession.email}` : ''}.
      </p>
      <Button size="sm" onClick={() => void openAuthModal({ reason: 'session-expired', tab: 'login' })}>
        {msg("Sign in")}</Button>
    </div>
  )
}
