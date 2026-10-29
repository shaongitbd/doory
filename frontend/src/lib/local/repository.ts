import { collectLocalAssetIds, newId } from '@/lib/document'
import { safeGetItem, safeSetItem } from '@/lib/storage'
import type { DoryDocument } from '@/types/document'
import { createIndexedDbStore, createMemoryStore, mapStorageError, openDatabase, type LocalStore } from './store'
import type { LocalAsset, LocalDesign, LocalDesignSummary, StorageMode, StorageUsage } from './types'

const PERSIST_FLAG = 'doory-storage-persist-requested'

export interface SaveLocalDesignInput {
  id: string
  title: string
  document: DoryDocument
  thumbnail?: Blob
}

export interface NewLocalAssetInput {
  blob: Blob
  name: string
  mime?: string
  width: number
  height: number
  id?: string
}

type StoreOpener = () => Promise<{ store: LocalStore; mode: StorageMode }>

/** Default opener: IndexedDB when it works, otherwise an in-memory store (flagged as non-persistent). */
export async function openBrowserStore(): Promise<{ store: LocalStore; mode: StorageMode }> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable')
    const db = await openDatabase()
    return { store: createIndexedDbStore(db), mode: 'indexeddb' }
  } catch {
    return { store: createMemoryStore(), mode: 'memory' }
  }
}

/**
 * Guest storage: designs and uploaded images kept in this browser.
 * One instance per page; `openStore` is injectable for tests.
 */
export class LocalRepository {
  private storePromise: Promise<{ store: LocalStore; mode: StorageMode }> | null = null
  private mode: StorageMode = 'indexeddb'
  private readonly listeners = new Set<() => void>()
  private readonly objectUrls = new Map<string, string>()
  private unloadHooked = false

  constructor(private readonly openStore: StoreOpener = openBrowserStore) {}

  private async store(): Promise<LocalStore> {
    this.storePromise ??= this.openStore().then((opened) => {
      if (opened.mode !== this.mode) {
        this.mode = opened.mode
        this.listeners.forEach((listener) => listener())
      }
      return opened
    })
    return (await this.storePromise).store
  }

  /** `memory` means designs will be lost when the tab closes: the UI must warn the user. */
  getStorageMode(): StorageMode {
    return this.mode
  }

  /** Resolves once the backing store is open (so `getStorageMode` is accurate). */
  async ready(): Promise<StorageMode> {
    await this.store()
    return this.mode
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async listDesigns(): Promise<LocalDesignSummary[]> {
    const store = await this.store()
    const designs = await store.listDesigns()
    return designs
      .map((design) => ({
        id: design.id,
        title: design.title,
        thumbnail: design.thumbnail,
        width: design.document.width,
        height: design.document.height,
        pageCount: design.document.pages.length,
        createdAt: design.createdAt,
        updatedAt: design.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async getDesign(id: string): Promise<LocalDesign | null> {
    const store = await this.store()
    return (await store.getDesign(id)) ?? null
  }

  async createDesign(input: { title: string; document: DoryDocument; thumbnail?: Blob }): Promise<LocalDesign> {
    return this.saveDesign({ id: newId(), title: input.title, document: input.document, thumbnail: input.thumbnail })
  }

  /** Upsert. Keeps `createdAt` and any previous thumbnail when none is supplied. */
  async saveDesign(input: SaveLocalDesignInput): Promise<LocalDesign> {
    const store = await this.store()
    const existing = await store.getDesign(input.id)
    const now = Date.now()
    const design: LocalDesign = {
      id: input.id,
      title: input.title,
      document: input.document,
      thumbnail: input.thumbnail ?? existing?.thumbnail,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    try {
      await store.putDesign(design)
    } catch (error) {
      throw mapStorageError(error)
    }
    void this.requestPersistence()
    return design
  }

  /** Deletes the design and any uploaded image that no other local design still uses. */
  async deleteDesign(id: string): Promise<void> {
    const store = await this.store()
    const design = await store.getDesign(id)
    await store.deleteDesign(id)
    if (design) await this.deleteAssetsIfUnused(collectLocalAssetIds(design.document))
  }

  /** Removes the given assets unless a remaining local design still references them. */
  async deleteAssetsIfUnused(assetIds: readonly string[]): Promise<void> {
    if (assetIds.length === 0) return
    const store = await this.store()
    const stillUsed = new Set<string>()
    for (const other of await store.listDesigns()) collectLocalAssetIds(other.document).forEach((assetId) => stillUsed.add(assetId))
    await Promise.all(assetIds.filter((assetId) => !stillUsed.has(assetId.toLowerCase())).map((assetId) => this.deleteAsset(assetId)))
  }

  async putAsset(input: NewLocalAssetInput): Promise<LocalAsset> {
    const store = await this.store()
    const asset: LocalAsset = {
      id: (input.id ?? newId()).toLowerCase(),
      blob: input.blob,
      name: input.name,
      mime: input.mime ?? input.blob.type,
      width: input.width,
      height: input.height,
      createdAt: Date.now(),
    }
    try {
      await store.putAsset(asset)
    } catch (error) {
      throw mapStorageError(error)
    }
    void this.requestPersistence()
    return asset
  }

  async getAsset(id: string): Promise<LocalAsset | null> {
    const store = await this.store()
    return (await store.getAsset(id.toLowerCase())) ?? null
  }

  async listAssets(): Promise<LocalAsset[]> {
    const store = await this.store()
    return (await store.listAssets()).sort((a, b) => b.createdAt - a.createdAt)
  }

  async deleteAsset(id: string): Promise<void> {
    const key = id.toLowerCase()
    const store = await this.store()
    await store.deleteAsset(key)
    const url = this.objectUrls.get(key)
    if (url) {
      URL.revokeObjectURL(url)
      this.objectUrls.delete(key)
    }
  }

  /** A cached `blob:` URL for a stored asset (or null when it no longer exists). */
  async getAssetObjectUrl(id: string): Promise<string | null> {
    const key = id.toLowerCase()
    const cached = this.objectUrls.get(key)
    if (cached) return cached
    const asset = await this.getAsset(key)
    if (!asset) return null
    const raced = this.objectUrls.get(key)
    if (raced) return raced
    const url = URL.createObjectURL(asset.blob)
    this.objectUrls.set(key, url)
    this.hookUnload()
    return url
  }

  revokeObjectUrls(): void {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url))
    this.objectUrls.clear()
  }

  private hookUnload(): void {
    if (this.unloadHooked || typeof window === 'undefined') return
    this.unloadHooked = true
    window.addEventListener('pagehide', () => this.revokeObjectUrls())
  }

  async estimateUsage(): Promise<StorageUsage> {
    const assets = await this.listAssets()
    const assetBytes = assets.reduce((sum, asset) => sum + asset.blob.size, 0)
    let usage: number | null = null
    let quota: number | null = null
    try {
      const estimate = await navigator.storage?.estimate?.()
      usage = estimate?.usage ?? null
      quota = estimate?.quota ?? null
    } catch {
      usage = null
      quota = null
    }
    return { usage, quota, assetBytes }
  }

  /** Politely asks the browser not to evict our data; asked once per browser profile. */
  async requestPersistence(): Promise<boolean> {
    if (this.mode === 'memory' || safeGetItem(PERSIST_FLAG)) return false
    try {
      if (!navigator.storage?.persist) return false
      safeSetItem(PERSIST_FLAG, '1')
      return await navigator.storage.persist()
    } catch {
      return false
    }
  }

  async clear(): Promise<void> {
    const store = await this.store()
    await store.clear()
    this.revokeObjectUrls()
  }
}

export const localRepository = new LocalRepository()
