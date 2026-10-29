import { collectLocalAssetIds, newId, rewriteLocalAssetSrcs } from '@/lib/document'
import type { DoryDocument } from '@/types/document'
import { localRepository, type LocalRepository } from './repository'

const FORMAT = 'doory-project'
const FORMAT_VERSION = 1
const MANIFEST = 'project.json'
const THUMBNAIL = 'thumbnail'
const MAX_PROJECT_BYTES = 512 * 1024 * 1024
const MAX_EXPANDED_BYTES = 1024 * 1024 * 1024
const MAX_ENTRIES = 5002
const MAX_MANIFEST_BYTES = 10 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface ArchivedAsset {
  id: string
  path: string
  name: string
  mime: string
  width: number
  height: number
}

interface ProjectManifest {
  format: typeof FORMAT
  version: typeof FORMAT_VERSION
  exportedAt: string
  title: string
  document: DoryDocument
  thumbnail?: { path: typeof THUMBNAIL; mime: string }
  assets: ArchivedAsset[]
}

export interface ProjectArchiveFile {
  blob: Blob
  filename: string
}

export class ProjectArchiveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ProjectArchiveError'
  }
}

function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the project file.'))
    reader.readAsArrayBuffer(blob)
  })
}

function blobFrom(bytes: Uint8Array, type: string): Blob {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Blob([buffer], { type })
}

function projectFilename(title: string): string {
  const clean = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .trim()
    .replace(/[ .]+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 120)
  return `${clean || 'design'}.doory`
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseAsset(value: unknown): ArchivedAsset {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !UUID.test(value.id) ||
    typeof value.path !== 'string' ||
    value.path !== `assets/${value.id.toLowerCase()}` ||
    typeof value.name !== 'string' ||
    value.name.length > 500 ||
    typeof value.mime !== 'string' ||
    value.mime.length > 200 ||
    !finiteNumber(value.width) ||
    !finiteNumber(value.height)
  ) {
    throw new ProjectArchiveError('This project backup has invalid asset information.')
  }
  return {
    id: value.id.toLowerCase(),
    path: value.path,
    name: value.name,
    mime: value.mime,
    width: value.width,
    height: value.height,
  }
}

function parseManifest(value: unknown): ProjectManifest {
  if (!record(value) || value.format !== FORMAT || value.version !== FORMAT_VERSION) {
    throw new ProjectArchiveError('This is not a supported Doory project backup.')
  }
  if (typeof value.title !== 'string' || value.title.length > 500 || !record(value.document) || !Array.isArray(value.assets)) {
    throw new ProjectArchiveError('This project backup is not valid.')
  }
  const assets = value.assets.map(parseAsset)
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length) throw new ProjectArchiveError('This project backup contains duplicate assets.')
  let thumbnail: ProjectManifest['thumbnail']
  if (value.thumbnail !== undefined) {
    if (!record(value.thumbnail) || value.thumbnail.path !== THUMBNAIL || typeof value.thumbnail.mime !== 'string' || value.thumbnail.mime.length > 200) {
      throw new ProjectArchiveError('This project backup has invalid thumbnail information.')
    }
    thumbnail = { path: THUMBNAIL, mime: value.thumbnail.mime }
  }
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
    title: value.title,
    document: value.document as unknown as DoryDocument,
    ...(thumbnail ? { thumbnail } : {}),
    assets,
  }
}

/** Packs one guest design and every browser-owned file it references into a portable `.doory` backup. */
export async function exportLocalProject(localId: string, repository: LocalRepository = localRepository): Promise<ProjectArchiveFile> {
  const design = await repository.getDesign(localId)
  if (!design) throw new ProjectArchiveError('This local design could not be found.')
  const ids = collectLocalAssetIds(design.document)
  const assets = await Promise.all(ids.map((id) => repository.getAsset(id)))
  if (assets.some((asset) => asset === null)) throw new ProjectArchiveError('One or more files used by this design are missing from browser storage.')

  const manifest: ProjectManifest = {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    title: design.title,
    document: design.document,
    ...(design.thumbnail ? { thumbnail: { path: THUMBNAIL, mime: design.thumbnail.type || 'application/octet-stream' } } : {}),
    assets: assets.map((asset, index) => {
      const stored = asset!
      return { id: ids[index], path: `assets/${ids[index]}`, name: stored.name, mime: stored.mime, width: stored.width, height: stored.height }
    }),
  }

  const { strToU8, zipSync } = await import('fflate')
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 | 6 }]> = {
    [MANIFEST]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }],
  }
  if (design.thumbnail) entries[THUMBNAIL] = [await readBytes(design.thumbnail), { level: 0 }]
  for (let index = 0; index < ids.length; index += 1) entries[`assets/${ids[index]}`] = [await readBytes(assets[index]!.blob), { level: 0 }]
  return { blob: blobFrom(zipSync(entries), 'application/vnd.doory.project+zip'), filename: projectFilename(design.title) }
}

