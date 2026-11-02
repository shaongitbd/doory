/**
 * Live Fabric helpers for semantic image grids. The persisted layout stays independent of Fabric;
 * this module is the small bridge that positions children, preserves photo crops and maps pointers
 * into a rotated or scaled grid.
 */
import { FabricImage, type FabricObject, Group, Point, Rect, util } from 'fabric'
import { gridCellFrame, gridCellFrames, hitTestGridCell, type ImageGridCellFrame } from '../../grids/geometry'
import { readImageGridSpec, type ImageGridSpec } from '../../grids/model'
import { asDory, ensureId } from './dory'

export const MIN_IMAGE_GRID_SIZE = 96

/**
 * A crop as Fabric saves a width: to 4 decimals. A crop worked out to more would come out a little different
 * from the saved width on every load, and the grid would count as changed (and overwrite a co-editor's edit).
 */
const savedPrecision = (value: number): number => Number(value.toFixed(4))

export interface GridCellHit {
  gridCellId: string
  frame: ImageGridCellFrame
}

export interface ScenePoint {
  x: number
  y: number
}

export function imageGridSpecOf(obj: FabricObject | null | undefined): ImageGridSpec | null {
  return obj instanceof Group ? readImageGridSpec(asDory(obj).imageGrid) : null
}

export function isImageGrid(obj: FabricObject | null | undefined): obj is Group {
  return imageGridSpecOf(obj) !== null
}

export function gridCellObject(group: Group, gridCellId: string): FabricObject | null {
  return group.getObjects().find((child) => asDory(child).gridCellId === gridCellId) ?? null
}

export function isEmptyGridCell(obj: FabricObject | null | undefined): obj is Rect {
  return obj instanceof Rect && typeof asDory(obj).gridCellId === 'string'
}

function localCellPosition(frame: ImageGridCellFrame, width: number, height: number): { left: number; top: number } {
  return {
    left: frame.left + frame.width / 2 - width / 2,
    top: frame.top + frame.height / 2 - height / 2,
  }
}

export function createEmptyGridCell(frame: ImageGridCellFrame, gridWidth: number, gridHeight: number, id?: string): Rect {
  const position = localCellPosition(frame, gridWidth, gridHeight)
  const rect = new Rect({
    ...position,
    originX: 'center',
    originY: 'center',
    width: frame.width,
    height: frame.height,
    fill: 'transparent',
    strokeWidth: 0,
    selectable: false,
    evented: false,
  })
  const d = asDory(rect)
  d.id = id
  d.gridCellId = frame.gridCellId
  ensureId(rect)
  return rect
}

/** Fits a photo to a cell while retaining the centre of its previous crop. */
export function fitImageGridCell(img: FabricImage, frame: ImageGridCellFrame, gridWidth: number, gridHeight: number): void {
  const natural = img.getOriginalSize()
  const naturalWidth = Math.max(1, natural.width || img.width || 1)
  const naturalHeight = Math.max(1, natural.height || img.height || 1)
  const oldWidth = Math.min(naturalWidth, Math.max(1, img.width || naturalWidth))
  const oldHeight = Math.min(naturalHeight, Math.max(1, img.height || naturalHeight))
  const oldX = Math.min(naturalWidth - oldWidth, Math.max(0, img.cropX || 0))
  const oldY = Math.min(naturalHeight - oldHeight, Math.max(0, img.cropY || 0))
  const focusX = (oldX + oldWidth / 2) / naturalWidth
  const focusY = (oldY + oldHeight / 2) / naturalHeight
  const scale = Math.max(frame.width / naturalWidth, frame.height / naturalHeight)
  const cropWidth = Math.min(naturalWidth, frame.width / scale)
  const cropHeight = Math.min(naturalHeight, frame.height / scale)
  const cropX = Math.min(naturalWidth - cropWidth, Math.max(0, focusX * naturalWidth - cropWidth / 2))
  const cropY = Math.min(naturalHeight - cropHeight, Math.max(0, focusY * naturalHeight - cropHeight / 2))
  const position = localCellPosition(frame, gridWidth, gridHeight)
  img.set({
    ...position,
    originX: 'center',
    originY: 'center',
    angle: 0,
    skewX: 0,
    skewY: 0,
    cropX: savedPrecision(cropX),
    cropY: savedPrecision(cropY),
    width: cropWidth,
    height: cropHeight,
    scaleX: scale,
    scaleY: scale,
    selectable: false,
    evented: false,
  })
  img.setCoords()
}

function positionEmptyCell(rect: Rect, frame: ImageGridCellFrame, width: number, height: number): void {
  rect.set({
    ...localCellPosition(frame, width, height),
    originX: 'center',
    originY: 'center',
    width: frame.width,
    height: frame.height,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    skewX: 0,
    skewY: 0,
    fill: 'transparent',
    strokeWidth: 0,
    selectable: false,
    evented: false,
  })
  rect.setCoords()
}

