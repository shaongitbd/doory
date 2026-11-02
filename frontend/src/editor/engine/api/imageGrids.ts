/** Image-grid mutations. Each method leaves the grid as one selected, undoable document object. */
import { FabricImage, type FabricObject, Group, Point } from 'fabric'
import type { AssetRef } from '@/types/adapter'
import type { EditorEngine } from '../editor'
import { UploadError } from '../assets'
import { pickFiles } from '../files'
import { createImage } from '../objects/factories'
import { asDory } from '../objects/dory'
import { kindOfLive } from '../objects/kinds'
import {
  createEmptyGridCell,
  createImageGridGroup,
  fitImageGridCell,
  gridCellObject,
  imageGridSpecOf,
  isEmptyGridCell,
  isImageGrid,
  reflowImageGrid,
} from '../objects/imageGrid'
import { gridCellFrame, gridCellFrames } from '../../grids/geometry'
import {
  clampImageGridGap,
  createImageGridSpec,
  imageGridPreset,
  type ImageGridLayoutId,
  type ImageGridSpec,
} from '../../grids/model'
import { t } from '../../strings'

export interface CanvasImageFrame {
  center: { x: number; y: number }
  width: number
  height: number
  angle: number
  flipX: boolean
  flipY: boolean
}

interface GridContext {
  pageId: string
  view: NonNullable<ReturnType<EditorEngine['activeView']>>
  group: Group
  spec: ImageGridSpec
}

function cellPosition(spec: ImageGridSpec, gridCellId: string): number {
  return Math.max(0, spec.cells.findIndex((cell) => cell.gridCellId === gridCellId)) + 1
}

function keepGridPosition(group: Group, mutate: () => void): void {
  const center = group.getCenterPoint()
  const width = group.width
  const height = group.height
  mutate()
  const spec = imageGridSpecOf(group)
  if (spec) reflowImageGrid(group, spec, width, height)
  group.setPositionByOrigin(center, 'center', 'center')
  group.setCoords()
  group.set('dirty', true)
}

function restoreCanvasImageFrame(image: FabricImage, frame: CanvasImageFrame): void {
  const width = image.getScaledWidth()
  const height = image.getScaledHeight()
  const scaleX = width > 0 ? image.scaleX * (frame.width / width) : frame.width / Math.max(image.width, 1)
  const scaleY = height > 0 ? image.scaleY * (frame.height / height) : frame.height / Math.max(image.height, 1)

  image.set({ scaleX, scaleY, angle: frame.angle, flipX: frame.flipX, flipY: frame.flipY })
  image.setPositionByOrigin(new Point(frame.center.x, frame.center.y), 'center', 'center')
  image.setCoords()
}

export class ImageGridApi {
  constructor(private readonly engine: EditorEngine) {}

  private selected(): GridContext | null {
    const view = this.engine.activeView()
    const group = view?.selectedObjects()[0]
    const spec = imageGridSpecOf(group)
    if (!view || !group || !isImageGrid(group) || !spec) return null
    return { pageId: this.engine.state.activePageId, view, group, spec }
  }

  private byId(pageId: string, gridId: string): GridContext | null {
    const view = this.engine.viewOf(pageId)
    const group = view?.getById(gridId)
    const spec = imageGridSpecOf(group)
    if (!view || !group || !isImageGrid(group) || !spec) return null
    return { pageId, view, group, spec }
  }

  async insert(layoutId: ImageGridLayoutId): Promise<void> {
    if (this.engine.readOnly) return
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    const width = Math.max(220, Math.min(page.width * 0.68, 720))
    const height = Math.max(160, Math.min(page.height * 0.46, width * 0.7))
    const group = createImageGridGroup(createImageGridSpec(layoutId), width, height, this.engine.insert.center())
    asDory(group).name = t.kinds['image-grid']
    await this.engine.insert.add([group], t.history.addImageGrid)
  }

