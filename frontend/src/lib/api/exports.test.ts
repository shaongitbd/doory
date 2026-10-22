import { captureFetch } from '@/test/utils'
import { resetClientState } from './client'
import { exportsApi } from './exports'

beforeEach(() => {
  resetClientState()
  document.cookie = 'csrftoken=tok; path=/'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// jsdom's Blob has no text() on every Node version; FileReader reads it everywhere.
const readText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsText(blob)
  })

const pdf = () => new Response('%PDF', { headers: { 'content-type': 'application/pdf' } })
const one = [new Blob(['<svg/>'])]

describe('exportsApi.pdf print options', () => {
  it('sends the bleed, the crop marks, the language and the sizes as form fields', async () => {
    const calls = captureFetch(pdf)
    await exportsApi.pdf({ pages: [...one, ...one], width: 1080, height: 1080, sizes: [{ width: 1080, height: 1080 }, { width: 794, height: 1123 }], bleedMm: 3, cropMarks: true, title: 'Menu', lang: 'de-CH' })
    const form = calls[0].body as FormData
    expect(form.get('bleed_mm')).toBe('3')
    expect(form.get('crop_marks')).toBe('true')
    expect(form.get('lang')).toBe('de-CH')
    expect(form.get('title')).toBe('Menu')
    expect(JSON.parse(form.get('sizes') as string)).toEqual([{ width: 1080, height: 1080 }, { width: 794, height: 1123 }])
  })

  it('sends a zero bleed and no marks as they are, and no language when none is given', async () => {
    const calls = captureFetch(pdf)
    await exportsApi.pdf({ pages: one, width: 100, height: 100, bleedMm: 0, cropMarks: false })
    const form = calls[0].body as FormData
    expect(form.get('bleed_mm')).toBe('0')
    expect(form.get('crop_marks')).toBe('false')
    expect(form.has('lang')).toBe(false)
  })

  it('stops the request when the signal aborts', async () => {
    const signals: (AbortSignal | null | undefined)[] = []
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init: RequestInit = {}) => {
      signals.push(init.signal)
      return Promise.resolve(pdf())
    })
    const controller = new AbortController()
    await exportsApi.pdf({ pages: one, width: 100, height: 100, signal: controller.signal })
    expect(signals).toEqual([controller.signal])
  })
})

describe('exportsApi.optimize', () => {
  const answer = () =>
    new Response('webp-bytes', {
      headers: {
        'content-type': 'image/webp',
        'x-doory-format': 'webp',
        'x-doory-width': '1080',
        'x-doory-height': '1350',
        'x-doory-quality': '74',
        'x-doory-bytes-before': '50000',
        'x-doory-optimizer': 'builtin',
        'x-doory-optimized': 'false',
        'x-doory-warnings': '["Built-in leaves WebP as it is."]',
      },
    })

  it('sends the drawn PNG and the options as form fields', async () => {
    const calls = captureFetch(answer)
    await exportsApi.optimize({ file: new Blob(['png'], { type: 'image/png' }), format: 'webp', quality: 82, maxBytes: 200_000.4, pngColors: 256, transparent: true, stripMetadata: false, progressive: false, optimize: 'builtin' })
    expect(calls[0].url.pathname).toMatch(/\/exports\/optimize\/$/)
    const form = calls[0].body as FormData
    expect(form.get('file')).toBeInstanceOf(Blob)
    expect(Object.fromEntries([...form.entries()].filter(([key]) => key !== 'file'))).toEqual({
      format: 'webp',
      quality: '82',
      max_bytes: '200000',
      png_colors: '256',
      transparent: 'true',
      strip_metadata: 'false',
      progressive: 'false',
      optimize: 'builtin',
    })
  })

  it('reads what was done from the headers', async () => {
    captureFetch(answer)
    const out = await exportsApi.optimize({ file: new Blob(['png']), format: 'webp', optimize: true })
    expect(out).toMatchObject({ format: 'webp', width: 1080, height: 1350, quality: 74, bytesBefore: 50000, optimizer: 'builtin', optimized: false, warnings: ['Built-in leaves WebP as it is.'] })
    expect(await readText(out.blob)).toBe('webp-bytes')
  })

  it('copes with missing or broken headers', async () => {
    captureFetch(() => new Response('x', { headers: { 'content-type': 'image/png', 'x-doory-format': 'bmp', 'x-doory-warnings': 'not json' } }))
    const out = await exportsApi.optimize({ file: new Blob(['png']), format: 'png', optimize: false })
    expect(out).toMatchObject({ format: 'png', quality: null, bytesBefore: 1, optimizer: '', optimized: false, warnings: [] })
  })
})
