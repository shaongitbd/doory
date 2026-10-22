import { Crop, Frame, Replace } from 'lucide-react'
import { I } from '../../chrome/icons'
import { useEditor, useSelection } from '../../context'
import { isBackgroundRemovalAvailable } from '../../engine/bgRemoval'
import { isUpscaleSupported } from '../../engine/upscale/support'
import { useBackgroundRemovalOptions } from '../../hooks/useBackgroundRemovalOptions'
import { FILTER_PRESETS, FILTER_RANGES, TOGGLE_FILTERS, specValue } from '../../engine/objects/filters'
import { MASK_SHAPE_IDS, maskPath } from '../../engine/objects/shapeGeometry'
import type { ImageFilterSpec, MaskShape } from '@/types/document'
import { t } from '../../strings'
import { Slider } from '../../ui/Slider'
import { Switch } from '../../ui/Switch'
import { OpacityTool } from '../controls'
import { Field, PopoverStack, PopoverTool, ToolButton } from '../parts'
import ed from '../../chrome/ed.module.css'
import styles from './sections.module.css'

function MaskGlyph({ id }: { id: (typeof MASK_SHAPE_IDS)[number] | 'none' }) {
  if (id === 'none') return <svg viewBox="0 0 100 100" aria-hidden="true"><rect x="12" y="12" width="76" height="76" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="10 8" /></svg>
  if (id === 'circle') return <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="currentColor" /></svg>
  if (id === 'rounded') return <svg viewBox="0 0 100 100" aria-hidden="true"><rect x="10" y="10" width="80" height="80" rx="20" fill="currentColor" /></svg>
  return <svg viewBox="0 0 100 100" aria-hidden="true"><path d={maskPath(id) ?? ''} fill="currentColor" /></svg>
}

/** Frame (mask shape) picker shared by images and placeholders. */
export function FrameTool() {
  const editor = useEditor()
  const sel = useSelection()
  const o = sel.objects[0] ?? {}
  const current = typeof o.maskShape === 'string' ? o.maskShape : o.maskShape ? 'custom' : 'none'
  const radius = Math.round(Number(o.maskRadius ?? 0.18) * 100)
  return (
    <PopoverTool label={t.toolbar.mask} trigger={<Frame size={18} aria-hidden="true" />} pressed={current !== 'none'} width={280} testId="ed-frame">
      <PopoverStack width={256}>
        <div className={styles.maskGrid} role="group" aria-label={t.toolbar.mask}>
          {(['none', ...MASK_SHAPE_IDS] as const).map((id) => (
            <button key={id} type="button" className={`${styles.maskBtn} ${current === id ? styles.maskOn : ''}`} aria-label={id === 'none' ? t.toolbar.maskNone : t.masks[id]} aria-pressed={current === id} title={id === 'none' ? t.toolbar.maskNone : t.masks[id]} onClick={() => editor.style.setMask(id === 'none' ? undefined : (id as MaskShape))}>
              <MaskGlyph id={id} />
            </button>
          ))}
        </div>
        {current === 'rounded' ? <Slider label={t.toolbar.cornerRadius} value={radius} min={0} max={50} onChange={(v) => editor.style.setMask('rounded', v / 100)} display={`${radius}%`} /> : null}
      </PopoverStack>
    </PopoverTool>
  )
}

/** CSS approximation of a preset, used only for the preview swatches. */
function presetCss(specs: readonly ImageFilterSpec[]): string {
  const parts: string[] = []
  for (const s of specs) {
    if (s.type === 'brightness') parts.push(`brightness(${1 + s.value})`)
    else if (s.type === 'contrast') parts.push(`contrast(${1 + s.value})`)
    else if (s.type === 'saturation') parts.push(`saturate(${1 + s.value})`)
    else if (s.type === 'hue') parts.push(`hue-rotate(${s.value * 180}deg)`)
    else if (s.type === 'grayscale') parts.push('grayscale(1)')
    else if (s.type === 'sepia') parts.push('sepia(1)')
    else if (s.type === 'blur') parts.push(`blur(${s.value * 4}px)`)
  }
  return parts.join(' ') || 'none'
}

