/**
 * Video assets as the Videos tool sees them: the server's limits (asked once per service), files the browser may
 * send, and following a clip the server is still converting until it is ready.
 */
import { useEffect, useState } from 'react'
import type { AssetRef, VideoService } from '@/types/adapter'
import type { VideoInfo } from '@/types/api'

/** How often a clip the server is converting is asked about again. */
export const POLL_MS = 3000

/** What the file picker offers; the server decides from the bytes, so this only narrows the dialog. */
export const VIDEO_ACCEPT = 'video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.3gp'

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i

/** True for files that look like videos (by type, or by extension when the browser doesn't say). */
export function looksLikeVideo(file: File): boolean {
  return file.type.startsWith('video/') || (!file.type && VIDEO_EXTENSIONS.test(file.name)) || VIDEO_EXTENSIONS.test(file.name)
}

export function videoFilesFrom(data: DataTransfer | null): File[] {
  return data ? [...data.files].filter(looksLikeVideo) : []
}

const infoCache = new WeakMap<VideoService, Promise<VideoInfo | null>>()

/** The server's video settings, asked once per service; `null` when it can't be asked (the tool then says so). */
export function videoInfo(service: VideoService): Promise<VideoInfo | null> {
  let request = infoCache.get(service)
  if (!request) {
    request = service.info().catch(() => {
      infoCache.delete(service)
      return null
    })
    infoCache.set(service, request)
  }
  return request
}

/** `undefined` while asking, then the server's video settings (or `null`). */
export function useVideoInfo(service: VideoService | null | undefined): VideoInfo | null | undefined {
  const [info, setInfo] = useState<VideoInfo | null | undefined>(undefined)
  useEffect(() => {
    if (!service) return
    let live = true
    void videoInfo(service).then((found) => live && setInfo(found))
    return () => {
      live = false
    }
  }, [service])
  return service ? info : null
}

/** Waits until the server has converted `ref` (or failed to); resolves with the asset as it ends up. */
export async function whenProcessed(service: VideoService, ref: AssetRef, signal?: AbortSignal, intervalMs = POLL_MS): Promise<AssetRef> {
  let current = ref
  while (current.video?.status === 'processing') {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs)
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(new DOMException('Aborted', 'AbortError'))
        },
        { once: true },
      )
    })
    current = await service.get(ref.id)
  }
  return current
}

export const megabytes = (bytes: number): number => Math.round(bytes / (1024 * 1024))
