export interface ImageGridCellSpec {
  /** Stable within one grid. Object ids may change when a grid is duplicated. */
  gridCellId: string
  /** Normalised frame inside the grid, before the pixel gap is applied. */
  x: number
  y: number
  width: number
  height: number
}

export interface ImageGridSpec {
  version: 1
  layoutId: string
  /** Space between neighbouring cells, in document pixels. */
  gap: number
  cells: ImageGridCellSpec[]
}

interface ImageGridPresetDefinition {
  id: string
  cells: readonly ImageGridCellSpec[]
}

const cell = (number: number, x: number, y: number, width: number, height: number): ImageGridCellSpec => ({
  gridCellId: `cell-${number}`,
  x,
  y,
  width,
  height,
})

/**
 * A small first-party catalogue rather than generated rows and columns. Keeping the frames explicit makes
 * asymmetric layouts just as predictable as regular ones and lets saved designs retain their exact geometry.
 */
export const IMAGE_GRID_PRESETS = [
  {
    id: 'two-columns',
    cells: [cell(1, 0, 0, 0.5, 1), cell(2, 0.5, 0, 0.5, 1)],
  },
  {
    id: 'two-rows',
    cells: [cell(1, 0, 0, 1, 0.5), cell(2, 0, 0.5, 1, 0.5)],
  },
  {
    id: 'three-columns',
    cells: [cell(1, 0, 0, 1 / 3, 1), cell(2, 1 / 3, 0, 1 / 3, 1), cell(3, 2 / 3, 0, 1 / 3, 1)],
  },
  {
    id: 'feature-left',
    cells: [cell(1, 0, 0, 0.6, 1), cell(2, 0.6, 0, 0.4, 0.5), cell(3, 0.6, 0.5, 0.4, 0.5)],
  },
  {
    id: 'four-grid',
    cells: [cell(1, 0, 0, 0.5, 0.5), cell(2, 0.5, 0, 0.5, 0.5), cell(3, 0, 0.5, 0.5, 0.5), cell(4, 0.5, 0.5, 0.5, 0.5)],
  },
  {
    id: 'feature-top',
    cells: [
      cell(1, 0, 0, 1, 0.56),
      cell(2, 0, 0.56, 0.25, 0.44),
      cell(3, 0.25, 0.56, 0.25, 0.44),
      cell(4, 0.5, 0.56, 0.25, 0.44),
      cell(5, 0.75, 0.56, 0.25, 0.44),
    ],
  },
  {
    id: 'six-grid',
    cells: [
      cell(1, 0, 0, 1 / 3, 0.5),
      cell(2, 1 / 3, 0, 1 / 3, 0.5),
      cell(3, 2 / 3, 0, 1 / 3, 0.5),
      cell(4, 0, 0.5, 1 / 3, 0.5),
      cell(5, 1 / 3, 0.5, 1 / 3, 0.5),
      cell(6, 2 / 3, 0.5, 1 / 3, 0.5),
    ],
  },
] as const satisfies readonly ImageGridPresetDefinition[]

export type ImageGridLayoutId = (typeof IMAGE_GRID_PRESETS)[number]['id']

export const DEFAULT_IMAGE_GRID_LAYOUT_ID: ImageGridLayoutId = 'four-grid'
export const DEFAULT_IMAGE_GRID_GAP = 8
export const MAX_IMAGE_GRID_GAP = 64

const EPSILON = 1e-6

function cloneCells(cells: readonly ImageGridCellSpec[]): ImageGridCellSpec[] {
  return cells.map((entry) => ({ ...entry }))
}

export function isImageGridLayoutId(value: unknown): value is ImageGridLayoutId {
  return typeof value === 'string' && IMAGE_GRID_PRESETS.some((preset) => preset.id === value)
}

export function imageGridPreset(layoutId: string): (typeof IMAGE_GRID_PRESETS)[number] {
  return IMAGE_GRID_PRESETS.find((preset) => preset.id === layoutId) ?? IMAGE_GRID_PRESETS.find((preset) => preset.id === DEFAULT_IMAGE_GRID_LAYOUT_ID)!
}

export function clampImageGridGap(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_IMAGE_GRID_GAP
  return Math.min(MAX_IMAGE_GRID_GAP, Math.max(0, Number(value.toFixed(3))))
}

export function createImageGridSpec(layoutId: string = DEFAULT_IMAGE_GRID_LAYOUT_ID, gap = DEFAULT_IMAGE_GRID_GAP): ImageGridSpec {
  const preset = imageGridPreset(layoutId)
  return { version: 1, layoutId: preset.id, gap: clampImageGridGap(gap), cells: cloneCells(preset.cells) }
}

function isCell(value: unknown): value is ImageGridCellSpec {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ImageGridCellSpec>
  const numbers = [candidate.x, candidate.y, candidate.width, candidate.height]
  if (typeof candidate.gridCellId !== 'string' || candidate.gridCellId.length === 0 || candidate.gridCellId.length > 64) return false
  if (!numbers.every((number) => typeof number === 'number' && Number.isFinite(number))) return false
  const x = candidate.x as number
  const y = candidate.y as number
  const width = candidate.width as number
  const height = candidate.height as number
  return x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1 + EPSILON && y + height <= 1 + EPSILON
}

function cellsDoNotOverlap(cells: readonly ImageGridCellSpec[]): boolean {
  for (let left = 0; left < cells.length; left += 1) {
    const a = cells[left]
    for (let right = left + 1; right < cells.length; right += 1) {
      const b = cells[right]
      const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (overlapWidth > EPSILON && overlapHeight > EPSILON) return false
    }
  }
  return true
}

/** Reads persisted metadata without trusting its shape. Unknown layout ids are retained when their cells are valid. */
export function readImageGridSpec(value: unknown): ImageGridSpec | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ImageGridSpec>
  if (candidate.version !== 1 || typeof candidate.layoutId !== 'string' || candidate.layoutId.length === 0 || candidate.layoutId.length > 64) return null
  if (!Array.isArray(candidate.cells) || candidate.cells.length === 0 || candidate.cells.length > 24 || !candidate.cells.every(isCell)) return null
  const ids = new Set(candidate.cells.map((entry) => entry.gridCellId))
  if (ids.size !== candidate.cells.length || !cellsDoNotOverlap(candidate.cells)) return null
  return {
    version: 1,
    layoutId: candidate.layoutId,
    gap: clampImageGridGap(candidate.gap),
    cells: cloneCells(candidate.cells),
  }
}

export function imageGridSpecOrDefault(value: unknown, fallback: ImageGridLayoutId = DEFAULT_IMAGE_GRID_LAYOUT_ID): ImageGridSpec {
  return readImageGridSpec(value) ?? createImageGridSpec(fallback)
}
