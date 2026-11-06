import { useEffect, useId, useState } from 'react'
import { isApiError } from '@/lib/api'
import type { AiOption } from '@/types/api'
import ed from '../chrome/ed.module.css'
import { useEditor } from '../context'
import type { PanelProps } from '../panels/registry'
import { t } from '../strings'
import styles from './Drawers.module.css'

export const TEXT_TO_IMAGE = 'text-to-image'
/** The backend's `MAX_PROMPT_LENGTH`. */
const MAX_PROMPT_LENGTH = 2000

/** The server options for making a picture from a prompt; empty while they load or when the server has none. */
export function useTextToImageOptions(): AiOption[] {
  const ai = useEditor().adapter.services.ai
  const [models, setModels] = useState<AiOption[]>([])
  useEffect(() => {
    if (!ai?.generate) return
    let live = true
    void ai.options(TEXT_TO_IMAGE).then(
      (options) => {
        if (live) setModels(options.models.filter((model) => model.kind === 'server'))
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [ai])
  return models
}

/** Create tab: a picture made on the server from a typed prompt, placed on the page. */
export function GenerateTab({ close, models }: PanelProps & { models: AiOption[] }) {
  const editor = useEditor()
  const ai = editor.adapter.services.ai
  const promptId = useId()
  const modelId = useId()
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(() => ai?.remembered(TEXT_TO_IMAGE) ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = models.find((m) => m.id === model) ?? models[0]

  const create = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const text = prompt.trim()
    if (!ai?.generate || !chosen || !text || busy) return
    setBusy(true)
    setError(null)
    try {
      const ref = await ai.generate(TEXT_TO_IMAGE, { model: chosen.id, prompt: text })
      ai.remember(TEXT_TO_IMAGE, chosen.id)
      await editor.insert.imageFromAsset(ref)
      close()
    } catch (err) {
      setError(isApiError(err) && err.isRateLimited ? t.imageDrawer.createBusy : t.imageDrawer.createFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void create(e)}>
      <label className={ed.sectionTitle} htmlFor={promptId}>
        {t.imageDrawer.promptLabel}
      </label>
      <textarea
        id={promptId}
        className={styles.prompt}
        data-testid="create-prompt"
        value={prompt}
        maxLength={MAX_PROMPT_LENGTH}
        placeholder={t.imageDrawer.promptPlaceholder}
        disabled={busy}
        onChange={(e) => setPrompt(e.target.value)}
      />
      {models.length > 1 ? (
        <>
          <label className={ed.sectionTitle} htmlFor={modelId} style={{ marginTop: 12 }}>
            {t.imageDrawer.model}
          </label>
          <select id={modelId} className={styles.prompt} value={chosen?.id ?? ''} disabled={busy} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label || m.provider_name}
              </option>
            ))}
          </select>
        </>
      ) : null}
      <button type="submit" className={`${ed.btn} ${ed.primary}`} style={{ width: '100%', marginTop: 12 }} data-testid="create-image" disabled={busy || !prompt.trim()}>
        {t.imageDrawer.createImage}
      </button>
      {busy ? (
        <div className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          {t.imageDrawer.creating}
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {chosen?.sends_offsite ? <p className={styles.note}>{ai?.offsiteNotice || t.imageDrawer.createOffsite}</p> : null}
    </form>
  )
}
