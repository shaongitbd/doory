import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorEngine } from '../editor'
import { DEFAULT_EXPORT_OPTIONS, exportFormats, pageFilename, parsePageRange, registerExportFormat, sanitizeFilename } from './registry'
import { runExport, selectPages } from './exporter'

async function engineWithShape(pages = 1, width = 200, height = 100) {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(width, height), meta: { id: 'x', title: 'My Design!', mode: 'guest' }, ephemeral: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const id = engine.state.doc.pages[0].id
  engine.mountPage(id, host)
  const view = await engine.whenView(id)
  view.setLayout(1, { x: 0, y: 0, width, height })
  await engine.insert.shape('rect')
  for (let i = 1; i < pages; i++) engine.pages.add()
  return { engine, handle }
}

// jsdom's Blob has no arrayBuffer()/text().
const readBlob = (blob: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as ArrayBuffer)
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(blob)
  })
const bytes = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await readBlob(blob))

describe('export helpers', () => {
  it('parses page ranges', () => {
    expect(parsePageRange('1-3, 5', 5)).toEqual([1, 2, 3, 5])
    expect(parsePageRange('2', 5)).toEqual([2])
    expect(parsePageRange('3-1', 5)).toBeNull()
    expect(parsePageRange('0', 5)).toBeNull()
    expect(parsePageRange('6', 5)).toBeNull()
    expect(parsePageRange('a', 5)).toBeNull()
    expect(parsePageRange('', 5)).toBeNull()
    expect(parsePageRange('2,2,1', 5)).toEqual([1, 2])
  })

  it('builds safe file names', () => {
    expect(sanitizeFilename('My Design! / ../x')).toBe('My-Design-.x')
    expect(sanitizeFilename('Café Menü')).toBe('Cafe-Menu')
    expect(pageFilename('Poster', 'png', 2, 3)).toBe('Poster-02.png')
    expect(pageFilename('Poster', 'png', 1, 1)).toBe('Poster.png')
    expect(pageFilename('', 'svg', 1, 1)).toBe('design.svg')
  })

  it('registers the built-in formats and supports third-party formats', async () => {
    await import('./exporter')
    const ids = exportFormats.list().map((f) => f.id)
    expect(ids).toEqual(expect.arrayContaining(['png', 'jpg', 'pdf', 'svg', 'pdf-server']))
    const off = registerExportFormat({ id: 'txt', label: 'Text', extension: 'txt', mime: 'text/plain', controls: {}, order: 999, run: async () => [{ blob: new Blob(['hi']), filename: 'a.txt' }] })
    expect(exportFormats.get('txt')).toBeDefined()
    off()
    expect(exportFormats.get('txt')).toBeUndefined()
  })
})

