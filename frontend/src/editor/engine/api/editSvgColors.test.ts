import { FabricImage, type FabricObject } from 'fabric'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { installImageStub } from '../../test/imageStub'
import { EditorEngine } from '../editor'
import { asDory } from '../objects/dory'
import { elementColors } from '../objects/elements'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="100" height="100" fill="#ff0000"/><circle cx="150" cy="50" r="40"/></svg>'

let svgText = SVG

async function setup() {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
  await engine.insert.imageFiles([new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })])
  await vi.waitFor(() => expect(view.canvas.getObjects()).toHaveLength(1))
  const img = view.canvas.getObjects()[0] as FabricImage
  // As an uploaded SVG is: its source is the stored `.svg` file.
  asDory(img).docSrc = '/media/assets/logo.svg'
  asDory(img).assetId = 'asset-1'
  view.selectObjects([img])
  return { engine, view, img }
}

const only = (engine: EditorEngine): Record<string, unknown> => engine.state.doc.pages[0].objects[0] as unknown as Record<string, unknown>

describe('StyleApi.editSvgColors', () => {
  let restore: () => void
  beforeEach(() => {
    svgText = SVG
    restore = installImageStub({ width: 200, height: 100 })
    vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(svgText, { headers: { 'Content-Type': 'image/svg+xml' } })))
    URL.createObjectURL = vi.fn(() => 'blob:fake')
  })
  afterEach(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    restore()
    document.body.innerHTML = ''
  })

  it('turns the uploaded SVG into recolorable shapes in the same place, as one undo step', async () => {
    const { engine, view, img } = await setup()
    const id = asDory(img).id
    expect(engine.style.canEditSvgColors()).toBe(true)

    expect(await engine.style.editSvgColors()).toBe(true)

    const next = view.canvas.getObjects()[0] as FabricObject
    expect(view.canvas.getObjects()).toHaveLength(1)
    expect(asDory(next)).toMatchObject({ id, elementId: 'upload:asset-1', assetId: 'asset-1' })
    expect(elementColors(next).sort()).toEqual(['#000000', '#ff0000'])
    expect(only(engine).elementId).toBe('upload:asset-1')

    engine.style.recolor('#ff0000', '#7a64e0')
    expect(only(engine).colorMap).toEqual({ '#ff0000': '#7a64e0' })

    await engine.undo()
    await engine.undo()
    expect(only(engine).type).toBe('image')
    expect(only(engine).elementId).toBeUndefined()
    engine.dispose()
  })

  it.each([
    ['as it is', false, 1],
    ['flipped', true, -1],
  ])('puts the shapes where the picture showed them, %s', async (_name, flipX, side) => {
    // A 200x100 canvas with one 40x20 shape off-centre: the margins around it must not stretch it.
    svgText = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect x="120" y="40" width="40" height="20" fill="#ff0000"/></svg>'
    const { engine, view, img } = await setup()
    img.set({ scaleX: 2, scaleY: 2, flipX })
    img.setCoords()
    const center = img.getCenterPoint()

    expect(await engine.style.editSvgColors()).toBe(true)

    const next = view.canvas.getObjects()[0] as FabricObject
    // Fabric's box includes the default 1 px stroke width, scaled: 41 x 2.
    expect(next.getScaledWidth()).toBeCloseTo(82, 1)
    expect(next.getScaledHeight()).toBeCloseTo(42, 1)
    // The shape's centre (140, 50) is 40 right of the canvas centre (100, 50): 80 at scale 2, mirrored when flipped.
    expect(next.getCenterPoint().x).toBeCloseTo(center.x + side * 80, 1)
    expect(next.getCenterPoint().y).toBeCloseTo(center.y, 1)
    engine.dispose()
  })

  it('keeps the new colors when the design is opened again', async () => {
    const { engine } = await setup()
    await engine.style.editSvgColors()
    engine.style.recolor('#ff0000', '#7a64e0')
    const saved = structuredClone(engine.state.doc)
    engine.dispose()

    const again = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: saved, meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const pageId = again.state.doc.pages[0].id
    again.mountPage(pageId, host)
    const view = await again.whenView(pageId)
    await vi.waitFor(() => expect(view.canvas.getObjects()).toHaveLength(1))
    const obj = view.canvas.getObjects()[0]
    expect(asDory(obj)).toMatchObject({ elementId: 'upload:asset-1', colorMap: { '#ff0000': '#7a64e0' } })
    const fills = (obj as unknown as { getObjects(): FabricObject[] }).getObjects().map((leaf) => leaf.fill)
    expect(fills).toContain('#7a64e0')
    expect(fills).not.toContain('#ff0000')
    again.dispose()
  })

  it('refuses drawings with parts the shape parser cannot reproduce', async () => {
    const { engine } = await setup()
    svgText = SVG.replace('</svg>', '<text x="10" y="10">Hi</text></svg>')
    const toast = vi.spyOn(engine, 'toast')
    expect(await engine.style.editSvgColors()).toBe(false)
    expect(only(engine).type).toBe('image')
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('text'), 'error')
    engine.dispose()
  })

  it('refuses a cropped picture and leaves it as it is', async () => {
    const { engine, img } = await setup()
    img.set({ cropX: 20, width: 180 })
    expect(await engine.style.editSvgColors()).toBe(false)
    expect(only(engine).type).toBe('image')
    engine.dispose()
  })

  it('refuses a drawing too big to store in the design', async () => {
    const { engine } = await setup()
    svgText = SVG.replace('</svg>', `<!--${'x'.repeat(1_000_001)}--></svg>`)
    expect(await engine.style.editSvgColors()).toBe(false)
    expect(only(engine).type).toBe('image')
    engine.dispose()
  })

  it('is not offered for other pictures', async () => {
    const { engine, img } = await setup()
    asDory(img).docSrc = '/media/assets/photo.png'
    expect(engine.style.canEditSvgColors()).toBe(false)
    expect(await engine.style.editSvgColors()).toBe(false)
    engine.dispose()
  })
})
