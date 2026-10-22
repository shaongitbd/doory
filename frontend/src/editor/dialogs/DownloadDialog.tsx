import { CircleCheck, Code, Copy, Download, Info } from 'lucide-react'
import { type ReactNode, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useSizePresets } from '@/lib/sizePresets'
import { usePersistedState } from '@/lib/usePersistedState'
import { useEditor, useEditorState } from '../context'
import { safeMultiplier } from '../engine/render'
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions, type ExportStage, type QualityPreset, exportFilename, exportFormats, pageFilename, parsePageRange, sanitizeFilename } from '../engine/export/registry'
import { type PageSelection, copyPageAsPng, downloadFiles, pickPages, runExport } from '../engine/export/exporter'
import { designPreset, loadLastExport, optimizesByDefault, saveLastExport } from '../engine/export/choices'
import { FILENAME_STYLES, type FilenameStyle, unixNow } from '../engine/export/filenames'
import { pageMultiplier } from '../engine/export/formats'
import { type RasterFormat, hasAlpha, isLossy, serverConverts } from '../engine/export/raster'
import { parseSize } from '../engine/export/size'
import { formatBytes } from '../engine/export/video/estimate'
import { zipFilename } from '../engine/export/zip'
import { getPageSize, sameSize } from '../engine/pageSizes'
import { t } from '../strings'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Segmented } from '../ui/Segmented'
import { Switch } from '../ui/Switch'
import { ExportProblem } from './print/ExportProblem'
import { PrintSection } from './print/PrintSection'
import type { VideoFormat } from '../engine/export/video/options'
import { LazyVideoSection } from './VideoSectionLoader'
import { AudioCredits } from '../panels/AudioCredits'
import { type ExportFailure, describeExportFailure, isCancellation } from './print/exportFailure'
import { type PrintSettings, applyPreset, describeSizes, loadPrintSettings, savePrintSettings } from './print/printOptions'
import { ApiPreview } from './download/ApiPreview'
import { apiFormat, describeCall } from './download/apiCall'
import { ComparePreview, type Zoom } from './download/ComparePreview'
import { FormatPicker } from './download/FormatPicker'
import { MoreSettings } from './download/MoreSettings'
import { OptimizerCard } from './download/OptimizerCard'
import { PageThumbs } from './download/PageThumbs'
import { type Purpose, purposesFor } from './download/purposes'
import { PurposeCards } from './download/PurposeCards'
import { QualityControl } from './download/QualityControl'
import { SizeField } from './download/SizeField'
import { usePreview } from './download/usePreview'
import printStyles from './print/print.module.css'
import styles from './dialogs.module.css'
import dl from './download/download.module.css'

type Scope = 'all' | 'current' | 'range'
const TIMESTAMP = ['off', 'on'] as const

/** What the dialog starts on: the format asked for, the design's own size, the last download, or PNG. */
function startingPoint(editor: ReturnType<typeof useEditor>, asked: unknown, purposes: Purpose[]): { formatId: string; options: ExportOptions; purpose: string | null } {
  const fresh = (formatId: string): ExportOptions => ({ ...DEFAULT_EXPORT_OPTIONS, size: '1x', optimize: optimizesByDefault(editor, formatId) })
  const usable = (id: string): boolean => {
    const f = exportFormats.get(id)
    return !!f && (!f.available || f.available(editor))
  }
  if (typeof asked === 'string' && usable(asked)) return { formatId: asked, options: fresh(asked), purpose: null }
  const own = purposes.find((p) => p.own && p.id === 'preset')
  if (own) return { formatId: own.formatId, options: own.options, purpose: own.id }
  const last = loadLastExport(editor)
  if (last && usable(last.formatId)) return { formatId: last.formatId, options: last.options, purpose: null }
  return { formatId: 'png', options: fresh('png'), purpose: null }
}

