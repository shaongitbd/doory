/**
 * The only seam between the app shell and the editor.
 * The editor never touches routing, auth or HTTP directly — everything goes through an EditorAdapter.
 */
import type { ReactNode } from 'react'
import type {
  AiTaskOptions,
  Asset,
  AssetQuery,
  AssetStatus,
  BrandKit,
  BulkFillInput,
  BulkFillResult,
  CommentInput,
  CommentMove,
  CommentT,
  ElementItem,
  ElementPack,
  ElementQuery,
  FontFamily,
  FontQuery,
  Page,
  PdfFontFile,
  ShareLink,
  ShareLinkInput,
  ShareRole,
  StockPage,
  AudioStockInfo,
  SoundCredit,
  StockSoundPage,
  StockPhoto,
  StockProviders,
  TemplateCategory,
  TemplateDetail,
  TemplateField,
  TemplateQuery,
  TemplateSummary,
  UserFontUploadInput,
  UserFontUploadOptions,
  VersionSummary,
  StockVideo,
  StockVideoPage,
  VideoFilmstrip,
  VideoInfo,
  VideoLength,
  VideoOrientation,
} from './api'
import type { DoryDocument } from './document'

export interface AudioStockQuery {
  type?: string
  subcategory?: string
  length?: string
  sort?: string
  page?: number
}

export type EditorMode = 'guest' | 'account' | 'shared-view' | 'shared-comment' | 'shared-edit'

export interface EditorMeta {
  /** Server design id (account / shared modes) or local id (guest mode). */
  id: string
  title: string
  mode: EditorMode
  /** Server revision the document was loaded at (account / shared-edit). */
  revision?: number
}

/** Durable reference to an uploaded image or audio file. `url` may be `idb://<uuid>` in guest mode (audio has no thumbnail and a size of 0 x 0). */
export interface AssetRef {
  id: string
  url: string
  thumbUrl: string
  width: number
  height: number
  name: string
  kind: 'image' | 'svg' | 'audio' | 'video'
  /** Video clips only. */
  video?: VideoAssetInfo
}

/** What the editor knows of a video clip asset: enough to place it, play it and draw it on the timeline. */
export interface VideoAssetInfo {
  status: AssetStatus
  /** Why the conversion failed (`status: 'failed'`). */
  error: string
  /** The still: what the clip object shows wherever it can't play (its `src`). */
  posterUrl: string
  /** The clip's sound on its own; empty for a silent clip. */
  audioUrl: string
  durationMs: number
  fps: number
  filmstrip: VideoFilmstrip | null
}

export interface SaveInput {
  document: DoryDocument
  title: string
  /** WebP/PNG thumbnail of the first page (~480px). */
  thumbnail?: Blob
}
export interface SaveResult {
  savedAt: number
  revision?: number
}

export type AccountReason = 'save' | 'share' | 'brand-kit' | 'version-history' | 'comment' | 'video'

export type SaveState =
  | { status: 'idle' }
  | { status: 'dirty' }
  | { status: 'saving' }
  | { status: 'saved'; savedAt: number }
  | { status: 'local'; savedAt: number } // guest: stored in this browser only
  | { status: 'conflict' }
  | { status: 'error'; message: string }

/** Fields of a share link the owner can change after creating it (`password: null` removes the password). */
export interface ShareLinkPatch {
  role?: ShareRole
  is_active?: boolean
  expires_at?: string | null
  password?: string | null
}

/** The signed-in user's own font library: families they uploaded (`GET/POST /fonts/mine/`, `DELETE /fonts/mine/{id}/`). */
export interface UserFontsService {
  list(): Promise<FontFamily[]>
  /** Rejects with the server's `ApiError` (`variant_exists`, `font_name_taken`, `font_limit_reached`, `font_storage_limit`, validation). */
  upload(input: UserFontUploadInput, options?: UserFontUploadOptions): Promise<FontFamily>
  remove(id: string): Promise<void>
}

/**
 * Remote AI image tasks (`background-removal` first). Signed-in users only; without it the editor offers the
 * in-browser model alone.
 */
