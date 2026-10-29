/** Types of the HTTP API (the serializers of the backend apps). Keep both in sync. */
import type { DoryDocument } from './document'

export interface Page<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    fields?: Record<string, string[] | string>
    /** Machine-readable codes per field (e.g. `password_too_common`). */
    field_codes?: Record<string, string[] | string>
    /** Seconds to wait before retrying (429 responses). */
    retry_after?: number
  }
}

/** A segmentation model the browser may download from this origin. */
export interface BackgroundRemovalModel {
  id: string
  name: string
  /** Same-origin URL; the file name carries the start of the hash, so it can be cached forever. */
  url: string
  bytes: number
  sha256: string
  input: { name: string; size: number; mean: [number, number, number]; std: [number, number, number]; rescale: 'max' | '255' }
  output: string
}

export interface AppConfig {
  google_client_id: string
  /** Text of the single sign-on button; absent on servers that predate it. */
  oidc_button_label?: string
  /** Name of the button's logo in `src/assets/sso-icons/`; "" or absent: a key icon. */
  oidc_button_icon?: string
  /** `background_removal` (and `ai_providers`, …) are absent on servers that predate them. */
  features: {
    stock_photos: boolean
    server_pdf: boolean
    google_login: boolean
    oidc_login?: boolean
    email_verification: boolean
    background_removal?: boolean
    realtime?: boolean
    mcp?: boolean
    ai_providers?: boolean
    /** Converting and optimizing downloads on the server; absent on servers that predate it. */
    image_optimize?: ImageOptimizeConfig | null
  }
  limits: { max_upload_bytes: number; max_pages: number; max_document_bytes: number; realtime_max_participants?: number; bulk_fill_max_rows?: number }
  /** Files the browser downloads at run time; absent on servers that predate it. */
  assets?: { background_removal_model: BackgroundRemovalModel | null }
  /** The instance's default export file names; absent on servers that predate them (simple, no timestamp). */
  exports?: { filename_style: 'simple' | 'structured'; filename_timestamp: boolean }
  /** Remote AI image providers; absent on servers that predate them. */
  ai?: AiConfig
}

/** `features.image_optimize` as `/config/` writes it. */
export interface ImageOptimizeConfig {
  formats: string[]
  optimizers: { id: string; name: string; formats: string[]; sends_offsite: boolean }[]
  default: string | null
}

/** Who may add their own AI servers in Settings (`staff`: staff accounts only). */
export type AiUserProviders = 'off' | 'staff' | 'everyone'

/** The `ai` part of `/config/`: per task, the options every signed-in user has and the one to start with. */
export interface AiConfig {
  user_providers: AiUserProviders
  /** The operator's wording of the notice under options that send the image away; empty: the editor's own. */
  offsite_notice?: string
  background_removal?: AiTaskOptions
  /** Absent on servers that predate the upscale task. */
  upscale?: AiTaskOptions
}

export interface AiTaskOptions {
  /** The option to start with; `null` when there is none. */
  default: string | null
  models: AiOption[]
}

/** One option a user may pick for an AI task (`GET /ai/models/`): the browser model, or a server's model. */
export interface AiOption {
  /** `device`, or `<provider id>:<model name>`. */
  id: string
  label: string
  task: string
  kind: 'device' | 'server'
  provider_name: string
  owner: 'device' | 'operator' | 'user'
  /** The image leaves this installation. */
  sends_offsite: boolean
}

export interface ApiUser {
  id: string
  email: string
  display_name: string
  name: string
  avatar_url: string | null
  is_email_verified: boolean
  has_password: boolean
  google_linked: boolean
  oidc_linked: boolean
  created_at: string
}

export interface DesignSummary {
  id: string
  title: string
  width: number
  height: number
  preset: string
  page_count: number
  thumbnail_url: string | null
  folder: string | null
  starred: boolean
  revision: number
  created_at: string
  updated_at: string
  trashed_at: string | null
}
export interface Design extends DesignSummary {
  document: DoryDocument
}
export interface DesignQuery {
  q?: string
  folder?: string | 'root'
  starred?: boolean
  trashed?: boolean
  ordering?: '-updated_at' | 'updated_at' | 'title' | '-title' | '-created_at'
  page?: number
  page_size?: number
}
export interface DesignCreateInput {
  title?: string
  width?: number
  height?: number
  preset?: string
  document?: DoryDocument
  folder?: string | null
  template?: string
}
export interface DesignPatchInput {
  title?: string
  document?: DoryDocument
  base_revision?: number
  folder?: string | null
  starred?: boolean
}
export type BulkAction = 'trash' | 'restore' | 'delete' | 'star' | 'unstar' | 'move'

export interface VersionSummary {
  id: string
  label: string
  is_auto: boolean
  page_count: number
  thumbnail_url: string | null
  created_at: string
}
export interface VersionDetail extends VersionSummary {
  document: DoryDocument
}

