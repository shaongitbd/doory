import type { Asset, AudioStockInfo, SoundCredit, StockPage, StockPhoto, StockProviders, StockSoundPage, StockVideo, StockVideoPage, VideoInfo, VideoLength, VideoOrientation } from '@/types/api'
import { API_BASE, http } from './client'

export interface StockSearchOptions {
  /** A provider name or `all`; the server picks the first provider when it is left out. */
  provider?: string
  /** The UI language, for providers that search in it. */
  lang?: string
  perPage?: number
  signal?: AbortSignal
}

export const stockApi = {
  providers: () => http.get<StockProviders>('/stock/providers/'),
  /** `page` is a page number, or the cursor an `all` search returned as `next_page`. */
  search: (q: string, page: number | string = 1, { provider, lang, perPage = 30, signal }: StockSearchOptions = {}) =>
    http.get<StockPage>('/stock/photos/', {
      query: { q, ...(typeof page === 'string' ? { cursor: page } : { page }), per_page: perPage, ...(provider ? { provider } : {}), ...(lang ? { lang } : {}) },
      signal,
    }),
  importPhoto: (photo: Pick<StockPhoto, 'provider' | 'id'>) => http.post<Asset>('/stock/photos/import/', { json: { provider: photo.provider, id: photo.id } }),
}

export interface AudioSearchOptions {
  type?: string
  subcategory?: string
  length?: string
  sort?: string
  page?: number
  perPage?: number
  signal?: AbortSignal
}

/** Freesound through the server: the key, the licence filter and the CDN all stay on the server. */
export const audioStockApi = {
  info: () => http.get<AudioStockInfo>('/stock/audio/info/'),
  search: (q: string, { type, subcategory, length, sort, page = 1, perPage = 20, signal }: AudioSearchOptions = {}) =>
    http.get<StockSoundPage>('/stock/audio/', {
      query: { q, page, per_page: perPage, ...(type && type !== 'all' ? { type } : {}), ...(subcategory ? { subcategory } : {}), ...(length ? { length } : {}), ...(sort ? { sort } : {}) },
      signal,
    }),
  /** Same-origin address of the sound's short preview (relayed by the server). */
  previewUrl: (id: string) => `${API_BASE}/stock/audio/${encodeURIComponent(id)}/preview/`,
  importSound: (id: string) => http.post<Asset & { credit: SoundCredit | null }>('/stock/audio/import/', { json: { id } }),
}

export interface VideoSearchOptions extends StockSearchOptions {
  orientation?: VideoOrientation
  /** short (under 15 s), medium (15 to 60 s) or long (over a minute). */
  length?: VideoLength
}

/** Stock videos through the server: it keeps the keys, downloads the clip and converts it like an upload. */
export const videoStockApi = {
  info: () => http.get<VideoInfo>('/stock/videos/providers/'),
  search: (q: string, page: number | string = 1, { provider, lang, perPage = 24, orientation, length, signal }: VideoSearchOptions = {}) =>
    http.get<StockVideoPage>('/stock/videos/', {
      query: {
        q,
        ...(typeof page === 'string' ? { cursor: page } : { page }),
        per_page: perPage,
        ...(provider ? { provider } : {}),
        ...(lang ? { lang } : {}),
        ...(orientation ? { orientation } : {}),
        ...(length ? { duration: length } : {}),
      },
      signal,
    }),
  importVideo: (video: Pick<StockVideo, 'provider' | 'id'>) => http.post<Asset>('/stock/videos/import/', { json: { provider: video.provider, id: video.id } }),
}
