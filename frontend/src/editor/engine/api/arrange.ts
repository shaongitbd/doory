/**
 * Selection & arrangement: delete, duplicate, group, z-order, align/distribute, flip, rotate, lock,
 * visibility, naming, nudging and numeric position/size. Every method operates on the current selection
 * (or an explicit id) of the active page and ends in one history step.
 */
import { ActiveSelection, FabricImage, type FabricObject, Group, IText, Point } from 'fabric'
import { type Delta, type AlignEdge, type DistributeAxis, alignItems, distributeItems, selectionBounds, tidyItems } from '../align'
import type { EditorEngine } from '../editor'
import { type Rect, normalizeAngle } from '../geometry'
import { asDory, ensureId, isLocked } from '../objects/dory'
import { bakeInPlace } from '../objects/bake'
import { applyMask } from '../objects/masks'
import { kindOfLive } from '../objects/kinds'
import { imageGridSpecOf, isImageGrid, normalizeImageGridTransform } from '../objects/imageGrid'
import { anchorFrames, carriedPictures, clampSlotImage, coverSlotTransform, followFrames, hasSlot, mirrorSlot, shiftSlot } from '../objects/slot'
import { getExtraProps } from '../serialization'
import { coverFrame } from './insert'
import { isFiniteNumber } from '../numbers'
import { type ZMode, moveId, reorderIds } from '../zorder'
import { objectRect } from '../pageCanvas'
import { newId } from '@/lib/document'
import { t } from '../../strings'

export type AlignTarget = 'page' | 'selection'

/**
 * Kinds Fit to page never applies to: text (stretching it would only blow up the font), QR codes (cropping one
 * would break it) and lines (a line has no height to fill).
 */
const NO_FIT_KINDS: ReadonlySet<string> = new Set(['text', 'qr', 'line'])

/** False for the object kinds Fit to page leaves alone. */
export function canFitKind(kind: string): boolean {
  return !NO_FIT_KINDS.has(kind)
}

/** Distance a duplicate or paste lands from its source, in page px. */
export const DUPLICATE_OFFSET = 20

/**
 * Re-assigns ids to an object and every object nested in it (noting each old id's new one in `renamed`, when given).
 * A copy also loses its template field tag: the same key twice on one page would clash, and the user tags the copy
 * when it is meant to be a field too.
 */
export function reidTree(obj: FabricObject, renamed?: Map<string, string>): void {
  const before = asDory(obj).id
  const id = newId()
  asDory(obj).id = id
  if (before && renamed) renamed.set(before, id)
  asDory(obj).field = undefined
  if (obj instanceof Group) for (const child of obj.getObjects()) reidTree(child, renamed)
}

export function findLive(objects: readonly FabricObject[], id: string): FabricObject | undefined {
  for (const o of objects) {
    if (asDory(o).id === id) return o
    if (o instanceof Group) {
      const hit = findLive(o.getObjects(), id)
      if (hit) return hit
    }
  }
  return undefined
}

/** True when an object is, or contains, a semantic image grid. */
function containsImageGrid(obj: FabricObject): boolean {
  if (isImageGrid(obj)) return true
  return obj instanceof Group && obj.getObjects().some((child) => containsImageGrid(child))
}

export class ArrangeApi {
  constructor(private readonly engine: EditorEngine) {}

  private get view() {
    return this.engine.activeView()
  }

  /** Runs `fn` with the selection "flattened" (members in page coordinates), then restores it. */
  private withFlat(fn: (objs: FabricObject[]) => void): FabricObject[] {
    const view = this.view
    if (!view) return []
    const objs = view.selectedObjects()
    if (objs.length === 0) return []
    view.quietly(() => {
      view.canvas.discardActiveObject()
      fn(objs)
      for (const o of objs) o.setCoords()
      view.selectObjects(objs)
    })
    return objs
  }

  /**
   * Runs a transform of a whole group or multi-selection and takes the frames of the placeholder pictures inside it
   * along: a layout moves as one, only a picture moved on its own is panned inside its frame.
   */
  private carrying(target: FabricObject, transform: () => void): void {
    const anchors = anchorFrames(carriedPictures(target))
    transform()
    followFrames(anchors)
  }