  async setLayout(layoutId: ImageGridLayoutId): Promise<void> {
    if (this.engine.readOnly) return
    const ctx = this.selected()
    if (!ctx) return
    const preset = imageGridPreset(layoutId)
    const ordered = ctx.spec.cells.map((cell) => gridCellObject(ctx.group, cell.gridCellId)).filter((child): child is FabricObject => !!child)
    const removed = ordered.slice(preset.cells.length)
    if (removed.some((child) => !isEmptyGridCell(child))) {
      this.engine.toast(t.imageGrid.fewerCellsDisabled)
      return
    }
    const next = createImageGridSpec(preset.id, ctx.spec.gap)
    keepGridPosition(ctx.group, () => {
      asDory(ctx.group).imageGrid = next
      for (const child of removed) {
        ctx.group.remove(child)
        child.dispose()
      }
      for (let index = 0; index < next.cells.length; index += 1) {
        const child = ordered[index]
        const cell = next.cells[index]
        if (child) {
          asDory(child).gridCellId = cell.gridCellId
        } else {
          const frames = gridCellFrames(next, ctx.group.width, ctx.group.height)
          const frame = gridCellFrame(frames, cell.gridCellId)
          if (frame) ctx.group.add(createEmptyGridCell(frame, ctx.group.width, ctx.group.height))
        }
      }
    })
    ctx.view.selectObjects([ctx.group])
    ctx.view.canvas.requestRenderAll()
    this.engine.commit(ctx.pageId, { label: t.history.changeImageGridLayout })
  }

  async setGap(value: number): Promise<void> {
    if (this.engine.readOnly) return
    const ctx = this.selected()
    if (!ctx) return
    const gap = clampImageGridGap(value)
    if (gap === ctx.spec.gap) return
    asDory(ctx.group).imageGrid = { ...ctx.spec, gap }
    keepGridPosition(ctx.group, () => undefined)
    ctx.view.canvas.requestRenderAll()
    this.engine.commit(ctx.pageId, { label: t.history.changeImageGridGap, coalesceKey: `image-grid-gap:${asDory(ctx.group).id ?? ''}` })
  }

  async replaceCell(gridCellId: string): Promise<void> {
    if (this.engine.readOnly) return
    const ctx = this.selected()
    if (ctx) await this.fillCell(ctx.pageId, asDory(ctx.group).id ?? '', gridCellId)
  }

  async fillCell(pageId: string, gridId: string, gridCellId: string): Promise<void> {
    if (this.engine.readOnly) return
    const files = await pickFiles('image/png,image/jpeg,image/webp,image/gif,image/avif', false)
    const file = files[0]
    if (!file) return
    try {
      const ref = await this.engine.assets.upload(file, file.name)
      if (this.engine.readOnly) return
      this.engine.store.setState((state) => ({ uploads: [ref, ...state.uploads.filter((item) => item.id !== ref.id)] }))
      await this.fillCellWith(pageId, gridId, gridCellId, ref)
    } catch (error) {
      this.engine.toast(error instanceof UploadError ? error.message : t.errors.upload, 'error')
    }
  }

  async fillCellWith(pageId: string, gridId: string, gridCellId: string, ref: AssetRef): Promise<void> {
    if (this.engine.readOnly || !this.byId(pageId, gridId)) return
    try {
      const url = await this.engine.assets.resolve(ref.url)
      const image = await createImage({ src: ref.url, url, assetId: ref.id }, new Point(0, 0), { width: 1, height: 1 })
      // Looked up after the wait: another fill or a co-editor may have changed the cell meanwhile.
      const ctx = this.byId(pageId, gridId)
      const old = ctx ? gridCellObject(ctx.group, gridCellId) : null
      if (this.engine.readOnly || !ctx || !old) {
        image.dispose()
        return
      }
      const oldData = asDory(old)
      const imageData = asDory(image)
      imageData.id = oldData.id
      imageData.gridCellId = gridCellId
      imageData.name = ref.name
      const wasEmpty = isEmptyGridCell(old)
      keepGridPosition(ctx.group, () => {
        const index = ctx.group.getObjects().indexOf(old)
        ctx.group.remove(old)
        ctx.group.insertAt(Math.max(0, index), image)
      })
      old.dispose()
      ctx.view.selectObjects([ctx.group])
      ctx.view.canvas.requestRenderAll()
      this.engine.commit(pageId, { label: t.history.fillImageGridCell })
      const position = cellPosition(ctx.spec, gridCellId)
      this.engine.announce(wasEmpty ? t.imageGrid.filled(position) : t.imageGrid.replaced(position))
    } catch {
      this.engine.toast(t.errors.imageLoad, 'error')
    }
  }

  async clearCell(gridCellId: string): Promise<void> {
    if (this.engine.readOnly) return
    const ctx = this.selected()
    const old = ctx ? gridCellObject(ctx.group, gridCellId) : null
    if (!ctx || !old || isEmptyGridCell(old)) return
    const frames = gridCellFrames(ctx.spec, ctx.group.width, ctx.group.height)
    const frame = gridCellFrame(frames, gridCellId)
    if (!frame) return
    const empty = createEmptyGridCell(frame, ctx.group.width, ctx.group.height, asDory(old).id)
    keepGridPosition(ctx.group, () => {
      const index = ctx.group.getObjects().indexOf(old)
      ctx.group.remove(old)
      ctx.group.insertAt(Math.max(0, index), empty)
    })
    old.dispose()
    ctx.view.selectObjects([ctx.group])
    ctx.view.canvas.requestRenderAll()
    this.engine.commit(ctx.pageId, { label: t.history.clearImageGridCell })
    this.engine.announce(t.imageGrid.cleared(cellPosition(ctx.spec, gridCellId)))
  }