export interface AiService {
  /** The options this user may pick for `task` and the one to start with. */
  options(task: string): Promise<AiTaskOptions>
  /**
   * Runs `task` with the server option `model` on an image and resolves with the new asset. `assetId` is the
   * image's asset when it has one; otherwise (or when it is not this user's) `image` is uploaded first.
   * Rejects with the server's `ApiError` (`ai_timeout`, `ai_quota`, …).
   */
  run(task: string, input: { model: string; image: Blob | (() => Promise<Blob>); assetId?: string; signal?: AbortSignal }): Promise<AssetRef>
  /** The option this user last picked for `task`, if any. */
  remembered(task: string): string | null
  remember(task: string, option: string): void
  /** The operator's wording of the notice for options that send the image away; empty: the editor's own. */
  offsiteNotice?: string
}

/** The person looking at the comments: `owner` is true for the design's owner, who may delete and move every comment. */
export interface CommentViewer {
  id: string
  owner: boolean
}

export interface EditorServices {
  fonts: {
    list(q: FontQuery): Promise<Page<FontFamily>>
    /** The user's uploaded fonts; `null` or absent for guests and shared-link visitors, who cannot upload. */
    mine?: UserFontsService | null
    /** Uploaded families that came with a shared design (the owner's, for the families its text uses); read-only. */
    provided?: readonly FontFamily[]
  }
  elements: {
    packs(): Promise<ElementPack[]>
    list(q: ElementQuery): Promise<Page<ElementItem>>
  }
  templates: {
    categories(): Promise<TemplateCategory[]>
    list(q: TemplateQuery): Promise<Page<TemplateSummary>>
    get(slug: string): Promise<TemplateDetail>
  }
  assets: {
    list(q: AssetQuery): Promise<Page<Asset>>
    remove(id: string): Promise<void>
  }
  /** null when unavailable (e.g. guests). The editor then shows a "sign up to use this" prompt. */
  brand: { list(): Promise<BrandKit[]>; save(kit: BrandKit): Promise<BrandKit> } | null
  stock: {
    providers(): Promise<StockProviders>
    /** `page` is a page number, or the cursor an `all` search returned; `provider` is a name or `all`. */
    search(q: string, page: number | string, provider?: string): Promise<StockPage>
    importPhoto(photo: StockPhoto): Promise<AssetRef>
  } | null
  /** Remote AI image tasks; `null` or absent: only the in-browser model (guests, shared links). */
  ai?: AiService | null
  /**
   * Video clips: uploads and stock videos, converted on the server. Optional: absent or null (guests, shared links,
   * adapters without it) turns the Videos tool into a sign-up prompt, and so does `info()` answering `enabled: false`.
   */
  video?: VideoService | null
  /**
   * Freesound sounds for the Audio tool, through the server. Optional: absent or null (guests, adapters without it)
   * hides the Freesound tab, and so does `info()` answering `configured: false`.
   */
  audioStock?: {
    info(): Promise<AudioStockInfo>
    search(q: string, options: AudioStockQuery): Promise<StockSoundPage>
    previewUrl(id: string): string
    importSound(id: string): Promise<{ ref: AssetRef; credit: SoundCredit | null; durationMs: number | null }>
  } | null
  versions: {
    list(): Promise<VersionSummary[]>
    create(label: string): Promise<VersionSummary>
    restore(id: string): Promise<DoryDocument>
  } | null
  /**
   * Share links of this design (owner only). Optional: an adapter without it (shared-link viewers, a shell that has
   * not wired it) hides the Share button for signed-in users; guests are asked to sign up instead.
   */
  sharing?: {
    list(): Promise<ShareLink[]>
    create(input: ShareLinkInput): Promise<ShareLink>
    update(id: string, patch: ShareLinkPatch): Promise<ShareLink>
    revoke(id: string): Promise<void>
  } | null
  /**
   * Review comments of this design, newest last. Optional like `sharing`; `null` or absent hides the Comments tool for
   * signed-in users (guests and comment-link visitors are asked to sign up). `resolve` is only offered by adapters whose
   * user may use it (the owner); `remove` and `move` are offered to everyone who may comment and the server lets an
   * author act on their own comments only (the owner on all of them). The editor hides what the viewer may not do.
   */
  comments?: {
    list(): Promise<CommentT[]>
    create(input: CommentInput): Promise<CommentT>
    resolve?(id: string, resolved: boolean): Promise<CommentT>
    remove?(id: string): Promise<void>
    /** Moves a thread's pin (its replies follow). */
    move?(id: string, to: CommentMove): Promise<CommentT>
    /** Who is looking, to tell their comments from the others'. `null`: not signed in. Absent: treated as the owner. */
    viewer?(): Promise<CommentViewer | null>
  } | null
  /** Bulk create from this design's template fields (signed-in owner only); `null` or absent hides it. */
  bulkFill?: {
    /** The fields as saved (the editor's changes are saved first). */
    fields(): Promise<TemplateField[]>
    /** A new folder for the created designs. */
    createFolder(name: string): Promise<{ id: string; name: string }>
    /** Remove a created empty folder if creation fails. */
    removeFolder?(id: string): Promise<void>
    run(input: BulkFillInput): Promise<BulkFillResult>
  } | null
}