  private done(label: string, coalesceKey?: string): void {
    this.engine.commitActive({ label, coalesceKey })
  }

  /* ----------------------------------------------------------------- delete */

  delete(): void {
    const view = this.view
    if (!view) return
    const objs = view.selectedObjects().filter((o) => !isLocked(o))
    if (objs.length === 0) return
    // A clip's blurred background goes with it: it is locked in place and means nothing without its clip.
    const gone = new Set(objs.map((o) => asDory(o).id))
    const backdrops = view.canvas.getObjects().filter((o) => {
      const of = (o as unknown as Record<string, unknown>).videoBackdropOf
      return typeof of === 'string' && gone.has(of) && !objs.includes(o)
    })
    view.canvas.discardActiveObject()
    view.canvas.remove(...objs, ...backdrops)
    view.canvas.requestRenderAll()
    this.done(objs.length === 1 ? t.history.deleteLayer : t.history.deleteLayers)
    this.engine.announce(t.announce.deleted(objs.length))
  }

  async duplicate(): Promise<void> {
    const view = this.view
    if (!view) return
    // A locked object is never duplicated (the copy would otherwise be an unlocked, movable twin).
    const objs = view.selectedObjects().filter((o) => !isLocked(o))
    if (objs.length === 0) return
    const offset = DUPLICATE_OFFSET
    // Leave the multi-selection before cloning: inside it, objects are placed relative to its centre, and copies
    // taken there would land around the page's top-left corner (#39). Copying does the same.
    view.canvas.discardActiveObject()
    // Not `field`: Fabric would revive the tag (it has a `type`) as an object, and copies drop it anyway.
    const props = [...getExtraProps().filter((p) => p !== 'field'), 'userFontSize', 'fitBoxHeight']
    const clones = await Promise.all(objs.map((o) => o.clone(props)))
    for (const c of clones) {
      reidTree(c)
      c.set({ left: c.left + offset, top: c.top + offset })
      shiftSlot(c, offset, offset)
      view.configure(c)
      view.canvas.add(c)
    }
    view.selectObjects(clones)
    this.done(clones.length === 1 ? t.history.duplicateLayer : t.history.duplicateLayers)
    this.engine.announce(t.announce.duplicated(clones.length))
  }

  /* ------------------------------------------------------------------ group */

  group(): void {
    const view = this.view
    if (!view) return
    const objs = view.selectedObjects()
    // Grid cells are addressed through their top-level grid. A generic wrapper would make those operations unreachable,
    // including when an imported legacy group already contains a grid.
    if (objs.length < 2 || objs.some((obj) => containsImageGrid(obj))) return
    const canvas = view.canvas
    const order = canvas.getObjects()
    const sorted = [...objs].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    const topIndex = Math.min(...sorted.map((o) => order.indexOf(o)))
    canvas.discardActiveObject()
    canvas.remove(...sorted)
    const group = new Group(sorted)
    ensureId(group)
    view.configure(group)
    canvas.insertAt(Math.min(topIndex, canvas.getObjects().length), group)
    canvas.setActiveObject(group)
    canvas.requestRenderAll()
    this.done(t.history.group)
    this.engine.announce(t.announce.grouped)
  }

  ungroup(): void {
    const view = this.view
    if (!view) return
    const target = view.canvas.getActiveObject()
    if (!(target instanceof Group) || target instanceof ActiveSelection) return
    if (imageGridSpecOf(target)) return
    const canvas = view.canvas
    const index = canvas.getObjects().indexOf(target)
    canvas.discardActiveObject()
    const children = target.removeAll()
    canvas.remove(target)
    children.forEach((child, i) => {
      view.configure(child)
      child.setCoords()
      canvas.insertAt(index + i, child)
    })
    view.selectObjects(children)
    this.done(t.history.ungroup)
    this.engine.announce(t.announce.ungrouped)
  }

  /* ---------------------------------------------------------------- z-order */

