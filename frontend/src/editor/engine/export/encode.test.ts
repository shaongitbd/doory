import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import type { EditorAdapter, OptimizeImageInput, OptimizedImage } from '@/types/adapter'
import { DEFAULT_EXPORT_OPTIONS } from './registry'
import { encodeRaster } from './encode'
import { setBrowserWebpForTests, wantsServer } from './raster'
import { t } from '../../strings'

/** A canvas whose encoder answers with `bytes(type, quality)` bytes; `webp: false` answers WebP with a PNG, as Safari does. */
function fakeCanvas({ webp = true, bytes = (_type: string, quality = 1) => Math.round(1000 * quality) + 100 } = {}): HTMLCanvasElement & { calls: string[] } {
  const calls: string[] = []
  return {
    width: 10,
    height: 10,
    calls,
    toBlob(callback: BlobCallback, type = 'image/png', quality?: number) {
      const real = type === 'image/webp' && !webp ? 'image/png' : type
      calls.push(`${real}@${quality ?? '-'}`)
      callback(new Blob(['x'.repeat(bytes(real, quality))], { type: real }))
    },
  } as unknown as HTMLCanvasElement & { calls: string[] }
}

const ok = (input: OptimizeImageInput): OptimizedImage => ({ blob: new Blob(['opt'], { type: `image/${input.format === 'jpg' ? 'jpeg' : input.format}` }), format: input.format, width: 10, height: 10, quality: input.quality ?? null, bytesBefore: 900, optimizer: 'builtin', optimized: true, warnings: [] })

function server(answer: (input: OptimizeImageInput) => Promise<OptimizedImage> = async (input) => ok(input)): Pick<EditorAdapter, 'imageOptimize' | 'optimizeImage'> & { optimizeImage: ReturnType<typeof vi.fn> } {
  return {
    imageOptimize: { formats: ['png', 'jpg', 'webp', 'avif'], optimizers: [{ id: 'builtin', name: 'Built-in', formats: ['jpg', 'png'], sendsOffsite: false }], default: 'builtin' },
    optimizeImage: vi.fn(answer),
  }
}

const options = { ...DEFAULT_EXPORT_OPTIONS, quality: 0.82 }

afterEach(() => {
  setBrowserWebpForTests(null)
  vi.useRealTimers()
})

