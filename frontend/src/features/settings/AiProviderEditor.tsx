import { CheckCircle2, CircleAlert, Download, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { describeFormError } from '@/features/auth/errors'
import { PasswordInput } from '@/features/auth/PasswordInput'
import { aiApi, isApiError } from '@/lib/api'
import type { AiProvider, AiProviderInput, AiProviderModel, AiProviderStyle, AiProviderTestResult } from '@/types/api'
import { Button, Checkbox, IconButton, Input, Select, Switch, Textarea } from '@/ui'
import { AI_STYLES, AI_TASKS, styleInfo, taskLabel } from './aiStyles'
import styles from './Settings.module.css'

const FIELDS = ['name', 'base_url', 'style', 'style_config', 'auth_header', 'secret', 'tasks', 'timeout_seconds'] as const
const DEFAULT_TIMEOUT = 60
const MAX_TIMEOUT = 60 // the server's cap for your own servers (USER_PROVIDER_MAX_TIMEOUT)

function errorText(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message || fallback : fallback
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
}

/**
 * Adds or edits one of the user's AI servers: the connection (address, API style and its settings, auth header
 * and write-only key, tasks), then, once saved, the models to offer and a test with the built-in sample picture.
 */
export function AiProviderEditor({ provider, onSaved, onClose }: { provider: AiProvider | null; onSaved(provider: AiProvider): void; onClose(): void }) {
  return (
    <div className={styles.issued}>
      <ConnectionForm provider={provider} onSaved={onSaved} onClose={onClose} />
      {provider ? (
        <>
          <ModelsEditor key={provider.id} provider={provider} onSaved={onSaved} />
          <ConnectionTest provider={provider} />
        </>
      ) : null}
    </div>
  )
}

function ConnectionForm({ provider, onSaved, onClose }: { provider: AiProvider | null; onSaved(provider: AiProvider): void; onClose(): void }) {
  const [name, setName] = useState(provider?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? '')
  const [style, setStyle] = useState<AiProviderStyle>(provider?.style ?? 'doory')
  const [styleConfig, setStyleConfig] = useState(provider && Object.keys(provider.style_config).length > 0 ? JSON.stringify(provider.style_config, null, 2) : '')
  const [authHeader, setAuthHeader] = useState(provider?.auth_header ?? '')
  const [secret, setSecret] = useState('')
  const [clearSecret, setClearSecret] = useState(false)
  const [tasks, setTasks] = useState<string[]>(provider?.tasks ?? [AI_TASKS[0].id])
  const [timeout, setTimeoutValue] = useState(String(provider?.timeout_seconds ?? DEFAULT_TIMEOUT))
  // A server the user adds is outside this site unless they say otherwise.
  const [offsite, setOffsite] = useState(provider?.sends_offsite ?? true)
  const [enabled, setEnabled] = useState(provider?.enabled ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const info = styleInfo(style)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Name the server, e.g. “My model server”.'
    if (!baseUrl.trim()) found.base_url = 'Enter the server’s address, e.g. https://ai.example.com.'
    if (tasks.length === 0) found.tasks = 'Choose at least one task.'
    const wait = Number(timeout)
    if (!Number.isInteger(wait) || wait < 1 || wait > MAX_TIMEOUT) found.timeout_seconds = `Enter a whole number of seconds from 1 to ${MAX_TIMEOUT}.`
    let config: Record<string, unknown> = {}
    if (styleConfig.trim()) {
      try {
        const parsed: unknown = JSON.parse(styleConfig)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
        config = parsed as Record<string, unknown>
      } catch {
        found.style_config = 'Write the settings as a JSON object, e.g. {"path": "/remove"}.'
      }
    }
    setErrors(found)
    setFormError('')
    if (Object.keys(found).length > 0) return
    const input: AiProviderInput = {
      name: name.trim(),
      base_url: baseUrl.trim(),
      style,
      style_config: config,
      auth_header: authHeader.trim(),
      tasks,
      timeout_seconds: wait,
      sends_offsite: offsite,
      enabled,
    }
    if (clearSecret) input.secret = ''
    else if (secret) input.secret = secret
    setBusy(true)
    try {
      const next = provider ? await aiApi.providers.update(provider.id, input) : await aiApi.providers.create(input)
      setSecret('')
      setClearSecret(false)
      onSaved(next)
    } catch (error) {
      const failure = describeFormError(error, FIELDS)
      setErrors(failure.fields)
      setFormError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const toggleTask = (id: string, on: boolean) => setTasks((list) => (on ? [...list, id] : list.filter((item) => item !== id)))

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-label={provider ? `Edit ${provider.name}` : 'Add a server'}>
      <p className={styles.tokenName}>{provider ? `Edit ${provider.name}` : 'Add a server'}</p>
      {formError ? (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      ) : null}
      <Input label="Name" placeholder="My model server" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} maxLength={80} autoComplete="off" />
      <Input label="Server address" placeholder="https://ai.example.com" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} error={errors.base_url} maxLength={500} autoComplete="off" spellCheck={false} inputMode="url" />
      <Select label="API style" hint={info.summary} options={AI_STYLES.map((item) => ({ value: item.id, label: item.label }))} value={style} onChange={(event) => setStyle(event.target.value as AiProviderStyle)} error={errors.style} />
      <Textarea
        label="Style settings (JSON)"
        hint={`Accepts: ${info.settings}`}
        placeholder={JSON.stringify(info.example, null, 2)}
        value={styleConfig}
        onChange={(event) => setStyleConfig(event.target.value)}
        error={errors.style_config}
        rows={4}
        spellCheck={false}
        className={styles.code}
      />
      <Input label="Auth header" hint="The header that carries your key, e.g. Authorization or X-Api-Key. Empty: no authentication." placeholder="Authorization" value={authHeader} onChange={(event) => setAuthHeader(event.target.value)} error={errors.auth_header} maxLength={64} autoComplete="off" spellCheck={false} />
      <PasswordInput
        label="Key"
        hint={provider?.has_secret ? 'A key is stored. Leave this empty to keep it.' : 'The header’s value, e.g. “Bearer …”. It is stored encrypted and never shown again.'}
        placeholder={provider?.has_secret ? 'Stored' : ''}
        name="ai-provider-key"
        autoComplete="new-password"
        value={secret}
        onChange={(event) => {
          setSecret(event.target.value)
          if (event.target.value) setClearSecret(false)
        }}
        error={errors.secret}
        disabled={clearSecret}
      />
      {provider?.has_secret ? <Checkbox label="Remove the stored key" checked={clearSecret} onChange={(event) => setClearSecret(event.target.checked)} /> : null}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Tasks</legend>
        {AI_TASKS.map((task) => (
          <Checkbox key={task.id} label={task.label} checked={tasks.includes(task.id)} onChange={(event) => toggleTask(task.id, event.target.checked)} />
        ))}
        {errors.tasks ? <p className={styles.error}>{errors.tasks}</p> : null}
      </fieldset>
      <Input label="Time limit (seconds)" type="number" min={1} max={MAX_TIMEOUT} value={timeout} onChange={(event) => setTimeoutValue(event.target.value)} error={errors.timeout_seconds} />
      <Checkbox label="Images leave this site" description="The editor shows a privacy notice under this server’s options." checked={offsite} onChange={(event) => setOffsite(event.target.checked)} />
      <Switch label="Offer this server in the editor" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
      <div className={styles.inline}>
        <Button type="submit" loading={busy}>
          {provider ? 'Save changes' : 'Add server'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {provider ? 'Done' : 'Cancel'}
        </Button>
      </div>
    </form>
  )
}

type ModelRow = Pick<AiProviderModel, 'task' | 'remote_name' | 'label' | 'enabled'>

function ModelsEditor({ provider, onSaved }: { provider: AiProvider; onSaved(provider: AiProvider): void }) {
  const [rows, setRows] = useState<ModelRow[]>(() => provider.models.map(({ task, remote_name, label, enabled }) => ({ task, remote_name, label, enabled })))
  const [busy, setBusy] = useState<'load' | 'save' | null>(null)
  const [error, setError] = useState('')
  const canLoad = styleInfo(provider.style).canLoadModels
  const tasks = provider.tasks.length > 0 ? provider.tasks : [AI_TASKS[0].id]

  const update = (index: number, patch: Partial<ModelRow>) => setRows((list) => list.map((row, at) => (at === index ? { ...row, ...patch } : row)))

  async function load() {
    setBusy('load')
    setError('')
    try {
      const updated = await aiApi.providers.loadModels(provider.id)
      setRows(updated.models.map(({ task, remote_name, label, enabled }) => ({ task, remote_name, label, enabled })))
      onSaved(updated)
    } catch (failure) {
      setError(errorText(failure, 'The server’s models could not be loaded.'))
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    const keys = rows.map((row) => `${row.task}\u0000${row.remote_name.trim()}`)
    if (new Set(keys).size !== keys.length) {
      setError('Each model may be listed once per task.')
      return
    }
    setBusy('save')
    setError('')
    try {
      const updated = await aiApi.providers.setModels(provider.id, rows.map((row, order) => ({ ...row, remote_name: row.remote_name.trim(), label: row.label.trim(), sort_order: order })))
      setRows(updated.models.map(({ task, remote_name, label, enabled }) => ({ task, remote_name, label, enabled })))
      onSaved(updated)
    } catch (failure) {
      setError(errorText(failure, 'The models could not be saved.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={styles.form} aria-label="Models">
      <p className={styles.tokenName}>Models</p>
      <p className={styles.hint}>
        {canLoad ? 'Load the models the server lists, then choose which to offer and how to label them (e.g. Fast, Best).' : 'Enter the model names the server accepts and label them (e.g. Fast, Best).'} Without models the editor offers the server’s default model, named after the server.
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className={styles.tokenList} aria-label="Models to offer">
          {rows.map((row, index) => (
            <li key={index} className={styles.modelRow}>
              {tasks.length > 1 ? (
                <Select label="Task" options={tasks.map((task) => ({ value: task, label: taskLabel(task) }))} value={row.task} onChange={(event) => update(index, { task: event.target.value })} selectSize="sm" />
              ) : null}
              <Input label="Model" placeholder="Server default" value={row.remote_name} onChange={(event) => update(index, { remote_name: event.target.value })} maxLength={200} autoComplete="off" spellCheck={false} />
              <Input label="Label" placeholder="Best" value={row.label} onChange={(event) => update(index, { label: event.target.value })} maxLength={80} autoComplete="off" />
              <Checkbox label="Offer" checked={row.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} />
              <IconButton label={`Remove model ${row.label || row.remote_name || index + 1}`} icon={<Trash2 size={14} />} size="sm" onClick={() => setRows((list) => list.filter((_, at) => at !== index))} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.inline}>
        {canLoad ? (
          <Button variant="secondary" size="sm" leftIcon={<Download size={14} />} loading={busy === 'load'} disabled={busy !== null} onClick={() => void load()}>
            Load models
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" leftIcon={<Plus size={14} />} disabled={busy !== null} onClick={() => setRows((list) => [...list, { task: tasks[0], remote_name: '', label: '', enabled: true }])}>
          Add model
        </Button>
        <Button size="sm" loading={busy === 'save'} disabled={busy !== null} onClick={() => void save()}>
          Save models
        </Button>
      </div>
    </section>
  )
}

function ConnectionTest({ provider }: { provider: AiProvider }) {
  const [result, setResult] = useState<AiProviderTestResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setResult(await aiApi.providers.test(provider.id))
    } catch (failure) {
      setError(errorText(failure, 'The test could not be run.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.form} aria-label="Test connection">
      <p className={styles.tokenName}>Test connection</p>
      <p className={styles.hint}>Sends a built-in sample picture with the saved settings and shows what comes back.</p>
      <div>
        <Button variant="secondary" size="sm" loading={busy} onClick={() => void run()}>
          Test connection
        </Button>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className={styles.testResult} role="status">
          {result.ok ? (
            <>
              <p className={styles.tokenName}>
                <CheckCircle2 size={16} aria-hidden /> It works: answered in {seconds(result.duration_ms)}.
              </p>
              {result.preview ? <img className={styles.preview} src={result.preview} alt="The sample picture as the server returned it" /> : null}
            </>
          ) : (
            <p className={styles.error}>
              <CircleAlert size={16} aria-hidden /> {result.error?.message ?? 'The server failed.'} ({seconds(result.duration_ms)})
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}
