import { localRepository, type LocalRepository } from '@/lib/local'
import type { AccountReason, AssetRef, EditorAdapter, SaveInput } from '@/types/adapter'
import type { Asset } from '@/types/api'
import { MigrationError } from './errors'
import { readImageInfo, UnsupportedImageError } from './images'
import { migrateLocalDesign, type MigrationProgress } from './migrateLocalDesign'
import { createPublicServices } from './services'

const LOCAL_SRC = /^idb:\/\/([0-9a-f-]{36})$/i

export interface GuestAdapterOptions {
  localId: string
  /** Opens the sign-in / sign-up modal; resolves true once the user is authenticated. */
  ensureSignedIn(reason: AccountReason): Promise<boolean>
  onMigrationStart?(): void
  onMigrationProgress?(progress: MigrationProgress): void
  onMigrationWarning?(message: string): void
  /** The design now lives in the account: the shell navigates to `/design/:id`. */
  onMigrated(designId: string): void
  /** Migration failed; the local copy is intact. `retry` re-runs the same migration. */
  onMigrationError?(error: Error, retry: () => Promise<boolean>): void
  maxUploadBytes?: number
  repository?: LocalRepository
}

const DEFAULT_MAX_UPLOAD = 10 * 1024 * 1024
/** Audio is larger than pictures; the server accepts 25 MB for both, so a guest's recording or song may be that big. */
const MAX_AUDIO_UPLOAD = 25 * 1024 * 1024

function localAssetToApi(asset: { id: string; name: string; mime: string; width: number; height: number; blob: Blob; createdAt: number }): Asset {
  const url = `idb://${asset.id}`
  return {
    id: asset.id,
    kind: asset.mime.startsWith('audio/') ? 'audio' : asset.mime === 'image/svg+xml' ? 'svg' : 'image',
    name: asset.name,
    url,
    thumb_url: url,
    width: asset.width,
    height: asset.height,
    size: asset.blob.size,
    mime: asset.mime,
    tags: [],
    attribution: null,
    created_at: new Date(asset.createdAt).toISOString(),
  }
}

/** The adapter used at `/local/:id`: everything stays in this browser until the user signs up. */
export function createGuestAdapter(options: GuestAdapterOptions): EditorAdapter {
  const repo = options.repository ?? localRepository
  const maxUpload = options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD

  async function requireAccount(reason: AccountReason, getSnapshot: () => Promise<SaveInput>): Promise<boolean> {
    if (!(await options.ensureSignedIn(reason))) return false
    const snapshot = await getSnapshot()
    options.onMigrationStart?.()
    try {
      const designId = await migrateLocalDesign(options.localId, snapshot, {
        onProgress: options.onMigrationProgress,
        onWarning: options.onMigrationWarning,
        repository: repo,
      })
      options.onMigrated(designId)
      return true
    } catch (error) {
      const failure = error instanceof Error ? error : new MigrationError('Saving to your account failed.', 'design', { cause: error })
      options.onMigrationError?.(failure, () => requireAccount(reason, async () => snapshot))
      return false
    }
  }

  return {
    async save({ document, title, thumbnail }) {
      await repo.saveDesign({ id: options.localId, title, document, thumbnail })
      return { savedAt: Date.now() }
    },
    requireAccount,
    async uploadAsset(file, opts): Promise<AssetRef> {
      if (file.type.startsWith('audio/') || (file instanceof File && /\.(mp3|ogg|oga|opus|wav|m4a|weba|webm)$/i.test(file.name) && !file.type.startsWith('image/'))) {
        if (file.size > MAX_AUDIO_UPLOAD) throw new UnsupportedImageError(`That audio is larger than ${Math.round(MAX_AUDIO_UPLOAD / (1024 * 1024))} MB. Try a shorter file.`)
        const name = opts?.name ?? (file instanceof File ? file.name : 'Audio')
        const mime = file.type.startsWith('audio/') ? file.type : 'audio/webm'
        const asset = await repo.putAsset({ blob: file, name, mime, width: 0, height: 0 })
        const url = `idb://${asset.id}`
        return { id: asset.id, url, thumbUrl: '', width: 0, height: 0, name, kind: 'audio' }
      }
      if (file.size > maxUpload) {
        throw new UnsupportedImageError(`That image is larger than ${Math.round(maxUpload / (1024 * 1024))} MB. Try a smaller file.`)
      }
      const info = await readImageInfo(file)
      const name = opts?.name ?? (file instanceof File ? file.name : 'Image')
      const asset = await repo.putAsset({ blob: file, name, mime: info.mime, width: info.width, height: info.height })
      const url = `idb://${asset.id}`
      return { id: asset.id, url, thumbUrl: url, width: info.width, height: info.height, name, kind: info.kind }
    },
    async resolveSrc(src) {
      const match = LOCAL_SRC.exec(src)
      if (!match) return src
      const url = await repo.getAssetObjectUrl(match[1])
      if (!url) throw new Error('This image is no longer stored in this browser.')
      return url
    },
    exportProject: async () => {
      const { exportLocalProject } = await import('@/lib/local/projectArchive')
      return exportLocalProject(options.localId, repo)
    },
    services: {
      ...createPublicServices(),
      assets: {
        async list(query) {
          const needle = query.q?.toLowerCase()
          const all = (await repo.listAssets()).filter((asset) => {
            const kind = localAssetToApi(asset).kind
            return (query.kind ? kind === query.kind : kind !== 'audio') && (!needle || asset.name.toLowerCase().includes(needle))
          })
          return { count: all.length, next: null, previous: null, results: all.map(localAssetToApi) }
        },
        remove: (id) => repo.deleteAsset(id),
      },
      brand: null,
      stock: null,
      versions: null,
    },
  }
}
