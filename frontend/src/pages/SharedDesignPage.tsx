import { msg } from '@/i18n/catalog'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, LinkIcon, PencilLine } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useAuthModal } from '@/features/auth/AuthModalProvider'
import { rateLimitMessage } from '@/features/auth/errors'
import { createSharedAdapter, RevisionTracker } from '@/features/editor/adapters'
import { EditorHomeLink } from '@/features/editor/EditorHomeLink'
import { EditorProblemPage, EditorSkeleton } from '@/features/editor/EditorStates'
import { LazyEditor } from '@/features/editor/LazyEditor'
import { useConflictResolution } from '@/features/editor/useConflictResolution'
import { isApiError, shareApi } from '@/lib/api'
import { useLatest } from '@/lib/useLatest'
import { hasUnsavedChanges, useUnsavedGuard } from '@/lib/useUnsavedGuard'
import { usePageMeta } from '@/lib/usePageMeta'
import type { EditorHandle, EditorMode, SaveState } from '@/types/adapter'
import type { ShareRole } from '@/types/api'
import { Avatar, Button, EmptyState, Input, LinkButton } from '@/ui'
import styles from './SharedDesignPage.module.css'

const MODE: Record<ShareRole, EditorMode> = { view: 'shared-view', comment: 'shared-comment', edit: 'shared-edit' }

function isPasswordProblem(error: unknown): boolean {
  return isApiError(error) && (error.status === 401 || error.status === 403 || error.isRateLimited)
}

/** What the password form says under the field after a refusal: wrong password, or too many guesses (even a right one is turned away then). */
function passwordRefusal(error: unknown, attempted: boolean): string | undefined {
  if (isApiError(error) && error.isRateLimited) return rateLimitMessage(error.retryAfter)
  return attempted ? 'That password isn’t right. Try again.' : undefined
}

/** `/s/:token`: the shared-link viewer (view / comment / edit), with the password prompt flow. */
export default function SharedDesignPage() {
  const { token = '' } = useParams()
  const { status, config, refresh } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [password, setPassword] = useState<string | undefined>(undefined)
  const [attempted, setAttempted] = useState(false)
  const [revision] = useState(() => new RevisionTracker())
  const handlers = useLatest({ openAuthModal, refresh })

  const query = useQuery({
    queryKey: ['shared', token, password ?? null],
    queryFn: ({ signal }) => shareApi.getShared(token, password, signal),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const shared = query.data
  usePageMeta({ title: shared?.title ?? 'Shared design', noindex: true })
  const editorRef = useRef<EditorHandle>(null)
  const [saveState, setSaveState] = useState<SaveState | null>(null)
  const [title, setTitle] = useState('')
  useUnsavedGuard(hasUnsavedChanges(saveState))
  const resolveConflict = useConflictResolution(editorRef, title || shared?.title || '')

  useEffect(() => {
    if (shared) revision.set(shared.revision)
  }, [shared, revision])

  const role = shared?.role
  const fonts = shared?.fonts
  const designId = shared?.design_id
  // Everybody in a live room is signed in; visitors who are not keep the static view.
  const joinLive = config.features.realtime === true && status === 'authenticated' && !!designId
  const adapter = useMemo(
    () =>
      role
        ? createSharedAdapter({
            token,
            role,
            password,
            getRevision: () => revision.get(),
            onRevision: (next) => revision.set(next),
            ensureSignedIn: (reason) => handlers.get().openAuthModal({ reason }),
            fonts,
            live: joinLive && designId ? { designId, requireSignIn: () => handlers.get().openAuthModal({ reason: 'generic', tab: 'login' }), refreshSession: async () => (await handlers.get().refresh()) !== null } : undefined,
          })
        : null,
    [token, role, password, revision, handlers, fonts, joinLive, designId],
  )
  const meta = useMemo(() => (shared ? { id: token, title: shared.title, mode: MODE[shared.role], revision: shared.revision } : null), [shared, token])
  // The live room starts connecting now, while the editor is still loading.
  useEffect(() => {
    const room = adapter?.realtime
    room?.early.start()
    return () => room?.early.release()
  }, [adapter])

  if (query.isPending) return <EditorSkeleton label={msg("Opening the shared design")} />

  if (query.isError) {
    if (isPasswordProblem(query.error)) {
      return <PasswordGate error={passwordRefusal(query.error, attempted && password !== undefined)} busy={query.isFetching} onSubmit={(value) => { setAttempted(true); setPassword(value) }} />
    }
    if (isApiError(query.error) && query.error.status === 404) {
      return (
        <main id="main" tabIndex={-1} className={styles.center}>
          <EmptyState
            icon={<LinkIcon size={28} />}
            title={msg("This link doesn’t work")}
            description={msg("It may have been turned off, it may have expired, or it was never valid. Ask the owner for a new link.")}
            role="alert"
            action={<LinkButton to="/create">{msg("Design something of your own")}</LinkButton>}
          />
        </main>
      )
    }
    return <EditorProblemPage problem={isApiError(query.error) && query.error.isNetwork ? 'offline' : 'error'} onRetry={() => void query.refetch()} />
  }

  if (!shared || !adapter || !meta) return null

  if (shared.role === 'edit' && status !== 'authenticated') {
    return (
      <main id="main" tabIndex={-1} className={styles.center}>
        <EmptyState
          icon={<PencilLine size={28} />}
          title={`Sign in to edit “${shared.title}”`}
          description={`${shared.owner.name} invited you to edit this design. Log in or create a free account to continue.`}
          action={<Button onClick={() => void openAuthModal({ reason: 'generic', tab: 'login' })}>{msg("Sign in to edit")}</Button>}
        />
      </main>
    )
  }

  return (
    <LazyEditor
      editorRef={editorRef}
      document={shared.document}
      meta={meta}
      adapter={adapter}
      onTitleChange={setTitle}
      onSaveStateChange={setSaveState}
      onConflictResolve={resolveConflict}
      topBarStart={<EditorHomeLink to="/" />}
      topBarEnd={
        <div className={styles.topEnd}>
          <span className={styles.owner}>
            <Avatar name={shared.owner.name} src={shared.owner.avatar_url} size={24} />
            <span>{msg("Shared by ")}{shared.owner.name}</span>
          </span>
          <LinkButton to="/create" size="sm" variant="secondary">
            {msg("Design your own")}</LinkButton>
        </div>
      }
    />
  )
}

function PasswordGate({ error, busy, onSubmit }: { error?: string; busy: boolean; onSubmit(password: string): void }) {
  const [value, setValue] = useState('')
  usePageMeta({ title: msg("Password required"), noindex: true })
  function submit(event: FormEvent) {
    event.preventDefault()
    if (value) onSubmit(value)
  }
  return (
    <main id="main" tabIndex={-1} className={styles.center}>
      <form className={styles.gate} onSubmit={submit}>
        <span className={styles.gateIcon} aria-hidden="true">
          <KeyRound size={28} />
        </span>
        <h1 className={styles.gateTitle}>{msg("This design is protected")}</h1>
        <p className={styles.gateLead}>{msg("Enter the password the owner shared with you.")}</p>
        <Input label={msg("Password")} type="password" name="share-password" autoComplete="off" autoFocus value={value} onChange={(event) => setValue(event.target.value)} error={error} />
        <Button type="submit" size="lg" fullWidth loading={busy} disabled={!value}>
          {msg("Open design")}</Button>
      </form>
    </main>
  )
}