export function AdjustPanel() {
  const editor = useEditor()
  const sel = useSelection()
  const specs = (sel.objects[0]?.filters ?? []) as ImageFilterSpec[]
  return (
    <PopoverStack width={288}>
      <Field label={t.toolbar.filterPresets}>
        <div className={styles.presetGrid}>
          {FILTER_PRESETS.map((p) => (
            <button key={p.id} type="button" className={styles.presetBtn} onClick={() => editor.style.applyFilterPreset(p.id)} aria-label={t.tools.filterOf(p.label)}>
              <div aria-hidden="true" style={{ filter: presetCss(p.specs) }} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label={t.toolbar.filters}>
        {FILTER_RANGES.map((r) => {
          const v = specValue(specs, r.type)
          return <Slider key={r.type} label={t.toolbar[r.type]} value={v} min={r.min} max={r.max} step={r.step} display={`${Math.round(v * r.display)}${r.suffix}`} onChange={(n) => editor.style.setFilter(r.type, n)} />
        })}
        {TOGGLE_FILTERS.map((f) => (
          <Switch key={f} label={t.toolbar[f]} checked={specValue(specs, f) > 0} onChange={(on) => editor.style.setFilter(f, on ? 1 : 0)} />
        ))}
      </Field>
      <button type="button" className={`${ed.btn} ${ed.ghost}`} disabled={specs.length === 0} onClick={() => editor.style.setFilters([])}>
        {t.toolbar.reset}
      </button>
    </PopoverStack>
  )
}

/** Images: crop, upscale, remove background, adjustments, frame and opacity; replace, border and shadow sit under `⋯`. A picture that fills a placeholder offers "Reset to placeholder" in place of crop and frame. */
export function ImageSection() {
  const editor = useEditor()
  const sel = useSelection()
  const fillsPlaceholder = sel.objects[0]?.slot !== undefined
  // The in-browser model, or a server option for this user (the list arrives a moment later).
  const removal = useBackgroundRemovalOptions()
  const canRemoveBackground = isBackgroundRemovalAvailable() || removal?.options.some((option) => option.kind === 'server') === true
  return (
    <>
      {fillsPlaceholder ? (
        <ToolButton label={t.ctx.resetPlaceholder} testId="ed-reset-placeholder" onClick={() => editor.style.resetToPlaceholder()}>
          <span className={ed.textButton}>{t.ctx.resetPlaceholder}</span>
        </ToolButton>
      ) : (
        <ToolButton label={t.toolbar.crop} shortcut="Enter" testId="ed-crop" onClick={() => void editor.crop.start()}>
          <Crop size={18} aria-hidden="true" />
        </ToolButton>
      )}
      {isUpscaleSupported() && editor.style.canUpscale() ? (
        <ToolButton label={t.toolbar.upscale} featured testId="ed-upscale" onClick={() => editor.openDialog('upscale')}>
          {I.upscale}
          <span className={ed.toolText}>{t.toolbar.upscale}</span>
        </ToolButton>
      ) : null}
      <ToolButton label={t.toolbar.replaceImage} testId="ed-replace-image" onClick={() => void editor.insert.pickAndReplaceImage()}>
        <Replace size={18} aria-hidden="true" />
      </ToolButton>
      {canRemoveBackground ? (
        <ToolButton label={t.toolbar.removeBackground} featured testId="ed-remove-bg" onClick={() => editor.openDialog('background-removal')}>
          {I.removeBg}
          <span className={ed.toolText}>{t.ctx.removeBackground}</span>
        </ToolButton>
      ) : null}
      {editor.style.canEditSvgColors() ? (
        <ToolButton label={t.toolbar.editColors} testId="ed-edit-svg-colors" onClick={() => void editor.style.editSvgColors()}>
          <span className={ed.textButton}>{t.toolbar.editColors}</span>
        </ToolButton>
      ) : null}
      <PopoverTool label={t.toolbar.filters} trigger={<SlidersIcon />} width={312} testId="ed-adjust">
        <AdjustPanel />
      </PopoverTool>
      {fillsPlaceholder ? null : <FrameTool />}
      <OpacityTool />
    </>
  )
}

export function SlidersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4" />
    </svg>
  )
}
