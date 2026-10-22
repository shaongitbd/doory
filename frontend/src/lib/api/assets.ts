import type { Asset, AssetQuery, AssetUsage, Page } from '@/types/api'
import { http } from './client'

export interface AssetUploadOptions {
  name?: string
  tags?: string[]
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

export const assetsApi = {
  list: (query: AssetQuery & { ordering?: string } = {}, signal?: AbortSignal) => http.get<Page<Asset>>('/assets/', { query, signal }),
  upload: (file: File | Blob, options: AssetUploadOptions = {}) => {
    const form = new FormData()
    const filename = file instanceof File ? file.name : (options.name ?? 'upload')
    form.append('file', file, filename)
    if (options.name) form.append('name', options.name)
    if (options.tags?.length) form.append('tags', options.tags.join(','))
    return http.post<Asset>('/assets/', { form, signal: options.signal, onUploadProgress: options.onProgress })
  },
  get: (id: string, signal?: AbortSignal) => http.get<Asset>(`/assets/${id}/`, { signal }),
  update: (id: string, input: { name?: string; tags?: string[] }) => http.patch<Asset>(`/assets/${id}/`, { json: input }),
  remove: (id: string) => http.delete<void>(`/assets/${id}/`),
  usage: (signal?: AbortSignal) => http.get<AssetUsage>('/assets/usage/', { signal }),
}