  async moveCell(gridCellId: string, direction: -1 | 1): Promise<void> {
    if (this.engine.readOnly) return
    const ctx = this.selected()
    if (!ctx) return
    const index = ctx.spec.cells.findIndex((cell) => cell.gridCellId === gridCellId)
    const target = ctx.spec.cells[index + direction]
    if (index < 0 || !target) return
    this.swapCells(ctx.pageId, asDory(ctx.group).id ?? '', gridCellId, target.gridCellId)
  }

  swapCells(pageId: string, gridId: string, fromCellId: string, toCellId: string): void {
    if (this.engine.readOnly) return
    if (fromCellId === toCellId) return
    const ctx = this.byId(pageId, gridId)
    const from = ctx ? gridCellObject(ctx.group, fromCellId) : null
    const to = ctx ? gridCellObject(ctx.group, toCellId) : null
    if (!ctx || !from || !to) return
    asDory(from).gridCellId = toCellId
    asDory(to).gridCellId = fromCellId
    keepGridPosition(ctx.group, () => undefined)
    ctx.view.selectObjects([ctx.group])
    ctx.view.canvas.requestRenderAll()
    this.engine.commit(pageId, { label: t.history.reorderImageGrid })
    this.engine.announce(t.imageGrid.reordered(cellPosition(ctx.spec, fromCellId), cellPosition(ctx.spec, toCellId)))
  }

  /** Moves a top-level canvas image into a cell and returns any displaced photo to the source frame. */
  consumeCanvasImage(pageId: string, sourceId: string, gridId: string, gridCellId: string, sourceFrame: CanvasImageFrame): void {
    if (this.engine.readOnly) return
    const ctx = this.byId(pageId, gridId)
    const source = ctx?.view.getById(sourceId)
    const target = ctx ? gridCellObject(ctx.group, gridCellId) : null
    if (!ctx || !(source instanceof FabricImage) || !target || source === target) return
    const sourceData = asDory(source)
    if (
      kindOfLive(source) !== 'image' ||
      sourceData.gridCellId ||
      sourceData.slot ||
      sourceData.maskShape ||
      sourceData.maskRadius !== undefined ||
      source.clipPath
    )
      return
    const canvas = ctx.view.canvas
    if (!canvas.getObjects().includes(source) || source.group) return
    if (sourceData.animation !== undefined) {
      restoreCanvasImageFrame(source, sourceFrame)
      canvas.requestRenderAll()
      this.engine.refreshSelection()
      this.engine.toast(t.imageGrid.animatedImageDisabled)
      return
    }
    const sourceIndex = canvas.getObjects().indexOf(source)
    const targetIndex = ctx.group.getObjects().indexOf(target)
    const gridData = sourceData
    delete gridData.slot
    delete gridData.maskShape
    delete gridData.maskRadius
    source.clipPath = undefined
    gridData.gridCellId = gridCellId

    keepGridPosition(ctx.group, () => {
      ctx.group.remove(target)
      canvas.remove(source)
      ctx.group.insertAt(Math.max(0, targetIndex), source)
    })

    if (target instanceof FabricImage) {
      const data = asDory(target)
      delete data.gridCellId
      const frame = { gridCellId: '', left: 0, top: 0, width: sourceFrame.width, height: sourceFrame.height }
      fitImageGridCell(target, frame, sourceFrame.width, sourceFrame.height)
      target.set({
        left: sourceFrame.center.x,
        top: sourceFrame.center.y,
        angle: sourceFrame.angle,
        flipX: sourceFrame.flipX,
        flipY: sourceFrame.flipY,
        selectable: true,
        evented: true,
      })
      ctx.view.configure(target)
      canvas.insertAt(Math.max(0, sourceIndex), target)
      target.setCoords()
    } else {
      target.dispose()
    }

    ctx.view.selectObjects([ctx.group])
    canvas.requestRenderAll()
    this.engine.commit(pageId, { label: t.history.fillImageGridCell })
    this.engine.announce(t.imageGrid.filled(cellPosition(ctx.spec, gridCellId)))
  }
}