export interface FolderT {
  id: string
  name: string
  parent: string | null
  design_count: number
  created_at: string
}

export type AssetKind = 'image' | 'svg' | 'audio' | 'video'
export interface Asset {
  id: string
  kind: AssetKind
  name: string
  url: string
  thumb_url: string
  width: number
  height: number
  size: number
  mime: string
  tags: string[]
  /** Credit for imported stock photos; null for the user's own uploads. */
  attribution: { provider: string; author: string; author_url: string; source_url: string } | null
  /** Length of an audio file when the container says, or of a video clip (null for images and for audio that does not say). */
  duration_ms?: number | null
  /** `processing` while the server converts a video clip; `failed` (with `error`) when that went wrong. Else `ready`. */
  status?: AssetStatus
  error?: string
  /** Video only: the still every surface that can't play the clip shows. Empty for other kinds. */
  poster_url?: string
  /** Video only: the clip's sound as a file of its own (empty for a silent clip). */
  audio_url?: string
  /** Video only (null for other kinds). */
  video?: AssetVideo | null
  created_at: string
}

export type AssetStatus = 'ready' | 'processing' | 'failed'

/** A strip of frames from a clip, side by side in one image, for the timeline. */
export interface VideoFilmstrip {
  url: string
  frames: number
  interval_ms: number
  tile_width: number
  tile_height: number
}

export interface AssetVideo {
  fps: number
  has_audio: boolean
  filmstrip: VideoFilmstrip | null
}

export interface StockVideo {
  id: string
  provider: string
  /** A still, for the grid. */
  thumb_url: string
  /** A small rendition from the provider's CDN that plays while the pointer rests on the result. */
  preview_url: string
  width: number
  height: number
  duration_ms: number
  author: string
  author_url: string
  source_url: string
}

export interface StockVideoPage extends Omit<StockPage, 'results'> {
  results: StockVideo[]
}

export type VideoOrientation = 'landscape' | 'portrait' | 'square'
export type VideoLength = 'short' | 'medium' | 'long'

/** Whether the server takes clips at all (it needs ffmpeg), its limits, and the stock video providers. */
export interface VideoInfo extends StockProviders {
  enabled: boolean
  max_upload_bytes: number
  max_duration_ms: number
}

export interface StockPhoto {
  id: string
  provider: string
  thumb_url: string
  preview_url: string
  width: number
  height: number
  author: string
  author_url: string
  source_url: string
}
/** A provider the "All" search left out of this page, and why. */
export interface StockSkipped {
  provider: string
  reason: 'busy' | 'unavailable' | 'timeout'
  retry_after: number | null
}
export interface StockPage {
  configured: boolean
  /** A provider name, or `all`. */
  provider: string
  total: number
  /** A page number for one provider; an opaque cursor for `all`. */
  next_page: number | string | null
  results: StockPhoto[]
  /** The provider failed or was busy, so an older copy of these results is shown. */
  stale?: boolean
  skipped?: StockSkipped[]
}
export interface StockProviderInfo {
  name: string
  label: string
  /** The credit line the provider asks for, e.g. "Photos provided by Pexels". */
  attribution: string
  url: string
}
/** What the Audio tool's Freesound tab needs; `configured: false` hides the tab. */
export type AudioStockInfo =
  | { configured: false }
  | {
      configured: true
      provider: string
      label: string
      url: string
      /** Licences sounds may have: `cc0`, and `by` when the server also allows CC BY. */
      licenses: string[]
      /** Freesound subcategories per type (music, effects, ambience). */
      types: Record<string, string[]>
      lengths: string[]
      sorts: string[]
    }

/** Where a sound came from and how it must be credited (CC BY) or may be (CC0). */
export interface SoundCredit {
  source: string
  id: string
  title: string
  author: string
  author_url?: string
  url: string
  license: string
  license_url?: string
  required: boolean
}

export interface StockSound {
  id: string
  provider: string
  title: string
  author: string
  author_url: string
  source_url: string
  duration_ms: number
  type: 'music' | 'effects' | 'ambience' | 'other'
  subcategory: string
  license: string
  license_url: string
  credit_required: boolean
  tags: string[]
}

export interface StockSoundPage {
  configured: boolean
  total: number
  next_page: number | null
  results: StockSound[]
  stale?: boolean
}

export interface StockProviders {
  providers: StockProviderInfo[]
  /** The providers the "All" tab searches; empty when there is no "All" tab. */
  all: string[]
  /** `all` or a provider name. */
  default: string
}