describe('runExport', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('PNG: one non-empty PNG file at the requested scale', async () => {
    const { engine } = await engineWithShape()
    const files = await runExport(engine, { formatId: 'png', pages: { kind: 'all' }, options: { ...DEFAULT_EXPORT_OPTIONS, scale: 2 } })
    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('My-Design.png')
    const b = await bytes(files[0].blob)
    expect(b.length).toBeGreaterThan(100)
    expect(Array.from(b.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
    // IHDR width/height = page * scale
    const view = new DataView(b.buffer)
    expect(view.getUint32(16)).toBe(400)
    expect(view.getUint32(20)).toBe(200)
    engine.dispose()
  })

  it('JPG: a JPEG with the SOI marker', async () => {
    const { engine } = await engineWithShape()
    const [file] = await runExport(engine, { formatId: 'jpg', pages: { kind: 'current' }, options: DEFAULT_EXPORT_OPTIONS })
    const b = await bytes(file.blob)
    expect(Array.from(b.slice(0, 2))).toEqual([0xff, 0xd8])
    expect(file.filename).toBe('My-Design.jpg')
    engine.dispose()
  })

  it('SVG: contains the shape and no editing UI', async () => {
    const { engine } = await engineWithShape()
    const [file] = await runExport(engine, { formatId: 'svg', pages: { kind: 'all' }, options: DEFAULT_EXPORT_OPTIONS })
    const text = new TextDecoder().decode(await bytes(file.blob))
    expect(text).toContain('<svg')
    expect(text).toContain('<rect')
    expect(text).not.toContain('canvas')
    engine.dispose()
  })

  it('PDF: a PDF document with one page per selected page', async () => {
    const { engine } = await engineWithShape(3)
    const [file] = await runExport(engine, { formatId: 'pdf', pages: { kind: 'pages', pages: [1, 3] }, options: DEFAULT_EXPORT_OPTIONS })
    const text = new TextDecoder('latin1').decode(await bytes(file.blob))
    expect(text.startsWith('%PDF-')).toBe(true)
    expect((text.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(2)
    engine.dispose()
  }, 30_000)

  it('booklet PDF: five portrait pages become four two-page sheet sides', async () => {
    const { engine } = await engineWithShape(5, 100, 180)
    const options = { ...DEFAULT_EXPORT_OPTIONS, imposition: { layout: 'booklet' as const, signaturePages: 4, binding: 'left' as const } }
    const [file] = await runExport(engine, { formatId: 'pdf', pages: { kind: 'all' }, options })
    const text = new TextDecoder('latin1').decode(await bytes(file.blob))
    expect(file.filename).toBe('My-Design-booklet.pdf')
    expect((text.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(4)
    const box = /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/.exec(text)
    expect(box?.slice(1).map(Number)).toEqual([150, 135])
    engine.dispose()
  }, 30_000)

  it('multi-page PNG yields one numbered file per page and reports progress', async () => {
    const { engine } = await engineWithShape(3)
    const progress: number[] = []
    const files = await runExport(engine, { formatId: 'png', pages: { kind: 'all' }, options: DEFAULT_EXPORT_OPTIONS, onProgress: (f) => progress.push(f), bundle: false })
    expect(files.map((f) => f.filename)).toEqual(['My-Design-01.png', 'My-Design-02.png', 'My-Design-03.png'])
    expect(progress[progress.length - 1]).toBe(1)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
    engine.dispose()
  })

  it('selects pages by range and rejects empty selections / unknown formats', async () => {
    const { engine } = await engineWithShape(3)
    expect(selectPages(engine, { kind: 'pages', pages: [2] }).map((p) => p.index)).toEqual([1])
    await expect(runExport(engine, { formatId: 'png', pages: { kind: 'pages', pages: [9] }, options: DEFAULT_EXPORT_OPTIONS })).rejects.toThrow(/at least one page/)
    await expect(runExport(engine, { formatId: 'nope', pages: { kind: 'all' }, options: DEFAULT_EXPORT_OPTIONS })).rejects.toThrow(/Unknown export format/)
    engine.dispose()
  })

  it('server PDF is offered only to accounts with adapter.exportPdf and sends embedded-image SVGs', async () => {
    const { engine, handle } = await engineWithShape()
    const server = exportFormats.get('pdf-server')
    expect(server?.available?.(engine)).toBe(false)
    const exportPdf = vi.fn(async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
    handle.adapter.exportPdf = exportPdf
    engine.store.setState({ mode: 'account' })
    expect(server?.available?.(engine)).toBe(true)
    const [file] = await runExport(engine, { formatId: 'pdf-server', pages: { kind: 'all' }, options: DEFAULT_EXPORT_OPTIONS })
    expect(file.filename).toBe('My-Design-print.pdf')
    const input = exportPdf.mock.calls[0] as unknown as [{ svgPages: string[]; width: number; height: number; fonts?: unknown[] }]
    expect(input[0].svgPages).toHaveLength(1)
    expect(input[0].svgPages[0]).toContain('<svg')
    expect(input[0].width).toBe(200)
    expect(input[0].fonts).toEqual([])
    engine.dispose()
  })
})
