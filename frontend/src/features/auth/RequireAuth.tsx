import { msg } from '@/i18n/catalog'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Button, EmptyState } from '@/ui'
import { WifiOff } from 'lucide-react'
import { PageLoader } from '@/app/PageLoader'
import { useAuth } from './AuthProvider'
import { SessionEndedBar } from './SessionEndedBar'

/**
 * Route guard: renders the child routes for signed-in users, otherwise sends them to /login and back.
 * `keepOpenWhenSessionEnds` is for the editor: when the session ends while the page is open, the editor stays (with what was
 * typed since the last save) and a sign-in prompt appears over it instead of redirecting.
 */
export function RequireAuth({ keepOpenWhenSessionEnds = false }: { keepOpenWhenSessionEnds?: boolean }) {
  const { status, bootstrapError, signedOutByUser, lostSession, retryBootstrap } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <PageLoader label={msg("Checking your session")} />
  if (status === 'anonymous' && bootstrapError && bootstrapError.status !== 401) {
    return (
      <EmptyState
        icon={<WifiOff size={28} />}
        title={msg("We can’t reach Doory")}
        description={msg("Check your connection and try again. Your designs are safe.")}
        action={<Button onClick={retryBootstrap}>{msg("Try again")}</Button>}
        role="alert"
      />
    )
  }
  const sessionEnded = status === 'anonymous' && lostSession !== null && keepOpenWhenSessionEnds
  if (status === 'anonymous' && !sessionEnded && signedOutByUser) return <Navigate to="/" replace />
  if (status === 'anonymous' && !sessionEnded) {
    const next = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  // The same tree whether or not the session ended: the open editor must not be remounted when it comes back.
  return (
    <>
      <Outlet />
      {sessionEnded ? <SessionEndedBar /> : null}
    </>
  )
}
