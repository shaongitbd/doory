/**
 * Draws pages of a saved design with the editor's own engine, for the server's exports: the headless `render.html`
 * page calls this from a browser the server drives (see `apps/exports` in the backend). Nothing here talks to the
 * API: the server hands over the document and the font catalogue entries it uses.
 *
 * `renderDesignPage` draws one page as a bitmap (the image export); `renderDesignPages` makes the SVG and PDF
 * exports' pages: an SVG file per page, the print server's SVG pages, or a 300 dpi picture per page.
 */
import type { FontFamily, PdfFontFile } from '@/types/api'
import type { DocPage, DoryDocument } from '@/types/document'
import { fontsInObjects, pageSize } from '../engine/docOps'
import { embedFontFaces } from '../engine/export/svgFonts'
import { FontManager } from '../engine/fonts'
import { migrateDocument } from '../engine/migrations'
import { canvasToBlob, renderableObjects, renderPageToCanvas, renderPageToSvg } from '../engine/render'
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

export type RenderErrorCode =
  | 'invalid_document'
  | 'page_not_found'
  | 'invalid_options'
  | 'image_unavailable'
  // The video export (`video.ts`):
  | 'too_long'
  | 'too_large'
  | 'sound_unavailable'
  | 'video_unsupported'

export class RenderError extends Error {
  constructor(
    readonly code: RenderErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RenderError'
  }
}

export function pickPage(doc: DoryDocument, page: number | string | undefined): [DocPage, number] {
  if (page === undefined) return [doc.pages[0], 0]
  const index = typeof page === 'number' ? page : doc.pages.findIndex((p) => p.id === page)
  if (!Number.isInteger(index) || index < 0 || index >= doc.pages.length) throw new RenderError('page_not_found', `The design has no page ${JSON.stringify(page)}.`)
  return [doc.pages[index], index]
}

export interface Session {
  doc: DoryDocument
  fonts: FontManager
  ctx: LoadContext
  /** Grey stand-ins drawn so far. */
  placeholders: () => number
}

export function open(document: unknown, families: FontFamily[] | undefined): Session {
  let doc: DoryDocument
  try {
    doc = migrateDocument(document)
  } catch (error) {
    throw new RenderError('invalid_document', error instanceof Error ? error.message : 'The design file is not valid.')
  }
  const fonts = new FontManager(null)
  fonts.remember(families ?? [])
  let placeholders = 0
  const ctx: LoadContext = {
    resolveSrc: async (src) => src,
    ensureFonts: (uses) => fonts.ensure(uses),
    onFallback: () => {
      placeholders += 1
    },
  }
  return { doc, fonts, ctx, placeholders: () => placeholders }
}

export async function renderDesignPage(input: RenderInput): Promise<RenderedPage> {
  const multiplier = input.multiplier ?? 1
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw new RenderError('invalid_options', 'The scale must be a positive number.')
  const { doc, fonts, ctx, placeholders } = open(input.document, input.fonts)
  const [page, pageIndex] = pickPage(doc, input.page)
  const canvas = await renderPageToCanvas(page, pageSize(doc, page), ctx, { multiplier, transparent: input.transparent === true })
  const missingFonts = await fonts.unavailable(fontsInObjects(renderableObjects(page.objects)))
  return { canvas, pageId: page.id, pageIndex, placeholders: placeholders(), missingFonts }
}

/**
 * What a page becomes:
 * - `svg`: the SVG download, with its pictures and fonts inside;
 * - `print`: the SVG the print server takes (no XML preamble, links kept, the bleed around the page);
 * - `picture`: a JPEG of the page and its bleed, for a PDF of pictures (the editor's own PDF download).
 */
export type PageOutput = 'svg' | 'print' | 'picture'

export interface PagesInput {
  document: unknown
  /** Page indexes (0-based) or ids, in the order wanted. Default: the first page. */
  pages?: (number | string)[]
  output: PageOutput
  /** `print` and `picture`: the bleed around every page, in px. */
  bleed?: number
  /** `picture`: output pixels per page pixel (300 dpi is 3.125). Lowered for a page whose picture would have more than `maxPixels`. */
  multiplier?: number
  maxPixels?: number
  /** The largest file of one page and of all pages together, in bytes (the server's limits). Making stops at the first page over either, with `too_large`. */
  maxPageBytes?: number
  maxTotalBytes?: number
  fonts?: FontFamily[]
}

export interface RenderedPageFile {
  pageId: string
  pageIndex: number
  /** The page's own size in px, without the bleed. */
  width: number
  height: number
  /** The SVG text, or the JPEG in base64 (`picture`). */
  data: string
  /** `picture`: the JPEG's size in pixels. */
  pixelWidth?: number
  pixelHeight?: number
  placeholders: number
  missingFonts: string[]
}

