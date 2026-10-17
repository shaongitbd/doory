/**
 * One Fabric canvas for one page.
 *
 * The canvas element covers only a *window* of the artboard (see `computeCanvasWindow`): the visible
 * region plus a bleed margin, so memory stays bounded at 800 % zoom and selection handles that hang
 * outside the page remain visible. A separate overlay canvas draws editing aids (smart guides, grid,
 * hover outline, placeholder hints) so nothing editor-only is ever part of the document or an export.
 */
import {
  ActiveSelection,
  Canvas,
  type FabricObject,
  Group,
  IText,
  type CanvasEvents,
  type TMat2D,
  type TPointerEvent,
  type TPointerEventInfo,
} from 'fabric'
import type { SafeZone } from '@/lib/sizePresets'
import type { DocObject, DocPage, PageGuide } from '@/types/document'
import type { PageSize } from './docOps'
import { DragLayerCache } from './dragCache'
import { type Rect, rectsIntersect } from './geometry'
import { type CanvasWindow } from './layout'
import { buildBackground, installBackground } from './objects/background'
import { bakeInPlace, isScaled } from './objects/bake'
import { refitCurve } from './objects/curvedText'
import { customizeControls } from './objects/controls'
import { anchorFrames, carriedPictures, clampSlotImage, followFrames, type FrameAnchor, slotOf, strokeSlotOutline } from './objects/slot'
import { applyLock, asDory, ensureId } from './objects/dory'
import { reapplyCase, syncDirection } from './objects/textStyle'
import { type CanvasTheme, applyThemeToCanvas, selectionStyle } from './objects/theme'
import { type Deferred, mergeObject, planPage } from './remoteSync'
import { type LoadContext, deserializeObjects, serializePage } from './serialization'
import { type ResizeDrag, type SnapGuide, type SpacingHint, computeResizeSnap, computeSnap } from './snapping'
import { continueList, renumber } from './text/lists'
import { t as strings } from '../strings'

export type ToolId = 'select' | 'hand' | 'text'

export interface CommitInfo {
  label: string
  coalesceKey?: string
}

/** What a PageCanvas needs from its owner (the editor engine). */
export interface PageCanvasHost {
  readonly theme: CanvasTheme
  readonly tool: ToolId
  readonly readOnly: boolean
  readonly loadContext: LoadContext
  /** Loads extra unicode subsets while the user types (Cyrillic, Greek, …). */
  ensureText(family: string, weight: string | number, style: string, text: string): void
  readonly snapEnabled: boolean
  readonly showGuides: boolean
  readonly showGrid: boolean
  readonly showBleed: boolean
  readonly showRulerGuides: boolean
  readonly bleedPx: number
  readonly showSafeZone: boolean
  /** The safe zone of a page of this size, from the design's size preset; null for none. */
  safeZoneFor(width: number, height: number): SafeZone | null
  readonly gridSize: number
  onCommit(pageId: string, info: CommitInfo): void
  onSelectionChange(pageId: string): void
  onSelectionLive(pageId: string): void
  onPointerActivate(pageId: string): void
  onTextCreate(pageId: string, rect: { x: number; y: number; width: number }): void
  onContextMenu(pageId: string, clientX: number, clientY: number): void
  onEditingChange(pageId: string, editing: boolean): void
  onPlaceholderActivate(pageId: string, id: string): void
  onToolDone(): void
  /** The user tried to edit the text of an object somebody else is editing. */
  onEditBlocked(pageId: string, id: string): void
}

export interface OverlayState {
  guides: SnapGuide[]
  spacing: SpacingHint[]
  /** Object under the pointer (outlined while it is not selected). */
  hover: FabricObject | null
  rulerGuides: PageGuide[]
}

const EMPTY_OVERLAY: OverlayState = { guides: [], spacing: [], hover: null, rulerGuides: [] }

const NUDGE_CLICK_SLOP = 6
/** Breathing room between a text and its selection border, so the last glyph never pokes out of it. */
const TEXT_PADDING = 6