/**
 * How the editor joins the live room of a design. Offered by the account and edit-link adapters when
 * the server has real-time editing; everyone in a room is signed in, so guests never get one.
 */
export interface RealtimeConnection {
  /** Absolute `ws://` or `wss://` address of the design's room. */
  url: string
  /** Share-link credentials, sent in the first frame; absent for the owner. */
  auth?: { token: string; password?: string }
  /** Renames the design without touching its document; `null` when this user may not rename it. */
  setTitle: ((title: string) => Promise<void>) | null
  /** The room needs a session. Resolves `true` once the user is signed in again (the shell shows its sign-in flow). */
  requireSignIn(): Promise<boolean>
  /** A cheap authenticated request that repairs a stale session; resolves `true` when the user is still signed in. */
  refreshSession?(): Promise<boolean>
  /** The server saved the design at this revision; keeps REST saves (the fallback) in step. */
  onRevision?(revision: number): void
  /** Stores the first page's thumbnail of the design (owner only; the room does not draw one). */
  uploadThumbnail?(image: Blob): Promise<void>
  /** Set by the editor while a room is connected: stores the live state in the design and resolves once it is stored. */
  flushRef: { current: (() => Promise<void>) | null }
  /**
   * Opens the room's connection ahead of the editor: the shell calls `start()` while the design and the editor are still
   * loading, so the server's copy is on its way by the time the editor mounts, which adopts it from `room`. `release()`
   * closes it again if the editor never did.
   */
  early: { room: { close(): void } | null; start(): void; release(): void }
}

export interface EditorAdapter {
  save(input: SaveInput): Promise<SaveResult>
  /**
   * Guest pressed Save / Share / etc. Resolve `true` once the user is signed in AND the design now lives
   * in their account (the shell then navigates to /design/:id). `getSnapshot` returns the freshest state.
   */
  requireAccount(reason: AccountReason, getSnapshot: () => Promise<SaveInput>): Promise<boolean>
  uploadAsset(file: File | Blob, opts?: { name?: string }): Promise<AssetRef>
  /** Turn a stored `src` (`idb://…`, `/media/…`, `https://…`) into a URL Fabric can load. */
  resolveSrc(src: string): Promise<string>
  services: EditorServices
  /** The design's live room; absent or `null` when real-time editing is not available (the editor saves over REST). */
  realtime?: RealtimeConnection | null
  /** The instance's default export file names (the download dialog starts there until the user picks). Simple without it. */
  exportFilenames?: { style: 'simple' | 'structured'; timestamp: boolean }
  /** Server-side vector PDF (account only). Absent → editor falls back to client-side PDF. */
  exportPdf?: (input: {
    /** One SVG document per page. Raster images are embedded as `data:` URIs (the server strips every other `href`). */
    svgPages: string[]
    /** The size of the first page in px (what a server without `sizes` uses for every page). */
    width: number
    height: number
    /** Size of each page in px, same length and order as `svgPages`: a design may mix page sizes. */
    sizes?: { width: number; height: number }[]
    bleedMm?: number
    cropMarks?: boolean
    title?: string
    /** Language of the document (BCP 47), written into the PDF; the server assumes English without it. */
    lang?: string
    /** The same-origin `/media/…` font files the pages use (family, weight, style); the server embeds them itself. */
    fonts?: PdfFontFile[]
    /** Aborting it cancels the request. */
    signal?: AbortSignal
    /** Called while the request body goes out (0..1). */
    onUploadProgress?: (fraction: number) => void
  }) => Promise<Blob>
  /** What the server converts and optimizes downloads into (`/config/` `features.image_optimize`). Absent: browser only. */
  imageOptimize?: ImageOptimizeInfo
  /** Converts a page the browser drew (PNG) to `format` and optimizes it on the server. Present with `imageOptimize`. */
  optimizeImage?: (input: OptimizeImageInput) => Promise<OptimizedImage>
}

