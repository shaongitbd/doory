import { Lock, LockOpen } from 'lucide-react'
import { useState } from 'react'
import { findPresetBySize, quickPresets, useSizePresets, type SizePresetCatalogue } from '@/lib/sizePresets'
import { SizePicker } from '@/lib/sizePresets/SizePicker'
import type { DocUnit } from '@/types/document'
import { useDocument, useEditor } from '../context'
import type { ResizeScope } from '../engine/api/pages'
import type { ResizeMode } from '../engine/magicResize'
import { getPageSize, isUniform, pageSizes, sameSize } from '../engine/pageSizes'
import { pxToUnit, unitDecimals, unitToPx } from '../engine/units'
import { t } from '../strings'
import { Button, IconButton } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { NumberField } from '../ui/NumberField'
import { Segmented } from '../ui/Segmented'
import { CANVAS_SIDE_PX, canvasSideRange, rangeHint } from '../toolbar/limits'
import styles from './dialogs.module.css'
import scopeStyles from './ResizeDialog.module.css'
import { ResizePreview } from './ResizePreview'

const MODES: { id: ResizeMode; label: string; hint: string }[] = [
  { id: 'magic', label: t.dialog.resizeMagic, hint: t.dialog.resizeMagicHint },
  { id: 'scale', label: t.dialog.resizeScale, hint: t.dialog.resizeScaleHint },
  { id: 'keep', label: t.dialog.resizeKeep, hint: t.dialog.resizeKeepHint },
]

/** The size the dialog opens on: the design's own preset if it still fits, else a popular one of this size, else any. */
function presetOfSize(catalogue: SizePresetCatalogue, width: number, height: number, own?: string): string | null {
  const fits = (preset?: { width: number; height: number }) => preset !== undefined && preset.width === width && preset.height === height
  const mine = own ? catalogue.byId.get(own) : undefined
  if (fits(mine)) return mine!.id
  return quickPresets(catalogue).find(fits)?.id ?? findPresetBySize(catalogue, width, height)?.id ?? null
}

/**
 * Props: `pageId` (default the page in view) names the page whose size is shown and previewed, `scope` says which
 * pages Resize reaches (default: every page of a design of one size, this page when the sizes already differ),
 * `width` / `height` pre-fill the fields.
 */
