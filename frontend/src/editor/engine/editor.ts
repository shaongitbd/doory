/**
 * The editor engine: owns the store, the live page canvases, history, fonts and assets, and exposes the
 * feature APIs (`insert`, `arrange`, `style`, `pages`, `clipboard`, `view`, `persistence`) that the UI,
 * shortcuts, commands and third-party extensions drive. It is framework-free; React only reads the
 * store and calls these methods.
 */
import { ActiveSelection, type FabricObject } from 'fabric'
import type { EditorAdapter, EditorMeta } from '@/types/adapter'
import type { DocObject, DocPage, DoryDocument } from '@/types/document'
import { getSizePresets, loadSizePresets, subscribeSizePresets, type SafeZone } from '@/lib/sizePresets'
import { migrateDocument } from './migrations'
import { AnimationApi } from './api/animation'
import { AudioApi } from './api/audio'
import { VideosApi } from './api/videos'
import { ArrangeApi } from './api/arrange'
import { ClipboardApi } from './api/clipboard'
import { CropApi } from './api/crop'
import { InsertApi } from './api/insert'
import { ImageGridApi, type CanvasImageFrame } from './api/imageGrids'
import { PagesApi } from './api/pages'
import { StyleApi } from './api/style'
import { ViewApi, type ViewportController } from './api/view'
import { AssetManager } from './assets'
import { type PageSize, findPageIndex, pageSize, replacePage, usedFonts } from './docOps'
import { FontManager } from './fonts'
import { UserFonts } from '../fonts/userFonts'
import { History } from './history'
import { type CommitInfo, PageCanvas, type PageCanvasHost, type ToolId } from './pageCanvas'
import { getPageSize } from './pageSizes'
import { PersistenceController } from './persistence'
import { PageSnapshots } from './snapshots'
import { asDory } from './objects/dory'
import { kindOfLive } from './objects/kinds'
import { type CanvasTheme, applyThemeDefaults, readCanvasTheme } from './objects/theme'
import { currentTextStyle } from './objects/textStyle'
import { IText } from 'fabric'
import { type LoadContext, serializeObject } from './serialization'
import type { CanvasWindow } from './layout'
import {
  EMPTY_SELECTION,
  type EditorState,
  type HistoryStatus,
  type EditorStore,
  type SelectionState,
  type Toast,
  createEditorStore,
  isReadOnlyMode,
  writePrefs,
} from '../store/editorStore'
import { t } from '../strings'

/** Width of the border that does not scale with an object (it is drawn around, not part of, its width and height). */
function border(obj: FabricObject): number {
  return obj.strokeUniform && !(obj instanceof ActiveSelection) ? obj.strokeWidth || 0 : 0
}

const NO_IDS: ReadonlySet<string> = new Set()

export interface HistoryState {
  doc: DoryDocument
  activePageId: string
  selection: string[]
}

/** A user edit that has been applied to the store, as a live-editing session needs to hear about it. */
export interface LocalChange extends CommitInfo {
  activePageId: string
  selection: string[]
}

/**
 * What the engine needs from a live-editing session (collab/session.ts). While one is attached, edits are shared
 * through it and undo / redo only touch this user's own changes; the snapshot history is not used.
 */
export interface LiveSession {
  /** `next` replaced `prev` because of something the user did. */
  recordLocal(prev: DoryDocument, next: DoryDocument, change: LocalChange): void
  /** The whole design was replaced (version restore) with `next`. */
  replaceDocument(prev: DoryDocument, next: DoryDocument): void
  undo(): Promise<void>
  redo(): Promise<void>
  /** Ends the current run of coalesced edits. */
  seal(): void
  historyStatus(): HistoryStatus
}

export interface EditorEngineOptions {
  adapter: EditorAdapter
  document: DoryDocument
  meta: EditorMeta
  /** Skip stored viewer preferences (tests). */
  ephemeral?: boolean
}

interface Deferred {
  promise: Promise<PageCanvas>
  resolve(view: PageCanvas): void
}

