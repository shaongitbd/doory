import type { UpscaleWorkerReply, UpscaleWorkerRequest } from './protocol'
import { t } from '../../strings'
import { UpscaleError, type UpscaleRequestOptions } from './types'

export type UpscaleProgress = (percent: number) => void

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
}

/**
 * Runs one upscale in a dedicated worker and returns the encoded image (WebP for photos, PNG for
 * pixel art). Aborting terminates the worker, which is the only way to interrupt a synchronous pixel
 * loop; no partial result is ever applied.
 */
export function upscaleImage(image: Blob, options: UpscaleRequestOptions, onProgress?: UpscaleProgress, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(abortError(signal))
  let worker: Worker
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'doory-upscale' })
  } catch {
    return Promise.reject(new UpscaleError('The upscaling worker could not be started.'))
  }

  return new Promise<Blob>((resolve, reject) => {
    let settled = false
    const finish = (done: () => void): void => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      worker.terminate()
      done()
    }
    const onAbort = (): void => finish(() => reject(signal ? abortError(signal) : new DOMException('Aborted', 'AbortError')))

    signal?.addEventListener('abort', onAbort, { once: true })
    onProgress?.(0)
    worker.onmessage = (event: MessageEvent<UpscaleWorkerReply>) => {
      const reply = event.data
      if (reply.type === 'progress') {
        if (!settled) onProgress?.(reply.percent)
        return
      }
      if (reply.type === 'done') finish(() => resolve(reply.result))
      else finish(() => reject(new UpscaleError(reply.message || t.errors.upscale)))
    }
    // An uncaught error in the worker (out of memory, most often) has a browser's wording: say it plainly.
    worker.onerror = () => finish(() => reject(new UpscaleError(t.errors.upscale)))
    worker.onmessageerror = () => finish(() => reject(new UpscaleError(t.errors.upscale)))

    const request: UpscaleWorkerRequest = { type: 'run', id: 1, image, options }
    worker.postMessage(request)
  })
}
