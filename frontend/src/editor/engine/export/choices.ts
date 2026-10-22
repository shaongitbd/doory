/**
 * Ready-made export settings: the one suggested by the design's size preset, and the last ones used in this browser.
 * The Share menu downloads them in one click; the Download dialog starts from them.
 */
import { type SizePreset, getSizePresets } from '@/lib/sizePresets'
import { safeGetItem, safeSetItem } from '@/lib/storage'
import type { EditorEngine } from '../editor'
import { getPageSize } from '../pageSizes'
import { t } from '../../strings'
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions, QUALITY_PRESETS, type QualityPreset, exportFormats } from './registry'

export interface ExportChoice {
  formatId: string
  options: ExportOptions
}

/** The design's own size preset while the page still has that size (as for the safe zone); null for custom sizes. */
export function designPreset(engine: EditorEngine): SizePreset | null {
  const preset = getSizePresets().byId.get(engine.state.doc.meta?.presetId ?? '')
  if (!preset) return null
  const size = getPageSize(engine.state.doc, engine.state.activePageId)
  return preset.width === size.width && preset.height === size.height ? preset : null
}

export function formatAvailable(engine: EditorEngine, id: string): boolean {
  const format = exportFormats.get(id)
  return !!format && (!format.available || format.available(engine))
}

/** Whether downloads in `format` are optimized unless the person says no: the instance has a default optimizer for it. */
export function optimizesByDefault(engine: EditorEngine, format: string): boolean {
  const info = engine.adapter.imageOptimize
  const fmt = format === 'jpeg' ? 'jpg' : format
  return !!info?.default && info.optimizers.some((o) => o.id === info.default && (o.formats as string[]).includes(fmt))
}

const PICTURES = ['jpg', 'png', 'webp', 'avif']

/** What suits the preset: a picture at its size for screen presets (the platform's own format when the catalogue knows it), a PDF for print sizes. */
export function suggestionFor(engine: EditorEngine, preset: SizePreset): ExportChoice {
  if (preset.unit !== 'px') return { formatId: formatAvailable(engine, 'pdf-server') ? 'pdf-server' : 'pdf', options: DEFAULT_EXPORT_OPTIONS }
  const formatId = preset.formats?.map((f) => (f === 'jpeg' ? 'jpg' : f)).find((f) => PICTURES.includes(f) && formatAvailable(engine, f)) ?? 'jpg'
  return {
    formatId,
    options: { ...DEFAULT_EXPORT_OPTIONS, size: '1x', quality: QUALITY_PRESETS.balanced / 100, qualityPreset: 'balanced', optimize: optimizesByDefault(engine, formatId) },
  }
}

/** "JPG · 2x · optimized" */
export function describeChoice(choice: ExportChoice): string {
  const format = exportFormats.get(choice.formatId)
  const { options } = choice
  const parts = [format?.label ?? choice.formatId.toUpperCase()]
  if (format?.controls.scale) parts.push(options.size?.trim() || `${options.scale}x`)
  if (format?.controls.optimize && options.optimize) parts.push(t.topbar.optimized)
  return parts.join(' · ')
}

const LAST_KEY = 'doory-export-last'
const PRESETS = Object.keys(QUALITY_PRESETS) as QualityPreset[]

const num = (value: unknown, min: number, max: number): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined)
const text = (value: unknown, max = 40): string | undefined => (typeof value === 'string' && value.length <= max ? value : undefined)
const flag = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)

/**
 * `options` with an optimizer this server still offers: one it no longer has (remembered from an earlier download) gives
 * way to the instance's default, or to none when there is no server.
 */
export function withOfferedOptimizer(engine: EditorEngine, options: ExportOptions): ExportOptions {
  const info = engine.adapter.imageOptimize
  if (options.optimizer === undefined || info?.optimizers.some((o) => o.id === options.optimizer)) return options
  const next = { ...options }
  const fallback = info?.default ?? info?.optimizers[0]?.id
  if (fallback) next.optimizer = fallback
  else delete next.optimizer
  return next
}

/** The last download's format and options in this browser (a per-viewer convenience), or null. With `engine`, a stale optimizer is replaced. */
export function loadLastExport(engine?: EditorEngine): ExportChoice | null {
  try {
    const raw = JSON.parse(safeGetItem(LAST_KEY) ?? 'null') as { formatId?: unknown; options?: Record<string, unknown> } | null
    const formatId = text(raw?.formatId, 20)
    if (!formatId || !exportFormats.get(formatId)) return null
    const o = raw?.options ?? {}
    const options: ExportOptions = {
      ...DEFAULT_EXPORT_OPTIONS,
      scale: num(o.scale, 0.1, 4) ?? 1,
      quality: num(o.quality, 0.01, 1) ?? DEFAULT_EXPORT_OPTIONS.quality,
      transparent: flag(o.transparent) ?? false,
      bleedMm: num(o.bleedMm, 0, 10) ?? 0,
      cropMarks: flag(o.cropMarks) ?? false,
    }
    const size = text(o.size, 12)
    if (size) options.size = size
    if (PRESETS.includes(o.qualityPreset as QualityPreset)) options.qualityPreset = o.qualityPreset as QualityPreset
    const maxBytes = num(o.maxBytes, 1000, 1e9)
    if (maxBytes) options.maxBytes = maxBytes
    if (o.pngColors === 256 || o.pngColors === 'full') options.pngColors = o.pngColors
    for (const key of ['optimize', 'stripMetadata', 'progressive'] as const) if (flag(o[key]) !== undefined) options[key] = o[key] as boolean
    const optimizer = text(o.optimizer)
    if (optimizer) options.optimizer = optimizer
    return { formatId, options: engine ? withOfferedOptimizer(engine, options) : options }
  } catch {
    return null
  }
}

export function saveLastExport(choice: ExportChoice): void {
  const options: Partial<ExportOptions> = { ...choice.options }
  delete options.video
  safeSetItem(LAST_KEY, JSON.stringify({ formatId: choice.formatId, options }))
}