export function ResizeDialog({ props }: { props?: Record<string, unknown> }) {
  const editor = useEditor()
  const doc = useDocument()
  const pageId = typeof props?.pageId === 'string' && doc.pages.some((p) => p.id === props.pageId) ? props.pageId : editor.state.activePageId
  const current = getPageSize(doc, pageId)
  const multiple = doc.pages.length > 1
  const initW = typeof props?.width === 'number' ? props.width : current.width
  const initH = typeof props?.height === 'number' ? props.height : current.height
  const [unit, setUnit] = useState<DocUnit>(doc.unit)
  const [w, setW] = useState(initW)
  const [h, setH] = useState(initH)
  const [lock, setLock] = useState(false)
  const [mode, setMode] = useState<ResizeMode>('scale')
  const catalogue = useSizePresets()
  const [pickedId, setPickedId] = useState<string | null>(() => presetOfSize(catalogue, initW, initH, doc.meta?.presetId))
  const [scope, setScope] = useState<ResizeScope>(!multiple ? 'all' : props?.scope === 'page' || props?.scope === 'all' ? props.scope : isUniform(doc) ? 'all' : 'page')
  const ratio = current.width / current.height
  const dec = unitDecimals(unit)
  const range = canvasSideRange(unit)
  const show = (px: number): number => Number(pxToUnit(px, unit).toFixed(dec))
  const next = { width: Math.round(w), height: Math.round(h) }
  const isUnchanged = (to: { width: number; height: number }): boolean => (scope === 'all' ? pageSizes(doc).every((size) => sameSize(size, to)) : sameSize(current, to))
  const unchanged = isUnchanged(next)

  // With the ratio locked the other side follows, but it cannot leave the canvas limits either.
  const withinLimits = (px: number): number => Math.min(CANVAS_SIDE_PX.max, Math.max(CANVAS_SIDE_PX.min, px))
  const setWidth = (px: number): void => {
    setPickedId(null)
    setW(px)
    if (lock) setH(withinLimits(px / ratio))
  }
  const setHeight = (px: number): void => {
    setPickedId(null)
    setH(px)
    if (lock) setW(withinLimits(px * ratio))
  }

  const apply = (): void => {
    editor.pages.resize(w, h, mode, { scope, pageId })
    editor.closeDialog()
  }

  return (
    <Dialog
      title={t.dialog.resizeTitle}
      onClose={() => editor.closeDialog()}
      width={1120}
      footer={
        <>
          <Button onClick={() => editor.closeDialog()}>{t.dialog.cancel}</Button>
          <Button variant="primary" disabled={unchanged || w < 1 || h < 1} onClick={apply}>
            {t.dialog.resizeTitle}
          </Button>
        </>
      }
    >
      <div className={styles.resize}>
        <div className={styles.presets}>
          <SizePicker
            selectedId={pickedId}
            onSelect={(preset) => {
              setPickedId(preset.id)
              setW(preset.width)
              setH(preset.height)
            }}
            onConfirm={(preset) => {
              // Like the Resize button, which stays disabled for the size the pages already have.
              if (isUnchanged({ width: Math.round(preset.width), height: Math.round(preset.height) })) return
              editor.pages.resize(preset.width, preset.height, mode, { scope, pageId })
              editor.closeDialog()
            }}
          />
        </div>
        <div className={styles.custom}>
          <h3 className={styles.groupTitle}>{t.dialog.resizeCustom}</h3>
          <Segmented label={t.dialog.resizeUnit} value={unit} onChange={setUnit} options={[{ value: 'px', label: 'px' }, { value: 'mm', label: 'mm' }, { value: 'in', label: 'in' }]} />
          <div className={styles.sizeRow}>
            <NumberField label={t.dialog.resizeWidth} showLabel value={show(w)} decimals={dec} min={range.min} max={range.max} hint={rangeHint(range, unit)} step={range.step} suffix={unit} onChange={(v) => setWidth(unitToPx(v, unit))} />
            <IconButton label={t.dialog.resizeLock} pressed={lock} onClick={() => setLock((l) => !l)}>
              {lock ? <Lock size={16} /> : <LockOpen size={16} />}
            </IconButton>
            <NumberField label={t.dialog.resizeHeight} showLabel value={show(h)} decimals={dec} min={range.min} max={range.max} hint={rangeHint(range, unit)} step={range.step} suffix={unit} onChange={(v) => setHeight(unitToPx(v, unit))} />
          </div>
          <p className={styles.muted}>
            {t.dialog.resizeCurrent}: {current.width} × {current.height} px · New: {next.width} × {next.height} px
          </p>
          {multiple ? (
            <div role="radiogroup" aria-label={t.dialog.resizeScope} className={scopeStyles.scope}>
              {(['page', 'all'] as const).map((id) => (
                <label key={id} className={`${scopeStyles.scopeOption} ${scope === id ? scopeStyles.scopeOn : ''}`}>
                  <input type="radio" name="resize-scope" checked={scope === id} onChange={() => setScope(id)} />
                  <span>{id === 'page' ? t.dialog.resizeThisPage : t.dialog.resizeAllPages(doc.pages.length)}</span>
                </label>
              ))}
            </div>
          ) : null}
          <div role="radiogroup" aria-label={t.dialog.resizeContent} className={styles.modes}>
            {MODES.map((m) => (
              <label key={m.id} className={`${styles.mode} ${mode === m.id ? styles.modeOn : ''}`}>
                <input type="radio" name="resize-mode" checked={mode === m.id} onChange={() => setMode(m.id)} />
                <span>
                  <strong>{m.label}</strong>
                  <small>{m.hint}</small>
                </span>
              </label>
            ))}
          </div>
          <ResizePreview pageId={pageId} to={next} mode={mode} />
        </div>
      </div>
    </Dialog>
  )
}
