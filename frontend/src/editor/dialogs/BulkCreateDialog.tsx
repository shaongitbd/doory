import { useEffect, useMemo, useState } from 'react'
import { configApi, isApiError } from '@/lib/api'
import type { BulkFillResult, TemplateField } from '@/types/api'
import { useEditor, useEditorState } from '../context'
import { t } from '../strings'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import styles from './BulkCreate.module.css'
import { autoMap, checkRows, MAX_ROWS, parseTable, type Mapping, type Table } from './bulkTable'
import dlg from './dialogs.module.css'

const PREVIEW_ROWS = 5
const ERRORS: Record<string, string> = { color: t.bulk.errorColor, https: t.bulk.errorHttps }

type Step = 'data' | 'map' | 'done'

const FOLDER_NAME_TRIES = 20

/** A new folder named `base`, or `base (2)`, `base (3)`… when that name is taken (a second bulk create from the
 * same design suggests the same name). */
async function newFolder(create: (name: string) => Promise<{ id: string; name: string }>, base: string): Promise<{ id: string; name: string }> {
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? base.slice(0, 120) : `${base.slice(0, 113)} (${n})`
    try {
      return await create(name)
    } catch (error) {
      const taken = isApiError(error) && error.status === 400 && (error.fields.name?.length ?? 0) > 0
      if (!taken || n >= FOLDER_NAME_TRIES) throw error
    }
  }
}

