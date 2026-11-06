import { msg } from '@/i18n/catalog'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EditorProblemPage, EditorSkeleton } from '@/features/editor/EditorStates'
import { useAuth } from '@/features/auth/AuthProvider'
import { resolveCreateSpec, type CreateSpec, type TemplateSpec } from '@/features/presets'
import { designsApi, templatesApi } from '@/lib/api'
import { getSizePresets, sizePresetsReady } from '@/lib/sizePresets'
import { createBlankDocument } from '@/lib/document'
import { createLocalDesign } from '@/lib/local'
import { usePageMeta } from '@/lib/usePageMeta'
import { LocalStorageFullError } from '@/lib/local'
import { EmptyState, Button } from '@/ui'
import { TriangleAlert } from 'lucide-react'

/**
 * `/create`: makes a new design from the query string and replaces itself with the editor route.
 * Guests get a local design (`/local/:id`); signed-in users get a real one (`/design/:id`).
 */
export default function CreatePage() {
  usePageMeta({ title: msg("Creating your design"), noindex: true })
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { status } = useAuth()
  const started = useRef(false)
  const [failure, setFailure] = useState<'template-missing' | 'storage-full' | 'error' | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (status === 'loading' || started.current) return
    started.current = true
    void (async () => {
      // A preset the server's catalogue adds is only known once that has loaded.
      const spec = resolveCreateSpec(params, params.has('preset') ? await sizePresetsReady() : getSizePresets())
      try {
        const target = status === 'authenticated' ? await createAccountDesign(spec) : await createGuestDesign(spec)
        navigate(target, { replace: true })
      } catch (error) {
        started.current = false
        if (error instanceof LocalStorageFullError) setFailure('storage-full')
        else if (spec.kind === 'template' && isNotFound(error)) setFailure('template-missing')
        else setFailure('error')
      }
    })()
  }, [status, params, navigate, attempt])

  if (failure === 'template-missing') {
    return <EditorProblemPage problem="not-found" extraAction={<Button variant="secondary" onClick={() => navigate('/templates')}>{msg("Browse templates")}</Button>} />
  }
  if (failure === 'storage-full') {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} />}
        title={msg("Your browser is out of space")}
        description={msg("Doory couldn’t store a new design here. Free up some space, or sign up to keep designs in your account instead.")}
        role="alert"
        action={<Button onClick={() => navigate('/signup')}>{msg("Create a free account")}</Button>}
      />
    )
  }
  if (failure === 'error') {
    return (
      <EditorProblemPage
        problem="error"
        onRetry={() => {
          setFailure(null)
          setAttempt((value) => value + 1)
        }}
      />
    )
  }
  return <EditorSkeleton label={msg("Setting up your canvas")} />
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && (error as { status: number }).status === 404
}

async function createGuestDesign(spec: CreateSpec | TemplateSpec): Promise<string> {
  if (spec.kind === 'template') {
    const template = await templatesApi.get(spec.slug)
    const document = { ...template.document, meta: { ...template.document.meta, presetId: template.document.meta?.presetId ?? (template.preset || undefined) } }
    const local = await createLocalDesign({ title: template.title, document })
    return `/local/${local.id}`
  }
  const local = await createLocalDesign({ title: spec.title, document: createBlankDocument(spec.width, spec.height, { unit: spec.unit, presetId: spec.presetId }) })
  return `/local/${local.id}`
}

async function createAccountDesign(spec: CreateSpec | TemplateSpec): Promise<string> {
  if (spec.kind === 'template') {
    const design = await templatesApi.use(spec.slug)
    return `/design/${design.id}`
  }
  const design = await designsApi.create({ title: spec.title, width: spec.width, height: spec.height, preset: spec.presetId, document: createBlankDocument(spec.width, spec.height, { unit: spec.unit, presetId: spec.presetId }) })
  return `/design/${design.id}`
}