  zOrder(mode: ZMode): void {
    const view = this.view
    if (!view) return
    const objs = view.selectedObjects()
    if (objs.length === 0) return
    const canvas = view.canvas
    const ids = new Set(objs.map((o) => asDory(o).id ?? ''))
    const current = canvas.getObjects().map((o) => asDory(o).id ?? '')
    const next = reorderIds(current, ids, mode)
    if (next.every((id, i) => id === current[i])) return
    this.applyOrder(next)
    const label = mode === 'forward' ? t.history.bringForward : mode === 'backward' ? t.history.sendBackward : mode === 'front' ? t.history.bringToFront : t.history.sendToBack
    this.done(label)
  }

  private applyOrder(order: readonly string[]): void {
    const view = this.view
    if (!view) return
    const canvas = view.canvas
    const byId = new Map(canvas.getObjects().map((o) => [asDory(o).id ?? '', o]))
    // Moving a member of an ActiveSelection would leave the selection bounds stale; flatten first.
    const active = canvas.getActiveObjects()
    canvas.discardActiveObject()
    order.forEach((id, index) => {
      const o = byId.get(id)
      if (o) canvas.moveObjectTo(o, index)
    })
    if (active.length > 0) view.selectObjects(active)
    canvas.requestRenderAll()
  }

  /** Layers panel drag & drop: place `id` so it ends up at stack position `toIndex` (0 = bottom). */
  reorderTo(id: string, toIndex: number): void {
    const view = this.view
    if (!view) return
    const current = view.canvas.getObjects().map((o) => asDory(o).id ?? '')
    const next = moveId(current, id, toIndex)
    if (next.every((v, i) => v === current[i])) return
    this.applyOrder(next)
    this.done(t.history.reorderLayers)
  }

  /* ------------------------------------------------------------ align etc. */

  private rectOf(o: FabricObject): Rect {
    return objectRect(o)
  }

  /** Moves each object by its delta. `rigid` means the objects move as one layout, so a picture takes its frame along. */
  private applyDeltas(objs: FabricObject[], deltas: Map<string, Delta>, rigid = false): boolean {
    let moved = false
    for (const o of objs) {
      if (isLocked(o)) continue
      const d = deltas.get(asDory(o).id ?? '')
      if (!d || (d.dx === 0 && d.dy === 0)) continue
      o.set({ left: o.left + d.dx, top: o.top + d.dy })
      if (rigid && hasSlot(o)) shiftSlot(o, d.dx, d.dy)
      else clampSlotImage(o)
      moved = true
    }
    return moved
  }

  align(edge: AlignEdge, target: AlignTarget = 'page'): void {
    const view = this.view
    if (!view) return
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    let changed = false
    this.withFlat((objs) => {
      const items = objs.map((o) => ({ id: asDory(o).id ?? '', rect: this.rectOf(o) }))
      const pageRect: Rect = { left: 0, top: 0, width: page.width, height: page.height }
      if (target === 'page' && objs.length > 1) {
        // Aligning a multi-selection to the page moves it as one object: the union box
        // goes to the page edge or centre and every member shifts by the same amount, so the layout is kept.
        const movable = objs.filter((o) => !isLocked(o)).map((o) => ({ id: asDory(o).id ?? '', rect: this.rectOf(o) }))
        if (movable.length === 0) return
        const shift = alignItems([{ id: 'selection', rect: selectionBounds(movable) }], edge, pageRect).get('selection') ?? { dx: 0, dy: 0 }
        changed = this.applyDeltas(objs, new Map(movable.map((i) => [i.id, shift])), true)
        return
      }
      const bounds: Rect = target === 'page' || objs.length === 1 ? pageRect : selectionBounds(items)
      changed = this.applyDeltas(objs, alignItems(items, edge, bounds))
    })
    if (changed) this.done(t.history.align)
  }

  distribute(axis: DistributeAxis): void {
    let changed = false
    this.withFlat((objs) => {
      const items = objs.map((o) => ({ id: asDory(o).id ?? '', rect: this.rectOf(o) }))
      changed = this.applyDeltas(objs, distributeItems(items, axis))
    })
    if (changed) this.done(t.history.distribute)
  }

