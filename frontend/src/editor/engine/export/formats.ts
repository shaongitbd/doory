/** Built-in export formats, registered through the public registry. */
import { fontsInObjects, pageSize } from '../docOps'
import { renderPageToCanvas, renderPageToSvg } from '../render'
import { mmToPx } from '../units'
import { documentLanguage } from './language'
import { MARK_STROKE_PX, type PrintGeometry, cropMarkSegments, printGeometry } from './printGeometry'
import {
  type ExportContext,
  type ExportFile,
  exportFilename,
  pageFilename,
  registerExportFormat,
  sanitizeFilename,
} from './registry'
import { type RasterFormat, browserEncodes, hasAlpha, serverConverts } from './raster'
import { MAX_SCALE, MIN_SCALE, sizeScale } from './size'
import { embedFontFaces } from './svgFonts'
import { t } from '../../strings'

const PDF_DPI = 300
const PX_PER_INCH = 96
const MM_PER_INCH = 25.4

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError')
}

/** The scale a page is drawn at: the typed size when it reads as one (per page: `1080w` differs by page width), else `scale`. */
export function pageMultiplier(options: ExportContext['options'], size: { width: number; height: number }): number {
  const scale = options.size ? sizeScale(options.size, size.width, size.height) : null
  // A width or height too large (or small) for this page is kept to the scales allowed, not swapped for `scale`.
  return scale === null ? options.scale : Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

async function rasterFiles(ctx: ExportContext, format: RasterFormat): Promise<ExportFile[]> {
  const { encodeRaster } = await import('./encode')
  const files: ExportFile[] = []
  const total = ctx.pages.length
  const notes = new Set<string>()
  for (let i = 0; i < total; i++) {
    throwIfAborted(ctx.signal)
    const { page, index } = ctx.pages[i]
    const size = pageSize(ctx.document, page)
    const canvas = await renderPageToCanvas(page, size, ctx.engine.loadContext, {
      multiplier: pageMultiplier(ctx.options, size),
      transparent: hasAlpha(format) && ctx.options.transparent,
    })
    const result = await encodeRaster(canvas, format, ctx.options, ctx.engine.adapter, ctx.signal)
    if (result.note && !notes.has(result.note)) {
      notes.add(result.note)
      ctx.onNote?.(result.note)
    }
    // A PNG stands in when neither the browser nor the server could make the format: its name says so.
    const extension = result.format
    files.push({ blob: result.blob, filename: exportFilename(ctx, pageFilename(ctx.title, extension, index + 1, total, ctx.document.pages.length), extension, size, index) })
    ctx.onProgress((i + 1) / total)
  }
  return files
}

async function svgFiles(ctx: ExportContext): Promise<ExportFile[]> {
  const files: ExportFile[] = []
  const total = ctx.pages.length
  for (let i = 0; i < total; i++) {
    throwIfAborted(ctx.signal)
    const { page, index } = ctx.pages[i]
    const size = pageSize(ctx.document, page)
    const svg = await renderPageToSvg(page, size, ctx.engine.loadContext)
    const withFonts = await embedFontFaces(svg, page.objects, (family) => ctx.engine.fonts.lookup(family))
    files.push({ blob: new Blob([withFonts], { type: 'image/svg+xml' }), filename: exportFilename(ctx, pageFilename(ctx.title, 'svg', index + 1, total, ctx.document.pages.length), 'svg', size, index) })
    ctx.onProgress((i + 1) / total)
  }
  return files
}

/**
 * The PDF made in the browser: a picture of each page at 300 dpi. A page of the PDF is the trim size grown by the bleed and by
 * the margin that carries the crop marks (the picture shows the bleed too); the marks are vector hairlines.
 */
async function pdfFile(ctx: ExportContext): Promise<ExportFile[]> {
  const { jsPDF } = await import('jspdf')
  const mm = (px: number): number => (px / PX_PER_INCH) * MM_PER_INCH
  const orientation = (w: number, h: number): 'p' | 'l' => (w > h ? 'l' : 'p')
  const { bleedMm, cropMarks } = ctx.options
  const geometries = ctx.pages.map(({ page }) => printGeometry(pageSize(ctx.document, page), bleedMm, cropMarks))
  const first = geometries[0]
  const pdf = new jsPDF({ unit: 'mm', format: [mm(first.sheetWidth), mm(first.sheetHeight)], orientation: orientation(first.sheetWidth, first.sheetHeight), compress: true })
  pdf.setProperties({ title: ctx.title, creator: 'Doory' })
  pdf.setLanguage(documentLanguage() as Parameters<typeof pdf.setLanguage>[0])
  const total = ctx.pages.length
  for (let i = 0; i < total; i++) {
    throwIfAborted(ctx.signal)
    const { page } = ctx.pages[i]
    const size = pageSize(ctx.document, page)
    const g = geometries[i]
    if (i > 0) pdf.addPage([mm(g.sheetWidth), mm(g.sheetHeight)], orientation(g.sheetWidth, g.sheetHeight))
    const canvas = await renderPageToCanvas(page, size, ctx.engine.loadContext, { multiplier: PDF_DPI / PX_PER_INCH, bleed: g.bleed })
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', mm(g.slug), mm(g.slug), mm(g.artWidth), mm(g.artHeight), undefined, 'FAST')
    drawCropMarks(pdf, g, mm)
    ctx.onProgress((i + 1) / total, 'rendering')
  }
  const blob = pdf.output('blob')
  return [{ blob, filename: exportFilename(ctx, `${sanitizeFilename(ctx.title) || 'design'}.pdf`, 'pdf', pageSize(ctx.document, ctx.pages[0].page), null) }]
}

/** Black hairlines in the slug, the same eight the print server draws. */
function drawCropMarks(pdf: import('jspdf').jsPDF, g: PrintGeometry, mm: (px: number) => number): void {
  const marks = cropMarkSegments(g)
  if (marks.length === 0) return
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(mm(MARK_STROKE_PX))
  for (const [x1, y1, x2, y2] of marks) pdf.line(mm(x1), mm(y1), mm(x2), mm(y2))
}

async function serverPdfFile(ctx: ExportContext): Promise<ExportFile[]> {
  const exportPdf = ctx.engine.adapter.exportPdf
  if (!exportPdf) throw new Error('Print-quality PDF is not available.')
  const total = ctx.pages.length
  const { bleedMm, cropMarks } = ctx.options
  const bleedPx = mmToPx(bleedMm)
  const svgPages: string[] = []
  for (let i = 0; i < total; i++) {
    throwIfAborted(ctx.signal)
    const { page } = ctx.pages[i]
    // The SVG shows the bleed around the page (its viewBox starts at -bleed), so the server places it 1:1.
    svgPages.push(await renderPageToSvg(page, pageSize(ctx.document, page), ctx.engine.loadContext, { bleed: bleedPx, links: true, bare: true }))
    ctx.onProgress(((i + 1) / total) * 0.5, 'rendering')
  }
  // The first page's size is for servers that predate `sizes`; every page is also listed with its own.
  const sizes = ctx.pages.map(({ page }) => pageSize(ctx.document, page))
  const size = sizes[0]
  const fonts = await ctx.engine.fonts.filesFor(ctx.pages.flatMap((p) => fontsInObjects(p.page.objects)))
  throwIfAborted(ctx.signal)
  ctx.onProgress(0.5, 'uploading')
  const blob = await exportPdf({
    svgPages,
    width: size.width,
    height: size.height,
    sizes,
    bleedMm,
    cropMarks,
    title: ctx.title,
    lang: documentLanguage(),
    fonts,
    signal: ctx.signal,
    onUploadProgress: (fraction) => ctx.onProgress(0.5 + fraction * 0.4, fraction >= 1 ? 'printing' : 'uploading'),
  })
  ctx.onProgress(1)
  return [{ blob, filename: exportFilename(ctx, `${sanitizeFilename(ctx.title) || 'design'}-print.pdf`, 'pdf', size, null, 'print') }]
}

export function registerBuiltinExportFormats(): void {
  registerExportFormat({
    id: 'png',
    label: 'PNG',
    description: t.exportFormats.png,
    extension: 'png',
    mime: 'image/png',
    order: 0,
    controls: { scale: true, transparent: true, optimize: true },
    run: (ctx) => rasterFiles(ctx, 'png'),
  })
  registerExportFormat({
    id: 'jpg',
    label: 'JPG',
    description: t.exportFormats.jpg,
    extension: 'jpg',
    mime: 'image/jpeg',
    order: 10,
    controls: { scale: true, quality: true, optimize: true },
    run: (ctx) => rasterFiles(ctx, 'jpg'),
  })
  registerExportFormat({
    id: 'webp',
    label: 'WebP',
    description: t.exportFormats.webp,
    extension: 'webp',
    mime: 'image/webp',
    order: 12,
    controls: { scale: true, quality: true, transparent: true, optimize: true },
    // Safari can't make WebP from a canvas: there it takes the server.
    available: (engine) => browserEncodes('webp') || serverConverts(engine.adapter, 'webp'),
    run: (ctx) => rasterFiles(ctx, 'webp'),
  })
  registerExportFormat({
    id: 'avif',
    label: 'AVIF',
    description: t.exportFormats.avif,
    extension: 'avif',
    mime: 'image/avif',
    order: 14,
    controls: { scale: true, quality: true, transparent: true, optimize: true },
    available: (engine) => serverConverts(engine.adapter, 'avif'),
    run: (ctx) => rasterFiles(ctx, 'avif'),
  })
  registerExportFormat({
    id: 'pdf',
    label: 'PDF',
    description: t.exportFormats.pdf,
    extension: 'pdf',
    mime: 'application/pdf',
    order: 20,
    controls: { print: true },
    run: pdfFile,
  })
  registerExportFormat({
    id: 'svg',
    label: 'SVG',
    description: t.exportFormats.svg,
    extension: 'svg',
    mime: 'image/svg+xml',
    order: 30,
    controls: {},
    run: svgFiles,
  })
  registerExportFormat({
    id: 'pdf-server',
    label: t.exportFormats.pdfServerLabel,
    description: t.exportFormats.pdfServer,
    extension: 'pdf',
    mime: 'application/pdf',
    order: 40,
    server: true,
    controls: { print: true },
    available: (engine) => typeof engine.adapter.exportPdf === 'function' && engine.state.mode !== 'guest',
    run: serverPdfFile,
  })
}

registerBuiltinExportFormats()
