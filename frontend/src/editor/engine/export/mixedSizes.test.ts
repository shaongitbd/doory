import { unzipSync } from 'fflate'
import { createBlankDocument } from '@/lib/document'
import type { DocObject, DocPage, DoryDocument } from '@/types/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorEngine } from '../editor'
import { runExport } from './exporter'
import { pageMultiplier } from './formats'
import { DEFAULT_EXPORT_OPTIONS, pageFilename } from './registry'

const rect = (id: string, left: number, top: number): DocObject => ({
  id,
  type: 'rect',
  left,
  top,
  width: 40,
  height: 20,
  scaleX: 1,
  scaleY: 1,
  fill: '#e11d48',
  originX: 'center',
  originY: 'center',
})

/** A poster, a flyer and a card in one design. */
function mixedDocument(): DoryDocument {
  const base = createBlankDocument(1080, 1920)
  const flyer: DocPage = { id: 'flyer', background: { type: 'solid', color: '#ffffff' }, objects: [rect('f', 100, 100)], width: 794, height: 1123 }
  const card: DocPage = { id: 'card', background: { type: 'solid', color: '#ffffff' }, objects: [rect('c', 100, 60)], width: 336, height: 192 }
  return { ...base, pages: [{ ...base.pages[0], id: 'poster', objects: [rect('p', 540, 960)] }, flyer, card] }
}

function makeEngine(doc = mixedDocument()) {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({ adapter: handle.adapter, document: doc, meta: { id: 'm', title: 'Launch Kit', mode: 'guest' }, ephemeral: true })
  return { engine, handle }
}

const readBlob = (blob: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as ArrayBuffer)
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(blob)
  })
