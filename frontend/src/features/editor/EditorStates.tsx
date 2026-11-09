import { msg } from '@/i18n/catalog'
import { FileQuestion, Lock, ServerCrash, Trash2, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, LinkButton, Skeleton } from '@/ui'
import styles from './EditorStates.module.css'

/** Placeholder shaped like the editor while its chunk and document load. */
export function EditorSkeleton({ label = 'Opening the editor' }: { label?: string }) {
  return (
    <div className={styles.skeleton} role="status" aria-label={label}>
      <div className={styles.skTop}>
        <Skeleton width={120} height={28} />
        <Skeleton width={180} height={28} />
        <Skeleton width={90} height={32} radius="var(--radius-md)" className={styles.skEnd} />
      </div>
      <div className={styles.skBody}>
        <Skeleton className={styles.skRail} height="100%" />
        <Skeleton className={styles.skPanel} height="100%" />
        <div className={styles.skCanvas}>
          <Skeleton width="min(60%, 28rem)" height="min(60%, 28rem)" radius="var(--radius-md)" />
        </div>
      </div>
    </div>
  )
}

export type EditorProblem = 'not-found' | 'forbidden' | 'offline' | 'error' | 'local-missing' | 'trashed'

const COPY: Record<EditorProblem, { icon: ReactNode; title: string; description: string }> = {
  'not-found': { icon: <FileQuestion size={28} />, title: "We can’t find that design", description: "It may have been deleted, or the link is wrong." },
  forbidden: { icon: <Lock size={28} />, title: "You don’t have access to this design", description: "Ask the owner to share it with you, or sign in with a different account." },
  offline: { icon: <WifiOff size={28} />, title: "You’re offline", description: "Reconnect to the internet to open this design. Nothing has been lost." },
  error: { icon: <ServerCrash size={28} />, title: "This design didn’t load", description: "Something went wrong on our side. Your work is safe. Try again in a moment." },
  'local-missing': {
    icon: <FileQuestion size={28} />,
    title: "This design isn’t in this browser",
    description: "Guest designs are stored in the browser they were made in. If you started it on another device or cleared your browsing data, it’s no longer here. Signed-in designs follow you everywhere.",
  },
  trashed: { icon: <Trash2 size={28} />, title: "This design is in the trash", description: "Restore it from the trash to keep editing." },
}

export function EditorProblemPage({ problem, onRetry, extraAction }: { problem: EditorProblem; onRetry?: () => void; extraAction?: ReactNode }) {
  const copy = COPY[problem]
  return (
    <div className={styles.problem}>
      <EmptyState
        icon={copy.icon}
        title={msg(copy.title)}
        description={msg(copy.description)}
        role="alert"
        action={
          <>
            {onRetry && (problem === 'offline' || problem === 'error') ? <Button onClick={onRetry}>{msg("Try again")}</Button> : null}
            {extraAction}
            <LinkButton to="/create" variant={problem === 'local-missing' ? 'primary' : 'secondary'}>
              {msg("Start a new design")}</LinkButton>
            <Link to="/">{msg("Back to home")}</Link>
          </>
        }
      />
    </div>
  )
}
