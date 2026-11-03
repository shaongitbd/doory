import { MAX_DIMENSION_PX, type DocUnit } from '@/types/document'
import { getSizePresets, type SizePreset, type SizePresetCatalogue } from '@/lib/sizePresets'

export type { SizePreset } from '@/lib/sizePresets'

export const PX_PER_INCH = 96
const MM_PER_INCH = 25.4
export const MIN_DIMENSION_PX = 1
export const MAX_DIMENSION = MAX_DIMENSION_PX

export type CustomUnit = 'px' | 'mm' | 'cm' | 'in'
export const CUSTOM_UNITS: CustomUnit[] = ['px', 'mm', 'cm', 'in']

export function unitToPx(value: number, unit: CustomUnit): number {
  switch (unit) {
    case 'in':
      return value * PX_PER_INCH
    case 'cm':
      return (value / 2.54) * PX_PER_INCH
    case 'mm':
      return (value / MM_PER_INCH) * PX_PER_INCH
    default:
      return value
  }
}

export function pxToUnit(px: number, unit: CustomUnit): number {
  switch (unit) {
    case 'in':
      return px / PX_PER_INCH
    case 'cm':
      return (px / PX_PER_INCH) * 2.54
    case 'mm':
      return (px / PX_PER_INCH) * MM_PER_INCH
    default:
      return px
  }
}

/** Rounds to a sensible display precision for the unit (px whole, others 2 decimals). */
export function formatUnitValue(value: number, unit: CustomUnit): string {
  if (unit === 'px') return String(Math.round(value))
  return String(Math.round(value * 100) / 100)
}

export const DEFAULT_PRESET_ID = 'instagram-post'

/** The preset a slug (or one of its aliases) names in the catalogue, by default the one loaded now. */
export function getPreset(id: string | null | undefined, catalogue: SizePresetCatalogue = getSizePresets()): SizePreset | undefined {
  return id ? catalogue.byId.get(id) : undefined
}

/** "Poster (18 × 24 in)" → { name: "Poster", detail: "18 × 24 in" }; a label without a size gets the pixel size as detail. */
export function presetParts(preset: SizePreset): { name: string; detail: string } {
  const match = /^(.*?)\s*\((.*)\)$/.exec(preset.label)
  return match ? { name: match[1], detail: match[2] } : { name: preset.label, detail: `${preset.width} × ${preset.height}` }
}

/** What a design is, for its card: the size preset's name ("Instagram Post"), or its pixel size. */
export function designKind(design: { preset?: string | null; width: number; height: number }, catalogue?: SizePresetCatalogue): string {
  const preset = getPreset(design.preset, catalogue)
  return preset ? presetParts(preset).name : `${design.width} × ${design.height} px`
}

export type CustomSizeResult =
  | { ok: true; width: number; height: number; unit: DocUnit }
  | { ok: false; error: string; field: 'width' | 'height' }

/** Validates a custom size typed in `unit`; converts to whole pixels at 96 dpi (1 … 20000). */
export function parseCustomSize(input: { width: string | number; height: string | number; unit: CustomUnit }): CustomSizeResult {
  // parseFloat alone would silently accept trailing garbage ('1080abc' -> 1080, '12.5.6' -> 12.5),
  // so the whole string must look like one number first (a decimal comma still counts as a point).
  const parse = (raw: string | number): number => {
    if (typeof raw === 'number') return raw
    const text = raw.replace(',', '.')
    return /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(text) ? Number.parseFloat(text) : Number.NaN
  }
  const entries: Array<['width' | 'height', number]> = [
    ['width', parse(input.width)],
    ['height', parse(input.height)],
  ]
  const converted = { width: 0, height: 0 }
  for (const [field, value] of entries) {
    if (!Number.isFinite(value) || value <= 0) return { ok: false, field, error: `Enter a ${field} greater than 0.` }
    const pixels = Math.round(unitToPx(value, input.unit))
    if (pixels < MIN_DIMENSION_PX) return { ok: false, field, error: `The ${field} must be at least 1 px.` }
    if (pixels > MAX_DIMENSION) {
      const max = formatUnitValue(pxToUnit(MAX_DIMENSION, input.unit), input.unit)
      return { ok: false, field, error: `The ${field} can be at most ${max} ${input.unit} (${MAX_DIMENSION.toLocaleString('en-US')} px).` }
    }
    converted[field] = pixels
  }
  return { ok: true, width: converted.width, height: converted.height, unit: input.unit === 'cm' ? 'mm' : input.unit }
}

/** Value of the other side when the aspect ratio is locked. */
export function lockedCounterpart(changed: number, ratio: number, changedIs: 'width' | 'height'): number {
  if (!Number.isFinite(changed) || !Number.isFinite(ratio) || ratio <= 0) return changed
  return changedIs === 'width' ? changed / ratio : changed * ratio
}

export interface CreateSpec {
  kind: 'size'
  width: number
  height: number
  unit: DocUnit
  presetId?: string
  title: string
}

export interface TemplateSpec {
  kind: 'template'
  slug: string
}

/** Interprets `/create?preset=…` | `?w=&h=&unit=` | `?template=…`. Falls back to the default preset. */
export function resolveCreateSpec(params: URLSearchParams, catalogue: SizePresetCatalogue = getSizePresets()): CreateSpec | TemplateSpec {
  const slug = params.get('template')
  if (slug && /^[\w-]{1,120}$/.test(slug)) return { kind: 'template', slug }
  const fallback = getPreset(DEFAULT_PRESET_ID, catalogue) ?? catalogue.presets[0]
  const preset = getPreset(params.get('preset'), catalogue)
  if (preset) return { kind: 'size', width: preset.width, height: preset.height, unit: preset.unit, presetId: preset.id, title: 'Untitled design' }
  const w = params.get('w')
  const h = params.get('h')
  if (w && h) {
    const unit = (CUSTOM_UNITS as string[]).includes(params.get('unit') ?? '') ? (params.get('unit') as CustomUnit) : 'px'
    const parsed = parseCustomSize({ width: w, height: h, unit })
    if (parsed.ok) return { kind: 'size', width: parsed.width, height: parsed.height, unit: parsed.unit, title: 'Untitled design' }
  }
  return { kind: 'size', width: fallback.width, height: fallback.height, unit: fallback.unit, presetId: fallback.id, title: 'Untitled design' }
}

export function createUrl(target: { presetId: string } | { width: number; height: number; unit: CustomUnit } | { template: string }): string {
  const params = new URLSearchParams()
  if ('presetId' in target) params.set('preset', target.presetId)
  else if ('template' in target) params.set('template', target.template)
  else {
    params.set('w', String(target.width))
    params.set('h', String(target.height))
    params.set('unit', target.unit)
  }
  return `/create?${params.toString()}`
}

/** "1080 × 1080 px", "210 × 297 mm", "8.5 × 11 in": the size as the catalogue defines it. */
export function describeSize(preset: Pick<SizePreset, 'sourceWidth' | 'sourceHeight' | 'sourceUnit'>): string {
  const unit: CustomUnit = preset.sourceUnit
  return `${formatUnitValue(preset.sourceWidth, unit)} × ${formatUnitValue(preset.sourceHeight, unit)} ${unit}`
}