/** Reflows every child from semantic cell geometry. One child is retained for every cell. */
export function reflowImageGrid(group: Group, spec: ImageGridSpec, width = group.width, height = group.height): void {
  const nextWidth = Math.max(MIN_IMAGE_GRID_SIZE, width)
  const nextHeight = Math.max(MIN_IMAGE_GRID_SIZE, height)
  const frames = gridCellFrames(spec, nextWidth, nextHeight)
  for (const child of group.getObjects()) {
    const cellId = asDory(child).gridCellId
    if (!cellId) continue
    const frame = gridCellFrame(frames, cellId)
    if (!frame) continue
    if (child instanceof FabricImage) fitImageGridCell(child, frame, nextWidth, nextHeight)
    else if (child instanceof Rect) positionEmptyCell(child, frame, nextWidth, nextHeight)
  }
  group.triggerLayout()
  group.setCoords()
}

/**
 * Restores the one-child-per-cell invariant after document or collaboration hydration. The semantic
 * grid metadata is authoritative; stale, duplicate or unsupported children are replaced with empty cells.
 */
export function reconcileImageGridChildren(group: Group, spec: ImageGridSpec): void {
  const center = group.getCenterPoint()
  const width = Math.max(MIN_IMAGE_GRID_SIZE, group.width)
  const height = Math.max(MIN_IMAGE_GRID_SIZE, group.height)
  const frames = gridCellFrames(spec, width, height)
  const wanted = new Set(spec.cells.map((cell) => cell.gridCellId))
  const retained = new Set<string>()
  const reusableIds: (string | undefined)[] = []
  const stale: FabricObject[] = []

  for (const child of [...group.getObjects()]) {
    const data = asDory(child)
    const cellId = data.gridCellId
    const supported = child instanceof FabricImage || child instanceof Rect
    if (!supported || !cellId || !wanted.has(cellId) || retained.has(cellId)) {
      reusableIds.push(data.id)
      stale.push(child)
      continue
    }
    retained.add(cellId)
  }
  // All at once: the group lays itself out again on every removal, too slow for a document with thousands.
  if (stale.length > 0) group.remove(...stale)
  for (const child of stale) child.dispose()

  const usedIds = new Set(group.getObjects().map((child) => asDory(child).id).filter((id): id is string => !!id))
  for (const cell of spec.cells) {
    if (retained.has(cell.gridCellId)) continue
    const frame = gridCellFrame(frames, cell.gridCellId)
    if (!frame) continue
    let reusableId = reusableIds.shift()
    while (reusableId && usedIds.has(reusableId)) reusableId = reusableIds.shift()
    const empty = createEmptyGridCell(frame, width, height, reusableId)
    usedIds.add(asDory(empty).id!)
    group.add(empty)
  }

  reflowImageGrid(group, spec, width, height)
  normalizeImageGridTransform(group)
  group.setPositionByOrigin(center, 'center', 'center')
  group.setCoords()
  for (const child of group.getObjects()) child.set({ selectable: false, evented: false })
}

/** Bakes a side/corner scale into cell geometry so photographs always keep a uniform scale. */
export function normalizeImageGridTransform(group: Group): boolean {
  const spec = imageGridSpecOf(group)
  if (!spec) return false
  const scaleX = Math.abs(group.scaleX || 1)
  const scaleY = Math.abs(group.scaleY || 1)
  if (Math.abs(scaleX - 1) < 1e-6 && Math.abs(scaleY - 1) < 1e-6) return false
  const center = group.getCenterPoint()
  const width = Math.max(MIN_IMAGE_GRID_SIZE, group.width * scaleX)
  const height = Math.max(MIN_IMAGE_GRID_SIZE, group.height * scaleY)
  group.set({ scaleX: 1, scaleY: 1 })
  reflowImageGrid(group, spec, width, height)
  group.setPositionByOrigin(center, 'center', 'center')
  group.setCoords()
  return true
}

/** Converts a page-space pointer into the grid's local top-left coordinate system. */
export function imageGridCellAtPoint(group: Group, point: ScenePoint): GridCellHit | null {
  const spec = imageGridSpecOf(group)
  if (!spec) return null
  const local = new Point(point.x, point.y).transform(util.invertTransform(group.calcTransformMatrix()))
  const frames = gridCellFrames(spec, group.width, group.height)
  const frame = hitTestGridCell(frames, { x: local.x + group.width / 2, y: local.y + group.height / 2 })
  return frame ? { gridCellId: frame.gridCellId, frame } : null
}

/** Cell corners in page coordinates, used by the editor-only grid overlay. */
export function imageGridCellPolygon(group: Group, gridCellId: string): Point[] {
  const spec = imageGridSpecOf(group)
  if (!spec) return []
  const frame = gridCellFrame(gridCellFrames(spec, group.width, group.height), gridCellId)
  if (!frame) return []
  const left = frame.left - group.width / 2
  const top = frame.top - group.height / 2
  const matrix = group.calcTransformMatrix()
  return [
    new Point(left, top),
    new Point(left + frame.width, top),
    new Point(left + frame.width, top + frame.height),
    new Point(left, top + frame.height),
  ].map((point) => point.transform(matrix))
}

export function createImageGridGroup(spec: ImageGridSpec, width: number, height: number, at: ScenePoint): Group {
  const frames = gridCellFrames(spec, width, height)
  const cells = frames.map((frame) => createEmptyGridCell(frame, width, height))
  const group = new Group(cells, {
    left: at.x,
    top: at.y,
    originX: 'center',
    originY: 'center',
    objectCaching: false,
    subTargetCheck: false,
    interactive: false,
  })
  const d = asDory(group)
  d.imageGrid = structuredClone(spec)
  ensureId(group)
  group.setCoords()
  return group
}