/** Bulk create: paste a table or upload a CSV, map its columns to the template fields, preview, create into a folder. */
export function BulkCreateDialog() {
  const editor = useEditor()
  const title = useEditorState((s) => s.title)
  const service = editor.adapter.services.bulkFill
  const [fields, setFields] = useState<TemplateField[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [step, setStep] = useState<Step>('data')
  const [maxRows, setMaxRows] = useState(MAX_ROWS)
  const [text, setText] = useState('')
  const [dataError, setDataError] = useState<string | null>(null)
  const [table, setTable] = useState<Table>({ headers: [], rows: [] })
  const [mapping, setMapping] = useState<Mapping>({})
  const [folderName, setFolderName] = useState(t.bulk.folderDefault(title))
  const [namePattern, setNamePattern] = useState('{title} - {n}')
  const [busy, setBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [result, setResult] = useState<BulkFillResult | null>(null)

  useEffect(() => {
    let live = true
    configApi
      .get()
      .then((cfg) => {
        if (live && cfg.limits?.bulk_fill_max_rows) {
          setMaxRows(cfg.limits.bulk_fill_max_rows)
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    service
      ?.fields()
      .then((list) => live && setFields(list.filter((f) => f.key)))
      .catch(() => live && setLoadError(true))
    return () => {
      live = false
    }
  }, [service])

  const checks = useMemo(() => (fields ? checkRows(table, mapping, fields) : []), [table, mapping, fields])
  const good = checks.filter((c) => Object.keys(c.errors).length === 0 && Object.keys(c.values).length > 0)
  const badCount = checks.filter((c) => Object.keys(c.errors).length > 0).length
  const close = (): void => editor.closeDialog()

  const readFile = (file: File | undefined): void => {
    if (!file) return
    file
      .text()
      .then((content) => setText(content))
      .catch(() => setDataError(t.bulk.readFailed))
  }

  const next = (): void => {
    const parsed = parseTable(text)
    if (parsed.rows.length === 0) return setDataError(t.bulk.noRows)
    if (parsed.rows.length > maxRows) return setDataError(t.bulk.tooManyRows(maxRows))
    setDataError(null)
    setTable(parsed)
    setMapping(autoMap(parsed.headers, fields ?? []))
    setStep('map')
  }

  const create = async (): Promise<void> => {
    if (!service || good.length === 0) return
    setBusy(true)
    setCreateError(null)
    let createdFolderId: string | null = null
    try {
      if (folderName.trim()) {
        const folder = await newFolder(service.createFolder, folderName.trim())
        createdFolderId = folder.id
      }
      const outcome = await service.run({
        rows: good.map((c) => c.values),
        row_numbers: good.map((c) => c.index),
        name_pattern: namePattern,
        folder: createdFolderId,
      })
      if (outcome.created === 0 && createdFolderId && service.removeFolder) {
        await service.removeFolder(createdFolderId).catch(() => {})
      }
      setResult(outcome)
      setStep('done')
    } catch (err: unknown) {
      if (createdFolderId && service.removeFolder) {
        await service.removeFolder(createdFolderId).catch(() => {})
      }
      setCreateError(isApiError(err) ? (err.message || t.bulk.createFailed) : t.bulk.createFailed)
    } finally {
      setBusy(false)
    }
  }

  const mapped = (fields ?? []).filter((f) => f.key && (mapping[f.key] ?? -1) >= 0)
  let body
  let footer
  if (loadError || !service) body = <p className={dlg.error}>{loadError ? t.bulk.loadFailed : t.bulk.unavailable}</p>
  else if (!fields) body = <p className={dlg.muted}>{t.bulk.loading}</p>
  else if (fields.length === 0) body = <p className={dlg.muted}>{t.bulk.noFields}</p>
  else if (step === 'data') {
    body = (
      <div className={dlg.stack}>
        <label className={dlg.field}>
          <span>{t.bulk.dataField}</span>
          <textarea className={styles.textarea} value={text} placeholder={t.bulk.dataPlaceholder} data-autofocus onChange={(e) => setText(e.target.value)} />
        </label>
        <label className={dlg.field}>
          <span>{t.bulk.upload}</span>
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={(e) => readFile(e.target.files?.[0])} />
        </label>
        {dataError && <p className={dlg.error}>{dataError}</p>}
      </div>
    )
    footer = (
      <>
        <Button onClick={close}>{t.dialog.cancel}</Button>
        <Button variant="primary" onClick={next} disabled={!text.trim()}>
          {t.bulk.next}
        </Button>
      </>
    )
  } else if (step === 'map') {
    body = (
      <div className={dlg.stack}>
        <fieldset className={dlg.fieldset}>
          <legend>{t.bulk.mapTitle}</legend>
          <div className={styles.mapping}>
            {fields.map((f) => {
              const label = f.label || f.key || ''
              return (
                <label key={f.key} style={{ display: 'contents' }}>
                  <span>{label}</span>
                  <select className={dlg.input} aria-label={t.bulk.mapField(label)} value={mapping[f.key!] ?? -1} onChange={(e) => setMapping({ ...mapping, [f.key!]: Number(e.target.value) })}>
                    <option value={-1}>{t.bulk.unmapped}</option>
                    {table.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `#${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>
        </fieldset>
        <div>
          <p className={dlg.muted}>{t.bulk.preview(Math.min(PREVIEW_ROWS, checks.length), checks.length)}</p>
          <div className={styles.preview}>
            <table>
              <thead>
                <tr>
                  <th>{t.bulk.row}</th>
                  {mapped.map((f) => (
                    <th key={f.key}>{f.label || f.key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checks.slice(0, PREVIEW_ROWS).map((c, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    {mapped.map((f) => {
                      const error = c.errors[f.key!]
                      const cell = table.rows[i][mapping[f.key!]] ?? ''
                      return (
                        <td key={f.key} className={error ? styles.bad : undefined} title={error ? `${cell}: ${ERRORS[error]}` : cell}>
                          {cell}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {badCount > 0 && (
          <div className={dlg.error} role="alert">
            <p>{t.bulk.rowErrors(badCount)}</p>
            <ul>
              {checks.flatMap((c) =>
                Object.entries(c.errors).map(([key, code]) => <li key={`${c.index}-${key}`}>{t.bulk.failedRow(c.index, `${key}: ${ERRORS[code]}`)}</li>),
              )}
            </ul>
          </div>
        )}
        <label className={dlg.field}>
          <span>{t.bulk.folderField}</span>
          <input className={dlg.input} value={folderName} maxLength={120} onChange={(e) => setFolderName(e.target.value)} />
        </label>
        <label className={dlg.field}>
          <span>{t.bulk.namePattern}</span>
          <input className={dlg.input} value={namePattern} maxLength={200} onChange={(e) => setNamePattern(e.target.value)} />
          <span className={dlg.muted}>{t.bulk.namePatternHint}</span>
        </label>
        {createError && <p className={dlg.error}>{createError}</p>}
      </div>
    )
    footer = (
      <>
        <Button onClick={() => setStep('data')} disabled={busy}>
          {t.bulk.back}
        </Button>
        <Button variant="primary" onClick={() => void create()} disabled={busy || good.length === 0}>
          {busy ? t.bulk.creating : t.bulk.create(good.length)}
        </Button>
      </>
    )
  } else if (result) {
    body = (
      <div className={dlg.stack}>
        <p role="status">{t.bulk.done(result.created)}</p>
        <ul className={styles.results}>
          {result.rows.map((row) =>
            row.ok ? (
              <li key={row.row}>
                {row.title}{' '}
                <a href={`/design/${row.design_id}`} target="_blank" rel="noreferrer">
                  {t.bulk.open}
                </a>
              </li>
            ) : (
              <li key={row.row} className={styles.bad}>
                {t.bulk.failedRow(row.row, row.error)}
              </li>
            ),
          )}
        </ul>
      </div>
    )
  }
  return (
    <Dialog title={t.bulk.title} description={t.bulk.description} onClose={close} width={640} footer={footer ?? <Button onClick={close}>{t.dialog.close}</Button>}>
      {body}
    </Dialog>
  )
}
