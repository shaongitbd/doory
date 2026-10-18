import { FabricImage } from 'fabric'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { installImageStub } from '../../test/imageStub'
import { EditorEngine } from '../editor'

const removal = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('../bgRemoval', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../bgRemoval')>()),
  removeBackground: removal.run,
}))

async function setup() {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
  await engine.insert.imageFiles([new File([new Uint8Array([1, 2, 3])], 'cat.png', { type: 'image/png' })])
  await vi.waitFor(() => expect(view.canvas.getObjects()).toHaveLength(1))
  return { engine, handle, view }
}

describe('StyleApi.removeBackground', () => {
  let restore: () => void
  beforeEach(() => {
    restore = installImageStub({ width: 200, height: 100 })
    vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x'], { type: 'image/png' }))))
    URL.createObjectURL = vi.fn(() => 'blob:fake')
    removal.run.mockReset()
  })
  afterEach(async () => {
    // Let Fabric's scheduled repaint run while the image stub is still installed.
    await new Promise((resolve) => requestAnimationFrame(resolve))
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    restore()
    document.body.innerHTML = ''
  })

  it('replaces the selected image with the cut-out and reports it', async () => {
    const { engine, handle } = await setup()
    removal.run.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    const before = engine.state.doc.pages[0].objects[0].src
    const applied = await engine.style.removeBackground()
    expect(applied).toBe(true)
    expect(handle.uploads.map((u) => u.name)).toContain('cutout.png')
    expect(engine.state.doc.pages[0].objects[0].src).not.toBe(before)
    engine.dispose()
  })

  it('hands the abort signal and the progress callback to the engine', async () => {
    const { engine } = await setup()
    removal.run.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    const progress = vi.fn()
    const controller = new AbortController()
    await engine.style.removeBackground(progress, controller.signal)
    expect(removal.run).toHaveBeenCalledWith(expect.anything(), progress, controller.signal)
    engine.dispose()
  })

  it('resolves false instead of throwing when the engine rejects because the run was cancelled', async () => {
    const { engine, handle } = await setup()
    const uploadsBefore = handle.uploads.length
    const controller = new AbortController()
    removal.run.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    expect(await engine.style.removeBackground(undefined, controller.signal)).toBe(false)
    expect(handle.uploads).toHaveLength(uploadsBefore)
    engine.dispose()
  })

  it('still reports a real failure of a run that was not cancelled', async () => {
    const { engine } = await setup()
    removal.run.mockRejectedValue(new Error('boom'))
    await expect(engine.style.removeBackground(undefined, new AbortController().signal)).rejects.toThrow('boom')
    engine.dispose()
  })

  it('leaves the design untouched when cancelled while the model runs', async () => {
    const { engine, handle } = await setup()
    const uploadsBefore = handle.uploads.length
    const controller = new AbortController()
    removal.run.mockImplementation(async () => {
      controller.abort()
      return new Blob(['png'], { type: 'image/png' })
    })
    const doc = engine.state.doc
    expect(await engine.style.removeBackground(undefined, controller.signal)).toBe(false)
    expect(handle.uploads).toHaveLength(uploadsBefore)
    expect(engine.state.doc).toBe(doc)
    engine.dispose()
  })

  it('does not replace a different object when the selection changed meanwhile', async () => {
    const { engine, handle } = await setup()
    const uploadsBefore = handle.uploads.length
    removal.run.mockImplementation(async () => {
      engine.activeView()?.canvas.discardActiveObject()
      return new Blob(['png'], { type: 'image/png' })
    })
    expect(await engine.style.removeBackground()).toBe(false)
    expect(handle.uploads).toHaveLength(uploadsBefore)
    engine.dispose()
  })

  describe('with a server option', () => {
    const cutout = { id: 'cut', url: '/media/cut.png', thumbUrl: '/media/cut.webp', width: 200, height: 100, name: 'cat (no background)', kind: 'image' as const }

    it('runs on the server with the image and its asset, swaps the result in as one undo step and keeps the original', async () => {
      const { engine, handle } = await setup()
      const run = vi.fn(async () => cutout)
      handle.adapter.services.ai = { options: vi.fn(), run, remembered: () => null, remember: vi.fn() }
      const before = engine.state.doc.pages[0].objects[0]
      const uploadsBefore = handle.uploads.length
      const controller = new AbortController()

      expect(await engine.style.removeBackground(undefined, controller.signal, 'env-1:best')).toBe(true)

      expect(removal.run).not.toHaveBeenCalled()
      expect(run).toHaveBeenCalledWith('background-removal', { model: 'env-1:best', image: expect.any(Function), assetId: before.assetId, signal: controller.signal })
      // The image is fetched only when the service asks for it (it may need just the asset).
      const [, input] = run.mock.calls[0] as unknown as [string, { image: () => Promise<Blob> }]
      expect((await input.image()).size).toBeGreaterThan(0)
      expect(handle.uploads).toHaveLength(uploadsBefore) // the server made the asset
      expect(engine.state.doc.pages[0].objects[0]).toMatchObject({ src: '/media/cut.png', assetId: 'cut' })
      await engine.undo()
      expect(engine.state.doc.pages[0].objects[0]).toMatchObject({ src: before.src, assetId: before.assetId })
      engine.dispose()
    })

    it('leaves the design untouched when cancelled while the server works', async () => {
      const { engine, handle } = await setup()
      const controller = new AbortController()
      handle.adapter.services.ai = {
        options: vi.fn(),
        run: vi.fn(async () => {
          controller.abort()
          throw new DOMException('Aborted', 'AbortError')
        }),
        remembered: () => null,
        remember: vi.fn(),
      }
      const doc = engine.state.doc
      expect(await engine.style.removeBackground(undefined, controller.signal, 'env-1:best')).toBe(false)
      expect(engine.state.doc).toBe(doc)
      engine.dispose()
    })

    it('reports the server failure as it is', async () => {
      const { engine, handle } = await setup()
      const failure = new Error('ai_timeout')
      handle.adapter.services.ai = { options: vi.fn(), run: vi.fn(async () => Promise.reject(failure)), remembered: () => null, remember: vi.fn() }
      await expect(engine.style.removeBackground(undefined, undefined, 'env-1:best')).rejects.toBe(failure)
      engine.dispose()
    })

    it('refuses a server option where the adapter has no AI service', async () => {
      const { engine } = await setup()
      await expect(engine.style.removeBackground(undefined, undefined, 'env-1:best')).rejects.toThrow(/No server option/)
      engine.dispose()
    })
  })
})