export function DownloadDialog({ props }: { props?: Record<string, unknown> } = {}) {
  const editor = useEditor()
  const allFormats = useSyncExternalStore(exportFormats.subscribe, exportFormats.getSnapshot)
  const formats = allFormats.filter((f) => !f.available || f.available(editor))
  const doc = useEditorState((s) => s.doc)
  const catalogue = useSizePresets()
  const preset = useMemo(() => designPreset(editor), [editor, catalogue, doc]) // eslint-disable-line react-hooks/exhaustive-deps
  const purposes = useMemo(() => purposesFor(editor, preset), [editor, preset])
  // `openDialog('download', { format: 'mp4' })` starts on that format (the Share menu's "Video").
  const [start] = useState(() => startingPoint(editor, props?.format, purposes))
  const [formatId, setFormatId] = useState(() => (formats.some((f) => f.id === start.formatId) ? start.formatId : (formats[0]?.id ?? 'png')))
  const [options, setOptions] = useState<ExportOptions>(() => ({ optimizer: editor.adapter.imageOptimize?.default ?? editor.adapter.imageOptimize?.optimizers[0]?.id, ...start.options }))
  const [purpose, setPurpose] = useState<string | null>(start.purpose)
  const [print, setPrint] = useState<PrintSettings>(() => loadPrintSettings(editor.designId))
  const [scope, setScope] = useState<Scope>('all')
  const [range, setRange] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [stage, setStage] = useState<ExportStage | undefined>()
  const [failure, setFailure] = useState<{ id: number; value: ExportFailure } | null>(null)
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [moreOpen, setMoreOpen] = useState(false)
  const [apiOpen, setApiOpen] = useState(false)
  // File names are a choice per browser; the instance's default holds until one is made.
  const namingDefault = editor.adapter.exportFilenames
  const [nameStyle, setNameStyle] = usePersistedState<FilenameStyle>('doory-export-filenames', namingDefault?.style ?? 'simple', FILENAME_STYLES)
  const [stamp, setStamp] = usePersistedState<(typeof TIMESTAMP)[number]>('doory-export-filename-timestamp', namingDefault?.timestamp ? 'on' : 'off', TIMESTAMP)
  const [exampleUnix] = useState(unixNow)
  const abort = useRef<AbortController | null>(null)
  const failures = useRef(0)
  /** Video formats: where the section draws its buttons, and whether a video is being made or shown (the choices above are held still). */
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null)
  const [videoLocked, setVideoLocked] = useState(false)
  const format = formats.find((f) => f.id === formatId) ?? formats[0]
  const total = doc.pages.length
  const pageRange = useMemo(() => (scope === 'range' ? parsePageRange(range, total) : null), [scope, range, total])
  const rangeInvalid = scope === 'range' && pageRange === null
  const busy = progress !== null

  /** A change of the print options: kept for the next visit to this design. */
  const changePrint = (next: PrintSettings): void => {
    setPrint(next)
    savePrintSettings(editor.designId, next)
  }

  const selected = useMemo<PageSelection>(() => (scope === 'all' ? { kind: 'all' } : scope === 'current' ? { kind: 'current' } : { kind: 'pages', pages: pageRange ?? [] }), [scope, pageRange])
  const activePageId = useEditorState((s) => s.activePageId)
  // The pages that will be exported, in document order.
  const chosenPages = useMemo(() => (rangeInvalid ? [] : pickPages(doc, activePageId, selected)), [doc, activePageId, selected, rangeInvalid])
  const chosen = chosenPages.map(({ page }) => getPageSize(doc, page.id))
  const size = chosen[0] ?? editor.pageSizeOf(editor.state.activePageId)
  const mixed = chosen.some((s) => !sameSize(s, size))
  const video = format?.controls.video === true
  const printing = format?.controls.print === true
  const raster = format?.controls.optimize ? (format.id as RasterFormat) : null
  const apiCallable = !!format && apiFormat(format.id) !== null
  const files = chosen.length
  const zipped = files > 1 && format?.mime !== 'application/pdf' && !video

  // The size as typed, the scale it means for the first page, and whether the browser had to draw smaller. Every page
  // downloaded must take it: `2000w` is 1.9x of a 1080 px page but 5x of a 400 px one.
  const sizeText = options.size ?? `${options.scale}x`
  const typed = parseSize(sizeText, size.width, size.height)
  const sizeValid = !raster || (typed !== null && chosen.every((s) => parseSize(sizeText, s.width, s.height) !== null))
  const wanted = typed ?? options.scale
  const clamped = !!raster && chosen.some((s) => safeMultiplier(s.width, s.height, pageMultiplier(options, s)) < pageMultiplier(options, s) - 1e-6)
  const multiplier = safeMultiplier(size.width, size.height, wanted)
  const pixels = sizeValid ? { width: Math.round(size.width * multiplier), height: Math.round(size.height * multiplier) } : null

  // The page in the preview: the current page, or the first one downloaded.
  const [shown, setShown] = useState(() => Math.max(0, doc.pages.findIndex((p) => p.id === activePageId)))
  const shownIndex = Math.min(shown, total - 1)
  const shownPage = doc.pages[shownIndex] ?? null
  const shownSize = shownPage ? getPageSize(doc, shownPage.id) : size
  const rasterFormats = formats.filter((f) => f.controls.optimize).map((f) => f.id as RasterFormat)
  const preview = usePreview({ engine: editor, page: shownPage, size: shownSize, format: raster, options, formats: rasterFormats })

  const info = editor.adapter.imageOptimize
  const optimizers = info?.optimizers ?? []
  const quality = Math.round(options.quality * 100)
  const perPage = raster ? preview.sizes[raster] : undefined
  const totalBytes = perPage !== undefined ? perPage * Math.max(1, files) : undefined
  const saved = raster && options.optimize && perPage !== undefined && preview.bytesBefore !== null ? (preview.bytesBefore - perPage) * Math.max(1, files) : 0

  const exampleName = (): string => {
    if (!format) return ''
    const naming = { style: nameStyle, unix: stamp === 'on' ? exampleUnix : null }
    const title = editor.state.title
    if (zipped) return zipFilename(title, naming)
    const first = chosenPages[0]
    const ctx = { document: doc, title, naming }
    const suffix = format.server && printing ? 'print' : undefined
    const simple = format.mime === 'application/pdf' || video ? `${sanitizeFilename(title) || 'design'}${suffix ? '-print' : ''}.${format.extension}` : pageFilename(title, format.extension, (first?.index ?? 0) + 1, chosenPages.length, total)
    const perPageFile = format.mime !== 'application/pdf' && !video
    return exportFilename(ctx, simple, format.extension, size, perPageFile ? (first?.index ?? 0) : null, suffix)
  }

  const patch = (next: Partial<ExportOptions>): void => setOptions((o) => ({ ...o, ...next }))

  const pickFormat = (id: string): void => {
    setFormatId(id)
    setPurpose(null)
    if (id === 'jpg') patch({ transparent: false })
  }

  const pickPurpose = (p: Purpose): void => {
    setPurpose(p.id)
    setFormatId(p.formatId)
    // The optimizer chosen and the metadata choice stay; the rest comes from the card.
    setOptions((o) => ({ ...p.options, optimizer: o.optimizer, stripMetadata: o.stripMetadata }))
    if (p.print) changePrint(applyPreset(p.print, print))
  }

  const fail = (error: unknown): void => {
    failures.current += 1
    setFailure({ id: failures.current, value: describeExportFailure(error) })
  }

  const effective: ExportOptions = printing ? { ...options, bleedMm: print.bleedMm, cropMarks: print.cropMarks } : { ...options, size: raster ? sizeText : options.size }

  const download = async (): Promise<void> => {
    if (!format || rangeInvalid || !sizeValid) return
    setFailure(null)
    setProgress(0)
    setStage(undefined)
    const controller = new AbortController()
    abort.current = controller
    const notes: string[] = []
    try {
      const out = await runExport(editor, {
        formatId: format.id,
        pages: selected,
        options: effective,
        onProgress: (fraction, next) => {
          setProgress(fraction)
          setStage(next)
        },
        onNote: (note) => notes.push(note),
        signal: controller.signal,
        filenames: { style: nameStyle, timestamp: stamp === 'on' },
      })
      downloadFiles(out)
      saveLastExport({ formatId: format.id, options: effective })
      editor.toast(t.dialog.downloadDone, 'success')
      for (const note of notes) editor.toast(note)
      editor.closeDialog()
    } catch (err) {
      if (isCancellation(err)) editor.toast(t.print.cancelled)
      else fail(err)
      setProgress(null)
    }
  }

  const copy = async (): Promise<void> => {
    setFailure(null)
    try {
      await copyPageAsPng(editor)
      editor.toast(t.dialog.downloadCopied, 'success')
    } catch (err) {
      fail(err)
    }
  }

  const close = (): void => {
    abort.current?.abort()
    editor.closeDialog()
  }

  // The platform of the design's preset, and what it accepts (when the catalogue says).
  const platform = preset ? (preset.path[preset.path.length - 1]?.label ?? preset.label) : ''
  const formatHint = (): ReactNode => {
    const note = (text: string, tone: 'warn' | 'ok' | '' = '', testId?: string): ReactNode => (
      <small className={`${dl.hint} ${tone ? dl[tone] : ''}`} data-testid={testId}>
        {tone === 'ok' ? <CircleCheck size={14} aria-hidden="true" /> : tone === 'warn' ? <Info size={14} aria-hidden="true" /> : null}
        <span>{text}</span>
      </small>
    )
    if (!format) return null
    if (video) return note(t.dialog.downloadVideoNext, '', 'download-format-note')
    if (raster && preset?.formats && !preset.formats.includes(raster)) return note(t.dialog.downloadNotAccepted(platform, preset.formats.map((f) => f.toUpperCase()).join(', ')), 'warn')
    if (raster === 'avif') return note(t.dialog.downloadAvifNote, 'warn', 'download-format-note')
    if (raster && preset?.maxBytes && perPage !== undefined) {
      const limit = formatBytes(preset.maxBytes)
      return perPage <= preset.maxBytes ? note(t.dialog.downloadFits(platform, format.label, formatBytes(perPage), limit), 'ok') : note(t.dialog.downloadTooBig(platform, formatBytes(perPage), limit), 'warn')
    }
    return format.description ? note(format.description, '', 'download-format-note') : null
  }

  const tag = raster && format ? `${format.label}${isLossy(raster) ? ` ${quality}` : options.pngColors === 256 ? ' 256' : ''}${perPage !== undefined ? ` · ${formatBytes(perPage)}` : ''}` : null
  const optimizeOffered = !!raster && serverConverts(editor.adapter, raster) && optimizers.length > 0
  const moreSummary = [scope === 'all' ? t.dialog.downloadAllPages.toLowerCase() : scope === 'current' ? t.dialog.downloadCurrentPage.toLowerCase() : range || t.dialog.downloadRange.toLowerCase(), nameStyle === 'simple' ? t.dialog.downloadNamesSimple.toLowerCase() : t.dialog.downloadNamesStructured.toLowerCase()]
  if (raster && options.transparent && hasAlpha(raster)) moreSummary.push(t.dialog.downloadTransparent.toLowerCase())

  const summary = (): ReactNode => {
    if (!format) return null
    if (raster) {
      return (
        <>
          <b>{t.dialog.downloadFiles(files, format.label)}</b>
          {zipped ? ` ${t.dialog.downloadInZip}` : ''}
          {pixels && !mixed ? ` · ${pixels.width} × ${pixels.height}` : ''}
          {totalBytes !== undefined ? (
            <>
              {' · '}
              <b>≈ {formatBytes(totalBytes)}</b>
            </>
          ) : null}
          {saved > 1024 ? <span className={dl.saved}> · {t.dialog.downloadSaved(formatBytes(saved))}</span> : null}
        </>
      )
    }
    if (format.mime === 'application/pdf') {
      return (
        <>
          <b>1 PDF</b> · {t.dialog.downloadPdfSummary(files, printing && (print.bleedMm > 0 || print.cropMarks))}
        </>
      )
    }
    return (
      <>
        <b>{t.dialog.downloadFiles(files, format.label)}</b>
        {zipped ? ` ${t.dialog.downloadInZip}` : ''}
      </>
    )
  }

  const chosenIndexes = useMemo(() => new Set(chosenPages.map((p) => p.index)), [chosenPages])
  const aside = (
    <section className={dl.preview} aria-label={t.dialog.downloadPreview}>
      <div className={dl.previewBar}>
        <span className={dl.pill}>{t.dialog.downloadPageOf(shownIndex + 1, total)}</span>
        <span className={dl.spacer} />
        {raster && preview.offsite && !preview.asked ? (
          <button type="button" className={dl.ask} onClick={preview.ask}>
            {t.dialog.downloadPreviewWith(preview.offsite)}
          </button>
        ) : null}
        {raster ? (
          <div className={dl.zoom} role="group" aria-label={t.dialog.downloadZoom}>
            {(['fit', 'detail'] as const).map((z) => (
              <button key={z} type="button" className={zoom === z ? dl.on : ''} aria-pressed={zoom === z} onClick={() => setZoom(z)}>
                {z === 'fit' ? t.dialog.downloadFit : t.dialog.downloadDetail}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {preview.failed ? <p className={dl.previewFailed}>{t.dialog.downloadPreviewFailed}</p> : <ComparePreview before={preview.original} after={raster ? preview.after : null} size={shownSize} zoom={raster ? zoom : 'fit'} tag={tag} />}
      <PageThumbs pages={doc.pages} shown={shownIndex} chosen={chosenIndexes} onShow={setShown} hint={raster ? (zoom === 'detail' ? t.dialog.downloadDetailHint : t.dialog.downloadDragHint) : ''} />
    </section>
  )

  const otherFormats = formats.filter((f) => !f.controls.optimize)
  const downloadLabel = busy ? t.dialog.downloadWorking : zipped ? t.dialog.downloadNFiles(files) : t.dialog.downloadButton

  return (
    <Dialog
      title={t.dialog.downloadTitle}
      onClose={close}
      width={1080}
      aside={aside}
      footer={
        video ? (
          <div ref={setFooterSlot} style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }} />
        ) : (
          <>
            <p className={dl.summary} data-testid="download-summary">
              {summary()}
            </p>
            {apiCallable ? (
              <Button variant="ghost" size="sm" icon={<Code size={16} />} pressed={apiOpen} aria-expanded={apiOpen} onClick={() => setApiOpen((o) => !o)}>
                {t.dialog.downloadApi}
              </Button>
            ) : null}
            {busy ? (
              <Button onClick={() => abort.current?.abort()}>{t.print.cancel}</Button>
            ) : (
              <Button icon={<Copy size={16} />} onClick={() => void copy()}>
                {t.dialog.downloadCopy}
              </Button>
            )}
            <Button variant="primary" icon={<Download size={16} />} onClick={() => void download()} disabled={busy || rangeInvalid || !format || !sizeValid}>
              {downloadLabel}
            </Button>
          </>
        )
      }
    >
      <div className={dl.side}>
        <fieldset className={dl.plain} disabled={videoLocked} style={videoLocked ? { opacity: 0.6 } : undefined}>
          <PurposeCards purposes={purposes} value={purpose} onPick={pickPurpose} />
        </fieldset>

        <FormatPicker
          pictures={formats.filter((f) => f.controls.optimize)}
          others={otherFormats}
          value={format?.id ?? ''}
          onChange={pickFormat}
          sizes={preview.sizes}
          approximate={preview.approximate}
          transparent={options.transparent}
          hint={formatHint()}
          disabled={videoLocked}
        />

        {raster && isLossy(raster) ? (
          <QualityControl
            value={quality}
            preset={options.qualityPreset}
            onChange={(value: number, stop?: QualityPreset) => patch({ quality: value / 100, qualityPreset: stop, maxBytes: undefined })}
            maxBytes={options.maxBytes}
            onMaxBytes={(bytes) => patch({ maxBytes: bytes })}
            estimate={perPage !== undefined ? t.dialog.downloadPerPageSize(formatBytes(perPage)) : null}
          />
        ) : null}

        {raster === 'png' && serverConverts(editor.adapter, 'png') ? (
          <section className={dl.section}>
            <h3 className={dl.label}>{t.dialog.downloadColors}</h3>
            <Segmented
              label={t.dialog.downloadColors}
              value={options.pngColors === 256 ? '256' : 'full'}
              onChange={(v) => patch({ pngColors: v === '256' ? 256 : 'full' })}
              options={[
                { value: 'full', label: t.dialog.downloadColorsFull },
                { value: '256', label: t.dialog.downloadColorsPalette },
              ]}
            />
          </section>
        ) : null}

        {raster ? <SizeField value={sizeText} onChange={(v) => patch({ size: v })} pixels={pixels} mixed={mixed} clamped={clamped} extra={preset ? [`${preset.width}w`] : []} /> : null}

        {optimizeOffered && raster ? (
          <OptimizerCard
            optimizers={optimizers}
            on={options.optimize === true}
            onToggle={(on) => patch({ optimize: on, optimizer: options.optimizer ?? optimizers[0]?.id })}
            value={options.optimizer}
            onPick={(id) => patch({ optimizer: id })}
            format={raster}
            formatLabel={format?.label ?? raster}
          />
        ) : null}
        {preview.note && raster ? (
          <small className={`${dl.hint} ${dl.warn}`} role="status">
            <Info size={14} aria-hidden="true" />
            <span>{preview.note}</span>
          </small>
        ) : null}

        {printing ? (
          <>
            <small className={printStyles.summary} data-testid="print-summary">
              {describeSizes(chosen, doc.unit)}
            </small>
            <PrintSection settings={print} onChange={changePrint} sizes={chosen} unit={doc.unit} server={format?.server === true} />
          </>
        ) : null}

        {video ? <AudioCredits /> : null}
        {video && format ? <LazyVideoSection format={format.id as VideoFormat} pages={chosenPages} rangeInvalid={rangeInvalid} footer={footerSlot} onLockChange={setVideoLocked} /> : null}

        <div inert={videoLocked} style={videoLocked ? { opacity: 0.6 } : undefined}>
          <MoreSettings open={moreOpen} onToggle={() => setMoreOpen((o) => !o)} summary={moreSummary.join(', ')}>
            <div className={styles.field}>
              <span>{t.dialog.downloadPages}</span>
              <Segmented
                label={t.dialog.downloadPages}
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'all', label: `${t.dialog.downloadAllPages} (${total})` },
                  { value: 'current', label: t.dialog.downloadCurrentPage },
                  { value: 'range', label: t.dialog.downloadRange },
                ]}
              />
              {scope === 'range' ? (
                <>
                  <input className={styles.input} value={range} placeholder={t.dialog.downloadRangeHint} aria-label={t.dialog.downloadRange} aria-invalid={rangeInvalid} onChange={(e) => setRange(e.target.value)} />
                  {rangeInvalid && range ? (
                    <small className={styles.error} role="alert">
                      {t.dialog.downloadRangeInvalid}
                    </small>
                  ) : null}
                </>
              ) : null}
              {zipped ? <small className={styles.muted}>{t.dialog.downloadZip}</small> : null}
            </div>

            <div className={styles.field}>
              <span>{t.dialog.downloadNames}</span>
              <Segmented
                label={t.dialog.downloadNames}
                value={nameStyle}
                onChange={setNameStyle}
                options={[
                  { value: 'simple', label: t.dialog.downloadNamesSimple },
                  { value: 'structured', label: t.dialog.downloadNamesStructured },
                ]}
              />
              {nameStyle === 'structured' ? <Switch label={t.dialog.downloadNamesTimestamp} checked={stamp === 'on'} onChange={(v) => setStamp(v ? 'on' : 'off')} /> : null}
              <small className={styles.muted} data-testid="download-filename">
                {t.dialog.downloadNamesExample(exampleName())}
              </small>
            </div>

            {format?.controls.transparent ? <Switch label={t.dialog.downloadTransparent} hint={t.dialog.downloadTransparentHint} checked={options.transparent} onChange={(v) => patch({ transparent: v })} /> : null}
            {raster && serverConverts(editor.adapter, raster) ? <Switch label={t.dialog.downloadMetadata} hint={t.dialog.downloadMetadataHint} checked={options.stripMetadata !== false} onChange={(v) => patch({ stripMetadata: v })} /> : null}
            {raster === 'jpg' && serverConverts(editor.adapter, 'jpg') ? <Switch label={t.dialog.downloadProgressive} hint={t.dialog.downloadProgressiveHint} checked={options.progressive === true} onChange={(v) => patch({ progressive: v })} /> : null}
          </MoreSettings>
        </div>

        {apiOpen && apiCallable && format && !rangeInvalid ? (
          <ApiPreview
            text={describeCall(
              { designId: editor.designId, formatId: format.id, options: effective, pages: scope === 'all' ? 'all' : chosenPages.map((p) => p.index + 1), fileNames: nameStyle },
              window.location.origin,
            )}
          />
        ) : null}

        {busy ? (
          <div className={styles.field}>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)} aria-label={t.dialog.downloadWorking} className={styles.progress}>
              <div style={{ width: `${Math.max(4, (progress ?? 0) * 100)}%` }} />
            </div>
            {stage ? (
              <p className={printStyles.stage} role="status" data-testid="export-stage">
                {t.print.stage[stage]}
              </p>
            ) : null}
          </div>
        ) : null}
        {failure ? <ExportProblem key={failure.id} failure={failure.value} onRetry={() => void download()} /> : null}
      </div>
    </Dialog>
  )
}