export function objectRect(o: FabricObject): Rect {
  const r = o.getBoundingRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export class PageCanvas {
  readonly canvas: Canvas
  readonly pageId: string
  loadedPage: DocPage
  private size: PageSize
  private window: CanvasWindow = { x: 0, y: 0, width: 1, height: 1 }
  private zoom = 1
  private readonly overlayEl: HTMLCanvasElement
  private overlay: OverlayState = { ...EMPTY_OVERLAY }
  private snapRects: Rect[] | null = null
  /** Frames of the filled placeholders inside the group or selection being transformed (see `followFrames`). */
  private frames: FrameAnchor[] = []
  private queue: Promise<void> = Promise.resolve()
  private suppress = 0
  private textDrag: { x: number; y: number } | null = null
  private disposed = false
  /** Emptied texts that are about to be removed (see `text:editing:exited`). */
  private readonly removing = new WeakSet<FabricObject>()
  private readonly dragCache: DragLayerCache
  private cleanups: (() => void)[] = []
  /** Objects being dragged, scaled or rotated right now. */
  private gesture = new Set<string>()
  /** Changes from elsewhere to objects the user is busy with, merged into the user's version at their next commit. */
  private readonly deferred = new Map<string, Deferred>()
  /** Syncs of changes from elsewhere that have not finished; a local commit waits for them (see `settled`). */
  private pendingRemote = 0
  /** Objects whose text somebody else is editing right now. */
  private editLocks: ReadonlySet<string> = new Set()

  constructor(
    private readonly host: PageCanvasHost,
    page: DocPage,
    size: PageSize,
    container: HTMLElement,
  ) {
    this.pageId = page.id
    this.loadedPage = { ...page, objects: [] }
    this.size = size
    const el = document.createElement('canvas')
    el.setAttribute('aria-hidden', 'true')
    container.appendChild(el)
    this.canvas = new Canvas(el, {
      width: 1,
      height: 1,
      preserveObjectStacking: true,
      selection: !host.readOnly,
      renderOnAddRemove: false,
      stopContextMenu: true,
      fireRightClick: true,
      allowTouchScrolling: true,
      uniformScaling: true,
      selectionKey: 'shiftKey',
      containerClass: 'doory-canvas',
    })
    this.dragCache = new DragLayerCache(this.canvas)
    const wrapper = this.canvas.wrapperEl
    wrapper.style.position = 'absolute'
    wrapper.style.left = '0px'
    wrapper.style.top = '0px'
    this.overlayEl = document.createElement('canvas')
    this.overlayEl.setAttribute('aria-hidden', 'true')
    Object.assign(this.overlayEl.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' })
    wrapper.appendChild(this.overlayEl)
    applyThemeToCanvas(this.canvas, host.theme)
    this.bind()
  }

  /* ------------------------------------------------------------------ layout */

  setLayout(zoom: number, win: CanvasWindow): void {
    this.zoom = zoom
    this.window = win
    const c = this.canvas
    this.dragCache.end()
    const wrapper = c.wrapperEl
    wrapper.style.left = `${win.x}px`
    wrapper.style.top = `${win.y}px`
    c.setDimensions({ width: win.width, height: win.height })
    const vpt: TMat2D = [zoom, 0, 0, zoom, -win.x, -win.y]
    c.setViewportTransform(vpt)
    const dpr = c.getRetinaScaling()
    this.overlayEl.width = Math.round(win.width * dpr)
    this.overlayEl.height = Math.round(win.height * dpr)
    this.overlayEl.style.width = `${win.width}px`
    this.overlayEl.style.height = `${win.height}px`
    c.requestRenderAll()
    this.drawOverlay()
  }

  get currentWindow(): CanvasWindow {
    return this.window
  }

  get pageSize(): PageSize {
    return this.size
  }

  /** Marks the canvas for repaint of editor-only decorations (guides, grid). */
  invalidateOverlay(): void {
    this.drawOverlay()
  }

  setTheme(theme: CanvasTheme): void {
    applyThemeToCanvas(this.canvas, theme)
    this.drawOverlay()
  }

  setReadOnly(readOnly: boolean): void {
    this.canvas.selection = !readOnly
    for (const o of this.canvas.getObjects()) {
      o.selectable = !readOnly
      o.evented = !readOnly
    }
    if (readOnly) this.canvas.discardActiveObject()
    this.canvas.skipTargetFind = readOnly
    this.canvas.requestRenderAll()
  }

  setCursor(cursor: string): void {
    this.canvas.defaultCursor = cursor
    this.canvas.hoverCursor = this.host.tool === 'select' ? 'move' : cursor
    this.canvas.skipTargetFind = this.host.readOnly || this.host.tool === 'hand'
    this.canvas.selection = !this.host.readOnly && this.host.tool === 'select'
  }

  setRulerGuides(guides: PageGuide[]): void {
    this.overlay.rulerGuides = guides
    this.drawOverlay()
  }

  /* ----------------------------------------------------------------- loading */

  /** Serialises loads/syncs so rapid undo/redo cannot interleave. */
  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task, task)
    return this.queue
  }

  load(page: DocPage): Promise<void> {
    return this.syncTo(page)
  }

  syncTo(next: DocPage): Promise<void> {
    return this.enqueue(async () => {
      if (this.disposed) return
      const prev = this.loadedPage
      this.suppress += 1
      try {
        const selected = this.selectedIds()
        this.canvas.discardActiveObject()
        const backgroundChanged = next.background !== prev.background || this.canvas.backgroundImage === undefined
        if (backgroundChanged) await this.applyBackground(next.background)
        await this.applyObjects(prev.objects, next.objects)
        this.loadedPage = next
        this.overlay.rulerGuides = next.guides ?? []
        const restore = selected.map((id) => this.getById(id)).filter((o): o is FabricObject => !!o)
        if (restore.length > 0) this.selectObjects(restore)
        this.canvas.requestRenderAll()
        this.drawOverlay()
      } finally {
        this.suppress -= 1
      }
    })
  }

  /** True while changes that came from elsewhere are still being applied to this canvas. */
  get hasPendingRemote(): boolean {
    return this.pendingRemote > 0
  }

  /** Resolves when every queued sync has finished. */
  settled(): Promise<void> {
    return this.queue
  }

  get hasDeferred(): boolean {
    return this.deferred.size > 0
  }

  /** Objects the user is working on right now: a text in edit mode, or whatever is being transformed. */
  busyIds(): Set<string> {
    const busy = new Set(this.gesture)
    const active = this.canvas.getActiveObject()
    if (active instanceof IText && active.isEditing) {
      const id = asDory(active).id
      if (id) busy.add(id)
    }
    return busy
  }

  /**
   * Brings the canvas to a page that changed somewhere else, touching as little as possible: objects whose
   * change fits (position, rotation, opacity …) are updated in place, the others are rebuilt, the selection
   * stays unless one of its members is rebuilt or removed, and objects the user is dragging or typing in keep
   * their state until the user's next commit (`reconcile`).
   */
  syncRemote(next: DocPage): Promise<void> {
    this.pendingRemote += 1
    return this.enqueue(async () => {
      try {
        if (this.disposed) return
        const prev = this.loadedPage
        if (next === prev) return
        await this.applyRemote(prev, next)
        this.host.onSelectionLive(this.pageId)
      } finally {
        this.pendingRemote -= 1
      }
    })
  }

  private async applyRemote(prev: DocPage, next: DocPage): Promise<void> {
    const canvas = this.canvas
    // Objects are about to change under the cached layers (a collaborator's edit while this person types).
    this.dragCache.end()
    if (next.background !== prev.background) await this.applyBackground(next.background)
    if (this.disposed) return
    const live = this.liveObjects()
    const plan = planPage(prev, next, this.busyIds(), new Set(live.keys()))
    for (const remote of plan.deferred) {
      const base = this.deferred.get(remote.id)?.base ?? prev.objects.find((o) => o.id === remote.id)
      if (base) this.deferred.set(remote.id, { base, remote })
    }
    for (const id of plan.removed) this.deferred.delete(id)

    const selected = this.selectedIds()
    const replaced = new Set([...plan.removed, ...plan.build.map((o) => o.id)])
    const patching = new Set(plan.patched.map((p) => p.id))
    const discard = selected.some((id) => replaced.has(id) || (selected.length > 1 && patching.has(id)))
    if (discard) this.quietly(() => canvas.discardActiveObject())

    for (const id of plan.removed) {
      const obj = live.get(id)
      if (obj) canvas.remove(obj)
      live.delete(id)
    }
    for (const { id, keys, next: doc } of plan.patched) {
      const obj = live.get(id)
      if (!obj) continue
      obj.set(Object.fromEntries(keys.map((key) => [key, doc[key]])))
      obj.setCoords()
    }
    if (plan.build.length > 0) {
      const built = await deserializeObjects(plan.build, this.host.loadContext)
      if (this.disposed) {
        for (const b of built) b.dispose()
        return
      }
      built.forEach((obj, i) => {
        const doc = plan.build[i]
        asDory(obj).id = doc.id
        this.configure(obj)
        // The user may have put an object with this id on the canvas while the new one was being built (ungrouping, undo).
        this.removeById(doc.id)
        canvas.add(obj)
        live.set(doc.id, obj)
      })
    }
    if (plan.orderChanged || plan.build.length > 0) {
      next.objects.forEach((doc, index) => {
        const obj = live.get(doc.id)
        if (obj && canvas.getObjects().indexOf(obj) !== index) canvas.moveObjectTo(obj, index)
      })
    }
    this.loadedPage = this.deferred.size === 0 ? next : { ...next, objects: next.objects.map((o) => this.deferred.get(o.id)?.base ?? o) }
    this.overlay.rulerGuides = next.guides ?? []
    if (discard) {
      const restore = selected.map((id) => this.getById(id)).filter((o): o is FabricObject => !!o)
      if (restore.length > 0) this.quietly(() => this.selectObjects(restore))
    }
    canvas.requestRenderAll()
    this.drawOverlay()
  }

  /**
   * The user's page (`local`, read from the canvas) with the changes that were held back merged in: a property
   * the user changed keeps their value, every other property takes the value from elsewhere. Returns `base`
   * itself when nothing is left of the user's side.
   */
  reconcile(local: DocPage, base: DocPage): DocPage {
    if (this.deferred.size === 0) return local
    const objects = local.objects.map((o) => {
      const held = this.deferred.get(o.id)
      return held ? mergeObject(held.base, o, held.remote) : o
    })
    this.deferred.clear()
    if (objects.length === base.objects.length && objects.every((o, i) => o === base.objects[i])) return base
    return { ...local, objects }
  }

  private async applyBackground(bg: DocPage['background']): Promise<void> {
    const built = await buildBackground(bg, this.size.width, this.size.height, (s) => this.host.loadContext.resolveSrc(s))
    if (this.disposed) return
    installBackground(this.canvas, built, this.size.width, this.size.height)
  }

  /** Re-sizes the artboard (background + clip). Objects are positioned by the caller. */
  async resize(size: PageSize, page: DocPage): Promise<void> {
    this.size = size
    await this.applyBackground(page.background)
    this.canvas.requestRenderAll()
  }

  private async applyObjects(prev: readonly DocObject[], next: readonly DocObject[]): Promise<void> {
    const canvas = this.canvas
    const prevById = new Map(prev.map((o) => [o.id, o]))
    const nextIds = new Set(next.map((o) => o.id))
    const live = this.liveObjects()
    for (const [id, o] of live) if (!nextIds.has(id)) canvas.remove(o)

    const toBuild = next.filter((o) => prevById.get(o.id) !== o || !live.has(o.id))
    const built = await deserializeObjects(toBuild, this.host.loadContext)
    if (this.disposed) {
      for (const b of built) b.dispose()
      return
    }
    built.forEach((obj, i) => {
      const doc = toBuild[i]
      asDory(obj).id = doc.id
      this.configure(obj)
      this.removeById(doc.id)
      canvas.add(obj)
      live.set(doc.id, obj)
    })
    next.forEach((doc, index) => {
      const obj = live.get(doc.id)
      if (obj) canvas.moveObjectTo(obj, index)
    })
  }

  /** The objects whose text somebody else is editing: they stay selectable and movable but cannot enter text editing. */
  setEditLocks(ids: ReadonlySet<string>): void {
    this.editLocks = ids
    for (const o of this.canvas.getObjects()) if (o instanceof IText) o.editable = !ids.has(asDory(o).id ?? '')
  }

  /** Leaves text editing, keeping what was typed. */
  stopEditing(): void {
    const active = this.canvas.getActiveObject()
    if (active instanceof IText && active.isEditing) active.exitEditing()
  }

  /** Per-object interactive configuration (selection style, lock, read-only). */
  configure(obj: FabricObject): void {
    ensureId(obj)
    if (obj instanceof IText) obj.editable = !this.editLocks.has(asDory(obj).id ?? '')
    obj.set(selectionStyle(this.host.theme))
    if (this.host.readOnly) {
      obj.selectable = false
      obj.evented = false
    }
    applyLock(obj)
    customizeControls(obj)
    if (obj instanceof IText) obj.set('padding', TEXT_PADDING)
    if (obj instanceof Group && !(obj instanceof ActiveSelection)) {
      obj.set({ subTargetCheck: false, interactive: false })
    }
  }

  /* --------------------------------------------------------------- selection */

  selectedObjects(): FabricObject[] {
    return this.canvas.getActiveObjects()
  }

  selectedIds(): string[] {
    return this.selectedObjects().map((o) => asDory(o).id ?? '').filter(Boolean)
  }

  /**
   * The objects on the canvas by id. An id carried by two objects (ungrouping puts the children on the page, and one of them may
   * be there already) cannot be trusted to either: both go, and the object is built again from the design.
   */
  private liveObjects(): Map<string, FabricObject> {
    const live = new Map<string, FabricObject>()
    const twins = new Set<string>()
    for (const o of this.canvas.getObjects()) {
      const id = asDory(o).id
      if (!id) continue
      if (live.has(id)) twins.add(id)
      else live.set(id, o)
    }
    if (twins.size > 0) {
      if (this.selectedIds().some((id) => twins.has(id))) this.quietly(() => this.canvas.discardActiveObject())
      for (const o of this.canvas.getObjects()) if (twins.has(asDory(o).id ?? '')) this.canvas.remove(o)
      for (const id of twins) live.delete(id)
    }
    return live
  }

  /** Takes every object with this id off the canvas (there is one, unless a change from elsewhere overlapped a change of the user). */
  private removeById(id: string): void {
    for (const o of this.canvas.getObjects()) if (asDory(o).id === id) this.canvas.remove(o)
  }

  getById(id: string): FabricObject | undefined {
    return this.canvas.getObjects().find((o) => asDory(o).id === id)
  }

  selectObjects(objects: FabricObject[]): void {
    const c = this.canvas
    const selectable = objects.filter((o) => o.visible !== false)
    if (selectable.length === 0) {
      c.discardActiveObject()
    } else if (selectable.length === 1) {
      c.setActiveObject(selectable[0])
    } else {
      c.setActiveObject(new ActiveSelection(selectable, { canvas: c }))
    }
    c.requestRenderAll()
  }

  /** Runs `fn` without selection/modify events reaching the host (used for flatten → edit → reselect). */
  quietly<T>(fn: () => T): T {
    this.suppress += 1
    try {
      return fn()
    } finally {
      this.suppress -= 1
    }
  }

  clearSelection(): void {
    if (this.canvas.getActiveObject()) {
      this.suppress += 1
      this.canvas.discardActiveObject()
      this.suppress -= 1
      this.canvas.requestRenderAll()
    }
  }

  /** Re-selects the current selection as a fresh ActiveSelection so group transforms are realised. */
  reselect(): void {
    const objs = this.selectedObjects()
    this.suppress += 1
    this.canvas.discardActiveObject()
    this.suppress -= 1
    if (objs.length > 0) this.selectObjects(objs)
  }

  serialize(base: DocPage): DocPage {
    return serializePage(this.canvas, base)
  }

  /* ------------------------------------------------------------------ events */

  private bind(): void {
    const c = this.canvas
    const host = this.host
    const pid = this.pageId

    const on = <K extends keyof CanvasEvents>(name: K, handler: (e: CanvasEvents[K]) => void): void => {
      c.on(name, handler)
      this.cleanups.push(() => c.off(name, handler))
    }

    on('mouse:down:before', () => host.onPointerActivate(pid))

    on('selection:created', () => !this.suppress && host.onSelectionChange(pid))
    on('selection:updated', () => !this.suppress && host.onSelectionChange(pid))
    on('selection:cleared', () => {
      this.dragCache.end()
      if (!this.suppress) host.onSelectionChange(pid)
      this.leaveGroupEditing()
    })

    // Pictures that fill a placeholder and travel inside a group or multi-selection take their frames along.
    on('before:transform', (e) => {
      this.frames = anchorFrames(carriedPictures(e.transform.target))
      const target = e.transform.target
      const members = target instanceof ActiveSelection ? target.getObjects() : [target]
      this.gesture = new Set(members.map((m) => asDory(m).id ?? '').filter(Boolean))
    })
    on('object:moving', (e) => {
      this.dragCache.ensure()
      this.snapMoving(e.target, e.e)
      clampSlotImage(e.target)
      followFrames(this.frames)
      host.onSelectionLive(pid)
    })
    on('object:scaling', (e) => {
      this.dragCache.ensure()
      this.snapScaling(e.target, e.transform?.corner ?? '', e.e)
      clampSlotImage(e.target)
      followFrames(this.frames)
      host.onSelectionLive(pid)
    })
    on('object:rotating', (e) => {
      this.dragCache.ensure()
      clampSlotImage(e.target)
      followFrames(this.frames)
      host.onSelectionLive(pid)
    })
    on('object:resizing', () => {
      this.dragCache.ensure()
      host.onSelectionLive(pid)
    })

    on('mouse:up', () => {
      this.dragCache.end()
      this.gesture = new Set()
      this.frames = []
      this.snapRects = null
      if (this.overlay.guides.length > 0 || this.overlay.spacing.length > 0) {
        this.overlay.guides = []
        this.overlay.spacing = []
        this.drawOverlay()
      }
    })

    on('object:modified', (e) => {
      if (this.suppress || asDory(e.target).isUi || this.removing.has(e.target)) return
      const target = e.target
      let label: string = strings.history.edit
      if (target instanceof ActiveSelection) {
        const members = target.getObjects()
        const scaled = members.some((m) => isScaled(m)) || isScaled(target)
        if (scaled) {
          const ids = this.selectedIds()
          this.reselect()
          let changed = false
          for (const id of ids) {
            const o = this.getById(id)
            if (o && bakeInPlace(o)) changed = true
          }
          if (changed) {
            const objs = ids.map((id) => this.getById(id)).filter((o): o is FabricObject => !!o)
            this.selectObjects(objs)
          }
        }
        label = strings.history.transformSelection
      } else {
        bakeInPlace(target)
        label = target.angle !== 0 ? strings.history.transform : strings.history.move
      }
      this.canvas.requestRenderAll()
      host.onCommit(pid, { label, coalesceKey: undefined })
      host.onSelectionLive(pid)
    })

    on('text:changed', (e) => {
      const t = e.target as IText
      this.dragCache.ensure()
      host.ensureText(t.fontFamily, t.fontWeight, t.fontStyle, t.text)
      this.afterTextInput(t)
      host.onCommit(pid, { label: strings.history.editText, coalesceKey: `text:${asDory(t).id ?? ''}` })
      host.onSelectionLive(pid)
    })
    on('text:selection:changed', () => host.onSelectionLive(pid))
    on('text:editing:entered', (e) => {
      const t = e.target as IText
      host.onEditingChange(pid, true)
      if (t.path) {
        Object.assign(t, { _stashedPath: t.path })
        t.set({ path: undefined })
        t.initDimensions()
      }
      t.set('borderDashArray', [4, 4])
      // Every entry into edit mode selects the whole text so typing replaces the placeholder copy. Deferred:
      // Fabric places the caret after this event fires.
      setTimeout(() => {
        if (!t.isEditing) return
        t.selectAll()
        // Typing repaints the page on every key: on a crowded page the other objects are painted once into two layers.
        this.dragCache.ensure()
        t.renderCursorOrSelection()
        c.requestRenderAll()
      }, 0)
    })
    on('text:editing:exited', (e) => {
      const t = e.target as IText
      this.dragCache.end()
      host.onEditingChange(pid, false)
      t.set('borderDashArray', null)
      if (!t.text || t.text.trim() === '') {
        // Fabric is still inside `exitEditing()` (it fires `object:modified` through `t.canvas` next), so take the
        // text off the page once that has finished; until then it is not committed as an edit of its own.
        this.removing.add(t)
        queueMicrotask(() => {
          this.removing.delete(t)
          if (this.disposed || !this.canvas.getObjects().includes(t)) return
          this.canvas.remove(t)
          this.canvas.discardActiveObject()
          this.canvas.requestRenderAll()
          host.onCommit(pid, { label: strings.history.removeEmptyText })
        })
        return
      }
      reapplyCase(t)
      if (asDory(t).curveAmount) refitCurve(t)
      this.canvas.requestRenderAll()
      host.onCommit(pid, { label: strings.history.editText })
    })

    on('mouse:over', (e) => {
      if (!e.target || e.target === this.canvas.getActiveObject() || asDory(e.target).isUi) return
      this.overlay.hover = e.target
      this.drawOverlay()
    })
    on('mouse:out', () => {
      if (this.overlay.hover) {
        this.overlay.hover = null
        this.drawOverlay()
      }
    })

    on('mouse:down', (e) => this.onMouseDown(e as TPointerEventInfo<MouseEvent>))
    on('mouse:up', (e) => this.onMouseUp(e as TPointerEventInfo<MouseEvent>))
    on('mouse:dblclick', (e) => this.onDoubleClick(e as TPointerEventInfo<MouseEvent>))
    on('after:render', () => this.drawOverlay())

    on('object:added', (e) => {
      ensureId(e.target)
    })
  }

  private onMouseDown(e: TPointerEventInfo<MouseEvent>): void {
    const host = this.host
    if (host.readOnly) return
    const ev = e.e
    if (ev.button === 2) {
      if (e.target && !this.selectedObjects().includes(e.target) && !(e.target.group instanceof ActiveSelection)) this.selectObjects([e.target])
      host.onContextMenu(this.pageId, ev.clientX, ev.clientY)
      return
    }
    if (ev.button !== 0) return
    if (host.tool === 'text' && (!e.target || !(e.target instanceof IText))) {
      this.textDrag = { x: e.scenePoint.x, y: e.scenePoint.y }
      return
    }
    const target = e.target
    if (target && asDory(target).isPlaceholder) {
      this.textDrag = null
      this.placeholderClick = { id: asDory(target).id ?? '', x: ev.clientX, y: ev.clientY }
    } else {
      this.placeholderClick = null
    }
    if (ev.altKey && target && !asDory(target).locked) void this.altDragCopy(target)
  }

  private placeholderClick: { id: string; x: number; y: number } | null = null

  private onMouseUp(e: TPointerEventInfo<MouseEvent>): void {
    if (this.textDrag) {
      const start = this.textDrag
      this.textDrag = null
      const dx = Math.abs(e.scenePoint.x - start.x)
      const left = Math.min(start.x, e.scenePoint.x)
      this.host.onTextCreate(this.pageId, { x: dx > NUDGE_CLICK_SLOP * 2 ? left + dx / 2 : start.x, y: start.y, width: dx > NUDGE_CLICK_SLOP * 2 ? dx : 0 })
      return
    }
    const pc = this.placeholderClick
    this.placeholderClick = null
    if (pc && Math.hypot(e.e.clientX - pc.x, e.e.clientY - pc.y) < NUDGE_CLICK_SLOP) this.host.onPlaceholderActivate(this.pageId, pc.id)
  }

  /** Alt-drag duplicates: a copy stays at the origin while the dragged original moves. */
  private async altDragCopy(target: FabricObject): Promise<void> {
    try {
      const clone = await target.clone(['id'])
      asDory(clone).id = undefined
      ensureId(clone)
      this.configure(clone)
      const index = this.canvas.getObjects().indexOf(target)
      this.suppress += 1
      this.canvas.insertAt(Math.max(0, index), clone)
      this.suppress -= 1
      this.canvas.requestRenderAll()
    } catch {
      /* the copy is a nicety; the drag itself continues */
    }
  }

  private onDoubleClick(e: TPointerEventInfo<MouseEvent>): void {
    if (this.host.readOnly) return
    const target = e.target
    if (!target) {
      // Double-click on empty canvas: start a new text box right there.
      this.host.onTextCreate(this.pageId, { x: e.scenePoint.x, y: e.scenePoint.y, width: 0 })
      return
    }
    const lockedId = asDory(target).id
    if (target instanceof IText && lockedId && this.editLocks.has(lockedId)) this.host.onEditBlocked(this.pageId, lockedId)
    if (target instanceof Group && !(target instanceof ActiveSelection)) {
      const sub = e.subTargets?.[0] ?? target.getObjects().find((o) => o.containsPoint(e.scenePoint))
      this.enterGroup(target)
      if (sub) {
        this.canvas.setActiveObject(sub)
        this.canvas.requestRenderAll()
      }
    }
  }

  private editingGroup: Group | null = null

  /** Makes the children of a group individually selectable (double-click / layers panel). */
  enterGroup(group: Group): void {
    group.set({ subTargetCheck: true, interactive: true })
    this.editingGroup = group
  }

  private leaveGroupEditing(): void {
    const g = this.editingGroup
    if (!g) return
    this.editingGroup = null
    g.set({ subTargetCheck: false, interactive: false })
    g.triggerLayout()
    g.setCoords()
  }

  private afterTextInput(t: IText): void {
    // Typing the first Arabic or Hebrew letter turns the box right-to-left at once, so the caret moves the right way.
    syncDirection(t)
    const d = asDory(t)
    if (d.listStyle === 'bullet' || d.listStyle === 'number') {
      const before = t.text
      const caret = t.selectionStart
      const next = continueList(t.text, caret)
      if (next) {
        t.set('text', next.text)
        t.selectionStart = next.caret
        t.selectionEnd = next.caret
      }
      if (d.listStyle === 'number') t.set('text', renumber(t.text))
      // Fabric reads each keystroke back from its hidden textarea: unless the marker is written there too, the
      // next letter typed brings back the text without it (#55).
      if (t.text !== before && t.hiddenTextarea) {
        t.hiddenTextarea.value = t.text
        t._updateTextarea()
      }
    }
  }

  /* ---------------------------------------------------------------- snapping */

  /** Rectangles the moving object can snap to: everything visible on the page except the object (or selection) itself. */
  private snapTargets(target: FabricObject): Rect[] {
    if (!this.snapRects) {
      const exclude = new Set<FabricObject>(target instanceof ActiveSelection ? target.getObjects() : [target])
      this.snapRects = this.canvas
        .getObjects()
        .filter((o) => !exclude.has(o) && o.visible !== false && !o.excludeFromExport)
        .map(objectRect)
    }
    return this.snapRects
  }

  /** True when snapping is off, or Alt / Cmd / Ctrl is held; clears any guide that is still showing. */
  private snapSuspended(ev: TPointerEvent): boolean {
    const mods = ev as Partial<MouseEvent>
    const disabled = !this.host.snapEnabled || mods.altKey === true || mods.metaKey === true || mods.ctrlKey === true
    if (disabled && (this.overlay.guides.length > 0 || this.overlay.spacing.length > 0)) {
      this.overlay.guides = []
      this.overlay.spacing = []
    }
    return disabled
  }

  private snapMoving(target: FabricObject, ev: TPointerEvent): void {
    const host = this.host
    if (this.snapSuspended(ev)) return
    const others = this.snapTargets(target)
    // Fabric fires `moving` before it refreshes the coordinates, so refresh them to read the live position.
    target.setCoords()
    const moving = objectRect(target)
    const page: Rect = { left: 0, top: 0, width: this.size.width, height: this.size.height }
    const threshold = 5 / Math.max(this.zoom, 0.25)
    const r = computeSnap(moving, others, page, { threshold })
    if (r.dx !== 0 || r.dy !== 0) {
      target.set({ left: target.left + r.dx, top: target.top + r.dy })
      target.setCoords()
    }
    this.overlay.guides = host.showGuides ? r.guides : []
    this.overlay.spacing = host.showGuides ? r.spacing : []
  }

  /**
   * Snapping while resizing: the edge being dragged sticks to the page and to other objects while the opposite
   * edge stays put. Corners keep the object's proportions unless Shift unlocks them. Rotated objects and
   * selections are not snapped (their bounding box does not follow the handle).
   */
  private snapScaling(target: FabricObject, corner: string, ev: TPointerEvent): void {
    if (this.snapSuspended(ev) || target instanceof ActiveSelection || Math.abs(target.angle % 180) > 0.01) return
    const drag: ResizeDrag = {}
    if (corner.includes('l')) drag.x = 'left'
    else if (corner.includes('r')) drag.x = 'right'
    if (corner.includes('t')) drag.y = 'top'
    else if (corner.includes('b')) drag.y = 'bottom'
    if (!drag.x && !drag.y) return
    const others = this.snapTargets(target)
    target.setCoords()
    const rect = objectRect(target)
    if (rect.width < 1 || rect.height < 1) return
    const page: Rect = { left: 0, top: 0, width: this.size.width, height: this.size.height }
    const snap = computeResizeSnap(rect, others, page, drag, 5 / Math.max(this.zoom, 0.25))
    this.overlay.guides = this.host.showGuides ? snap.guides : []
    this.overlay.spacing = []
    if (snap.dx === 0 && snap.dy === 0) return

    let fx = drag.x && snap.dx !== 0 ? (rect.width + (drag.x === 'left' ? -snap.dx : snap.dx)) / rect.width : 1
    let fy = drag.y && snap.dy !== 0 ? (rect.height + (drag.y === 'top' ? -snap.dy : snap.dy)) / rect.height : 1
    const shift = (ev as Partial<MouseEvent>).shiftKey === true
    const proportional = !!drag.x && !!drag.y && this.canvas.uniformScaling !== shift
    if (proportional) {
      // One scale for both axes: follow whichever edge is closer to its target.
      const f = Math.abs(snap.dx) > 0 && (Math.abs(snap.dy) === 0 || Math.abs(snap.dx) <= Math.abs(snap.dy)) ? fx : fy
      fx = f
      fy = f
    }
    const border = target.strokeUniform ? target.strokeWidth || 0 : 0
    const innerW = rect.width - border
    const innerH = rect.height - border
    if (innerW <= 0 || innerH <= 0) return
    target.set({
      scaleX: target.scaleX * (fx === 1 ? 1 : Math.max(0.01, (rect.width * fx - border) / innerW)),
      scaleY: target.scaleY * (fy === 1 ? 1 : Math.max(0.01, (rect.height * fy - border) / innerH)),
    })
    target.setCoords()
    // The opposite edge is the anchor: put it back where it was.
    const next = objectRect(target)
    const anchorX = drag.x === 'right' ? rect.left : drag.x === 'left' ? rect.left + rect.width : undefined
    const anchorY = drag.y === 'bottom' ? rect.top : drag.y === 'top' ? rect.top + rect.height : undefined
    target.set({
      left: target.left + (anchorX === undefined ? 0 : drag.x === 'right' ? anchorX - next.left : anchorX - (next.left + next.width)),
      top: target.top + (anchorY === undefined ? 0 : drag.y === 'bottom' ? anchorY - next.top : anchorY - (next.top + next.height)),
    })
    target.setCoords()
  }

  /* ----------------------------------------------------------------- overlay */

  drawOverlay(): void {
    if (this.disposed) return
    const el = this.overlayEl
    const ctx = el.getContext('2d')
    if (!ctx || el.width === 0) return
    const dpr = this.canvas.getRetinaScaling()
    const z = this.zoom
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.setTransform(dpr * z, 0, 0, dpr * z, -this.window.x * dpr, -this.window.y * dpr)
    const theme = this.host.theme
    const px = 1 / z
    const w = this.size.width
    const h = this.size.height

    if (this.host.showGrid && this.host.gridSize * z >= 6) {
      ctx.strokeStyle = theme.muted
      ctx.globalAlpha = 0.28
      ctx.lineWidth = px
      ctx.beginPath()
      const g = this.host.gridSize
      for (let x = g; x < w; x += g) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      for (let y = g; y < h; y += g) {
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    if (this.host.showBleed && this.host.bleedPx > 0) {
      const b = this.host.bleedPx
      ctx.setLineDash([6 * px, 4 * px])
      ctx.strokeStyle = theme.guide
      ctx.lineWidth = px
      ctx.strokeRect(b, b, w - b * 2, h - b * 2)
      ctx.setLineDash([])
    }

    const zone = this.host.showSafeZone ? this.host.safeZoneFor(w, h) : null
    if (zone) {
      // Shade the margins a platform covers with its own buttons and captions, and outline what stays clear.
      const top = (zone.top ?? 0) * h
      const bottom = (zone.bottom ?? 0) * h
      const left = (zone.left ?? 0) * w
      const right = (zone.right ?? 0) * w
      ctx.fillStyle = theme.guide
      ctx.globalAlpha = 0.1
      ctx.fillRect(0, 0, w, top)
      ctx.fillRect(0, h - bottom, w, bottom)
      ctx.fillRect(0, top, left, h - top - bottom)
      ctx.fillRect(w - right, top, right, h - top - bottom)
      ctx.globalAlpha = 1
      ctx.setLineDash([2 * px, 3 * px])
      ctx.strokeStyle = theme.guide
      ctx.lineWidth = px
      ctx.strokeRect(left, top, w - left - right, h - top - bottom)
      ctx.setLineDash([])
    }

    ctx.strokeStyle = theme.guide
    ctx.lineWidth = px
    for (const g of this.host.showRulerGuides ? this.overlay.rulerGuides : []) {
      ctx.beginPath()
      if (g.orientation === 'vertical') {
        ctx.moveTo(g.pos, -4000)
        ctx.lineTo(g.pos, h + 4000)
      } else {
        ctx.moveTo(-4000, g.pos)
        ctx.lineTo(w + 4000, g.pos)
      }
      ctx.stroke()
    }

    const hover = this.overlay.hover
    if (hover && hover !== this.canvas.getActiveObject() && !this.canvas.getActiveObjects().includes(hover) && this.canvas.getObjects().includes(hover)) {
      const r = objectRect(hover)
      ctx.strokeStyle = theme.selection
      ctx.lineWidth = 1.5 * px
      ctx.strokeRect(r.left, r.top, r.width, r.height)
    }

    this.drawZoneHints(ctx, px)
    this.drawPlaceholders(ctx, px)

    ctx.strokeStyle = theme.guide
    ctx.fillStyle = theme.guide
    ctx.lineWidth = px
    for (const g of this.overlay.guides) {
      ctx.beginPath()
      if (g.axis === 'x') {
        ctx.moveTo(g.pos, g.from - 8 * px)
        ctx.lineTo(g.pos, g.to + 8 * px)
      } else {
        ctx.moveTo(g.from - 8 * px, g.pos)
        ctx.lineTo(g.to + 8 * px, g.pos)
      }
      ctx.stroke()
    }
    for (const s of this.overlay.spacing) this.drawSpacing(ctx, s, px)
  }

  /**
   * While a text is selected (not being typed into) every other editable text on the page gets a faint dashed
   * outline, so it is clear at a glance which parts of the design can be edited.
   */
  private drawZoneHints(ctx: CanvasRenderingContext2D, px: number): void {
    const active = this.canvas.getActiveObject()
    if (!(active instanceof IText) || active.isEditing || this.host.readOnly) return
    ctx.save()
    ctx.strokeStyle = this.host.theme.selection
    ctx.globalAlpha = 0.55
    ctx.lineWidth = px
    ctx.setLineDash([6 * px, 4 * px])
    const pad = 2 * px
    for (const o of this.canvas.getObjects()) {
      if (o === active || !(o instanceof IText) || o.visible === false || o.evented === false || o.selectable === false) continue
      const r = objectRect(o)
      ctx.strokeRect(r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2)
    }
    ctx.restore()
  }

  private drawSpacing(ctx: CanvasRenderingContext2D, hint: SpacingHint, px: number): void {
    const theme = this.host.theme
    ctx.strokeStyle = theme.guide
    ctx.fillStyle = theme.guide
    ctx.lineWidth = px
    for (const seg of hint.segments) {
      ctx.beginPath()
      if (hint.axis === 'x') {
        ctx.moveTo(seg.from, seg.at)
        ctx.lineTo(seg.to, seg.at)
        ctx.moveTo(seg.from, seg.at - 4 * px)
        ctx.lineTo(seg.from, seg.at + 4 * px)
        ctx.moveTo(seg.to, seg.at - 4 * px)
        ctx.lineTo(seg.to, seg.at + 4 * px)
      } else {
        ctx.moveTo(seg.at, seg.from)
        ctx.lineTo(seg.at, seg.to)
        ctx.moveTo(seg.at - 4 * px, seg.from)
        ctx.lineTo(seg.at + 4 * px, seg.from)
        ctx.moveTo(seg.at - 4 * px, seg.to)
        ctx.lineTo(seg.at + 4 * px, seg.to)
      }
      ctx.stroke()
    }
    const seg = hint.segments[0]
    if (!seg) return
    const label = `${Math.round(hint.gap)}`
    ctx.font = `${600} ${11 * px}px system-ui, sans-serif`
    const tw = ctx.measureText(label).width
    const cx = hint.axis === 'x' ? (seg.from + seg.to) / 2 : seg.at
    const cy = hint.axis === 'x' ? seg.at : (seg.from + seg.to) / 2
    const padX = 5 * px
    const hgt = 16 * px
    ctx.fillStyle = theme.guide
    ctx.beginPath()
    ctx.roundRect(cx - tw / 2 - padX, cy - hgt / 2, tw + padX * 2, hgt, 4 * px)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(label, cx, cy + 0.5 * px)
  }

  private drawPlaceholders(ctx: CanvasRenderingContext2D, px: number): void {
    const theme = this.host.theme
    const visible = { left: this.window.x / this.zoom, top: this.window.y / this.zoom, width: this.window.width / this.zoom, height: this.window.height / this.zoom }
    for (const o of this.canvas.getObjects()) {
      if (!asDory(o).isPlaceholder || o.visible === false) continue
      const r = objectRect(o)
      if (!rectsIntersect(r, visible)) continue
      // The outline follows the frame the photo will be cropped to (oval, rounded box, any path), tilt included.
      const slot = slotOf(o)
      ctx.save()
      ctx.translate(slot.cx, slot.cy)
      ctx.rotate((slot.angle * Math.PI) / 180)
      ctx.setLineDash([8 * px, 6 * px])
      ctx.strokeStyle = theme.muted
      ctx.lineWidth = 1.5 * px
      strokeSlotOutline(ctx, slot)
      ctx.setLineDash([])
      ctx.rotate((-slot.angle * Math.PI) / 180)
      ctx.translate(-slot.cx, -slot.cy)
      const size = Math.min(r.width, r.height, 160)
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      ctx.fillStyle = theme.muted
      ctx.globalAlpha = 0.9
      const iconW = size * 0.34
      ctx.fillRect(cx - iconW / 2, cy - iconW / 2 - size * 0.08, iconW, iconW * 0.04)
      ctx.beginPath()
      ctx.roundRect(cx - iconW / 2, cy - iconW / 2 - size * 0.08, iconW, iconW * 0.75, iconW * 0.1)
      ctx.lineWidth = 2 * px
      ctx.strokeStyle = theme.muted
      ctx.stroke()
      ctx.font = `600 ${Math.max(10, Math.min(15, size * 0.1)) * px}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      if (r.width * this.zoom > 90) ctx.fillText(strings.workspace.placeholderHint, cx, cy + iconW * 0.45)
      ctx.restore()
    }
  }

  /* ---------------------------------------------------------------- lifecycle */

  /** Snapshot of the visible bitmap (used when the page unmounts so a placeholder image can stand in). */
  toBitmap(multiplier: number): HTMLCanvasElement | null {
    if (this.disposed) return null
    return this.canvas.toCanvasElement(multiplier)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const off of this.cleanups) off()
    this.cleanups = []
    this.dragCache.end()
    // Fabric puts the original <canvas> back where its wrapper was; remove both so nothing lingers in the host.
    const lower = this.canvas.lowerCanvasEl
    const wrapper = this.canvas.wrapperEl
    void this.canvas.dispose().then(() => {
      lower.remove()
      wrapper.remove()
    })
  }

  isDisposed(): boolean {
    return this.disposed
  }
}
