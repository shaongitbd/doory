import type { ExportOptions } from '../../engine/export/registry'
import { readSize } from '../../engine/export/size'

/** The dialog's formats that REST and MCP make, by the name the API gives them (video is not among them yet). */
export const API_FORMATS: Readonly<Record<string, string>> = { png: 'png', jpg: 'jpg', webp: 'webp', avif: 'avif', svg: 'svg', pdf: 'pdf', 'pdf-server': 'pdf-print' }

/** Files of all pages or vector pages: none of the image options apply to them. */
const DOCUMENT_FORMATS = new Set(['svg', 'pdf', 'pdf-print'])

/** The API's name of a dialog format, or null when REST and MCP can't make it. */
export function apiFormat(formatId: string): string | null {
  return Object.hasOwn(API_FORMATS, formatId) ? API_FORMATS[formatId] : null
}

export interface ApiCallInput {
  designId: string
  formatId: string
  options: ExportOptions
  /** 1-based page numbers, or every page. */
  pages: 'all' | number[]
  fileNames: 'simple' | 'structured'
}

/** `2×` and `2` as the API writes them (`2x`); the typed text when it is not a size. */
function apiSize(text: string): string {
  const size = readSize(text)
  return size ? `${size.value}${size.kind}` : text.trim()
}

/** The arguments of the MCP tool `export_design` (and the REST body) that make the same file as the dialog. */
export function exportArguments({ designId, formatId, options, pages, fileNames }: ApiCallInput): Record<string, unknown> {
  const format = apiFormat(formatId) ?? formatId
  const args: Record<string, unknown> = { design_id: designId, format }
  if (pages === 'all') args.pages = 'all'
  else if (pages.length === 1) args.page = pages[0]
  else args.pages = pages
  if (DOCUMENT_FORMATS.has(format)) {
    if (format !== 'svg' && options.bleedMm > 0) args.bleed_mm = options.bleedMm
    if (format !== 'svg' && options.cropMarks) args.crop_marks = true
    if (format !== 'svg' && options.imposition) {
      args.layout = options.imposition.layout
      args.signature_pages = options.imposition.signaturePages
      args.binding = options.imposition.binding
      if (options.imposition.sides && options.imposition.sides !== 'both') args.print_sides = options.imposition.sides
    }
    if (fileNames === 'structured') args.file_names = 'detailed'
    return args
  }
  if (options.size?.trim()) args.size = apiSize(options.size)
  else if (options.scale !== 1) args.scale = options.scale
  if (formatId !== 'png') {
    if (options.qualityPreset) args.quality = options.qualityPreset
    else args.quality = Math.round(options.quality * 100)
    if (options.maxBytes) args.max_bytes = Math.round(options.maxBytes)
  }
  if (formatId === 'png' && options.pngColors === 256) args.png_colors = 256
  if (formatId !== 'jpg' && options.transparent) args.transparent = true
  if (options.stripMetadata === false) args.strip_metadata = false
  if (formatId === 'jpg' && options.progressive) args.progressive = true
  args.optimize = options.optimize ? (options.optimizer ?? true) : false
  if (fileNames === 'structured') args.file_names = 'detailed'
  return args
}

/** The call as text: the MCP tool, then the REST request. */
export function describeCall(input: ApiCallInput, origin: string): string {
  const args = exportArguments(input)
  const { design_id: id, ...body } = args
  return [
    '// MCP tool export_design',
    JSON.stringify(args, null, 2),
    '',
    `// REST: POST ${origin}/api/v1/designs/${String(id)}/export/image/`,
    JSON.stringify(body, null, 2),
  ].join('\n')
}
