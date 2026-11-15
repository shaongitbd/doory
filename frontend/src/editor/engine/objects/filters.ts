/**
 * Image adjustments. The document stores a plain list of `{type, value}` specs; this module turns them
 * into Fabric filters (WebGL when available, 2D otherwise) and defines the one-click presets.
 */
import { writableMetadata } from '@/i18n/metadata'
import { classRegistry, type FabricImage, filters as F } from 'fabric'
import type { ImageFilterSpec, ImageFilterType } from '@/types/document'
import { t } from '../../strings'

type FilterInstance = InstanceType<typeof F.BaseFilter>
type T2D = Parameters<InstanceType<typeof F.Brightness>['applyTo2d']>[0]
type GlUniformMap = Parameters<InstanceType<typeof F.Brightness>['sendUniformData']>[1]

const VIGNETTE_FRAGMENT = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uAmount;
  varying vec2 vTexCoord;
  void main() {
    vec4 color = texture2D(uTexture, vTexCoord);
    float d = length(vTexCoord - vec2(0.5)) * 1.4142;
    float v = smoothstep(0.35, 1.05, d) * uAmount;
    color.rgb *= (1.0 - v);
    gl_FragColor = color;
  }
`

/** Darkens the corners. `amount` is 0..1. */
export class Vignette extends F.BaseFilter<'Vignette', { amount: number }> {
  declare amount: number
  static override type = 'Vignette'
  static override defaults = { amount: 0 }
  static override uniformLocations = ['uAmount']

  override getFragmentSource(): string {
    return VIGNETTE_FRAGMENT
  }

  override applyTo2d({ imageData: { data, width, height } }: T2D): void {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x / width - 0.5
        const dy = y / height - 0.5
        const d = Math.hypot(dx, dy) * 1.4142
        const t = Math.min(1, Math.max(0, (d - 0.35) / 0.7))
        const smooth = t * t * (3 - 2 * t)
        const factor = 1 - smooth * this.amount
        const i = (y * width + x) * 4
        data[i] *= factor
        data[i + 1] *= factor
        data[i + 2] *= factor
      }
    }
  }

  override sendUniformData(gl: WebGLRenderingContext, uniformLocations: GlUniformMap): void {
    gl.uniform1f(uniformLocations.uAmount, this.amount)
  }

  override isNeutralState(): boolean {
    return this.amount === 0
  }
}

classRegistry.setClass(Vignette)

export interface FilterRange {
  type: ImageFilterType
  min: number
  max: number
  step: number
  /** Unit shown next to the value in the UI, as a multiplier (value * display). */
  display: number
  suffix: string
}

export const FILTER_RANGES: readonly FilterRange[] = [
  { type: 'brightness', min: -1, max: 1, step: 0.01, display: 100, suffix: '' },
  { type: 'contrast', min: -1, max: 1, step: 0.01, display: 100, suffix: '' },
  { type: 'saturation', min: -1, max: 1, step: 0.01, display: 100, suffix: '' },
  { type: 'hue', min: -1, max: 1, step: 0.01, display: 180, suffix: '°' },
  { type: 'blur', min: 0, max: 1, step: 0.01, display: 100, suffix: '' },
  { type: 'vignette', min: 0, max: 1, step: 0.01, display: 100, suffix: '' },
]

export const TOGGLE_FILTERS: readonly ImageFilterType[] = ['grayscale', 'sepia']

export function buildFilters(specs: readonly ImageFilterSpec[]): FilterInstance[] {
  const out: FilterInstance[] = []
  for (const { type, value } of specs) {
    switch (type) {
      case 'brightness':
        if (value !== 0) out.push(new F.Brightness({ brightness: value }))
        break
      case 'contrast':
        if (value !== 0) out.push(new F.Contrast({ contrast: value }))
        break
      case 'saturation':
        if (value !== 0) out.push(new F.Saturation({ saturation: value }))
        break
      case 'hue':
        if (value !== 0) out.push(new F.HueRotation({ rotation: value }))
        break
      case 'blur':
        if (value > 0) out.push(new F.Blur({ blur: value * 0.25 }))
        break
      case 'vignette':
        if (value > 0) out.push(new Vignette({ amount: value }))
        break
      case 'grayscale':
        if (value > 0) out.push(new F.Grayscale())
        break
      case 'sepia':
        if (value > 0) out.push(new F.Sepia())
        break
    }
  }
  return out
}

/** Drops neutral entries and duplicate types (last wins) so stored specs stay minimal. */
export function normalizeSpecs(specs: readonly ImageFilterSpec[]): ImageFilterSpec[] {
  const byType = new Map<ImageFilterType, number>()
  for (const s of specs) byType.set(s.type, s.value)
  const order: ImageFilterType[] = ['brightness', 'contrast', 'saturation', 'hue', 'blur', 'vignette', 'grayscale', 'sepia']
  return order
    .filter((t) => (byType.get(t) ?? 0) !== 0)
    .map((t) => ({ type: t, value: Math.round((byType.get(t) ?? 0) * 1000) / 1000 }))
}

export function applyImageFilters(img: FabricImage, specs: readonly ImageFilterSpec[]): void {
  img.filters = buildFilters(specs)
  img.applyFilters()
  img.set('dirty', true)
}

export interface FilterPreset {
  id: string
  label: string
  specs: ImageFilterSpec[]
}

export const FILTER_PRESETS: readonly FilterPreset[] = [
  writableMetadata({ id: 'none', get label() { return t.filterPresets.none }, specs: [] }),
  writableMetadata({
    id: 'vivid',
    get label() { return t.filterPresets.vivid },
    specs: [
      { type: 'contrast', value: 0.15 },
      { type: 'saturation', value: 0.45 },
    ],
  }),
  writableMetadata({
    id: 'warm',
    get label() { return t.filterPresets.warm },
    specs: [
      { type: 'hue', value: -0.04 },
      { type: 'saturation', value: 0.2 },
      { type: 'brightness', value: 0.04 },
    ],
  }),
  writableMetadata({
    id: 'cool',
    get label() { return t.filterPresets.cool },
    specs: [
      { type: 'hue', value: 0.08 },
      { type: 'saturation', value: -0.1 },
      { type: 'brightness', value: 0.02 },
    ],
  }),
  writableMetadata({ id: 'mono', get label() { return t.filterPresets.mono }, specs: [{ type: 'grayscale', value: 1 }] }),
  writableMetadata({
    id: 'noir',
    get label() { return t.filterPresets.noir },
    specs: [
      { type: 'grayscale', value: 1 },
      { type: 'contrast', value: 0.35 },
      { type: 'vignette', value: 0.55 },
    ],
  }),
  writableMetadata({
    id: 'fade',
    get label() { return t.filterPresets.fade },
    specs: [
      { type: 'contrast', value: -0.2 },
      { type: 'saturation', value: -0.25 },
      { type: 'brightness', value: 0.1 },
    ],
  }),
  writableMetadata({
    id: 'vintage',
    get label() { return t.filterPresets.vintage },
    specs: [
      { type: 'sepia', value: 1 },
      { type: 'contrast', value: 0.1 },
      { type: 'vignette', value: 0.4 },
    ],
  }),
  writableMetadata({
    id: 'dramatic',
    get label() { return t.filterPresets.dramatic },
    specs: [
      { type: 'contrast', value: 0.4 },
      { type: 'saturation', value: -0.15 },
      { type: 'brightness', value: -0.05 },
      { type: 'vignette', value: 0.35 },
    ],
  }),
]

export function specValue(specs: readonly ImageFilterSpec[] | undefined, type: ImageFilterType): number {
  return specs?.find((s) => s.type === type)?.value ?? 0
}

export function withSpec(specs: readonly ImageFilterSpec[] | undefined, type: ImageFilterType, value: number): ImageFilterSpec[] {
  const rest = (specs ?? []).filter((s) => s.type !== type)
  return normalizeSpecs([...rest, { type, value }])
}
