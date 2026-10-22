import { KeyRound } from 'lucide-react'
import { useId } from 'react'
import { useLocation } from 'react-router-dom'
import { authApi } from '@/lib/api'
import { AnchorButton } from '@/ui'
import { useAuth } from './AuthProvider'
import styles from './AuthForms.module.css'
import { useSsoIcon } from './ssoIcons'

/**
 * "Sign in with …" through the server's OpenID Connect provider, only when the server has one. A plain link: the API
 * runs the whole flow and sends the browser back to `next` (by default, this page). `note` is shown under it.
 */
export function SsoButton({ next, note }: { next?: string; note?: string }) {
  const { config } = useAuth()
  const location = useLocation()
  const icon = useSsoIcon(config.oidc_button_icon)
  const noteId = useId()
  if (!config.features.oidc_login) return null
  const button = (
    <AnchorButton
      href={authApi.oidcStartUrl(next ?? `${location.pathname}${location.search}`)}
      fullWidth
      leftIcon={icon ? <img src={icon} width={16} height={16} alt="" /> : <KeyRound size={16} aria-hidden="true" />}
      aria-describedby={note ? noteId : undefined}
    >
      {config.oidc_button_label || 'Sign in with SSO'}
    </AnchorButton>
  )
  if (!note) return button
  return (
    <div className={styles.withNote}>
      {button}
      <p id={noteId} className={styles.note}>
        {note}
      </p>
    </div>
  )
}
