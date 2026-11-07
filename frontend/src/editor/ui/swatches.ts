import { Registry } from '../engine/registry'

/** The default swatch set, with the Doory palette first. */
export const DEFAULT_COLORS = [
  '#2b1c17', '#ffffff', '#7a64e0', '#c9bcff', '#ffa9b9', '#ffc9d3',
  '#f5a623', '#fb923c', '#fef08a', '#16a34a', '#22a39f', '#3b82f6',
  '#1e40af', '#0a1f55', '#7e6cd8', '#5b2bb8', '#a3199c', '#3a0a4d',
  '#7b4a1f', '#e8d5a6', '#cfd6df', '#6b6165', '#3b0a0a',
] as const

export interface Palette {
  id: string
  label: string
  colors: readonly string[]
  /** Lower comes first. */
  order?: number
}

/** Preset swatch palettes shown in the colour picker. Extensions (brand kits…) can add their own. */
export const palettes = new Registry<Palette>((a, b) => (a.order ?? 100) - (b.order ?? 100))

export function registerPalette(palette: Palette): () => void {
  return palettes.register(palette)
}

registerPalette({
  id: 'doory',
  label: 'Doory',
  order: 0,
  colors: ['#2b1c17', '#7a64e0', '#c9bcff', '#ffa9b9', '#ffc9d3', '#ffe8a8', '#c4ecd9', '#ffffff'],
})
registerPalette({
  id: 'vivid',
  label: 'Vivid',
  order: 10,
  colors: ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f43f5e'],
})
registerPalette({
  id: 'pastel',
  label: 'Pastel',
  order: 20,
  colors: ['#fecaca', '#fed7aa', '#fef08a', '#d9f99d', '#bbf7d0', '#a5f3fc', '#bfdbfe', '#c7d2fe', '#e9d5ff', '#fbcfe8'],
})
registerPalette({
  id: 'earth',
  label: 'Earth',
  order: 30,
  colors: ['#292524', '#57534e', '#78716c', '#a8a29e', '#d6d3d1', '#92400e', '#b45309', '#d97706', '#65a30d', '#3f6212'],
})
registerPalette({
  id: 'mono',
  label: 'Grayscale',
  order: 40,
  colors: ['#000000', '#262626', '#404040', '#525252', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5', '#f5f5f5', '#ffffff'],
})

export const GRADIENT_PRESETS: readonly { id: string; label: string; stops: { offset: number; color: string }[]; angle: number }[] = [
  { id: 'sunset', label: 'Sunset', angle: 45, stops: [{ offset: 0, color: '#f43f5e' }, { offset: 1, color: '#f59e0b' }] },
  { id: 'ocean', label: 'Ocean', angle: 60, stops: [{ offset: 0, color: '#2563eb' }, { offset: 1, color: '#06b6d4' }] },
  { id: 'berry', label: 'Berry', angle: 35, stops: [{ offset: 0, color: '#be123c' }, { offset: 1, color: '#7c3aed' }] },
  { id: 'mint', label: 'Mint', angle: 90, stops: [{ offset: 0, color: '#34d399' }, { offset: 1, color: '#bbf7d0' }] },
  { id: 'dusk', label: 'Dusk', angle: 135, stops: [{ offset: 0, color: '#1e1b4b' }, { offset: 1, color: '#9f1239' }] },
  { id: 'cream', label: 'Cream', angle: 90, stops: [{ offset: 0, color: '#fff7ed' }, { offset: 1, color: '#fecdd3' }] },
]
