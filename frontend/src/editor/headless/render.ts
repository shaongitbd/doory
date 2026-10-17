/**
 * Draws one page of a saved design with the editor's own engine, for the server's image export: the headless
 * `render.html` page calls this from a browser the server drives (see `apps/exports` in the backend). Nothing here
 * talks to the API: the server hands over the document and the font catalogue entries it uses.
 */
import type { FontFamily } from '@/types/api'
import type { DocPage, DoryDocument } from '@/types/document'
import { fontsInObjects, pageSize } from '../engine/docOps'
import { FontManager } from '../engine/fonts'
import { migrateDocument } from '../engine/migrations'
import { renderableObjects, renderPageToCanvas } from '../engine/render'
import type { LoadContext } from '../engine/serialization'

export interface RenderInput {
  /** The design's document JSON, as stored. */
  document: unknown
  /** Page index (0-based) or page id. Default: the first page. */
  page?: number | string
  /** Output pixels per page pixel. Default 1. Lowered when the bitmap would exceed the browser's canvas limits. */
  multiplier?: number
  /** Leave out the page background. */
  transparent?: boolean
  /** Catalogue and uploaded font families the page may use, in the shape the fonts API returns. */
  fonts?: FontFamily[]
}

export interface RenderedPage {
  canvas: HTMLCanvasElement
  pageId: string
  pageIndex: number
  /** Objects that could not be rebuilt and are drawn as grey stand-ins (usually a picture that did not load). */
  placeholders: number
  /** Families the page uses that could not be loaded: their text is drawn in a fallback font. */
  missingFonts: string[]
}

export type RenderErrorCode = 'invalid_document' | 'page_not_found' | 'invalid_options'

export class RenderError extends Error {
  constructor(
    readonly code: RenderErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RenderError'
  }
}

function pickPage(doc: DoryDocument, page: number | string | undefined): [DocPage, number] {
  if (page === undefined) return [doc.pages[0], 0]
  const index = typeof page === 'number' ? page : doc.pages.findIndex((p) => p.id === page)
  if (!Number.isInteger(index) || index < 0 || index >= doc.pages.length) throw new RenderError('page_not_found', `The design has no page ${JSON.stringify(page)}.`)
  return [doc.pages[index], index]
}

export async function renderDesignPage(input: RenderInput): Promise<RenderedPage> {
  const multiplier = input.multiplier ?? 1
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw new RenderError('invalid_options', 'The scale must be a positive number.')
  let doc: DoryDocument
  try {
    doc = migrateDocument(input.document)
  } catch (error) {
    throw new RenderError('invalid_document', error instanceof Error ? error.message : 'The design file is not valid.')
  }
  const [page, pageIndex] = pickPage(doc, input.page)

  const fonts = new FontManager(null)
  fonts.remember(input.fonts ?? [])
  let placeholders = 0
  const ctx: LoadContext = {
    resolveSrc: async (src) => src,
    ensureFonts: (uses) => fonts.ensure(uses),
    onFallback: () => {
      placeholders += 1
    },
  }
  const canvas = await renderPageToCanvas(page, pageSize(doc, page), ctx, { multiplier, transparent: input.transparent === true })
  const missingFonts = await fonts.unavailable(fontsInObjects(renderableObjects(page.objects)))
  return { canvas, pageId: page.id, pageIndex, placeholders, missingFonts }
}