export interface BrandColor {
  id: string
  name: string
  hex: string
}
export interface BrandFont {
  role: 'heading' | 'subheading' | 'body'
  family: string
}
export interface BrandKit {
  id: string
  name: string
  is_default: boolean
  colors: BrandColor[]
  fonts: BrandFont[]
  logos: Asset[]
  created_at: string
  updated_at: string
}
export interface BrandKitInput {
  name: string
  is_default?: boolean
  colors: BrandColor[]
  fonts: BrandFont[]
  logo_ids: string[]
}

export interface TemplateCategory {
  id: string
  slug: string
  name: string
  icon: string
  template_count: number
  sort_order: number
}
export interface TemplateSummary {
  id: string
  slug: string
  title: string
  category: { id: string; slug: string; name: string } | null
  tags: string[]
  width: number
  height: number
  orientation: 'landscape' | 'portrait' | 'square'
  preset: string
  page_count: number
  thumbnail_url: string | null
  is_featured: boolean
  use_count: number
  created_at: string
}
export interface TemplateDetail extends TemplateSummary {
  description: string
  document: DoryDocument
}
export interface TemplateQuery {
  category?: string
  q?: string
  orientation?: 'landscape' | 'portrait' | 'square'
  preset?: string
  featured?: boolean
  ordering?: 'use_count' | '-use_count' | 'created_at' | '-created_at' | 'title' | '-title'
  page?: number
  page_size?: number
}

export type ElementKind = 'shape' | 'line' | 'icon' | 'sticker' | 'illustration' | 'frame' | 'graphic'
/** How an icon is drawn; blank where the distinction does not apply (shapes, charts, …). */
export type ElementStyle = '' | 'outline' | 'filled' | 'duotone' | 'colour'
export interface ElementPack {
  id: string
  slug: string
  name: string
  kind: ElementKind
  thumbnail_url: string | null
  element_count: number
  /** SPDX expression, e.g. `CC0-1.0` or `MIT`. */
  license: string
  /** The licence text; empty when the pack has none to point to. */
  license_url: string
  /** The copyright notice the licence asks to keep with the artwork; empty for CC0. Show it wherever the pack is credited. */
  attribution: string
  /** Where the artwork comes from; empty when unknown. */
  source_url: string
}
export interface ElementItem {
  id: string
  name: string
  kind: ElementKind
  style: ElementStyle
  pack: { id: string; slug: string; name: string }
  tags: string[]
  svg_url: string
  width: number
  height: number
  colors: string[]
  is_recolorable: boolean
}
export interface ElementQuery {
  pack?: string
  kind?: ElementKind
  style?: Exclude<ElementStyle, ''>
  q?: string
  /** With `q` the default is `relevance`; otherwise pack order. Prefix `-` to reverse (not for `relevance`). */
  ordering?: 'relevance' | 'name' | '-name' | 'created_at' | '-created_at' | 'sort_order' | '-sort_order'
  page?: number
  page_size?: number
}

export type FontCategory = 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace'
export interface FontVariant {
  weight: number
  style: 'normal' | 'italic'
  /** The Latin file. */
  url: string
  /** Per-script files (`subset` is e.g. "latin-ext", "cyrillic"). */
  subsets?: Array<{ subset: string; url: string }>
}
export interface FontFamily {
  id: string
  family: string
  category: FontCategory
  scripts: string[]
  is_variable: boolean
  is_user_font: boolean
  variants: FontVariant[]
  /** Rank: 1 is the most popular, 9999 means unranked. */
  popularity: number
  /** CSS `unicode-range` per subset, for `@font-face` declarations. */
  unicode_ranges?: Record<string, string>
}
export interface FontQuery {
  q?: string
  category?: FontCategory
  script?: string
  /** `popularity` (default), `family` or `created_at`; prefix `-` to reverse. */
  ordering?: 'popularity' | '-popularity' | 'family' | '-family' | 'created_at' | '-created_at'
  page?: number
  page_size?: number
}

export type ShareRole = 'view' | 'comment' | 'edit'
export interface ShareLink {
  id: string
  token: string
  role: ShareRole
  url: string
  is_active: boolean
  expires_at: string | null
  has_password: boolean
  created_at: string
}
export interface SharedDesign {
  /** The design's id, for its live room. */
  design_id: string
  role: ShareRole
  title: string
  width: number
  height: number
  revision: number
  owner: { name: string; avatar_url: string | null }
  document: DoryDocument
  /** The owner's uploaded font families that the document uses (so viewers can draw the text as the owner sees it). */
  fonts: FontFamily[]
}
export interface CommentT {
  id: string
  author: { id: string; name: string; avatar_url: string | null }
  body: string
  page_id: string | null
  x: number | null
  y: number | null
  parent: string | null
  resolved: boolean
  created_at: string
}
export type AssetQuery = { kind?: AssetKind; q?: string; page?: number; page_size?: number }

export interface AssetUsage {
  used_bytes: number
  quota_bytes: number
}

