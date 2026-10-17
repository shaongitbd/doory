import { afterEach, describe, expect, it } from 'vitest'
import type { DocObject, DocPage } from '@/types/document'
import { context2d } from '../animation/canvasFx'
import { RenderError, renderDesignPage } from './render'

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
