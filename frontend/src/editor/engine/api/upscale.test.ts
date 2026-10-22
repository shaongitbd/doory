import { FabricImage } from 'fabric'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { installImageStub } from '../../test/imageStub'
import { EditorEngine } from '../editor'
import { asDory } from '../objects/dory'
import { upscaleImage } from '../upscale'

// jsdom has no worker; the engine only needs the encoded result.
vi.mock('../upscale', async (importOriginal) => ({ ...(await importOriginal<typeof import('../upscale')>()), upscaleImage: vi.fn() }))

async function setup(docSrc = '/media/assets/photo.png') {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
  await engine.insert.imageFiles([new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })])
  await vi.waitFor(() => expect(view.canvas.getObjects()).toHaveLength(1))
  const img = view.canvas.getObjects()[0] as FabricImage
  asDory(img).docSrc = docSrc
  view.selectObjects([img])
  return { engine, handle, img }
}

describe('StyleApi.upscale', () => {
  let restore: () => void
  beforeEach(() => {
    restore = installImageStub({ width: 200, height: 100 })
    vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x'], { type: 'image/png' }))))
    URL.createObjectURL = vi.fn(() => 'blob:fake')
    vi.mocked(upscaleImage).mockReset()
  })
  afterEach(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    restore()
    document.body.innerHTML = ''
  })

  it('is offered for a raster picture', async () => {
    const { engine } = await setup()
    expect(engine.style.canUpscale()).toBe(true)
    engine.dispose()
  })

  it('leaves an SVG alone without fetching or starting the worker', async () => {
    const { engine } = await setup('/media/assets/logo.svg?v=2')
    expect(engine.style.canUpscale()).toBe(false)
    expect(await engine.style.upscale({ scale: 2 })).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(upscaleImage).not.toHaveBeenCalled()
    engine.dispose()
  })

  it('leaves a video clip alone', async () => {
    const { engine, img } = await setup()
    ;(img as unknown as Record<string, unknown>).videoSrc = '/media/clip.mp4'
    expect(engine.style.canUpscale()).toBe(false)
    expect(await engine.style.upscale({ scale: 2 })).toBe(false)
    expect(upscaleImage).not.toHaveBeenCalled()
    engine.dispose()
  })
})
