import { afterEach, describe, expect, it } from 'vitest'
import type { DocObject, DocPage } from '@/types/document'
import { context2d } from '../animation/canvasFx'
import { RenderError, renderDesignPage, renderDesignPages } from './render'

const rect = (id: string, fill: string, left: number, top: number): DocObject => ({
  id,
  type: 'rect',
  left,
  top,
  width: 40,
  height: 30,
  fill,
  stroke: null,
  strokeWidth: 0,
  originX: 'left',
  originY: 'top',
})
const page = (id: string, objects: DocObject[], color = '#ffffff', size: { width?: number; height?: number } = {}): DocPage => ({ id, background: { type: 'solid', color }, objects, ...size })
const design = (...pages: DocPage[]) => ({ schemaVersion: 1, width: 200, height: 100, unit: 'px', pages })

function pixelAt(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...context2d(canvas).getImageData(x, y, 1, 1).data]
}

async function renderError(promise: Promise<unknown>): Promise<RenderError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof RenderError) return error
    throw error
  }
  throw new Error('expected a RenderError')
}

describe('renderDesignPage', () => {
  const doc = design(page('a', [rect('r', '#ff0000', 10, 10)], '#00ff00'), page('b', [], '#0000ff', { width: 50, height: 60 }))

  it('draws the first page by default, at page size', async () => {
    const out = await renderDesignPage({ document: doc })
    expect(out).toMatchObject({ pageId: 'a', pageIndex: 0, placeholders: 0, missingFonts: [] })
    expect([out.canvas.width, out.canvas.height]).toEqual([200, 100])
    expect(pixelAt(out.canvas, 20, 20)).toEqual([255, 0, 0, 255])
    expect(pixelAt(out.canvas, 150, 80)).toEqual([0, 255, 0, 255])
  })

  it('picks a page by index or id and uses its own size', async () => {
    for (const ref of [1, 'b']) {
      const out = await renderDesignPage({ document: doc, page: ref })
      expect(out).toMatchObject({ pageId: 'b', pageIndex: 1 })
      expect([out.canvas.width, out.canvas.height]).toEqual([50, 60])
    }
  })

  it('scales by the multiplier', async () => {
    const out = await renderDesignPage({ document: doc, multiplier: 2 })
    expect([out.canvas.width, out.canvas.height]).toEqual([400, 200])
  })

  it('leaves the background out when transparent', async () => {
    const out = await renderDesignPage({ document: doc, transparent: true })
    expect(pixelAt(out.canvas, 150, 80)[3]).toBe(0)
    expect(pixelAt(out.canvas, 20, 20)).toEqual([255, 0, 0, 255])
  })

  it('refuses a missing page, a bad scale and a broken document with a code', async () => {
    expect((await renderError(renderDesignPage({ document: doc, page: 2 }))).code).toBe('page_not_found')
    expect((await renderError(renderDesignPage({ document: doc, page: 'nope' }))).code).toBe('page_not_found')
    expect((await renderError(renderDesignPage({ document: doc, multiplier: 0 }))).code).toBe('invalid_options')
    expect((await renderError(renderDesignPage({ document: 'not a design' }))).code).toBe('invalid_document')
  })

  describe('with a picture that does not load', () => {
    const proto = HTMLImageElement.prototype
    const srcDesc = Object.getOwnPropertyDescriptor(proto, 'src')
    afterEach(() => {
      if (srcDesc) Object.defineProperty(proto, 'src', srcDesc)
    })

    it('counts the grey stand-in it draws instead', async () => {
      Object.defineProperty(proto, 'src', {
        configurable: true,
        get: () => '',
        set(this: HTMLImageElement) {
          queueMicrotask(() => this.onerror?.(new Event('error')))
        },
      })
      const picture: DocObject = { id: 'img', type: 'image', src: '/media/missing.png', left: 0, top: 0, width: 20, height: 20 }
      const out = await renderDesignPage({ document: design(page('a', [picture, rect('r', '#ff0000', 100, 10)])) })
      expect(out.placeholders).toBe(1)
      expect(pixelAt(out.canvas, 110, 20)).toEqual([255, 0, 0, 255])
    })
  })
})

describe('renderDesignPages', () => {
  const doc = design(page('a', [rect('r', '#ff0000', 10, 10)], '#00ff00'), page('b', [], '#0000ff', { width: 50, height: 60 }))

  it('makes an SVG file per page asked for, in that order, at each page size', async () => {
    const out = await renderDesignPages({ document: doc, pages: ['b', 0], output: 'svg' })
    expect(out.pages.map((p) => [p.pageId, p.pageIndex, p.width, p.height])).toEqual([
      ['b', 1, 50, 60],
      ['a', 0, 200, 100],
    ])
    expect(out.pages[0].data).toMatch(/^<\?xml/)
    expect(out.pages[0].data).toContain('viewBox="0 0 50 60"')
    expect(out.pages[1].data).toContain('rgb(255,0,0)')
    expect(out.fontFiles).toEqual([])
  })

  it('makes the print server’s pages: no preamble, the bleed around the page', async () => {
    const out = await renderDesignPages({ document: doc, output: 'print', bleed: 10 })
    expect(out.pages).toHaveLength(1)
    expect(out.pages[0].data.startsWith('<svg')).toBe(true)
    expect(out.pages[0].data).toContain('viewBox="-10 -10 220 120"')
  })

  it('makes a JPEG of each page and its bleed, smaller when it would have too many pixels', async () => {
    // The second page and its bleed (60 x 70) fit at 2x; the first (210 x 110) only at less.
    const out = await renderDesignPages({ document: doc, pages: [0, 1], output: 'picture', bleed: 5, multiplier: 2, maxPixels: 120 * 140 })
    const [first, second] = out.pages
    expect([second.pixelWidth, second.pixelHeight]).toEqual([120, 140])
    expect(first.pixelWidth).toBeLessThan(420)
    expect((first.pixelWidth ?? 0) * (first.pixelHeight ?? 0)).toBeLessThanOrEqual(120 * 140 + 300)
    expect(atob(first.data).slice(0, 3)).toBe('\xff\xd8\xff')
  })

  it('stops at the first page over the size limits with too_large', async () => {
    const first = (await renderDesignPages({ document: doc, pages: [0], output: 'svg' })).pages[0]
    const size = new TextEncoder().encode(first.data).length
    const page = await renderError(renderDesignPages({ document: doc, pages: [1, 0], output: 'svg', maxPageBytes: size - 1 }))
    expect(page.code).toBe('too_large')
    expect(page.message).toMatch(/^Page 1 would be a file of .* MB; this server makes SVG files of at most/)
    const total = await renderError(renderDesignPages({ document: doc, pages: [0, 1], output: 'print', maxTotalBytes: size }))
    expect(total.code).toBe('too_large')
    expect(total.message).toContain('together')
    const fits = await renderDesignPages({ document: doc, pages: [0, 1], output: 'svg', maxPageBytes: size, maxTotalBytes: 3 * size })
    expect(fits.pages).toHaveLength(2)
  })

  it('refuses unknown outputs, a negative bleed and a missing page with a code', async () => {
    expect((await renderError(renderDesignPages({ document: doc, output: 'eps' as 'svg' }))).code).toBe('invalid_options')
    expect((await renderError(renderDesignPages({ document: doc, output: 'print', bleed: -1 }))).code).toBe('invalid_options')
    expect((await renderError(renderDesignPages({ document: doc, output: 'svg', pages: [0, 5] }))).code).toBe('page_not_found')
  })
})