describe('encodeRaster: the browser first, the server when it helps', () => {
  it('keeps the browser file when nothing asks for the server', async () => {
    const adapter = server()
    const out = await encodeRaster(fakeCanvas(), 'jpg', options, adapter)
    expect(out.format).toBe('jpg')
    expect(out.blob.type).toBe('image/jpeg')
    expect(out.note).toBeUndefined()
    expect(adapter.optimizeImage).not.toHaveBeenCalled()
  })

  it('sends the drawn PNG with the options when an optimizer is on', async () => {
    const adapter = server()
    const out = await encodeRaster(fakeCanvas(), 'jpg', { ...options, optimize: true, optimizer: 'builtin', progressive: true }, adapter)
    const input = adapter.optimizeImage.mock.calls[0][0] as OptimizeImageInput
    expect(input.file.type).toBe('image/png')
    expect(input).toMatchObject({ format: 'jpg', quality: 82, optimize: 'builtin', progressive: true, stripMetadata: true, transparent: false })
    expect(out).toMatchObject({ format: 'jpg', optimized: true, bytesBefore: 900 })
    expect(out.blob.size).toBe(3)
  })

  it('on a server failure keeps the browser file and says so', async () => {
    const adapter = server(async () => {
      throw new ApiError({ status: 503, code: 'export_busy', message: 'Busy' })
    })
    const out = await encodeRaster(fakeCanvas(), 'png', { ...options, optimize: true }, adapter)
    expect(out.format).toBe('png')
    expect(out.optimized).toBe(false)
    expect(out.note).toBe(t.dialog.downloadServerSkipped)
  })

  it('AVIF always takes the server, and falls back to a PNG that says what it is', async () => {
    const adapter = server(async () => {
      throw new ApiError({ status: 0, code: 'network_error', message: 'offline' })
    })
    const out = await encodeRaster(fakeCanvas(), 'avif', options, adapter)
    expect(adapter.optimizeImage).toHaveBeenCalledWith(expect.objectContaining({ format: 'avif', optimize: false }))
    expect(out.format).toBe('png')
    expect(out.blob.type).toBe('image/png')
    expect(out.note).toBe(t.dialog.downloadNoServer('AVIF'))
  })

  it('WebP where the browser answers with a PNG goes to the server; without one the PNG stays', async () => {
    setBrowserWebpForTests(false)
    const canvas = fakeCanvas({ webp: false })
    const adapter = server()
    expect((await encodeRaster(canvas, 'webp', options, adapter)).format).toBe('webp')
    expect(adapter.optimizeImage).toHaveBeenCalledWith(expect.objectContaining({ format: 'webp' }))
    const alone = await encodeRaster(canvas, 'webp', options, {})
    expect(alone.format).toBe('png')
    expect(alone.note).toBe(t.dialog.downloadNoServer('WEBP'))
  })

  it('a WebP the browser says it makes but answers as PNG is still caught by its type', async () => {
    setBrowserWebpForTests(true)
    const out = await encodeRaster(fakeCanvas({ webp: false }), 'webp', options, {})
    expect(out.format).toBe('png')
  })

  it('a cancel is passed on, not swallowed', async () => {
    const adapter = server(async () => {
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(encodeRaster(fakeCanvas(), 'jpg', { ...options, optimize: true }, adapter)).rejects.toThrow('Aborted')
  })

  it('asked to slow down (429), waits as long as the server says and tries again', async () => {
    vi.useFakeTimers()
    const busy = new ApiError({ status: 429, code: 'throttled', message: 'Slow down', retryAfter: 7 })
    const adapter = server()
    adapter.optimizeImage.mockRejectedValueOnce(busy)
    const pending = encodeRaster(fakeCanvas(), 'jpg', { ...options, optimize: true }, adapter)
    await vi.advanceTimersByTimeAsync(6900)
    expect(adapter.optimizeImage).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    const out = await pending
    expect(adapter.optimizeImage).toHaveBeenCalledTimes(2)
    expect(out).toMatchObject({ format: 'jpg', optimized: true })
    expect(out.note).toBeUndefined()
  })

  it('waits at most a minute per try, and keeps the browser file after a few tries', async () => {
    vi.useFakeTimers()
    const adapter = server(async () => {
      throw new ApiError({ status: 429, code: 'throttled', message: 'Slow down', retryAfter: 3600 })
    })
    const pending = encodeRaster(fakeCanvas(), 'jpg', { ...options, optimize: true }, adapter)
    await vi.advanceTimersByTimeAsync(59_000)
    expect(adapter.optimizeImage).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(adapter.optimizeImage).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(120_000)
    const out = await pending
    expect(adapter.optimizeImage).toHaveBeenCalledTimes(4)
    expect(out).toMatchObject({ format: 'jpg', optimized: false, note: t.dialog.downloadServerSkipped })
  })

  it('a cancel during the wait stops at once, without another try', async () => {
    vi.useFakeTimers()
    const adapter = server(async () => {
      throw new ApiError({ status: 429, code: 'throttled', message: 'Slow down', retryAfter: 30 })
    })
    const controller = new AbortController()
    const pending = encodeRaster(fakeCanvas(), 'jpg', { ...options, optimize: true }, adapter, controller.signal)
    const failed = expect(pending).rejects.toThrow('Aborted')
    await vi.advanceTimersByTimeAsync(1000)
    controller.abort()
    await failed
    await vi.advanceTimersByTimeAsync(60_000)
    expect(adapter.optimizeImage).toHaveBeenCalledTimes(1)
  })

  it('fits a cap in the browser by lowering the quality', async () => {
    const canvas = fakeCanvas({ bytes: (_type, quality = 1) => Math.round(2000 * quality) })
    const out = await encodeRaster(canvas, 'jpg', { ...options, maxBytes: 1000 }, {})
    expect(out.blob.size).toBeLessThanOrEqual(1000)
    expect(out.blob.size).toBeGreaterThan(900)
  })

  it('palette PNGs and progressive JPGs need the server; plain ones do not', () => {
    setBrowserWebpForTests(true)
    expect(wantsServer('png', options)).toBe(false)
    expect(wantsServer('png', { ...options, pngColors: 256 })).toBe(true)
    expect(wantsServer('jpg', { ...options, progressive: true })).toBe(true)
    expect(wantsServer('webp', options)).toBe(false)
    expect(wantsServer('avif', options)).toBe(true)
  })
})
