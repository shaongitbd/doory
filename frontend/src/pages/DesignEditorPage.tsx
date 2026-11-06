import { msg } from '@/i18n/catalog'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useAuthModal } from '@/features/auth/AuthModalProvider'
import { createAccountAdapter, RevisionTracker } from '@/features/editor/adapters'
import { EditorHomeLink } from '@/features/editor/EditorHomeLink'
import { EditorProblemPage, EditorSkeleton, type EditorProblem } from '@/features/editor/EditorStates'
import { LazyEditor } from '@/features/editor/LazyEditor'
import { useConflictResolution } from '@/features/editor/useConflictResolution'
import { designsApi, isApiError } from '@/lib/api'
import { useRestoreDesign } from '@/lib/api/hooks'
import { qk } from '@/lib/api/keys'
import { useLatest } from '@/lib/useLatest'
import { hasUnsavedChanges, useUnsavedGuard } from '@/lib/useUnsavedGuard'
import { usePageMeta } from '@/lib/usePageMeta'
import type { EditorHandle, SaveState } from '@/types/adapter'
import { Button } from '@/ui'
import { useNavigate } from 'react-router-dom'

function problemFor(error: unknown): EditorProblem {
  if (isApiError(error)) {
    if (error.isNetwork) return 'offline'
    if (error.status === 404) return 'not-found'
    if (error.status === 403) return 'forbidden'
  }
  return 'error'
}

/** `/design/:id`: the account editor for a design the signed-in user owns. */
export default function DesignEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { config, user, refresh, status, lostSession } = useAuth()
  const { openAuthModal } = useAuthModal()
  const handlers = useLatest({ openAuthModal, refresh })
  const restore = useRestoreDesign()
  const [revision] = useState(() => new RevisionTracker())
  const editorRef = useRef<EditorHandle>(null)
  const sessionWasLost = useRef(false)
  const [saveState, setSaveState] = useState<SaveState | null>(null)
  const [title, setTitle] = useState('')
  useUnsavedGuard(hasUnsavedChanges(saveState))

  // After a lost session is restored the editor is told to save what it could not save meanwhile.
  useEffect(() => {
    if (lostSession) sessionWasLost.current = true
    else if (sessionWasLost.current && status === 'authenticated') {
      sessionWasLost.current = false
      void editorRef.current?.saveNow().catch(() => undefined)
    }
  }, [lostSession, status])

  // The editor owns the document once mounted: never refetch underneath it.
  const query = useQuery({ queryKey: qk.designs.detail(id), queryFn: ({ signal }) => designsApi.get(id, signal), staleTime: Infinity, gcTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const design = query.data
  usePageMeta({ title: design?.title ?? 'Design', noindex: true })
  const resolveConflict = useConflictResolution(editorRef, title || design?.title || '')

  const serverPdf = config.features.server_pdf
  const realtime = config.features.realtime === true
  const exportsConfig = config.exports
  const aiProviders = config.features.ai_providers === true
  const aiConfig = config.ai
  const imageOptimize = config.features.image_optimize ?? null
  // Keep the last known user id across dropped sessions so the adapter is not rebuilt while editing.
  const [userId, setUserId] = useState(user?.id)
  if (user?.id && user.id !== userId) {
    setUserId(user.id)
  }
  const adapter = useMemo(
    () =>
      createAccountAdapter(id, () => revision.get(), {
        onRevision: (next) => revision.set(next),
        config: { features: { stock_photos: false, server_pdf: serverPdf, google_login: false, email_verification: false, realtime, ai_providers: aiProviders, image_optimize: imageOptimize }, exports: exportsConfig, ai: aiConfig },
        userId,
        requireSignIn: () => handlers.get().openAuthModal({ reason: 'generic', tab: 'login' }),
        refreshSession: async () => (await handlers.get().refresh()) !== null,
      }),
    [id, serverPdf, realtime, exportsConfig, aiProviders, aiConfig, imageOptimize, userId, revision, handlers],
  )
  useEffect(() => {
    if (design) revision.set(design.revision)
  }, [design, revision])
  // The live room starts connecting now, while the design and the editor are still loading.
  useEffect(() => {
    const room = adapter.realtime
    room?.early.start()
    return () => room?.early.release()
  }, [adapter])
  const meta = useMemo(() => (design ? { id: design.id, title: design.title, mode: 'account' as const, revision: design.revision } : null), [design])

  if (query.isPending) return <EditorSkeleton label={msg("Opening your design")} />
  if (query.isError) return <EditorProblemPage problem={problemFor(query.error)} onRetry={() => void query.refetch()} />
  if (!design || !meta) return null
  if (design.trashed_at) {
    return (
      <EditorProblemPage
        problem="trashed"
        extraAction={
          <Button
            loading={restore.isPending}
            onClick={() =>
              restore.mutate(design.id, {
                onSuccess: () => {
                  navigate(0)
                },
              })
            }
          >
            {msg("Restore design")}</Button>
        }
      />
    )
  }

  return <LazyEditor editorRef={editorRef} document={design.document} meta={meta} adapter={adapter} onTitleChange={setTitle} onSaveStateChange={setSaveState} onConflictResolve={resolveConflict} topBarStart={<EditorHomeLink to="/dashboard" />} />
}
