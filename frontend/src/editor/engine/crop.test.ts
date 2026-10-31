import { FabricImage, type FabricObject } from 'fabric'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { installImageStub } from '../test/imageStub'
import { type CropGeometry, clampCrop, cropToFrame, fitAspect, frameToCrop, trimCrop } from './crop'
import { EditorEngine } from './editor'

const base: CropGeometry = { natW: 400, natH: 200, sx: 0.5, sy: 0.5, angle: 0, flipX: false, flipY: false, ghostCenter: { x: 300, y: 200 } }

describe('crop geometry', () => {
  it('a full-image crop maps to a frame the size of the scaled image, centred on the ghost', () => {
    const f = cropToFrame(base, { cropX: 0, cropY: 0, width: 400, height: 200 })
    expect(f).toEqual({ cx: 300, cy: 200, w: 200, h: 100 })
  })

  it('frameToCrop inverts cropToFrame for arbitrary rotation and flips', () => {
    for (const angle of [0, 30, 90, 217]) {
      for (const flipX of [false, true]) {
        for (const flipY of [false, true]) {
          const g = { ...base, angle, flipX, flipY }
          const c = { cropX: 40, cropY: 25, width: 180, height: 90 }
          const back = frameToCrop(g, cropToFrame(g, c))
          expect(back.cropX).toBeCloseTo(c.cropX, 6)
          expect(back.cropY).toBeCloseTo(c.cropY, 6)
          expect(back.width).toBeCloseTo(c.width, 6)
          expect(back.height).toBeCloseTo(c.height, 6)
        }
      }
    }
  })

  it('moving the frame right moves the crop window right (and left when flipped)', () => {
    const c = { cropX: 100, cropY: 50, width: 100, height: 100 }
    const f = cropToFrame(base, c)
    expect(frameToCrop(base, { ...f, cx: f.cx + 20 }).cropX).toBeCloseTo(140)
    const flipped = { ...base, flipX: true }
    const ff = cropToFrame(flipped, c)
    expect(frameToCrop(flipped, { ...ff, cx: ff.cx + 20 }).cropX).toBeCloseTo(60)
  })

  it('moving along a rotated axis uses the image axes', () => {
    const g = { ...base, angle: 90 }
    const c = { cropX: 100, cropY: 50, width: 100, height: 100 }
    const f = cropToFrame(g, c)
    // At 90° the image x axis points down the screen.
    expect(frameToCrop(g, { ...f, cy: f.cy + 10 }).cropX).toBeCloseTo(120)
  })

  it('clamps to the image bounds and size', () => {
    expect(clampCrop(base, { cropX: -50, cropY: 190, width: 100, height: 50 })).toEqual({ cropX: 0, cropY: 150, width: 100, height: 50 })
    expect(clampCrop(base, { cropX: 0, cropY: 0, width: 9999, height: 9999 })).toMatchObject({ width: 400, height: 200 })
    expect(clampCrop(base, { cropX: 0, cropY: 0, width: 0, height: 0 }).width).toBe(8)
  })

  it('trims the parts of a region that lie outside the image', () => {
    expect(trimCrop(base, { cropX: -50, cropY: 150, width: 200, height: 100 })).toEqual({ cropX: 0, cropY: 150, width: 150, height: 50 })
    expect(trimCrop(base, { cropX: 10, cropY: 20, width: 100, height: 50 })).toEqual({ cropX: 10, cropY: 20, width: 100, height: 50 })
  })

  it('fits an aspect ratio inside the image around the current centre', () => {
    const full = { cropX: 0, cropY: 0, width: 400, height: 200 }
    const sq = fitAspect(base, full, 1)
    expect(sq.width / sq.height).toBeCloseTo(1)
    expect(sq.height).toBeCloseTo(200)
    expect(sq.cropX).toBeCloseTo(100)
    const wide = fitAspect(base, { cropX: 100, cropY: 50, width: 100, height: 100 }, 2)
    expect(wide.width / wide.height).toBeCloseTo(2)
    expect(wide.cropX).toBeGreaterThanOrEqual(0)
    expect(wide.cropX + wide.width).toBeLessThanOrEqual(400)
  })

  it('accounts for non-uniform scale when matching the visual aspect', () => {
    const g = { ...base, sx: 1, sy: 0.5 }
    const c = fitAspect(g, { cropX: 0, cropY: 0, width: 400, height: 200 }, 1)
    expect((c.width * g.sx) / (c.height * g.sy)).toBeCloseTo(1)
  })
})

describe('crop session', () => {
  let restore: () => void
  beforeEach(() => {
    restore = installImageStub({ width: 200, height: 100 })
    vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined)
    URL.createObjectURL = vi.fn(() => 'blob:fake')
  })
  afterEach(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    vi.restoreAllMocks()
    restore()
    document.body.innerHTML = ''
  })

  async function setup() {
    const engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const pageId = engine.state.doc.pages[0].id
    engine.mountPage(pageId, host)
    const view = await engine.whenView(pageId)
    view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
    await engine.insert.imageFiles([new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })])
    await vi.waitFor(() => expect(view.canvas.getObjects()).toHaveLength(1))
    const img = view.canvas.getObjects()[0] as FabricImage
    view.selectObjects([img])
    await engine.crop.start()
    const frame = view.canvas.getActiveObject() as FabricObject
    // Alt held, so snapping stays out of the way.
    const e = new MouseEvent('mousemove', { altKey: true })
    const drag = (patch: { scaleX?: number; scaleY?: number; left?: number }): void => {
      frame.set(patch)
      view.canvas.fire('object:scaling', { target: frame, e } as never)
    }
    const move = (left: number): void => {
      frame.set({ left })
      view.canvas.fire('object:moving', { target: frame, e } as never)
    }
    const release = (): void => void view.canvas.fire('object:modified', { target: frame } as never)
    return { engine, img, frame, drag, move, release }
  }

  it('crops one side without moving the other', async () => {
    const { engine, img, drag, release } = await setup()
    drag({ scaleX: 0.5 })
    release()
    expect(img.width).toBeCloseTo(100)
    for (let i = 1; i <= 10; i++) drag({ scaleY: 1 - i * 0.04 })
    release()
    expect(img.width).toBeCloseTo(100)
    expect(img.height).toBeCloseTo(60)
    engine.dispose()
  })

  it('stops a resize at the edge of the image without moving the other side', async () => {
    const { engine, img, frame, drag, release } = await setup()
    drag({ scaleX: 0.5 })
    release()
    expect(img.cropX).toBeCloseTo(50)
    expect(img.cropX + img.width).toBeCloseTo(150)
    // Fabric's left handle keeps the right edge where it is.
    const right = frame.getCenterPoint().x + frame.width / 2
    drag({ scaleX: 2, left: right - frame.width })
    release()
    expect(img.cropX).toBeCloseTo(0)
    expect(img.cropX + img.width).toBeCloseTo(150)
    engine.dispose()
  })

  it('keeps the size when the frame is moved past the edge of the image', async () => {
    const { engine, img, frame, drag, move, release } = await setup()
    drag({ scaleX: 0.5 })
    release()
    move(frame.left - frame.width)
    release()
    expect(img.cropX).toBeCloseTo(0)
    expect(img.width).toBeCloseTo(100)
    engine.dispose()
  })
})
