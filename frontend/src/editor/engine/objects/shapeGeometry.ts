/**
 * Pure geometry for built-in shapes and image mask frames. All paths use a 100 x 100 viewBox so they
 * can be stretched into any bounding box.
 */
import { writableMetadata } from '@/i18n/metadata'
import type { MaskShapeId } from '@/types/document'
import { t } from '../../strings'

export interface Pt {
  x: number
  y: number
}

/** Vertices of a regular polygon inscribed in a `size` x `size` box, first vertex at the top. */
export function regularPolygonPoints(sides: number, size = 100): Pt[] {
  const n = Math.max(3, Math.min(12, Math.round(sides)))
  const r = size / 2
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    pts.push({ x: r + r * Math.cos(a), y: r + r * Math.sin(a) })
  }
  return normalizePoints(pts, size)
}

/** Star with `points` tips; `innerRatio` is the inner radius as a fraction of the outer one (0.1..0.95). */
export function starPoints(points: number, innerRatio: number, size = 100): Pt[] {
  const n = Math.max(3, Math.min(24, Math.round(points)))
  const ratio = Math.max(0.1, Math.min(0.95, innerRatio))
  const r = size / 2
  const pts: Pt[] = []
  for (let i = 0; i < n * 2; i++) {
    const radius = i % 2 === 0 ? r : r * ratio
    const a = -Math.PI / 2 + (i * Math.PI) / n
    pts.push({ x: r + radius * Math.cos(a), y: r + radius * Math.sin(a) })
  }
  return normalizePoints(pts, size)
}

/** Fits the points tightly into [0,size]² so the shape fills its bounding box regardless of vertex count. */
function normalizePoints(pts: Pt[], size: number): Pt[] {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  return pts.map((p) => ({ x: round(((p.x - minX) / w) * size), y: round(((p.y - minY) / h) * size) }))
}

const round = (n: number): number => Math.round(n * 1000) / 1000

export function pointsToPath(pts: readonly Pt[]): string {
  return `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} Z`
}

export interface PathShape {
  id: string
  label: string
  path: string
  /** Use even-odd filling (shapes with holes). */
  evenOdd?: boolean
  keywords: string[]
}

/** Built-in vector shapes (originals, CC0). They work with no server. */
export const PATH_SHAPES: readonly PathShape[] = [
  writableMetadata({
    id: 'heart',
    get label() { return t.shapes.heart },
    path: 'M50 90 C18 66 4 48 4 31 C4 17 15 7 29 7 C38 7 46 12 50 20 C54 12 62 7 71 7 C85 7 96 17 96 31 C96 48 82 66 50 90 Z',
    keywords: ['love', 'valentine'],
  }),
  writableMetadata({
    id: 'speech',
    get label() { return t.shapes.speech },
    path: 'M16 6 H84 Q94 6 94 16 V58 Q94 68 84 68 H46 L26 92 V68 H16 Q6 68 6 58 V16 Q6 6 16 6 Z',
    keywords: ['chat', 'comment', 'callout'],
  }),
  writableMetadata({ id: 'arrow-right', get label() { return t.shapes.arrowRight }, path: 'M4 36 H56 V12 L96 50 L56 88 V64 H4 Z', keywords: ['arrow', 'direction'] }),
  writableMetadata({ id: 'cross', get label() { return t.shapes.cross }, path: 'M36 4 H64 V36 H96 V64 H64 V96 H36 V64 H4 V36 H36 Z', keywords: ['add', 'plus', 'medical'] }),
  writableMetadata({ id: 'diamond', get label() { return t.shapes.diamond }, path: 'M50 2 L98 50 L50 98 L2 50 Z', keywords: ['rhombus'] }),
  writableMetadata({ id: 'trapezoid', get label() { return t.shapes.trapezoid }, path: 'M22 18 H78 L98 82 H2 Z', keywords: [] }),
  writableMetadata({ id: 'parallelogram', get label() { return t.shapes.parallelogram }, path: 'M26 18 H98 L74 82 H2 Z', keywords: [] }),
  writableMetadata({
    id: 'ring',
    get label() { return t.shapes.ring },
    path: 'M50 2 A48 48 0 1 1 49.99 2 Z M50 24 A26 26 0 1 0 50.01 24 Z',
    evenOdd: true,
    keywords: ['donut', 'circle'],
  }),
  writableMetadata({
    id: 'cloud',
    get label() { return t.shapes.cloud },
    path: 'M26 82 C10 82 2 70 6 57 C8 47 18 42 25 44 C25 27 41 16 56 23 C64 11 85 16 86 35 C99 37 101 56 91 67 C87 77 79 82 70 82 Z',
    keywords: ['weather', 'sky'],
  }),
  writableMetadata({ id: 'bolt', get label() { return t.shapes.bolt }, path: 'M58 2 L16 56 H44 L36 98 L84 40 H56 Z', keywords: ['energy', 'flash'] }),
  writableMetadata({ id: 'chevron', get label() { return t.shapes.chevron }, path: 'M18 6 H66 L96 50 L66 94 H18 L48 50 Z', keywords: ['arrow'] }),
  writableMetadata({ id: 'banner', get label() { return t.shapes.banner }, path: 'M2 22 H98 L86 50 L98 78 H2 L14 50 Z', keywords: ['ribbon', 'label'] }),
  writableMetadata({
    id: 'moon',
    get label() { return t.shapes.moon },
    path: 'M62 4 A46 46 0 1 0 96 66 A36 36 0 0 1 62 4 Z',
    keywords: ['night'],
  }),
  writableMetadata({ id: 'drop', get label() { return t.shapes.drop }, path: 'M50 2 C50 2 14 42 14 64 A36 36 0 0 0 86 64 C86 42 50 2 50 2 Z', keywords: ['water'] }),
]

