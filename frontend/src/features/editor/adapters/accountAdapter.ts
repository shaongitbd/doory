import { assetsApi, designsApi, exportsApi, isApiError } from '@/lib/api'
import type { AppConfig, ImageOptimizeConfig } from '@/types/api'
import type { EditorAdapter, ImageOptimizeInfo, OptimizeFormat } from '@/types/adapter'
import { RevisionConflictError } from './errors'
import { createRealtimeConnection, flushLiveRoom } from './realtime'
import { assetToRef, createAccountServices, createAiService } from './services'

export interface AccountAdapterOptions {
  /** Called with the revision the server assigned after each successful save. */
  onRevision?(revision: number): void
  config?: Pick<AppConfig, 'features' | 'exports' | 'ai'>
  /** The signed-in user, so the editor remembers choices (e.g. the background-removal option) per user. */
  userId?: string | (() => string | undefined)
  /** Minimum gap between thumbnail uploads (ms). */
  thumbnailIntervalMs?: number
  /** Opens the shell's sign-in flow when the live room needs a session; resolves `true` once the user is signed in. */
  requireSignIn?(): Promise<boolean>
  /** Re-reads the session through the shell, which updates its own state; resolves `true` when still signed in. */
  refreshSession?(): Promise<boolean>
}

const DEFAULT_THUMBNAIL_INTERVAL = 15_000

function conflictFrom(error: unknown): RevisionConflictError | null {
  if (!isApiError(error) || error.status !== 409 || error.code !== 'revision_conflict') return null
  const current = (error.data as { current?: { revision?: unknown } } | undefined)?.current?.revision
  return new RevisionConflictError(typeof current === 'number' ? current : null)
}

const OPTIMIZE_FORMATS: readonly OptimizeFormat[] = ['png', 'jpg', 'webp', 'avif']
const optimizeFormats = (formats: readonly string[]): OptimizeFormat[] => OPTIMIZE_FORMATS.filter((format) => formats.includes(format))

/** `/config/` `features.image_optimize` in the editor's terms; unknown formats are left out. */
export function imageOptimizeInfo(config: ImageOptimizeConfig): ImageOptimizeInfo {
  return {
    formats: optimizeFormats(config.formats),
    optimizers: config.optimizers.map((o) => ({ id: o.id, name: o.name, formats: optimizeFormats(o.formats), sendsOffsite: o.sends_offsite === true })),
    default: config.default,
  }
}

/** The adapter used at `/design/:id` for a signed-in owner. */
export function createAccountAdapter(designId: string, getRevision: () => number, options: AccountAdapterOptions = {}): EditorAdapter {
  const interval = options.thumbnailIntervalMs ?? DEFAULT_THUMBNAIL_INTERVAL
  let lastThumbnailAt = 0
  const realtime =
    options.config?.features.realtime === true
      ? createRealtimeConnection({
          designId,
          setTitle: async (title) => {
            await designsApi.patch(designId, { title })
          },
          requireSignIn: options.requireSignIn ?? (async () => false),
          refreshSession: options.refreshSession,
          onRevision: options.onRevision,
          uploadThumbnail: async (image) => {
            await designsApi.uploadThumbnail(designId, image)
          },
        })
      : null

  const adapter: EditorAdapter = {
    async save({ document, title, thumbnail }) {
      let revision: number
      try {
        const saved = await designsApi.patch(designId, { title, document, base_revision: getRevision() })
        revision = saved.revision
      } catch (error) {
        throw conflictFrom(error) ?? error
      }
      options.onRevision?.(revision)
      const now = Date.now()
      if (thumbnail && now - lastThumbnailAt >= interval) {
        lastThumbnailAt = now
        await designsApi.uploadThumbnail(designId, thumbnail).catch(() => undefined)
      }
      return { savedAt: now, revision }
    },
    requireAccount: async () => true,
    async uploadAsset(file, opts) {
      return assetToRef(await assetsApi.upload(file, { name: opts?.name }))
    },
    resolveSrc: async (src) => src,
    services: createAccountServices(
      designId,
      () => flushLiveRoom(realtime),
      options.config?.ai && options.config.features.ai_providers === true ? createAiService({ config: options.config.ai, userId: options.userId }) : null,
    ),
    realtime,
  }
  const exports = options.config?.exports
  if (exports) adapter.exportFilenames = { style: exports.filename_style === 'structured' ? 'structured' : 'simple', timestamp: exports.filename_timestamp === true }
  if (options.config?.features.server_pdf) {
    adapter.exportPdf = ({ svgPages, width, height, sizes, bleedMm, cropMarks, imposition, title, lang, fonts, signal, onUploadProgress }) =>
      exportsApi.pdf({ pages: svgPages.map((svg) => new Blob([svg], { type: 'image/svg+xml' })), width, height, sizes, bleedMm, cropMarks, imposition, title, lang, fonts, signal, onUploadProgress })
  }
  const optimize = options.config?.features.image_optimize
  if (optimize) {
    adapter.imageOptimize = imageOptimizeInfo(optimize)
    adapter.optimizeImage = exportsApi.optimize
  }
  return adapter
}

/** Holds the last server revision known to the page; the adapter reads it on every save. */
export class RevisionTracker {
  private value: number

  constructor(initial = 0) {
    this.value = initial
  }

  get(): number {
    return this.value
  }

  set(next: number): void {
    this.value = next
  }
}