const bytes = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await readBlob(blob))
const pngSize = (b: Uint8Array): { width: number; height: number } => {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

describe('exports of a design with pages of different sizes', () => {
  it('PNG: every page at its own size times the scale, in one ZIP named after the design', async () => {
    const { engine } = makeEngine()
    const files = await runExport(engine, { formatId: 'png', pages: { kind: 'all' }, options: { ...DEFAULT_EXPORT_OPTIONS, scale: 2 } })
    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('Launch-Kit.zip')
    const entries = unzipSync(await bytes(files[0].blob))
    expect(Object.keys(entries)).toEqual(['Launch-Kit-01.png', 'Launch-Kit-02.png', 'Launch-Kit-03.png'])
    expect(pngSize(entries['Launch-Kit-01.png'])).toEqual({ width: 2160, height: 3840 })
    expect(pngSize(entries['Launch-Kit-02.png'])).toEqual({ width: 1588, height: 2246 })
    expect(pngSize(entries['Launch-Kit-03.png'])).toEqual({ width: 672, height: 384 })
    engine.dispose()
  }, 30_000)

  it('JPG: the same, as JPEG files', async () => {
    const { engine } = makeEngine()
    const [zip] = await runExport(engine, { formatId: 'jpg', pages: { kind: 'pages', pages: [2, 3] }, options: DEFAULT_EXPORT_OPTIONS })
    const entries = unzipSync(await bytes(zip.blob))
    expect(Object.keys(entries)).toEqual(['Launch-Kit-02.jpg', 'Launch-Kit-03.jpg'])
    for (const data of Object.values(entries)) expect(Array.from(data.slice(0, 2))).toEqual([0xff, 0xd8])
    engine.dispose()
  }, 30_000)

  it('a single chosen page is one plain file, not an archive', async () => {
    const { engine } = makeEngine()
    const files = await runExport(engine, { formatId: 'png', pages: { kind: 'pages', pages: [3] }, options: DEFAULT_EXPORT_OPTIONS })
    expect(files.map((f) => f.filename)).toEqual(['Launch-Kit.png'])
    expect(pngSize(await bytes(files[0].blob))).toEqual({ width: 336, height: 192 })
    engine.dispose()
  })

  it('files can be asked for one by one', async () => {
    const { engine } = makeEngine()
    const files = await runExport(engine, { formatId: 'png', pages: { kind: 'all' }, options: DEFAULT_EXPORT_OPTIONS, bundle: false })
    expect(files.map((f) => f.filename)).toEqual(['Launch-Kit-01.png', 'Launch-Kit-02.png', 'Launch-Kit-03.png'])
    engine.dispose()
  }, 30_000)

  it('SVG: each page file carries its own width, height and viewBox', async () => {
    const { engine } = makeEngine()
    const [zip] = await runExport(engine, { formatId: 'svg', pages: { kind: 'all' }, options: DEFAULT_EXPORT_OPTIONS })
    const entries = unzipSync(await bytes(zip.blob))
    const root = (name: string): string => new TextDecoder().decode(entries[name]).match(/<svg[^>]*>/)?.[0] ?? ''
    expect(root('Launch-Kit-01.svg')).toMatch(/width="1080"[^>]*height="1920"|height="1920"[^>]*width="1080"/)
    expect(root('Launch-Kit-01.svg')).toContain('viewBox="0 0 1080 1920"')
    expect(root('Launch-Kit-02.svg')).toContain('viewBox="0 0 794 1123"')
    expect(root('Launch-Kit-03.svg')).toContain('viewBox="0 0 336 192"')
    expect(root('Launch-Kit-03.svg')).toMatch(/width="336"/)
    engine.dispose()
  }, 30_000)

  it('PDF: one file whose pages have their own boxes (points = px x 0.75)', async () => {
    const { engine } = makeEngine()
    const files = await runExport(engine, { formatId: 'pdf', pages: { kind: 'all' }, options: DEFAULT_EXPORT_OPTIONS })
    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('Launch-Kit.pdf')
    const text = new TextDecoder('latin1').decode(await bytes(files[0].blob))
    expect(text.startsWith('%PDF-')).toBe(true)
    const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])])
    expect(boxes).toHaveLength(3)
    const expected = [
      [1080, 1920],
      [794, 1123],
      [336, 192],
    ]
    boxes.forEach(([w, h], i) => {
      expect(w).toBeCloseTo(expected[i][0] * 0.75, 1)
      expect(h).toBeCloseTo(expected[i][1] * 0.75, 1)
    })
    engine.dispose()
  }, 60_000)

  it('server PDF: sends one SVG and one size per page, and the first page size for older servers', async () => {
    const { engine, handle } = makeEngine()
    const exportPdf = vi.fn(async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
    handle.adapter.exportPdf = exportPdf
    engine.store.setState({ mode: 'account' })
    await runExport(engine, { formatId: 'pdf-server', pages: { kind: 'all' }, options: DEFAULT_EXPORT_OPTIONS })
    const [input] = exportPdf.mock.calls[0] as unknown as [{ svgPages: string[]; width: number; height: number; sizes: { width: number; height: number }[] }]
    expect(input.svgPages).toHaveLength(3)
    expect(input.sizes).toEqual([
      { width: 1080, height: 1920 },
      { width: 794, height: 1123 },
      { width: 336, height: 192 },
    ])
    expect(input.sizes).toHaveLength(input.svgPages.length)
    expect({ width: input.width, height: input.height }).toEqual(input.sizes[0])
    input.svgPages.forEach((svg, i) => expect(svg).toContain(`viewBox="0 0 ${input.sizes[i].width} ${input.sizes[i].height}"`))
    engine.dispose()
  }, 30_000)

  it('server PDF of a chosen range lists only the sizes of those pages', async () => {
    const { engine, handle } = makeEngine()
    const exportPdf = vi.fn(async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
    handle.adapter.exportPdf = exportPdf
    engine.store.setState({ mode: 'account' })
    await runExport(engine, { formatId: 'pdf-server', pages: { kind: 'pages', pages: [2, 3] }, options: DEFAULT_EXPORT_OPTIONS })
    const [input] = exportPdf.mock.calls[0] as unknown as [{ width: number; sizes: { width: number }[] }]
    expect(input.sizes.map((s) => s.width)).toEqual([794, 336])
    expect(input.width).toBe(794)
    engine.dispose()
  }, 30_000)
})

describe('the scale of each page', () => {
  it('takes a width per page, and keeps one too large for a small page to the largest scale, not the plain scale', () => {
    const options = { ...DEFAULT_EXPORT_OPTIONS, scale: 1, size: '2000w' }
    expect(pageMultiplier(options, { width: 1000, height: 1000 })).toBe(2)
    expect(pageMultiplier(options, { width: 336, height: 192 })).toBe(4)
    expect(pageMultiplier({ ...options, size: '10w' }, { width: 336, height: 192 })).toBe(0.1)
    expect(pageMultiplier({ ...options, size: 'big' }, { width: 336, height: 192 })).toBe(1)
  })
})

describe('page file names', () => {
  it('number pages with at least two digits and as many as the design needs', () => {
    expect(pageFilename('Kit', 'png', 1, 3)).toBe('Kit-01.png')
    expect(pageFilename('Kit', 'png', 12, 12)).toBe('Kit-12.png')
    expect(pageFilename('Kit', 'png', 7, 2, 120)).toBe('Kit-007.png')
    expect(pageFilename('Kit', 'png', 3, 1)).toBe('Kit.png')
  })
})
