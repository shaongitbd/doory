import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { FabricImage } from 'fabric'
import type { DocObject, DocPage } from '@/types/document'
import type { LoadContext } from '../engine/serialization'
import { installImageStub } from '../test/imageStub'
import { context2d, createCanvas } from './canvasFx'
import type { ClipFrameSource, ClipMediaFactory } from './clipSource'
import { createFrameRenderer } from './frameRenderer'

const ctx: LoadContext = { resolveSrc: async (s) => s, ensureFonts: async () => undefined }
const SIZE = { width: 100, height: 60 }

function solid(color: string, w = 40, h = 20): HTMLCanvasElement {
  const c = createCanvas(w, h)
  const g = context2d(c)
  g.fillStyle = color
  g.fillRect(0, 0, w, h)
  return c
}

const clip = (over: Partial<DocObject> = {}): DocObject => ({
  id: 'clip',
  type: 'image',
  src: '/media/poster.webp',
  left: 10,
  top: 10,
  width: 40,
  height: 20,
  originX: 'left',
  originY: 'top',
  videoSrc: '/media/c.mp4',
  videoDurationMs: 5000,
  videoStartMs: 1000,
  ...over,
})
const page = (objects: DocObject[]): DocPage => ({ id: 'p', background: { type: 'solid', color: '#ffffff' }, objects })

function pixelAt(canvas: HTMLCanvasElement, x: number, y: number): [number, number, number] {
  const d = context2d(canvas).getImageData(x, y, 1, 1).data
  return [d[0], d[1], d[2]]
}

/** A source whose picture the test sets, recording what it is asked for. */
function fakeSource() {
  const state = { picture: null as HTMLCanvasElement | null, version: 0, wants: [] as [number, boolean][], disposed: false, readyFor: [] as number[] }
  const source: ClipFrameSource = {
    get version() {
      return state.version
    },
    want: (ms, moving) => void state.wants.push([ms, moving]),
    ready: async (ms) => void state.readyFor.push(ms),
    frame: () => state.picture,
    setClock: vi.fn(),
    suspend: vi.fn(),
    dispose: () => void (state.disposed = true),
  }
  const show = (color: string): void => {
    state.picture = solid(color, 80, 40)
    state.version++
  }
  return { state, source, show }
}

describe('video clips in the frame renderer', () => {
  // jsdom decodes no pictures: the poster "loads" at its size but has no pixels (the page shows through).
  let restoreImages: () => void
  beforeAll(() => {
    restoreImages = installImageStub({ width: 40, height: 20 })
  })
  afterAll(() => restoreImages())

  it('is a picture like any other without a media source (thumbnails, server export)', async () => {
    vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined) // the stubbed poster can't be drawn
    const media = vi.fn()
    const renderer = await createFrameRenderer(page([clip()]), SIZE, ctx, { multiplier: 1 })
    expect(renderer.hasClips).toBe(false)
    expect(media).not.toHaveBeenCalled()
    await expect(renderer.prepare(2000)).resolves.toBeUndefined()
    vi.restoreAllMocks()
  })

  it('shows the clip picture of the moment, scaled to the object', async () => {
    const fake = fakeSource()
    const media: ClipMediaFactory = vi.fn(() => fake.source)
    const renderer = await createFrameRenderer(page([clip()]), SIZE, ctx, { multiplier: 1, media })
    expect(renderer.hasClips).toBe(true)
    expect(media).toHaveBeenCalledWith(expect.objectContaining({ url: '/media/c.mp4', speed: 1 }), expect.any(Function))
    // No picture yet: the poster (blank here).
    expect(pixelAt(renderer.render(0), 30, 20)).toEqual([255, 255, 255])
    fake.show('#0000ff')
    expect(pixelAt(renderer.render(0), 30, 20)).toEqual([0, 0, 255])
    // Outside the object nothing changes.
    expect(pixelAt(renderer.canvas, 80, 50)).toEqual([255, 255, 255])
  })

  it('draws again when the picture changes although nothing else did', async () => {
    const fake = fakeSource()
    const renderer = await createFrameRenderer(page([clip()]), SIZE, ctx, { multiplier: 1, media: () => fake.source })
    fake.show('#0000ff')
    renderer.render(500)
    fake.show('#00ff00')
    expect(pixelAt(renderer.render(500), 30, 20)).toEqual([0, 255, 0])
  })

  it('asks for the clip time of the page time, and whether the clip is moving', async () => {
    const fake = fakeSource()
    const renderer = await createFrameRenderer(page([clip({ videoTrimStartMs: 2000 })]), SIZE, ctx, { multiplier: 1, media: () => fake.source })
    renderer.render(500)
    renderer.render(1500)
    renderer.render(9000)
    expect(fake.state.wants).toEqual([
      [2000, false],
      [2500, true],
      [5000, false],
    ])
    await renderer.prepare(1500)
    expect(fake.state.readyFor).toEqual([2500])
  })

  it('passes the clock on and lets go of its sources', async () => {
    const fake = fakeSource()
    const renderer = await createFrameRenderer(page([clip()]), SIZE, ctx, { multiplier: 1, media: () => fake.source })
    renderer.setMediaClock(true, 2)
    expect(fake.source.setClock).toHaveBeenCalledWith(true, 2)
    renderer.suspendMedia()
    expect(fake.source.suspend).toHaveBeenCalled()
    renderer.dispose()
    expect(fake.state.disposed).toBe(true)
  })

  it('decodes a clip once for itself and its blurred background', async () => {
    const fake = fakeSource()
    const media = vi.fn(() => fake.source)
    const renderer = await createFrameRenderer(page([clip({ id: 'backdrop', videoBackdropOf: 'clip' }), clip()]), SIZE, ctx, { multiplier: 1, media })
    expect(media).toHaveBeenCalledTimes(1)
    renderer.dispose()
    expect(fake.state.disposed).toBe(true)
  })

  it('keeps a mask on the clip', async () => {
    const fake = fakeSource()
    const renderer = await createFrameRenderer(page([clip({ maskShape: 'circle' })]), SIZE, ctx, { multiplier: 1, media: () => fake.source })
    fake.show('#0000ff')
    const frame = renderer.render(0)
    expect(pixelAt(frame, 30, 20)).toEqual([0, 0, 255]) // the middle
    expect(pixelAt(frame, 11, 11)).toEqual([255, 255, 255]) // a corner, outside the circle
  })
})
