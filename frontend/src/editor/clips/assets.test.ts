import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssetRef, VideoService } from '@/types/adapter'
import { whenProcessed } from './assets'

const ref = (status: 'ready' | 'processing'): AssetRef => ({
  id: 'c',
  url: '/media/c.mp4',
  thumbUrl: '',
  width: 160,
  height: 90,
  name: 'c.mp4',
  kind: 'video',
  video: { status, error: '', posterUrl: '/media/c.webp', audioUrl: '', durationMs: 1000, fps: 30, filmstrip: null },
})

const service = (get: VideoService['get']): VideoService => ({ get } as unknown as VideoService)

describe('whenProcessed', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks again until the clip is ready, leaving no listener behind on the signal', async () => {
    vi.useFakeTimers()
    const answers = [ref('processing'), ref('processing'), ref('ready')]
    const get = vi.fn(async () => answers.shift()!)
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, 'addEventListener')
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const done = whenProcessed(service(get), ref('processing'), controller.signal, 10)
    await vi.advanceTimersByTimeAsync(30)
    await expect(done).resolves.toMatchObject({ video: { status: 'ready' } })
    expect(get).toHaveBeenCalledTimes(3)
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length)
  })

  it('stops when the signal goes while the server is being asked', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const get = vi.fn(async () => {
      controller.abort()
      return ref('processing')
    })
    const done = whenProcessed(service(get), ref('processing'), controller.signal, 10)
    const settled = expect(done).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(100)
    await settled
    expect(get).toHaveBeenCalledTimes(1)
  })
})
