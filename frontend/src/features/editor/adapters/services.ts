import { aiApi, assetsApi, audioStockApi, authApi, brandApi, commentsApi, designsApi, elementsApi, foldersApi, fontsApi, isApiError, shareApi, stockApi, templatesApi, videoStockApi } from '@/lib/api'
import { safeGetItem, safeSetItem } from '@/lib/storage'
import type { AiConfig, AiTaskOptions, Asset, BrandKit, BrandKitInput, Page } from '@/types/api'
import type { AiService, AssetRef, CommentViewer, EditorServices, UserFontsService, VideoService } from '@/types/adapter'

/** The page's language for stock providers that search in it (Pixabay). */
function uiLanguage(): string | undefined {
  const lang = (typeof document !== 'undefined' && document.documentElement.lang) || (typeof navigator !== 'undefined' ? navigator.language : '')
  return /^[A-Za-z]{2}([-_][A-Za-z0-9]{1,8})*$/.test(lang) ? lang : undefined
}

/**
 * Tells the comments who is looking (`GET /auth/me/`). The answer is kept once there is one; a visitor who is not
 * signed in is asked again next time because they may sign in meanwhile. `owner`: the person owns the design.
 */
export function createViewerLookup(owner: boolean): () => Promise<CommentViewer | null> {
  let known: CommentViewer | null = null
  return async () => {
    if (known) return known
    const user = (await authApi.me()).user
    known = user ? { id: user.id, owner } : null
    return known
  }
}

export function assetToRef(asset: Asset): AssetRef {
  const ref: AssetRef = { id: asset.id, url: asset.url, thumbUrl: asset.thumb_url, width: asset.width, height: asset.height, name: asset.name, kind: asset.kind }
  if (asset.kind === 'video') {
    ref.video = {
      status: asset.status ?? 'ready',
      error: asset.error ?? '',
      posterUrl: asset.poster_url ?? '',
      audioUrl: asset.audio_url ?? '',
      durationMs: asset.duration_ms ?? 0,
      fps: asset.video?.fps ?? 0,
      filmstrip: asset.video?.filmstrip ?? null,
    }
  }
  return ref
}

/** Video clips of a signed-in user: uploads (converted by the server) and stock videos. */
export function createVideoService(): VideoService {
  return {
    info: () => videoStockApi.info(),
    list: async (page) => {
      const found = await assetsApi.list({ kind: 'video', page, page_size: 20 })
      return { ...found, results: found.results.map(assetToRef) }
    },
    get: async (id) => assetToRef(await assetsApi.get(id)),
    upload: async (file, options = {}) => assetToRef(await assetsApi.upload(file, { name: file.name, signal: options.signal, onProgress: options.onProgress })),
    search: (q, page, { provider, orientation, length, signal }) => videoStockApi.search(q, page, { provider, orientation, length, signal, lang: uiLanguage() }),
    importVideo: async (video) => assetToRef(await videoStockApi.importVideo(video)),
  }
}

type PublicServices = Pick<EditorServices, 'fonts' | 'elements' | 'templates'>

/** Catalog endpoints that need no login. */
export function createPublicServices(): PublicServices {
  return {
    fonts: { list: (query) => fontsApi.list(query) },
    elements: { packs: () => elementsApi.packs(), list: (query) => elementsApi.list(query) },
    templates: {
      categories: () => templatesApi.categories(),
      list: (query) => templatesApi.list(query),
      get: (slug) => templatesApi.get(slug),
    },
  }
}

/** The signed-in user's own font library (`/fonts/mine/`). */
export function createUserFontsService(): UserFontsService {
  return {
    list: () => fontsApi.mine(),
    upload: (input, options) => fontsApi.upload(input, options),
    remove: (id) => fontsApi.removeMine(id),
  }
}

/** How long the options of a task are reused before they are asked for again (a new server in Settings shows up). */
const AI_OPTIONS_TTL = 60_000

function configOptions(config: AiConfig | undefined, task: string): AiTaskOptions | undefined {
  return (config as Record<string, unknown> | undefined)?.[task.replace(/-/g, '_')] as AiTaskOptions | undefined
}

/**
 * AI image tasks for a signed-in user: their options (`GET /ai/models/`, which includes their own servers; the
 * public list from `/config/` when that fails), runs on the server, and the last choice per user and task.
 */