  tidy(): void {
    let changed = false
    this.withFlat((objs) => {
      const items = objs.map((o) => ({ id: asDory(o).id ?? '', rect: this.rectOf(o) }))
      changed = this.applyDeltas(objs, tidyItems(items, 8))
    })
    if (changed) this.done(t.history.tidyUp)
  }

  /* ------------------------------------------------------- flip / rotate */

  flip(axis: 'horizontal' | 'vertical'): void {
    const view = this.view
    if (!view) return
    const active = view.canvas.getActiveObject()
    if (!active) return
    if (active instanceof ActiveSelection) {
      const bounds = active.getBoundingRect()
      this.withFlat((objs) => {
        for (const o of objs) {
          if (isLocked(o)) continue
          const r = objectRect(o)
          if (axis === 'horizontal') {
            const newLeft = bounds.left + bounds.width - (r.left - bounds.left) - r.width
            o.set({ left: o.left + (newLeft - r.left), flipX: !o.flipX })
            if (hasSlot(o)) mirrorSlot(o, axis, bounds.left + bounds.width / 2)
          } else {
            const newTop = bounds.top + bounds.height - (r.top - bounds.top) - r.height
            o.set({ top: o.top + (newTop - r.top), flipY: !o.flipY })
            if (hasSlot(o)) mirrorSlot(o, axis, bounds.top + bounds.height / 2)
          }
        }
      })
    } else if (!isLocked(active)) {
      this.carrying(active, () => {
        if (axis === 'horizontal') active.set('flipX', !active.flipX)
        else active.set('flipY', !active.flipY)
      })
      active.setCoords()
    }
    view.canvas.requestRenderAll()
    this.done(axis === 'horizontal' ? t.history.flipHorizontal : t.history.flipVertical)
  }

  /** Rotates the selection by `delta` degrees about its centre. */
  rotateBy(delta: number): void {
    const view = this.view
    const active = view?.canvas.getActiveObject()
    if (!view || !active || isLocked(active) || !isFiniteNumber(delta)) return
    this.rotateObjectTo(active, normalizeAngle(Math.round(active.angle) + delta))
    view.canvas.requestRenderAll()
    this.done(t.history.rotate)
  }

  setAngle(angle: number): void {
    const view = this.view
    const active = view?.canvas.getActiveObject()
    if (!view || !active || isLocked(active) || !isFiniteNumber(angle)) return
    this.rotateObjectTo(active, normalizeAngle(angle))
    view.canvas.requestRenderAll()
    this.done(t.history.rotate, 'rotate')
  }

  private rotateObjectTo(obj: FabricObject, angle: number): void {
    const center = obj.getCenterPoint()
    this.carrying(obj, () => {
      obj.rotate(angle)
      obj.setPositionByOrigin(center, 'center', 'center')
    })
    // A photo turned inside its placeholder frame is zoomed in as needed so no corner of the frame is left empty.
    clampSlotImage(obj)
    obj.setCoords()
  }

  /* ---------------------------------------------------------- lock / hide */

  toggleLock(): void {
    const view = this.view
    if (!view) return
    const objs = view.selectedObjects()
    if (objs.length === 0) return
    const next = !objs.every((o) => isLocked(o))
    this.withFlat((flat) => {
      for (const o of flat) {
        asDory(o).locked = next
        o.set({
          lockMovementX: next,
          lockMovementY: next,
          lockScalingX: next,
          lockScalingY: next,
          lockRotation: next,
          hasControls: !next,
        })
      }
    })
    this.done(next ? t.history.lock : t.history.unlock)
    this.engine.announce(next ? t.announce.locked : t.announce.unlocked)
  }

  /** Layers panel: lock/unlock one layer by id (nested layers included). */
  setLocked(id: string, locked: boolean): void {
    const view = this.view
    const obj = view ? findLive(view.canvas.getObjects(), id) : undefined
    if (!view || !obj) return
    asDory(obj).locked = locked
    obj.set({ lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked })
    if (locked && view.canvas.getActiveObjects().includes(obj)) view.canvas.discardActiveObject()
    view.canvas.requestRenderAll()
    this.done(locked ? t.history.lock : t.history.unlock)
  }