export type OptimizeFormat = 'png' | 'jpg' | 'webp' | 'avif'

export interface ImageOptimizerInfo {
  id: string
  name: string
  /** The formats it makes smaller; the others pass through as the conversion made them. */
  formats: OptimizeFormat[]
  /** The image leaves the server for an outside service. */
  sendsOffsite: boolean
}

export interface ImageOptimizeInfo {
  /** What the server converts a PNG to (AVIF only where the server has it). */
  formats: OptimizeFormat[]
  /** In the admin's order; may be empty (conversion only). */
  optimizers: ImageOptimizerInfo[]
  default: string | null
}

export interface OptimizeImageInput {
  /** The page as the browser drew it, as a PNG. */
  file: Blob
  format: OptimizeFormat
  /** 1..100. */
  quality?: number
  maxBytes?: number
  pngColors?: 'full' | number
  transparent?: boolean
  stripMetadata?: boolean
  progressive?: boolean
  /** An optimizer id, `true` for the instance's default, `false` to convert only. */
  optimize: boolean | string
  signal?: AbortSignal
}

export interface OptimizedImage {
  blob: Blob
  format: OptimizeFormat
  width: number
  height: number
  /** The quality used, after a `maxBytes` search (lossy formats). */
  quality: number | null
  /** The converted file's size before optimizing. */
  bytesBefore: number
  /** The optimizer asked ('' for none) and whether its smaller file was kept. */
  optimizer: string
  optimized: boolean
  warnings: string[]
}

export interface EditorHandle {
  saveNow(): Promise<void>
  getDocument(): DoryDocument
  isDirty(): boolean
}

export interface EditorAppProps {
  document: DoryDocument
  meta: EditorMeta
  adapter: EditorAdapter
  onTitleChange?: (title: string) => void
  onSaveStateChange?: (state: SaveState) => void
  /**
   * The user's choice after a save was rejected with a `RevisionConflictError`: load the latest server
   * version (`reload`) or keep the local edits and store them as a new design (`save-as-copy`). The shell
   * decides what that means; without this callback the banner only offers "Dismiss".
   */
  onConflictResolve?: (choice: 'reload' | 'save-as-copy') => void
  /** Slots in the editor's top bar. */
  topBarStart?: ReactNode
  topBarEnd?: ReactNode
}

export interface VideoUploadOptions {
  signal?: AbortSignal
  /** Called while the file goes up (0..1). */
  onProgress?: (fraction: number) => void
}

export interface VideoService {
  info(): Promise<VideoInfo>
  /** The user's clips, newest first. */
  list(page: number): Promise<Page<AssetRef>>
  /** One clip again: how the editor follows a clip the server is still converting. */
  get(id: string): Promise<AssetRef>
  upload(file: File, options?: VideoUploadOptions): Promise<AssetRef>
  /** `page` is a page number, or the cursor an `all` search returned; `provider` is a name or `all`. */
  search(q: string, page: number | string, options: { provider?: string; orientation?: VideoOrientation; length?: VideoLength; signal?: AbortSignal }): Promise<StockVideoPage>
  importVideo(video: StockVideo): Promise<AssetRef>
}