export interface RenderedPages {
  pages: RenderedPageFile[]
  /** `print`: the font files the pages use, for the print server to embed (as the editor's print export sends them). */
  fontFiles: PdfFontFile[]
}

const PICTURE_QUALITY = 0.92 // as the editor's PDF download
const PAGE_KINDS: Record<PageOutput, string> = { svg: 'SVG files', print: 'print pages', picture: 'pictures' }

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** The size of a page's file: UTF-8 text, or the JPEG behind the base64 of a picture. */
function fileBytes(output: PageOutput, data: string): number {
  if (output !== 'picture') return new TextEncoder().encode(data).length
  return Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
}

/** Refuses a page over the server's limits as soon as it is made (the server checks them again). */
function checkSize(input: PagesInput, pageIndex: number, bytes: number, total: number): void {
  if (input.maxPageBytes !== undefined && bytes > input.maxPageBytes) {
    throw new RenderError(
      'too_large',
      `Page ${pageIndex + 1} would be a file of ${megabytes(bytes)}; this server makes ${PAGE_KINDS[input.output]} of at most ${megabytes(input.maxPageBytes)}. A picture is put into the file once for every time it is used: use large pictures fewer times, or export PNG or JPG.`,
    )
  }
  if (input.maxTotalBytes !== undefined && total > input.maxTotalBytes) {
    throw new RenderError('too_large', `The pages would be more than ${megabytes(input.maxTotalBytes)} together, the most this server makes in one export. Export fewer pages at once.`)
  }
}

/** The bytes of `blob` in base64 (no `data:` prefix). */
export function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1))
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'))
    reader.readAsDataURL(blob)
  })
}

export async function renderDesignPages(input: PagesInput): Promise<RenderedPages> {
  const bleed = input.bleed ?? 0
  const multiplier = input.multiplier ?? 1
  const maxPixels = input.maxPixels ?? Infinity
  if (!['svg', 'print', 'picture'].includes(input.output)) throw new RenderError('invalid_options', 'The output must be svg, print or picture.')
  if (!Number.isFinite(bleed) || bleed < 0) throw new RenderError('invalid_options', 'The bleed must be 0 or more.')
  if (!Number.isFinite(multiplier) || multiplier <= 0 || !(maxPixels > 0)) throw new RenderError('invalid_options', 'The scale must be a positive number.')
  const session = open(input.document, input.fonts)
  const { doc, fonts, ctx } = session
  const chosen = (input.pages ?? [undefined]).map((ref) => pickPage(doc, ref))
  const pages: RenderedPageFile[] = []
  let total = 0
  for (const [page, pageIndex] of chosen) {
    const size = pageSize(doc, page)
    const before = session.placeholders()
    const file: Pick<RenderedPageFile, 'data' | 'pixelWidth' | 'pixelHeight'> = { data: '' }
    try {
      if (input.output === 'picture') {
        const art = (size.width + 2 * bleed) * (size.height + 2 * bleed)
        const canvas = await renderPageToCanvas(page, size, ctx, { multiplier: Math.min(multiplier, Math.sqrt(maxPixels / art)), bleed })
        Object.assign(file, { data: await base64(await canvasToBlob(canvas, 'image/jpeg', PICTURE_QUALITY)), pixelWidth: canvas.width, pixelHeight: canvas.height })
      } else if (input.output === 'print') {
        file.data = await renderPageToSvg(page, size, ctx, { bleed, links: true, bare: true })
      } else {
        file.data = await embedFontFaces(await renderPageToSvg(page, size, ctx), page.objects, (family) => fonts.lookup(family))
      }
    } catch (error) {
      // `renderPageToSvg` puts every picture into the file; one that can't be fetched stops it.
      if (error instanceof Error && error.name === 'SvgEmbedError') throw new RenderError('image_unavailable', error.message)
      throw error
    }
    if (input.maxPageBytes !== undefined || input.maxTotalBytes !== undefined) {
      const bytes = fileBytes(input.output, file.data)
      total += bytes
      checkSize(input, pageIndex, bytes, total)
    }
    const missingFonts = await fonts.unavailable(fontsInObjects(renderableObjects(page.objects)))
    pages.push({ pageId: page.id, pageIndex, width: size.width, height: size.height, ...file, placeholders: session.placeholders() - before, missingFonts })
  }
  const fontFiles = input.output === 'print' ? await fonts.filesFor(chosen.flatMap(([page]) => fontsInObjects(renderableObjects(page.objects)))) : []
  return { pages, fontFiles }
}