const MASK_PATHS: Record<Exclude<MaskShapeId, 'circle' | 'rounded'>, string> = {
  triangle: 'M50 4 L97 94 H3 Z',
  diamond: 'M50 2 L98 50 L50 98 L2 50 Z',
  hexagon: 'M26 4 H74 L98 50 L74 96 H26 L2 50 Z',
  star: pointsToPath(starPoints(5, 0.45)),
  heart: 'M50 94 C16 68 2 50 2 32 C2 16 14 5 29 5 C38 5 46 10 50 18 C54 10 62 5 71 5 C86 5 98 16 98 32 C98 50 84 68 50 94 Z',
  blob: 'M50 4 C74 2 96 20 96 46 C96 74 76 98 48 96 C22 94 4 76 4 50 C4 24 24 6 50 4 Z',
  arch: 'M2 98 V50 A48 48 0 0 1 98 50 V98 Z',
  cross: 'M34 2 H66 V34 H98 V66 H66 V98 H34 V66 H2 V34 H34 Z',
}

export const MASK_SHAPE_IDS: readonly MaskShapeId[] = ['circle', 'rounded', 'triangle', 'diamond', 'hexagon', 'star', 'heart', 'blob', 'arch', 'cross']

/** 100x100-viewBox path for a mask shape, or null for the primitives (circle/rounded) drawn natively. */
export function maskPath(id: MaskShapeId): string | null {
  if (id === 'circle' || id === 'rounded') return null
  return MASK_PATHS[id]
}

/** Arrowhead outlines in a unit space where the line tip is at (0,0) and the line extends toward -x. */
export function arrowHeadPath(kind: 'triangle' | 'open' | 'circle' | 'diamond', size: number): { d: string; fill: boolean } {
  const s = size
  switch (kind) {
    case 'triangle':
      return { d: `M 0 0 L ${-s} ${-s * 0.55} L ${-s} ${s * 0.55} Z`, fill: true }
    case 'open':
      return { d: `M ${-s} ${-s * 0.6} L 0 0 L ${-s} ${s * 0.6}`, fill: false }
    case 'diamond':
      return { d: `M 0 0 L ${-s / 2} ${-s * 0.45} L ${-s} 0 L ${-s / 2} ${s * 0.45} Z`, fill: true }
    case 'circle': {
      const r = s * 0.42
      return { d: `M ${-r * 2} 0 A ${r} ${r} 0 1 0 0 0 A ${r} ${r} 0 1 0 ${-r * 2} 0 Z`, fill: true }
    }
  }
}