function defer(): Deferred {
  let resolve!: (v: PageCanvas) => void
  const promise = new Promise<PageCanvas>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

export class EditorEngine implements PageCanvasHost {
  readonly store: EditorStore
  readonly fonts: FontManager
  /** The user's uploaded fonts (or the ones a shared design came with), shared by every part of the UI. */
  readonly userFonts: UserFonts
  readonly assets: AssetManager
  readonly snapshots: PageSnapshots
  readonly history: History<HistoryState>
  readonly insert: InsertApi
  readonly imageGrids: ImageGridApi
  readonly arrange: ArrangeApi
  readonly style: StyleApi
  readonly pages: PagesApi
  readonly animation: AnimationApi
  readonly audio: AudioApi
  readonly videos: VideosApi
  readonly clipboard: ClipboardApi
  readonly crop: CropApi
  readonly view: ViewApi
  readonly persistence: PersistenceController
  adapter: EditorAdapter
  gridSize = 20
  /** The id of the design that is open (what choices remembered per design, like the print options, are filed under). */
  private designIdValue: string

  /** The document as it was opened or last loaded: what "Reset design" returns to. */
  private openedDoc: DoryDocument
  private readonly views = new Map<string, PageCanvas>()
  private readonly waiting = new Map<string, Deferred>()
  private themeValue: CanvasTheme
  private toastSeq = 0
  private disposers: (() => void)[] = []
  private liveRaf = 0
  private disposed = false
  private readonly unsubscribePresets: () => void
  private live: LiveSession | null = null
  private liveReadOnly = false
  private editLocks: ReadonlyMap<string, ReadonlySet<string>> = new Map()
  /** Told when the user tries to edit text somebody else is editing (set by the live session). */
  editBlockedHandler: ((pageId: string, id: string) => void) | null = null

  constructor(options: EditorEngineOptions) {
    this.adapter = options.adapter
    this.designIdValue = options.meta.id
    const doc = migrateDocument(options.document)
    this.openedDoc = doc
    this.store = createEditorStore({ doc, title: options.meta.title, mode: options.meta.mode, ephemeral: options.ephemeral })
    this.fonts = new FontManager(this.listFonts())
    this.userFonts = new UserFonts(this.fonts)
    this.userFonts.attach(options.adapter.services.fonts)
    this.assets = new AssetManager(options.adapter)
    this.snapshots = new PageSnapshots(() => this.loadContext)
    this.history = new History<HistoryState>({ doc, activePageId: doc.pages[0].id, selection: [] })
    this.themeValue = readCanvasTheme()
    applyThemeDefaults(this.themeValue)

    this.insert = new InsertApi(this)
    this.imageGrids = new ImageGridApi(this)
    this.arrange = new ArrangeApi(this)
    this.style = new StyleApi(this)
    this.pages = new PagesApi(this)
    this.animation = new AnimationApi(this)
    this.audio = new AudioApi(this)
    this.videos = new VideosApi(this)
    this.clipboard = new ClipboardApi(this)
    this.crop = new CropApi(this)
    this.view = new ViewApi(this)
    this.persistence = new PersistenceController(this)
    // Safe zones come from the size preset catalogue, which may arrive after the pages are drawn.
    this.unsubscribePresets = subscribeSizePresets(() => {
      for (const v of this.allViews()) v.invalidateOverlay()
    })
    void loadSizePresets()

  }

  /* ------------------------------------------------------------ host surface */

  get state(): EditorState {
    return this.store.getState()
  }
  get theme(): CanvasTheme {
    return this.themeValue
  }
  get tool(): ToolId {
    const ui = this.state.ui
    return ui.spaceDown ? 'hand' : ui.tool
  }
  get readOnly(): boolean {
    return this.state.readOnly
  }
  get snapEnabled(): boolean {
    return this.state.ui.snapping
  }
  get showGuides(): boolean {
    return this.state.ui.guides
  }
  get showGrid(): boolean {
    return this.state.ui.grid
  }
  get showBleed(): boolean {
    return this.state.ui.bleed
  }
  get showRulerGuides(): boolean {
    return this.state.ui.rulers
  }
  get showSafeZone(): boolean {
    return this.state.ui.safeZone
  }
  safeZoneFor(width: number, height: number): SafeZone | null {
    const preset = getSizePresets().byId.get(this.state.doc.meta?.presetId ?? '')
    // Only a page still at the preset's size: once resized, the platform's overlays no longer line up.
    return preset?.safeZone && preset.width === width && preset.height === height ? preset.safeZone : null
  }
  get bleedPx(): number {
    return this.state.doc.meta?.bleedPx ?? 24
  }
  get loadContext(): LoadContext {
    return {
      resolveSrc: (src) => this.assets.resolve(src),
      ensureFonts: (fonts) => this.fonts.ensure(fonts),
    }
  }

  ensureText(family: string, weight: string | number, style: string, text: string): void {
    void this.fonts.ensureText(family, weight, style, text)
  }

  private listFonts(): ((q: Parameters<EditorAdapter['services']['fonts']['list']>[0]) => ReturnType<EditorAdapter['services']['fonts']['list']>) | null {
    return (q) => this.adapter.services.fonts.list(q)
  }

  /** Swaps the adapter (guest → account migration); open pages keep working. */
  setAdapter(adapter: EditorAdapter): void {
    this.adapter = adapter
    this.assets.setAdapter(adapter)
    this.userFonts.attach(adapter.services.fonts)
  }

  /** The user signed in (guest → account) or access changed. */
  setMode(mode: EditorMeta['mode']): void {
    const readOnly = isReadOnlyMode(mode) || this.liveReadOnly
    this.store.setState((s) => ({ mode, readOnly, ui: readOnly ? { ...s.ui, panelId: null, tool: 'select' } : s.ui }))
  }

  /* -------------------------------------------------------------- live editing */

  get liveSession(): LiveSession | null {
    return this.live
  }

  /** Connects the engine to a live-editing session (see `LiveSession`); `null` returns to the snapshot history. */
  attachLive(session: LiveSession | null): void {
    this.live = session
    if (session) this.history.clear({ doc: this.state.doc, activePageId: this.state.activePageId, selection: [] })
    this.updateHistoryStatus()
  }

  /** The server says this user may only look (or may edit again): the editor follows. */
  setLiveReadOnly(readOnly: boolean): void {
    if (this.liveReadOnly === readOnly) return
    this.liveReadOnly = readOnly
    const locked = readOnly || isReadOnlyMode(this.state.mode)
    this.store.setState((s) => ({ readOnly: locked, ui: locked ? { ...s.ui, panelId: null, tool: 'select' } : s.ui }))
    for (const view of this.allViews()) {
      view.setReadOnly(locked)
      view.setCursor(this.cursorFor(this.tool))
    }
  }

  /** Objects (per page) whose text somebody else is editing: they cannot enter text editing here. */
  setRemoteEditLocks(locks: ReadonlyMap<string, ReadonlySet<string>>): void {
    this.editLocks = locks
    for (const [id, view] of this.views) view.setEditLocks(locks.get(id) ?? NO_IDS)
  }

  /** Leaves text editing on the active page. */
  stopEditingText(): void {
    this.activeView()?.stopEditing()
  }

  /**
   * Applies a document that came from elsewhere (a collaborator, the server's first copy, the result of an
   * undo): no history step, no autosave, only the canvases whose pages changed are touched and what the user is
   * doing (selection, text being typed, an object being dragged) is left alone. Resolves when the canvases show it.
   */
  async applyRemoteDocument(doc: DoryDocument): Promise<void> {
    const prev = this.state
    if (this.disposed || doc === prev.doc) return
    const keepActive = doc.pages.some((p) => p.id === prev.activePageId)
    const activePageId = keepActive ? prev.activePageId : doc.pages[Math.min(Math.max(0, this.pageIndex(prev.activePageId)), doc.pages.length - 1)].id
    this.store.setState({
      doc,
      activePageId,
      docVersion: prev.docVersion + 1,
      ...(keepActive ? {} : { selection: EMPTY_SELECTION }),
    })
    const syncs: Promise<void>[] = []
    let resized = false
    for (const [id, view] of this.views) {
      const page = doc.pages.find((p) => p.id === id)
      if (!page) continue
      const size = pageSize(doc, page)
      if (size.width !== view.pageSize.width || size.height !== view.pageSize.height) {
        resized = true
        syncs.push(view.resize(size, page).then(() => view.syncRemote(page)))
      } else if (page !== view.loadedPage) {
        syncs.push(view.syncRemote(page))
      }
    }
    await Promise.all(syncs)
    if (resized) this.view.relayout()
    this.refreshSelection()
  }

  /* ---------------------------------------------------------------- documents */

  getDocument(): DoryDocument {
    return this.state.doc
  }

  getPage(pageId: string): DocPage | undefined {
    return this.state.doc.pages.find((p) => p.id === pageId)
  }

  pageSizeOf(pageId: string): PageSize {
    return getPageSize(this.state.doc, pageId)
  }

  /**
   * Commits a new document produced by a pure document operation (page ops, resize, background, template
   * load…). Mounted canvases are brought in line with the new pages.
   */
  applyDocument(doc: DoryDocument, info: CommitInfo & { activePageId?: string; selection?: string[] }): void {
    const prev = this.state
    const activePageId = info.activePageId && doc.pages.some((p) => p.id === info.activePageId)
      ? info.activePageId
      : doc.pages.some((p) => p.id === prev.activePageId)
        ? prev.activePageId
        : doc.pages[0].id
    if (this.live) this.live.recordLocal(prev.doc, doc, { label: info.label, coalesceKey: info.coalesceKey, activePageId, selection: info.selection ?? [] })
    else this.history.push({ doc, activePageId, selection: info.selection ?? [] }, { label: info.label, coalesceKey: info.coalesceKey })
    this.store.setState({ doc, activePageId, docVersion: prev.docVersion + 1 })
    this.syncViews(doc)
    this.updateHistoryStatus()
  }

  private syncViews(doc: DoryDocument): void {
    for (const [id, view] of this.views) {
      const page = doc.pages.find((p) => p.id === id)
      if (!page) continue
      const size = pageSize(doc, page)
      if (size.width !== view.pageSize.width || size.height !== view.pageSize.height) {
        void view.resize(size, page).then(() => view.syncTo(page)).then(() => this.view.relayout())
      } else if (page !== view.loadedPage) {
        void view.syncTo(page)
      }
    }
  }

  /** Replaces the whole document (e.g. version restore). Clears history. */
  async loadDocument(raw: unknown): Promise<void> {
    const doc = migrateDocument(raw)
    this.openedDoc = doc
    this.live?.replaceDocument(this.state.doc, doc)
    this.history.clear({ doc, activePageId: doc.pages[0].id, selection: [] })
    this.store.setState({ doc, activePageId: doc.pages[0].id, selection: EMPTY_SELECTION, docVersion: this.state.docVersion + 1 })
    this.syncViews(doc)
    this.updateHistoryStatus()
  }

  /**
   * True when the design differs from how it was opened (there is something to reset). Never while others edit it with
   * the user: "how it was opened" is not theirs to take back.
   */
  get canResetDesign(): boolean {
    return !this.readOnly && !this.live && this.state.doc !== this.openedDoc
  }

  /**
   * Returns every page, object, background and size to how the design was opened, as one undoable step. The
   * a "reset to template"; the previous state stays one undo away.
   */
  resetDesign(): void {
    if (!this.canResetDesign) return
    this.clearSelection()
    this.applyDocument(this.openedDoc, { label: t.history.resetDesign, activePageId: this.openedDoc.pages[0].id })
    this.announce(t.announce.designReset)
    this.view.refit()
  }

  /* ------------------------------------------------------------------ canvases */

  mountPage(pageId: string, container: HTMLElement): PageCanvas {
    const existing = this.views.get(pageId)
    if (existing && !existing.isDisposed()) return existing
    const page = this.getPage(pageId)
    if (!page) throw new Error(`Unknown page ${pageId}`)
    const view = new PageCanvas(this, page, this.pageSizeOf(pageId), container)
    view.setEditLocks(this.editLocks.get(pageId) ?? NO_IDS)
    this.views.set(pageId, view)
    this.store.setState((s) => ({ loadingPages: [...s.loadingPages.filter((id) => id !== pageId), pageId] }))
    void view
      .load(page)
      .then(() => {
        if (view.isDisposed()) return
        const latest = this.getPage(pageId)
        return latest && latest !== view.loadedPage ? view.syncTo(latest) : undefined
      })
      .finally(() => {
        this.store.setState((s) => ({ loadingPages: s.loadingPages.filter((id) => id !== pageId) }))
        const d = this.waiting.get(pageId)
        if (d && !view.isDisposed()) {
          d.resolve(view)
          this.waiting.delete(pageId)
        }
        view.setCursor(this.cursorFor(this.tool))
        if (this.state.activePageId === pageId) this.refreshSelection()
      })
    return view
  }

  unmountPage(pageId: string): void {
    const view = this.views.get(pageId)
    if (!view) return
    this.views.delete(pageId)
    if (this.state.selection.pageId === pageId && view.selectedIds().length > 0) {
      this.store.setState({ selection: EMPTY_SELECTION })
    }
    view.dispose()
  }

  viewOf(pageId: string): PageCanvas | undefined {
    const v = this.views.get(pageId)
    return v && !v.isDisposed() ? v : undefined
  }

  activeView(): PageCanvas | undefined {
    return this.viewOf(this.state.activePageId)
  }

  /** Resolves with the live canvas of a page, waiting for it to mount and load if necessary. */
  whenView(pageId: string): Promise<PageCanvas> {
    const v = this.viewOf(pageId)
    if (v && !this.state.loadingPages.includes(pageId)) return Promise.resolve(v)
    let d = this.waiting.get(pageId)
    if (!d) {
      d = defer()
      this.waiting.set(pageId, d)
    }
    return d.promise
  }

  layoutPage(pageId: string, zoom: number, win: CanvasWindow): void {
    this.viewOf(pageId)?.setLayout(zoom, win)
  }

  allViews(): PageCanvas[] {
    return [...this.views.values()].filter((v) => !v.isDisposed())
  }

  /* ----------------------------------------------------------------- commits */

  /** Serialises the page behind `pageId` into the document and records a history step. */
  commit(pageId: string, info: CommitInfo): void {
    if (this.disposed || this.readOnly) return
    const view = this.viewOf(pageId)
    const base = this.getPage(pageId)
    if (!view || !base) return
    if (view.hasPendingRemote) {
      // The canvas is still catching up with a change from elsewhere: reading it now would undo that change.
      void view.settled().then(() => this.commit(pageId, info))
      return
    }
    const shown = view.serialize(base)
    const next = view.reconcile(shown, base)
    if (next !== shown) {
      view.loadedPage = shown
      void view.syncRemote(next)
    }
    if (next === base) {
      this.refreshSelection()
      return
    }
    if (next === shown) view.loadedPage = next
    const prev = this.state.doc
    const doc = replacePage(prev, next)
    const selection = view.selectedIds()
    if (this.live) this.live.recordLocal(prev, doc, { ...info, activePageId: this.state.activePageId, selection })
    else this.history.push({ doc, activePageId: this.state.activePageId, selection }, info)
    this.store.setState({ doc })
    this.updateHistoryStatus()
    this.refreshSelection()
  }

  /** Commits the active page. */
  commitActive(info: CommitInfo): void {
    this.commit(this.state.activePageId, info)
  }

  private updateHistoryStatus(): void {
    const h = this.history
    this.store.setState({ history: this.live ? this.live.historyStatus() : { canUndo: h.canUndo, canRedo: h.canRedo, undoLabel: h.undoLabel, redoLabel: h.redoLabel } })
  }

  /** Ends the current run of coalesced edits, in whichever history is in use. */
  sealHistory(): void {
    this.history.seal()
    this.live?.seal()
  }

  /** The history status changed inside the live session (a step was added, undone or redone). */
  refreshHistoryStatus(): void {
    this.updateHistoryStatus()
  }

  async undo(): Promise<void> {
    if (this.readOnly) return
    if (this.live) {
      await this.live.undo()
      return
    }
    const label = this.history.undoLabel
    const s = this.history.undo()
    if (!s) return
    await this.restore(s)
    this.announce(t.announce.undone(label ?? ''))
  }

  async redo(): Promise<void> {
    if (this.readOnly) return
    if (this.live) {
      await this.live.redo()
      return
    }
    const label = this.history.redoLabel
    const s = this.history.redo()
    if (!s) return
    await this.restore(s)
    this.announce(t.announce.redone(label ?? ''))
  }

  private async restore(s: HistoryState): Promise<void> {
    const doc = s.doc
    const activePageId = doc.pages.some((p) => p.id === s.activePageId) ? s.activePageId : doc.pages[0].id
    this.store.setState({ doc, activePageId, docVersion: this.state.docVersion + 1 })
    this.updateHistoryStatus()
    const syncs: Promise<void>[] = []
    for (const [id, view] of this.views) {
      const page = doc.pages.find((p) => p.id === id)
      if (!page) continue
      const size = pageSize(doc, page)
      if (size.width !== view.pageSize.width || size.height !== view.pageSize.height) {
        syncs.push(view.resize(size, page).then(() => view.syncTo(page)))
      } else if (page !== view.loadedPage) syncs.push(view.syncTo(page))
    }
    await Promise.all(syncs)
    this.view.relayout()
    const view = this.viewOf(activePageId)
    if (view && s.selection.length > 0) {
      const objs = s.selection.map((id) => view.getById(id)).filter((o): o is FabricObject => !!o)
      view.selectObjects(objs)
    }
    this.refreshSelection()
  }

  /* --------------------------------------------------------------- selection */

  setActivePage(pageId: string): void {
    if (this.state.activePageId === pageId) return
    if (!this.getPage(pageId)) return
    for (const [id, v] of this.views) if (id !== pageId) v.clearSelection()
    this.store.setState({ activePageId: pageId, selection: EMPTY_SELECTION })
    this.sealHistory()
  }

  /** Selects objects (by id) on the active page. Nested children select their group. */
  select(ids: readonly string[], pageId: string = this.state.activePageId): void {
    const view = this.viewOf(pageId)
    if (!view) return
    if (pageId !== this.state.activePageId) this.setActivePage(pageId)
    const objs = ids.map((id) => view.getById(id)).filter((o): o is FabricObject => !!o)
    view.selectObjects(objs)
    this.refreshSelection()
  }

  clearSelection(): void {
    this.activeView()?.clearSelection()
    this.refreshSelection()
  }

  selectAll(): void {
    const view = this.activeView()
    if (!view) return
    const objs = view.canvas.getObjects().filter((o) => o.visible !== false && !o.excludeFromExport)
    view.selectObjects(objs)
    this.refreshSelection()
  }

  /** Live Fabric objects of the current selection. */
  selectedObjects(): FabricObject[] {
    return this.activeView()?.selectedObjects() ?? []
  }

  refreshSelection(): void {
    const pageId = this.state.activePageId
    const view = this.viewOf(pageId)
    const prev = this.state.selection
    const live = view?.selectedObjects() ?? []
    const objs = live.filter((o) => !asDory(o).isUi)
    if (!view || (objs.length === 0 && live.length > 0 && this.state.ui.cropping)) return
    if (!view || objs.length === 0) {
      if (prev.ids.length === 0 && !prev.editing) return
      this.store.setState({ selection: { ...EMPTY_SELECTION, pageId, version: prev.version + 1 } })
      return
    }
    const active = view.canvas.getActiveObject()
    const rect = active ? active.getBoundingRect() : null
    const single = objs.length === 1 ? objs[0] : null
    const textObj = single instanceof IText ? single : null
    const kinds = [...new Set(objs.map((o) => kindOfLive(o)))]
    const snapshot: SelectionState = {
      pageId,
      ids: objs.map((o) => asDory(o).id ?? ''),
      objects: objs.map((o) => serializeObject(o)),
      kinds,
      editing: !!textObj?.isEditing,
      textStyle: textObj ? currentTextStyle(textObj) : null,
      bounds: rect && active ? { x: rect.left, y: rect.top, width: active.getScaledWidth() - border(active), height: active.getScaledHeight() - border(active), angle: active.angle } : null,
      locked: objs.every((o) => asDory(o).locked === true),
      version: prev.version + 1,
    }
    this.store.setState({ selection: snapshot })
  }

  /* --------------------------------------------------------- host callbacks */

  onCommit(pageId: string, info: CommitInfo): void {
    this.commit(pageId, info)
  }

  onSelectionChange(pageId: string): void {
    const view = this.viewOf(pageId)
    if (!view) return
    if (view.selectedObjects().length > 0) {
      if (this.state.activePageId !== pageId) {
        this.setActivePage(pageId)
      }
      for (const [id, v] of this.views) if (id !== pageId) v.clearSelection()
      this.sealHistory()
    }
    this.refreshSelection()
    const n = this.state.selection.ids.length
    if (n > 1) this.announce(t.announce.selected(n))
  }

  onSelectionLive(pageId: string): void {
    if (pageId !== this.state.activePageId || this.liveRaf) return
    this.liveRaf = requestAnimationFrame(() => {
      this.liveRaf = 0
      this.refreshSelection()
    })
  }

  onPointerActivate(pageId: string): void {
    if (this.state.activePageId !== pageId) {
      this.setActivePage(pageId)
    }
    if (this.state.ui.contextMenu) this.store.setState((s) => ({ ui: { ...s.ui, contextMenu: null } }))
  }

  onTextCreate(pageId: string, rect: { x: number; y: number; width: number }): void {
    void this.insert.textAt(pageId, rect)
  }

  onContextMenu(pageId: string, clientX: number, clientY: number): void {
    this.refreshSelection()
    this.store.setState((s) => ({ ui: { ...s.ui, contextMenu: { x: clientX, y: clientY, pageId } } }))
  }

  onEditingChange(_pageId: string, _editing: boolean): void {
    this.refreshSelection()
  }

  onPlaceholderActivate(pageId: string, id: string): void {
    void this.insert.fillPlaceholder(pageId, id)
  }

  onImageGridCellActivate(pageId: string, gridId: string, gridCellId: string): void {
    void this.imageGrids.fillCell(pageId, gridId, gridCellId)
  }

  onImageGridCellSwap(pageId: string, gridId: string, fromCellId: string, toCellId: string): void {
    this.imageGrids.swapCells(pageId, gridId, fromCellId, toCellId)
  }

  onImageGridImageDrop(pageId: string, sourceId: string, gridId: string, gridCellId: string, sourceFrame: CanvasImageFrame): void {
    this.imageGrids.consumeCanvasImage(pageId, sourceId, gridId, gridCellId, sourceFrame)
  }

  onToolDone(): void {
    this.setTool('select')
  }

  onEditBlocked(pageId: string, id: string): void {
    this.editBlockedHandler?.(pageId, id)
  }

  /* ---------------------------------------------------------------------- ui */

  setTool(tool: ToolId): void {
    this.store.setState((s) => ({ ui: { ...s.ui, tool } }))
  }

  patchUi(patch: Partial<EditorState['ui']>): void {
    this.store.setState((s) => ({ ui: { ...s.ui, ...patch } }))
  }

  openDialog(id: string, props?: Record<string, unknown>): void {
    this.patchUi({ dialog: { id, props } })
  }

  closeDialog(): void {
    this.patchUi({ dialog: null })
  }

  private cursorFor(tool: ToolId): string {
    if (tool === 'hand') return 'grab'
    if (tool === 'text') return 'text'
    return 'default'
  }

  private syncUi(state: EditorState, prev: EditorState): void {
    const tool = state.ui.spaceDown ? 'hand' : state.ui.tool
    const prevTool = prev.ui.spaceDown ? 'hand' : prev.ui.tool
    if (tool !== prevTool) for (const v of this.allViews()) v.setCursor(this.cursorFor(tool))
    if (state.ui.grid !== prev.ui.grid || state.ui.bleed !== prev.ui.bleed || state.ui.safeZone !== prev.ui.safeZone || state.ui.guides !== prev.ui.guides || state.ui.rulers !== prev.ui.rulers) {
      for (const v of this.allViews()) v.invalidateOverlay()
    }
  }

  announce(message: string): void {
    this.store.setState({ announcement: message })
  }

  toast(message: string, tone: Toast['tone'] = 'info', action?: Toast['action']): void {
    const id = ++this.toastSeq
    this.store.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone, action }] }))
    setTimeout(() => this.dismissToast(id), tone === 'error' ? 7000 : 4000)
  }

  dismissToast(id: number): void {
    this.store.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
  }

  get designId(): string {
    return this.designIdValue
  }

  setDesignId(id: string): void {
    this.designIdValue = id
  }

  setTitle(title: string): void {
    const trimmed = title.trim() || t.untitled
    if (trimmed !== this.state.title) this.store.setState({ title: trimmed })
  }

  rememberColor(color: string): void {
    this.store.setState((s) => ({ recentColors: [color, ...s.recentColors.filter((c) => c !== color)].slice(0, 12) }))
  }

  rememberFont(family: string): void {
    this.store.setState((s) => ({ recentFonts: [family, ...s.recentFonts.filter((f) => f !== family)].slice(0, 8) }))
  }

  /** Lets the workspace register how to scroll/zoom (so the engine can drive viewport commands). */
  setViewportController(controller: ViewportController | null): void {
    this.view.setController(controller)
  }

  /* ------------------------------------------------------------------ helpers */

  private remeasureText(family: string): void {
    for (const view of this.allViews()) {
      let touched = false
      const visit = (o: FabricObject): void => {
        const maybe = o as FabricObject & { fontFamily?: unknown; initDimensions?: () => void; getObjects?: () => FabricObject[] }
        if (typeof maybe.fontFamily === 'string' && maybe.fontFamily.toLowerCase().includes(family.toLowerCase())) {
          maybe.initDimensions?.()
          o.setCoords()
          o.set('dirty', true)
          touched = true
        }
        maybe.getObjects?.().forEach(visit)
      }
      view.canvas.getObjects().forEach(visit)
      if (touched) view.canvas.requestRenderAll()
    }
  }

  /** Fetches the user's fonts up front and loads the design's text in them whenever the library changes. */
  private watchUserFonts(): () => void {
    let seen = this.userFonts.getSnapshot().families
    const off = this.userFonts.subscribe(() => {
      const families = this.userFonts.getSnapshot().families
      if (families === seen) return
      seen = families
      void this.fonts.ensure(usedFonts(this.state.doc))
    })
    void this.userFonts.ensureLoaded()
    return off
  }

  private watchTheme(): () => void {
    const update = (): void => {
      this.themeValue = readCanvasTheme()
      applyThemeDefaults(this.themeValue)
      for (const v of this.allViews()) v.setTheme(this.themeValue)
    }
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'data-contrast'] })
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    mq?.addEventListener('change', update)
    return () => {
      mo.disconnect()
      mq?.removeEventListener('change', update)
    }
  }

  /** Document objects of a page by id (no live canvas needed). */
  findDocObject(pageId: string, id: string): DocObject | undefined {
    return this.getPage(pageId)?.objects.find((o) => o.id === id)
  }

  pageIndex(pageId: string): number {
    return findPageIndex(this.state.doc, pageId)
  }

  private running = false

  /** Begins listening (theme, font loads, store → preferences). Safe to call again after `stop()`. */
  start(): void {
    if (this.running || this.disposed) return
    this.running = true
    this.disposers.push(this.watchTheme())
    this.disposers.push(this.fonts.onLoaded((family) => this.remeasureText(family)))
    this.disposers.push(this.watchUserFonts())
    this.disposers.push(
      this.store.subscribe((state, prev) => {
        if (state.ui !== prev.ui) this.syncUi(state, prev)
        if (state.ui.panelId !== prev.ui.panelId || state.ui.rulers !== prev.ui.rulers || state.ui.grid !== prev.ui.grid || state.ui.guides !== prev.ui.guides || state.ui.snapping !== prev.ui.snapping || state.ui.bleed !== prev.ui.bleed || state.ui.safeZone !== prev.ui.safeZone || state.recentColors !== prev.recentColors || state.recentFonts !== prev.recentFonts) {
          writePrefs(state)
        }
      }),
    )
  }

  get isRunning(): boolean {
    return this.running
  }

  /** Stops listeners and autosave; the engine can be started again (React StrictMode re-mounts). */
  stop(): void {
    if (!this.running) return
    this.running = false
    this.persistence.dispose()
    for (const off of this.disposers) off()
    this.disposers = []
    if (this.liveRaf) cancelAnimationFrame(this.liveRaf)
    this.liveRaf = 0
  }

  /** Final teardown: stops everything and releases canvases and snapshots. */
  dispose(): void {
    if (this.disposed) return
    this.stop()
    this.disposed = true
    this.unsubscribePresets()
    for (const v of this.views.values()) v.dispose()
    this.views.clear()
    this.snapshots.dispose()
  }
}
