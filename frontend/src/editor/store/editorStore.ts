/**
 * Editor state (Zustand, one store per editor instance — never a module singleton, so several editors
 * and unit tests can coexist). The *document* lives here as an immutable `DoryDocument`; Fabric canvases
 * are views that commit back into it (see engine/editor.ts).
 */
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AssetRef, EditorMode, SaveState } from '@/types/adapter'
import type { DocObject, DoryDocument } from '@/types/document'
import type { ToolId } from '../engine/pageCanvas'
import type { ZoomMode } from '../engine/zoom'

export interface SelectionBounds {
  x: number
  y: number
  width: number
  height: number
  angle: number
}

export interface SelectionState {
  pageId: string | null
  ids: string[]
  /** Serialised snapshots of the selected objects (read-only copies for inspectors). */
  objects: DocObject[]
  /** Distinct object kinds in the selection (see engine/objects/kinds.ts). */
  kinds: string[]
  /** True while a text object is in edit mode. */
  editing: boolean
  /** Effective character style at the caret / selection while editing text. */
  textStyle: Record<string, unknown> | null
  bounds: SelectionBounds | null
  /** True when every selected object is locked. */
  locked: boolean
  /** Bumped on every refresh so memoised readers can re-evaluate. */
  version: number
}

export const EMPTY_SELECTION: SelectionState = {
  pageId: null,
  ids: [],
  objects: [],
  kinds: [],
  editing: false,
  textStyle: null,
  bounds: null,
  locked: false,
  version: 0,
}

export interface HistoryStatus {
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
}

export type DialogId = 'shortcuts' | 'resize' | 'download' | 'rename' | 'background-removal' | 'upscale' | (string & {})

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'success' | 'error'
  action?: { label: string; run: () => void }
}

export interface ContextMenuState {
  x: number
  y: number
  pageId: string
}

export interface CropState {
  pageId: string
  id: string
}

export interface UiState {
  /** Open left panel id, or null when collapsed. */
  panelId: string | null
  tool: ToolId
  rulers: boolean
  grid: boolean
  /** Smart guides (alignment lines while dragging). */
  guides: boolean
  snapping: boolean
  bleed: boolean
  /** Safe-zone guides of the design's size preset (a platform's overlays), where it has some. */
  safeZone: boolean
  dialog: { id: DialogId; props?: Record<string, unknown> } | null
  contextMenu: ContextMenuState | null
  cropping: CropState | null
  /** Space bar held: temporary hand tool. */
  spaceDown: boolean
  /** True below the desktop breakpoint: panels render as a bottom sheet. */
  compact: boolean
}

/** A comment being written at a spot of a page, not sent yet. `x` and `y` are in that page's own pixels. */
export interface CommentDraft {
  pageId: string
  x: number
  y: number
  body: string
}

/** Which comments the sidebar and the pins show. */
export type CommentFilterId = 'all' | 'unresolved' | 'mine'

/** The state of the comment pins on the artboard; the comments themselves live in the comments controller (panels/commentsController.ts). */
export interface CommentsUiState {
  /** Comment mode: a click on a page starts a comment at that spot. */
  mode: boolean
  /** The pins are drawn on the pages. True while the Comments sidebar is open; on small screens it stays on after the sheet is closed, until switched off in it. */
  pins: boolean
  filter: CommentFilterId
  /** The thread whose card is open next to its pin. */
  activeThreadId: string | null
  draft: CommentDraft | null
  /** "Show me this thread": its pin scrolls into view and pulses once; `focus` also moves the keyboard focus to it. `nonce` makes a repeated request count. */
  reveal: { id: string; nonce: number; focus: boolean } | null
}

export const COMMENTS_UI_DEFAULT: CommentsUiState = { mode: false, pins: false, filter: 'all', activeThreadId: null, draft: null, reveal: null }

export interface EditorState {
  doc: DoryDocument
  title: string
  mode: EditorMode
  readOnly: boolean
  activePageId: string
  selection: SelectionState
  zoom: number
  zoomMode: ZoomMode
  history: HistoryStatus
  save: SaveState
  /** Set after a save was rejected with a revision conflict. */
  conflict: boolean
  ui: UiState
  recentColors: string[]
  recentFonts: string[]
  /** Images uploaded in this session (newest first), shown in the Uploads panel. */
  uploads: AssetRef[]
  /** Uploads in flight. */
  uploading: number
  toasts: Toast[]
  /** Text for the polite live region (screen reader announcements). */
  announcement: string
  /** Page ids whose live canvas is still loading (skeleton shown). */
  loadingPages: string[]
  /** Bumped when the document structure changes outside normal commits (undo/redo/restore). */
  docVersion: number
  comments: CommentsUiState
}

const PREFS_KEY = 'doory.editor.prefs.v1'

interface StoredPrefs {
  rulers?: boolean
  grid?: boolean
  guides?: boolean
  snapping?: boolean
  bleed?: boolean
  safeZone?: boolean
  panelId?: string | null
  recentColors?: string[]
  recentFonts?: string[]
}

function readPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as StoredPrefs) : {}
  } catch {
    return {}
  }
}

export function writePrefs(state: EditorState): void {
  try {
    const prefs: StoredPrefs = {
      rulers: state.ui.rulers,
      grid: state.ui.grid,
      guides: state.ui.guides,
      snapping: state.ui.snapping,
      bleed: state.ui.bleed,
      safeZone: state.ui.safeZone,
      panelId: state.ui.panelId,
      recentColors: state.recentColors,
      recentFonts: state.recentFonts,
    }
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable (private mode, quota): preferences just do not persist */
  }
}

export interface StoreInit {
  doc: DoryDocument
  title: string
  mode: EditorMode
  /** Skip reading/writing stored viewer preferences (tests). */
  ephemeral?: boolean
}

export function isReadOnlyMode(mode: EditorMode): boolean {
  return mode === 'shared-view' || mode === 'shared-comment'
}

export type EditorStore = StoreApi<EditorState>

export function createEditorStore(init: StoreInit): EditorStore {
  const prefs = init.ephemeral ? {} : readPrefs()
  const readOnly = isReadOnlyMode(init.mode)
  return createStore<EditorState>(() => ({
    doc: init.doc,
    title: init.title,
    mode: init.mode,
    readOnly,
    activePageId: init.doc.pages[0].id,
    selection: EMPTY_SELECTION,
    zoom: 1,
    zoomMode: 'fit-page',
    history: { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },
    save: { status: 'idle' },
    conflict: false,
    ui: {
      panelId: readOnly ? null : (prefs.panelId === undefined ? 'design' : prefs.panelId),
      tool: 'select',
      rulers: prefs.rulers ?? false,
      grid: prefs.grid ?? false,
      guides: prefs.guides ?? true,
      snapping: prefs.snapping ?? true,
      bleed: prefs.bleed ?? false,
      safeZone: prefs.safeZone ?? true,
      dialog: null,
      contextMenu: null,
      cropping: null,
      spaceDown: false,
      compact: false,
    },
    recentColors: prefs.recentColors ?? [],
    recentFonts: prefs.recentFonts ?? [],
    uploads: [],
    uploading: 0,
    toasts: [],
    announcement: '',
    loadingPages: [],
    docVersion: 0,
    comments: COMMENTS_UI_DEFAULT,
  }))
}