export interface DesignBulkInput {
  ids: string[]
  action: BulkAction
  folder?: string | null
}

export interface GoogleLoginResult {
  user: ApiUser
  created: boolean
}

export interface RegisterInput {
  email: string
  password: string
  display_name?: string
}

/** A font file the server embeds into a print PDF itself (same-origin `/media/…` URL). */
export interface PdfFontFile {
  family: string
  url: string
  weight: number
  style: 'normal' | 'italic'
}

export interface PdfExportInput {
  pages: Blob[]
  /** The first page's size (what servers that predate `sizes` read). */
  width: number
  height: number
  /** Trim size of every page in px, in the order of `pages`; sent as the `sizes` JSON field. */
  sizes?: { width: number; height: number }[]
  bleedMm?: number
  cropMarks?: boolean
  title?: string
  lang?: string
  fonts?: PdfFontFile[]
  signal?: AbortSignal
  onUploadProgress?: (fraction: number) => void
}

export interface ShareLinkInput {
  role: ShareRole
  expires_at?: string | null
  password?: string
}

export interface CommentInput {
  body: string
  page_id?: string | null
  x?: number | null
  y?: number | null
  parent?: string | null
}

/** A new place for a comment's pin: the page (by id) and a point in that page's own pixels. */
export interface CommentMove {
  page_id: string
  x: number
  y: number
}

export interface UserFontUploadInput {
  /** One file per weight/style (ttf, otf, woff, woff2). */
  files: File[]
  family?: string
  category?: FontCategory
}

export interface UserFontUploadOptions {
  signal?: AbortSignal
  /** Upload progress, 0..1. */
  onProgress?: (fraction: number) => void
}

/** Error codes of `POST /fonts/mine/` (all carry a user-presentable `message`). */
export type UserFontErrorCode = 'variant_exists' | 'font_name_taken' | 'font_limit_reached' | 'font_storage_limit'

/** A personal access token (for the MCP server). The secret itself is only in `IssuedApiToken`. */
export interface ApiToken {
  id: string
  name: string
  prefix: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

export interface IssuedApiToken extends ApiToken {
  /** The full token, shown only once. */
  token: string
}

export interface ApiTokenScope {
  id: string
  description: string
}

/** The API styles a provider can speak (see the backend's `apps.ai.styles`). */
export type AiProviderStyle = 'doory' | 'multipart' | 'json' | 'mask' | 'custom'

/** A model a user's provider offers for a task, as they picked and labelled it. */
export interface AiProviderModel {
  id?: string
  task: string
  /** Sent to the server as the model; empty: the server's default. */
  remote_name: string
  label: string
  enabled: boolean
  sort_order?: number
}

/** A user's own AI server (`/ai/providers/`). The secret is write-only: only `has_secret` comes back. */
export interface AiProvider {
  id: string
  name: string
  base_url: string
  style: AiProviderStyle
  style_config: Record<string, unknown>
  auth_header: string
  has_secret: boolean
  tasks: string[]
  timeout_seconds: number
  max_image_bytes: number
  sends_offsite: boolean
  enabled: boolean
  sort_order: number
  models: AiProviderModel[]
  created_at: string
  updated_at: string
}

/** What `POST`/`PATCH /ai/providers/` accept: `secret` omitted keeps the stored one, `''` removes it. */
export type AiProviderInput = Partial<Pick<AiProvider, 'name' | 'base_url' | 'style' | 'style_config' | 'auth_header' | 'tasks' | 'timeout_seconds' | 'sends_offsite' | 'enabled'>> & { secret?: string }

/** `POST /ai/providers/{id}/test/`: a built-in sample picture sent to the server. */
export interface AiProviderTestResult {
  ok: boolean
  duration_ms: number
  task: string
  model: string
  /** `data:` URL of the result (PNG, at most 256 px) when it worked. */
  preview: string
  error: { code: string; message: string } | null
}

/** A template field of a design (`GET /designs/{id}/fields/`). `key: null`: a photo placeholder without a tag. */
export interface TemplateField {
  key: string | null
  type: 'text' | 'image' | 'color'
  label: string | null
  pages: number[]
  object_ids: string[]
  current: unknown
  fit: { mode: 'shrink'; minFontSize?: number } | null
  overflow: boolean
}

export type FieldValue = string | { asset_id?: string; element_id?: string; url?: string; focal?: [number, number] } | null

export interface BulkFillInput {
  rows: Record<string, FieldValue>[]
  row_numbers?: number[]
  name_pattern?: string
  folder?: string | null
}

export type BulkFillRow =
  | { row: number; ok: true; design_id: string; title: string; filled: string[]; skipped: string[]; overflow: string[] }
  | { row: number; ok: false; error: string }

export interface BulkFillResult {
  created: number
  rows: BulkFillRow[]
}
