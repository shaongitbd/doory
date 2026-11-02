import { clampImageGridGap, type ImageGridCellSpec, type ImageGridSpec } from './model'

export interface ImageGridCellFrame {
  gridCellId: string
  left: number
  top: number
  width: number
  height: number
}

export interface ImageGridPoint {
  x: number
  y: number
}

function safeDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(1, value) : 1
}

function fittedInsets(start: number, end: number, length: number): [number, number] {
  const total = start + end
  const available = Math.max(0, length - 1)
  if (total === 0 || total <= available) return [start, end]
  const scale = available / total
  return [start * scale, end * scale]
}

function cellFrame(cell: ImageGridCellSpec, width: number, height: number, gap: number): ImageGridCellFrame {
  const baseLeft = cell.x * width
  const baseTop = cell.y * height
  const baseWidth = cell.width * width
  const baseHeight = cell.height * height
  const halfGap = gap / 2
  const [leftInset, rightInset] = fittedInsets(cell.x > 0 ? halfGap : 0, cell.x + cell.width < 1 ? halfGap : 0, baseWidth)
  const [topInset, bottomInset] = fittedInsets(cell.y > 0 ? halfGap : 0, cell.y + cell.height < 1 ? halfGap : 0, baseHeight)
  return {
    gridCellId: cell.gridCellId,
    left: baseLeft + leftInset,
    top: baseTop + topInset,
    width: baseWidth - leftInset - rightInset,
    height: baseHeight - topInset - bottomInset,
  }
}

/** Pixel frames in a top-left grid coordinate system. Gaps are split evenly across shared edges. */
export function gridCellFrames(spec: ImageGridSpec, gridWidth: number, gridHeight: number): ImageGridCellFrame[] {
  const width = safeDimension(gridWidth)
  const height = safeDimension(gridHeight)
  const gap = clampImageGridGap(spec.gap)
  return spec.cells.map((cell) => cellFrame(cell, width, height, gap))
}

/** Finds the cell below a point expressed in the same top-left coordinate system as `gridCellFrames`. */
export function hitTestGridCell(frames: readonly ImageGridCellFrame[], point: ImageGridPoint): ImageGridCellFrame | null {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index]
    if (point.x >= frame.left && point.x <= frame.left + frame.width && point.y >= frame.top && point.y <= frame.top + frame.height) return frame
  }
  return null
}

export function gridCellFrame(frames: readonly ImageGridCellFrame[], gridCellId: string): ImageGridCellFrame | null {
  return frames.find((frame) => frame.gridCellId === gridCellId) ?? null
}
