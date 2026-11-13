import type { PdfExportInput } from '@/types/api'
import type { OptimizeFormat, OptimizeImageInput, OptimizedImage } from '@/types/adapter'
import { http } from './client'

const FORMATS: readonly OptimizeFormat[] = ['png', 'jpg', 'webp', 'avif']

function headerNumber(headers: Headers, name: string): number | null {
  const value = Number.parseInt(headers.get(name) ?? '', 10)
  return Number.isFinite(value) ? value : null
}

function headerList(headers: Headers, name: string): string[] {
  try {
    const value: unknown = JSON.parse(headers.get(name) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export const exportsApi = {
  /** Server-side vector PDF (account only); one SVG file per page. */
  pdf: (input: PdfExportInput) => {
    const form = new FormData()
    input.pages.forEach((page, index) => form.append('pages', page, `page-${index + 1}.svg`))
    form.append('width', String(Math.round(input.width)))
    form.append('height', String(Math.round(input.height)))
    // One entry per `pages` file, same order: pages of a design may differ in size.
    if (input.sizes?.length) form.append('sizes', JSON.stringify(input.sizes.map((s) => ({ width: Math.round(s.width), height: Math.round(s.height) }))))
    if (input.bleedMm !== undefined) form.append('bleed_mm', String(input.bleedMm))
    if (input.cropMarks !== undefined) form.append('crop_marks', input.cropMarks ? 'true' : 'false')
    if (input.imposition) {
      form.append('layout', input.imposition.layout)
      form.append('signature_pages', String(input.imposition.signaturePages))
      form.append('binding', input.imposition.binding)
      if (input.imposition.sides) form.append('print_sides', input.imposition.sides)
    }
    if (input.title) form.append('title', input.title)
    if (input.lang) form.append('lang', input.lang)
    if (input.fonts?.length) form.append('fonts', JSON.stringify(input.fonts))
    return http.postForBlob('/exports/pdf/', { form, signal: input.signal, onUploadProgress: input.onUploadProgress })
  },
  /** A page the browser drew (PNG), converted to `format` and optimized on the server; the headers say what was done. */
  optimize: async (input: OptimizeImageInput): Promise<OptimizedImage> => {
    const form = new FormData()
    form.append('file', input.file, 'page.png')
    form.append('format', input.format)
    if (input.quality !== undefined) form.append('quality', String(Math.round(input.quality)))
    if (input.maxBytes !== undefined) form.append('max_bytes', String(Math.round(input.maxBytes)))
    if (input.pngColors !== undefined) form.append('png_colors', String(input.pngColors))
    if (input.transparent !== undefined) form.append('transparent', input.transparent ? 'true' : 'false')
    if (input.stripMetadata !== undefined) form.append('strip_metadata', input.stripMetadata ? 'true' : 'false')
    if (input.progressive !== undefined) form.append('progressive', input.progressive ? 'true' : 'false')
    form.append('optimize', typeof input.optimize === 'string' ? input.optimize : input.optimize ? 'true' : 'false')
    const { blob, headers } = await http.postForFile('/exports/optimize/', { form, signal: input.signal })
    const format = headers.get('x-doory-format') as OptimizeFormat | null
    return {
      blob,
      format: format && FORMATS.includes(format) ? format : input.format,
      width: headerNumber(headers, 'x-doory-width') ?? 0,
      height: headerNumber(headers, 'x-doory-height') ?? 0,
      quality: headerNumber(headers, 'x-doory-quality'),
      bytesBefore: headerNumber(headers, 'x-doory-bytes-before') ?? blob.size,
      optimizer: headers.get('x-doory-optimizer') ?? '',
      optimized: headers.get('x-doory-optimized') === 'true',
      warnings: headerList(headers, 'x-doory-warnings'),
    }
  },
}