export function createAiService({ config, userId }: { config?: AiConfig; userId?: string | (() => string | undefined) } = {}): AiService {
  const cached = new Map<string, { at: number; value: Promise<AiTaskOptions> }>()
  const resolveUserId = (): string => {
    const id = typeof userId === 'function' ? userId() : userId
    return id ?? 'me'
  }
  const storageKey = (task: string): string => `doory.ai.choice.${resolveUserId()}.${task}`
  const upload = async (image: Blob, signal?: AbortSignal): Promise<string> => {
    const ext = image.type === 'image/jpeg' ? 'jpg' : (image.type.split('/')[1] ?? 'png').replace(/\W.*$/, '')
    return (await assetsApi.upload(image, { name: `image.${ext}`, signal })).id
  }
  return {
    offsiteNotice: config?.offsite_notice ?? '',
    options(task) {
      const hit = cached.get(task)
      if (hit && Date.now() - hit.at < AI_OPTIONS_TTL) return hit.value
      const fallback = configOptions(config, task)
      const value = aiApi.options(task).then(
        (models) => ({ default: fallback?.default ?? 'device', models }),
        () => {
          cached.delete(task) // ask again next time
          return fallback ?? { default: null, models: [] }
        },
      )
      cached.set(task, { at: Date.now(), value })
      return value
    },
    async run(task, { model, image, assetId, signal }) {
      if (assetId) {
        try {
          return assetToRef(await aiApi.run(task, { asset_id: assetId, model }, signal))
        } catch (error) {
          // Not this user's asset (a template's picture, say): upload the picture and run on that copy.
          if (!isApiError(error) || error.status !== 404 || error.code === 'ai_model_not_found' || error.code === 'unknown_task') throw error
        }
      }
      const blob = typeof image === 'function' ? await image() : image
      return assetToRef(await aiApi.run(task, { asset_id: await upload(blob, signal), model }, signal))
    },
    remembered: (task) => safeGetItem(storageKey(task)),
    remember: (task, option) => {
      safeSetItem(storageKey(task), option)
    },
  }
}

function brandInput(kit: BrandKit): BrandKitInput {
  return { name: kit.name, is_default: kit.is_default, colors: kit.colors, fonts: kit.fonts, logo_ids: kit.logos.map((logo) => logo.id) }
}

export function createAccountAssetsService(): EditorServices['assets'] {
  return {
    list: (query): Promise<Page<Asset>> => assetsApi.list(query),
    remove: (id) => assetsApi.remove(id),
  }
}

/** Everything an authenticated user can reach from the editor. */
export function createAccountServices(designId: string | null, beforeVersion: () => Promise<void> = () => Promise.resolve(), ai: AiService | null = null): EditorServices {
  const publicServices = createPublicServices()
  return {
    ai,
    ...publicServices,
    fonts: { ...publicServices.fonts, mine: createUserFontsService() },
    assets: createAccountAssetsService(),
    brand: {
      list: () => brandApi.list(),
      save: (kit) => (kit.id ? brandApi.update(kit.id, brandInput(kit)) : brandApi.create(brandInput(kit))),
    },
    stock: {
      providers: () => stockApi.providers(),
      search: (query, page, provider) => stockApi.search(query, page, { provider, lang: uiLanguage() }),
      importPhoto: async (photo) => assetToRef(await stockApi.importPhoto(photo)),
    },
    video: createVideoService(),
    audioStock: {
      info: () => audioStockApi.info(),
      search: (q, options) => audioStockApi.search(q, options),
      previewUrl: (id) => audioStockApi.previewUrl(id),
      importSound: async (id) => {
        const asset = await audioStockApi.importSound(id)
        return { ref: assetToRef(asset), credit: asset.credit, durationMs: asset.duration_ms ?? null }
      },
    },
    sharing: designId
      ? {
          list: () => shareApi.listLinks(designId),
          create: (input) => shareApi.createLink(designId, input),
          update: (id, patch) => shareApi.updateLink(designId, id, patch),
          revoke: (id) => shareApi.revokeLink(designId, id),
        }
      : null,
    comments: designId
      ? {
          list: () => commentsApi.list(designId),
          create: (input) => commentsApi.create(designId, input),
          resolve: (id, resolved) => commentsApi.resolve(designId, id, resolved),
          remove: (id) => commentsApi.remove(designId, id),
          move: (id, to) => commentsApi.move(designId, id, to),
          viewer: createViewerLookup(true),
        }
      : null,
    versions: designId
      ? {
          list: async () => (await designsApi.versions.list(designId)).results,
          create: async (label) => {
            await beforeVersion()
            return designsApi.versions.create(designId, label)
          },
          restore: async (versionId) => {
            await beforeVersion()
            return (await designsApi.versions.restore(designId, versionId)).document
          },
        }
      : null,
    bulkFill: designId
      ? {
          fields: async () => {
            await beforeVersion()
            return designsApi.fields(designId)
          },
          createFolder: (name) => foldersApi.create({ name }),
          removeFolder: (id) => foldersApi.remove(id),
          run: (input) => designsApi.bulkFill(designId, input),
        }
      : null,
  }
}