/** Restores a `.doory` backup as a new guest project without overwriting any existing design or asset ids. */
export async function importLocalProject(file: Blob, repository: LocalRepository = localRepository) {
  if (file.size > MAX_PROJECT_BYTES) throw new ProjectArchiveError('This project backup is too large to open in the browser.')
  const bytes = await readBytes(file)
  const { strFromU8, unzipSync } = await import('fflate')
  let entryCount = 0
  let expandedBytes = 0
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes, {
      filter(info) {
        entryCount += 1
        expandedBytes += info.originalSize
        if (entryCount > MAX_ENTRIES || expandedBytes > MAX_EXPANDED_BYTES) throw new ProjectArchiveError('This project backup is too large to open safely.')
        return true
      },
    })
  } catch (error) {
    if (error instanceof ProjectArchiveError) throw error
    throw new ProjectArchiveError('This project backup could not be opened.', { cause: error })
  }
  const manifestBytes = entries[MANIFEST]
  if (!manifestBytes || manifestBytes.byteLength > MAX_MANIFEST_BYTES) throw new ProjectArchiveError('This project backup does not contain a valid project file.')
  let manifest: ProjectManifest
  try {
    manifest = parseManifest(JSON.parse(strFromU8(manifestBytes)) as unknown)
  } catch (error) {
    if (error instanceof ProjectArchiveError) throw error
    throw new ProjectArchiveError('This project backup does not contain valid project data.', { cause: error })
  }

  const { migrateDocument } = await import('@/editor/engine/migrations')
  let document: DoryDocument
  try {
    document = migrateDocument(manifest.document)
  } catch (error) {
    throw new ProjectArchiveError(error instanceof Error ? error.message : 'The design in this project backup is not valid.', { cause: error })
  }
  const referenced = collectLocalAssetIds(document)
  const archived = new Map(manifest.assets.map((asset) => [asset.id, asset]))
  if (referenced.some((id) => !archived.has(id))) throw new ProjectArchiveError('This project backup is missing one or more files used by the design.')

  const replacements = new Map<string, { url: string }>()
  const createdAssets: string[] = []
  try {
    for (const oldId of referenced) {
      const asset = archived.get(oldId)!
      const assetBytes = entries[asset.path]
      if (!assetBytes) throw new ProjectArchiveError(`The project backup is missing “${asset.name || 'a local file'}”.`)
      const id = newId().toLowerCase()
      await repository.putAsset({ id, blob: blobFrom(assetBytes, asset.mime), name: asset.name, mime: asset.mime, width: asset.width, height: asset.height })
      createdAssets.push(id)
      replacements.set(oldId, { url: `idb://${id}` })
    }
    const thumbnail = manifest.thumbnail ? entries[manifest.thumbnail.path] : undefined
    if (manifest.thumbnail && !thumbnail) throw new ProjectArchiveError('The project backup is missing its thumbnail.')
    return await repository.createDesign({
      title: manifest.title,
      document: rewriteLocalAssetSrcs(document, replacements),
      ...(thumbnail ? { thumbnail: blobFrom(thumbnail, manifest.thumbnail!.mime) } : {}),
    })
  } catch (error) {
    await Promise.allSettled(createdAssets.map((id) => repository.deleteAsset(id)))
    if (error instanceof ProjectArchiveError) throw error
    throw new ProjectArchiveError('Doory could not restore this project backup.', { cause: error })
  }
}
