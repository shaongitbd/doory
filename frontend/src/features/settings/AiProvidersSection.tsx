import { Pencil, Plus, Server, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { aiApi, isApiError } from '@/lib/api'
import type { AiProvider } from '@/types/api'
import { Badge, Button, ConfirmDialog, useToast } from '@/ui'
import { AiProviderEditor } from './AiProviderEditor'
import { styleInfo } from './aiStyles'
import { SettingsCard } from './SettingsCard'
import styles from './Settings.module.css'

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function modelSummary(provider: AiProvider): string {
  const offered = provider.models.filter((model) => model.enabled)
  if (provider.models.length === 0) return 'the server’s default model'
  if (offered.length === 0) return 'no models offered'
  return offered.map((model) => model.label || model.remote_name || 'default').join(', ')
}

/**
 * Settings → AI providers: the user's own AI servers ("bring your own server"). Shown when `/config/` says users
 * may have them; hides itself when the server answers that this user may not (e.g. staff only).
 */
export function AiProvidersSection() {
  const { toast } = useToast()
  const [providers, setProviders] = useState<AiProvider[] | null>(null)
  const [hidden, setHidden] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<AiProvider | 'new' | null>(null)
  const [removing, setRemoving] = useState<AiProvider | null>(null)
  const [busy, setBusy] = useState(false)
  const newForm = useRef(0)
  const [formId, setFormId] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    aiApi.providers
      .list(controller.signal)
      .then(setProviders)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isApiError(error) && error.status === 403) setHidden(true)
        else {
          setProviders([])
          setLoadError('Your AI servers could not be loaded. Reload the page to try again.')
        }
      })
    return () => controller.abort()
  }, [])

  if (hidden) return null

  /** `target` is what the form that saved was editing; `form` numbers the "Add a server" forms, so a late answer
   * from an earlier form never takes over the one open now. */
  const saved = (provider: AiProvider, target: AiProvider | 'new', form: number): void => {
    setProviders((list) => {
      const rest = (list ?? []).filter((item) => item.id !== provider.id)
      const at = (list ?? []).findIndex((item) => item.id === provider.id)
      if (at < 0) return [...rest, provider]
      rest.splice(at, 0, provider)
      return rest
    })
    setEditing((current) => {
      if (current === null) return null
      if (current === 'new') return target === 'new' && form === newForm.current ? provider : current
      return current.id === provider.id ? provider : current
    })
  }

  async function remove(provider: AiProvider) {
    setBusy(true)
    try {
      await aiApi.providers.remove(provider.id)
      setProviders((list) => (list ?? []).filter((item) => item.id !== provider.id))
      if (editing !== null && editing !== 'new' && editing.id === provider.id) setEditing(null)
      toast({ title: 'Server removed', description: `${provider.name} is no longer offered in the editor.` })
    } catch {
      toast({ title: 'Couldn’t remove the server', description: 'Please try again.', variant: 'error' })
    } finally {
      setBusy(false)
      setRemoving(null)
    }
  }

  return (
    <SettingsCard
      id="ai-providers"
      title="AI providers"
      description="Connect your own AI server for background removal. Only you can use the servers you add here; the editor offers them under Remove background. Your key is stored encrypted and never shown again."
    >
      {loadError ? (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      ) : null}
      {editing ? (
        <AiProviderEditor
          key={editing === 'new' ? `new-${formId}` : editing.id}
          provider={editing === 'new' ? null : editing}
          onSaved={(provider) => saved(provider, editing, formId)}
          onClose={() => setEditing(null)}
        />
      ) : (
        <div>
          <Button variant="secondary" leftIcon={<Plus size={16} />} onClick={() => {
              newForm.current += 1
              setFormId(newForm.current)
              setEditing('new')
            }}
            disabled={providers === null}
          >
            Add a server
          </Button>
        </div>
      )}
      {providers && providers.length > 0 ? (
        <ul className={styles.tokenList} aria-label="Your AI servers">
          {providers.map((provider) => (
            <li key={provider.id} className={styles.tokenRow}>
              <div>
                <p className={`${styles.tokenName} ${styles.providerName}`}>
                  <Server size={14} aria-hidden /> {provider.name}
                  <Badge>{styleInfo(provider.style).label}</Badge>
                  {provider.has_secret ? <Badge tone="success">Key stored</Badge> : null}
                  {provider.enabled ? null : <Badge tone="warning">Off</Badge>}
                </p>
                <p className={styles.hint}>
                  {host(provider.base_url)} · {modelSummary(provider)}
                </p>
              </div>
              <div className={styles.rowActions}>
                <Button variant="ghost" size="sm" leftIcon={<Pencil size={14} />} onClick={() => setEditing(provider)} aria-label={`Edit ${provider.name}`}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" leftIcon={<Trash2 size={14} />} onClick={() => setRemoving(provider)} aria-label={`Remove ${provider.name}`}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title="Remove this server?"
        description={removing ? `“${removing.name}” and its stored key will be deleted. The editor stops offering it.` : undefined}
        confirmLabel="Remove"
        tone="danger"
        loading={busy}
        onConfirm={() => (removing ? remove(removing) : undefined)}
        onCancel={() => setRemoving(null)}
      />
    </SettingsCard>
  )
}