  setVisible(id: string, visible: boolean): void {
    const view = this.view
    const obj = view ? findLive(view.canvas.getObjects(), id) : undefined
    if (!view || !obj) return
    obj.set('visible', visible)
    if (!visible && view.canvas.getActiveObjects().includes(obj)) view.canvas.discardActiveObject()
    view.canvas.requestRenderAll()
    this.done(visible ? t.history.showLayer : t.history.hideLayer)
  }

  rename(id: string, name: string): void {
    const view = this.view
    const obj = view ? findLive(view.canvas.getObjects(), id) : undefined
    if (!view || !obj) return
    const trimmed = name.trim()
    asDory(obj).name = trimmed || undefined
    this.done(t.history.renameLayer, `rename:${id}`)
  }

  /* -------------------------------------------------------- move / resize */

  nudge(dx: number, dy: number): void {
    const view = this.view
    if (!view || !isFiniteNumber(dx) || !isFiniteNumber(dy)) return
    const active = view.canvas.getActiveObject()
    if (!active || isLocked(active)) return
    if (active instanceof ActiveSelection && active.getObjects().some((o) => isLocked(o))) return
    this.carrying(active, () => active.set({ left: active.left + dx, top: active.top + dy }))
    clampSlotImage(active)
    active.setCoords()
    view.canvas.requestRenderAll()
    this.done(t.history.move, 'nudge')
    this.engine.refreshSelection()
  }

  /** Sets the bounding position (top-left, page px) of the selection. */
  setPosition(x?: number, y?: number): void {
    const view = this.view
    const active = view?.canvas.getActiveObject()
    if (!view || !active || isLocked(active)) return
    if ((x !== undefined && !isFiniteNumber(x)) || (y !== undefined && !isFiniteNumber(y))) return
    const r = active.getBoundingRect()
    this.carrying(active, () => active.set({ left: active.left + (x === undefined ? 0 : x - r.left), top: active.top + (y === undefined ? 0 : y - r.top) }))
    clampSlotImage(active)
    active.setCoords()
    view.canvas.requestRenderAll()
    this.done(t.history.move, 'position')
  }

  /**
   * True when Fit to page can act on the selection: one unlocked object of a kind it suits, on the page itself. A
   * member of an entered group is left out: its size and position are in the group's terms, not the page's.
   */
  canFitToPage(): boolean {
    const active = this.view?.canvas.getActiveObject()
    return !!active && this.fitsPage(active)
  }

  private fitsPage(obj: FabricObject): boolean {
    return !isLocked(obj) && !(obj instanceof ActiveSelection) && !(obj instanceof IText) && !obj.group && canFitKind(kindOfLive(obj))
  }

  /**
   * Makes the selected object, unrotated, cover the whole page: a picture is scaled and cropped, a picture in a
   * placeholder frame gets a page-sized frame, a group or an element is scaled evenly until it covers the page (what
   * spills over is cut off by the page edge, like a picture's crop) and a shape is stretched. Text, QR codes and
   * lines are left alone (see `canFitKind`).
   */
  fitToPage(): void {
    const view = this.view
    const active = view?.canvas.getActiveObject()
    if (!view || !active || !this.fitsPage(active)) return
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    const centre = new Point(page.width / 2, page.height / 2)
    const border = active.strokeUniform ? active.strokeWidth || 0 : 0
    // The object's own size and the size it gets, both without a uniform border (which keeps its width when scaled).
    const w0 = Math.max(1, (active.getScaledWidth() || 1) - border)
    const h0 = Math.max(1, (active.getScaledHeight() || 1) - border)
    const pageW = Math.max(1, page.width - border)
    const pageH = Math.max(1, page.height - border)
    this.carrying(active, () => {
      active.rotate(0)
      const slot = asDory(active).slot
      if (slot) {
        // The frame is what shows of a placeholder picture: the frame takes the page and the picture covers it, centred.
        const frame = { ...slot, cx: centre.x, cy: centre.y, width: page.width, height: page.height, angle: 0 }
        asDory(active).slot = frame
        const k = coverSlotTransform(frame, active.width, active.height).scale
        active.set({ scaleX: active.scaleX < 0 ? -k : k, scaleY: active.scaleY < 0 ? -k : k })
        applyMask(active)
      } else if (active instanceof FabricImage) {
        coverFrame(active, page.width, page.height)
        applyMask(active)
      } else if (active instanceof Group || kindOfLive(active) === 'element') {
        // Stretching would distort the parts of a group or a drawing, so it is scaled by one factor, like a picture.
        const k = Math.max(pageW / w0, pageH / h0)
        active.set({ scaleX: active.scaleX * k, scaleY: active.scaleY * k })
        if (active instanceof Group && isImageGrid(active)) normalizeImageGridTransform(active)
      } else {
        active.set({ scaleX: (active.scaleX * pageW) / w0, scaleY: (active.scaleY * pageH) / h0 })
        // A baked shape has a new width and height, so its frame (a placeholder's crop shape) is rebuilt to match.
        if (bakeInPlace(active) && asDory(active).maskShape) applyMask(active)
      }
      active.setPositionByOrigin(centre, 'center', 'center')
    })
    clampSlotImage(active)
    active.setCoords()
    view.canvas.requestRenderAll()
    this.done(t.history.fitToPage)
  }

