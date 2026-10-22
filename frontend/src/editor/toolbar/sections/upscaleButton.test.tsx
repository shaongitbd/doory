import { render, screen } from '@testing-library/react'
import { FabricImage } from 'fabric'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorProvider } from '../../EditorProvider'
import { EditorEngine } from '../../engine/editor'
import { asDory } from '../../engine/objects/dory'
import { installImageStub } from '../../test/imageStub'
import { ImageSection } from './image'

// jsdom has no worker or OffscreenCanvas; the button only needs to know that this browser can run it.
vi.mock('../../engine/upscale/support', () => ({ isUpscaleSupported: () => true }))

async function renderSection(docSrc: string) {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'account' }, ephemeral: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
  await engine.insert.imageFiles([new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })])
  await vi.waitFor(() => expect(view.canvas.getObjects()).toHaveLength(1))
  const img = view.canvas.getObjects()[0]
  asDory(img).docSrc = docSrc
  view.selectObjects([img])
  render(
    <EditorProvider engine={engine} portalRoot={document.body}>
      <ImageSection />
    </EditorProvider>,
  )
  return engine
}

describe('Upscale button', () => {
  let restore: () => void
  let engine: EditorEngine | null = null
  beforeEach(() => {
    restore = installImageStub({ width: 200, height: 100 })
    vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined)
    URL.createObjectURL = vi.fn(() => 'blob:fake')
  })
  afterEach(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    engine?.dispose()
    engine = null
    vi.restoreAllMocks()
    restore()
    document.body.innerHTML = ''
  })

  it('is offered for a photo', async () => {
    engine = await renderSection('/media/assets/photo.png')
    expect(await screen.findByTestId('ed-upscale')).toBeInTheDocument()
  })

  it('is not offered for an uploaded SVG', async () => {
    engine = await renderSection('/media/assets/logo.svg')
    await screen.findByTestId('ed-replace-image')
    expect(screen.queryByTestId('ed-upscale')).toBeNull()
  })
})
