import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorAdapter } from '@/types/adapter'
import type { DocPage } from '@/types/document'
import type { EditorEngine } from '../../engine/editor'
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from '../../engine/export/registry'
import { setBrowserWebpForTests } from '../../engine/export/raster'
import { canvasToBlob } from '../../engine/render'
import { type PreviewInput, usePreview } from './usePreview'

vi.mock('../../engine/render', () => ({
  renderPageToCanvas: vi.fn(async () => document.createElement('canvas')),
  canvasToBlob: vi.fn(async (_canvas: HTMLCanvasElement, type = 'image/png') => new Blob(['x'], { type })),
  safeMultiplier: (_width: number, _height: number, multiplier: number) => multiplier,
}))

const page: DocPage = { id: 'p', background: { type: 'solid', color: '#ffffff' }, objects: [] }
const size = { width: 400, height: 300 }

function engineWith(adapter: Partial<EditorAdapter> = {}): EditorEngine {
  return { adapter, loadContext: {} } as unknown as EditorEngine
}

function input(engine: EditorEngine, options: Partial<ExportOptions> = {}): PreviewInput {
  return { engine, page, size, format: 'jpg', options: { ...DEFAULT_EXPORT_OPTIONS, ...options }, formats: ['png', 'jpg', 'webp'] }
}

/** Lets the delayed drawing, then the encoding, run (effects start once each step is shown). */
const settle = async () => {
  await act(() => vi.advanceTimersByTimeAsync(1000))
  await act(() => vi.advanceTimersByTimeAsync(1000))
}

let made = 0
const revoked: string[] = []

beforeEach(() => {
  vi.useFakeTimers()
  setBrowserWebpForTests(true)
  made = 0
  revoked.length = 0
  URL.createObjectURL = vi.fn(() => `blob:${++made}`)
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url))
  vi.mocked(canvasToBlob).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  setBrowserWebpForTests(null)
})

describe('usePreview', () => {
  it('keeps the original while the file side changes, and lets each picture go only once it is replaced', async () => {
    const engine = engineWith()
    const view = renderHook((props: PreviewInput) => usePreview(props), { initialProps: input(engine) })
    await settle()
    const original = view.result.current.original
    expect(original).not.toBeNull()
    const seen: string[] = []
    for (let i = 0; i < 8; i++) {
      view.rerender(input(engine, { quality: 0.5 + i / 20 }))
      await settle()
      seen.push(view.result.current.after as string)
    }
    expect(view.result.current.original).toBe(original)
    expect(revoked).not.toContain(original)
    // Every file picture but the one on screen is gone.
    expect(revoked).toEqual(expect.arrayContaining(seen.slice(0, -1)))
    expect(revoked).not.toContain(seen[seen.length - 1])
    view.unmount()
    expect(revoked).toEqual(expect.arrayContaining([original, seen[seen.length - 1]]))
  })

  it('a quick change stops the run before it, between formats', async () => {
    let release: (() => void) | null = null
    vi.mocked(canvasToBlob).mockImplementation(async (_canvas, type = 'image/png', quality) => {
      // The first JPG of the first run waits until the test lets it go.
      if (type === 'image/jpeg' && quality === 0.3 && !release) await new Promise<void>((resolve) => (release = resolve))
      return new Blob(['x'], { type })
    })
    const engine = engineWith()
    const view = renderHook((props: PreviewInput) => usePreview(props), { initialProps: input(engine, { quality: 0.3 }) })
    await settle()
    expect(release).not.toBeNull()
    view.rerender(input(engine, { quality: 0.6 }))
    await act(async () => release?.())
    await settle()
    const webp = vi.mocked(canvasToBlob).mock.calls.filter(([, type]) => type === 'image/webp').map(([, , quality]) => quality)
    expect(webp).toEqual([0.6])
  })
})