  /** Sets the (unrotated) size, keeping the centre fixed. Optionally keeps the aspect ratio. */
  setSize(width?: number, height?: number, lockAspect = false): void {
    const view = this.view
    const active = view?.canvas.getActiveObject()
    if (!view || !active || isLocked(active)) return
    if ((width !== undefined && !isFiniteNumber(width)) || (height !== undefined && !isFiniteNumber(height))) return
    // The size is the object's own width and height; a uniform border (which keeps its width when scaled) is not part of it.
    const border = active.strokeUniform && !(active instanceof ActiveSelection) ? active.strokeWidth || 0 : 0
    const w0 = Math.max(1, (active.getScaledWidth() || 1) - border)
    const h0 = Math.max(1, (active.getScaledHeight() || 1) - border)
    let sxk = width === undefined ? 1 : Math.max(1, width) / w0
    let syk = height === undefined ? 1 : Math.max(1, height) / h0
    if (lockAspect) {
      if (width !== undefined) syk = sxk
      else if (height !== undefined) sxk = syk
    }
    const center = active.getCenterPoint()
    this.carrying(active, () => {
      active.set({ scaleX: active.scaleX * sxk, scaleY: active.scaleY * syk })
      if (active instanceof Group && isImageGrid(active)) normalizeImageGridTransform(active)
      else if (!(active instanceof ActiveSelection)) bakeInPlace(active)
      active.setPositionByOrigin(new Point(center.x, center.y), 'center', 'center')
    })
    clampSlotImage(active)
    active.setCoords()
    view.canvas.requestRenderAll()
    // A stretched selection is flattened; its pictures are made to cover their (stretched) frames again.
    if (active instanceof ActiveSelection) {
      this.withFlat((objs) => {
        for (const obj of objs) {
          if (isImageGrid(obj)) normalizeImageGridTransform(obj)
          clampSlotImage(obj)
        }
      })
    }
    this.done(t.history.resize, 'size')
  }

  /** Layers panel: select a (possibly nested) layer by id. */
  selectLayer(id: string, additive = false): void {
    const view = this.view
    if (!view) return
    const top = view.canvas.getObjects().find((o) => asDory(o).id === id)
    if (top) {
      if (additive) {
        const current = view.selectedObjects()
        if (current.includes(top)) view.selectObjects(current.filter((o) => o !== top))
        else view.selectObjects([...current, top])
      } else {
        view.selectObjects([top])
      }
      this.engine.refreshSelection()
      return
    }
    const nested = findLive(view.canvas.getObjects(), id)
    if (!nested) return
    const parent = nested.group
    if (parent instanceof Group) {
      view.enterGroup(parent)
      view.canvas.setActiveObject(nested)
      view.canvas.requestRenderAll()
      this.engine.refreshSelection()
    }
  }
}
