import { msg } from '@/i18n/catalog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useAuthModal } from '@/features/auth/AuthModalProvider'
import { createGuestAdapter, type MigrationProgress } from '@/features/editor/adapters'
import { EditorHomeLink } from '@/features/editor/EditorHomeLink'
import { EditorProblemPage, EditorSkeleton } from '@/features/editor/EditorStates'
import { GuestBanner } from '@/features/editor/GuestBanner'
import { LazyEditor } from '@/features/editor/LazyEditor'
import { MigrationOverlay } from '@/features/editor/MigrationOverlay'
import { getLocalDesign, localRepository, type LocalDesign } from '@/lib/local'
import { useStorageMode } from '@/lib/local/useStorageMode'
import { registerE2eHook } from '@/lib/e2eHooks'
import { useLatest } from '@/lib/useLatest'
import { hasUnsavedChanges, useUnsavedGuard } from '@/lib/useUnsavedGuard'
import { usePageMeta } from '@/lib/usePageMeta'
import type { EditorHandle, SaveInput, SaveState } from '@/types/adapter'
import { useToast } from '@/ui'

type Load = { kind: 'loading' } | { kind: 'ready'; design: LocalDesign } | { kind: 'missing' } | { kind: 'error' }

/** `/local/:localId`: the guest editor. Everything lives in this browser until the user signs up. */
export default function LocalEditorPage() {
  const { localId = '' } = useParams()
  const navigate = useNavigate()
  const { status, config } = useAuth()
  const { openAuthModal } = useAuthModal()
  const { toast } = useToast()
  const storageMode = useStorageMode()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [title, setTitle] = useState('')
  const [saveState, setSaveState] = useState<SaveState | null>(null)
  const [migration, setMigration] = useState<{ active: boolean; progress: MigrationProgress | null }>({ active: false, progress: null })
  const editorRef = useRef<EditorHandle>(null)

  useEffect(() => {
    let active = true
    getLocalDesign(localId)
      .then((design) => {
        if (!active) return
        if (design) {
          setTitle(design.title)
          setLoad({ kind: 'ready', design })
        } else setLoad({ kind: 'missing' })
      })
      .catch(() => active && setLoad({ kind: 'error' }))
    return () => {
      active = false
    }
  }, [localId, attempt])

  usePageMeta({ title: title || 'Design', noindex: true })

  // The adapter must stay referentially stable (the editor is mounted with it), so it reads the latest
  // handlers through a ref instead of closing over per-render values.
  const handlers = useLatest({ openAuthModal, navigate, toast })
  const maxUploadBytes = config.limits.max_upload_bytes

  const adapter = useMemo(
    () =>
      createGuestAdapter({
        localId,
        maxUploadBytes,
        ensureSignedIn: (reason) => handlers.get().openAuthModal({ reason }),
        onMigrationStart: () => setMigration({ active: true, progress: null }),
        onMigrationProgress: (progress) => setMigration({ active: true, progress }),
        onMigrationWarning: (message) => handlers.get().toast({ title: msg("Some images were left out"), description: message, variant: 'warning', duration: 9000 }),
        onMigrated: (designId) => {
          setMigration({ active: false, progress: null })
          handlers.get().toast({ title: msg("Saved to your account"), description: msg("Your design is now safe in the cloud."), variant: 'success' })
          handlers.get().navigate(`/design/${designId}`, { replace: true })
        },
        onMigrationError: (error, retry) => {
          setMigration({ active: false, progress: null })
          handlers.get().toast({
            title: msg("We couldn’t save to your account"),
            description: `${error.message} Your design is still safe in this browser.`,
            variant: 'error',
            duration: 0,
            action: { label: msg("Try again"), onClick: () => void retry() },
          })
        },
      }),
    [localId, maxUploadBytes, handlers],
  )

  // Without browser storage the design only lives in this tab; and a change that could not be written yet is as good as lost.
  useUnsavedGuard(storageMode === 'memory' || hasUnsavedChanges(saveState))

  const saveAction = useLatest(() => saveToAccount())
  useEffect(() => registerE2eHook('saveToAccount', () => saveAction.get()()), [saveAction])

  async function saveToAccount() {
    const handle = editorRef.current
    const snapshot = async (): Promise<SaveInput> => {
      await handle?.saveNow().catch(() => undefined)
      const stored = await localRepository.getDesign(localId)
      return { document: handle?.getDocument() ?? stored?.document ?? (load.kind === 'ready' ? load.design.document : (await Promise.reject(new Error('No design loaded')))), title, thumbnail: stored?.thumbnail }
    }
    await adapter.requireAccount('save', snapshot)
  }

  const initialMeta = useMemo(() => (load.kind === 'ready' ? { id: load.design.id, title: load.design.title, mode: 'guest' as const } : null), [load])

  if (load.kind === 'loading') return <EditorSkeleton label={msg("Opening your design")} />
  if (load.kind === 'missing') return <EditorProblemPage problem="local-missing" />
  if (load.kind === 'error') return <EditorProblemPage problem="error" onRetry={() => setAttempt((value) => value + 1)} />
  if (!initialMeta) return null

  return (
    <>
      <LazyEditor
        editorRef={editorRef}
        document={load.design.document}
        meta={initialMeta}
        adapter={adapter}
        onTitleChange={setTitle}
        onSaveStateChange={setSaveState}
        topBarStart={<EditorHomeLink to="/" />}
        topBarEnd={<GuestBanner signedIn={status === 'authenticated'} memoryOnly={storageMode === 'memory'} busy={migration.active} onSave={() => void saveToAccount()} />}
      />
      <MigrationOverlay open={migration.active} progress={migration.progress} />
    </>
  )
}
