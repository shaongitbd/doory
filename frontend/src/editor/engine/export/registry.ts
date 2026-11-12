/**
 * Export format registry — the extension point for output formats (GIF, WebP, PPTX…).
 *
 * A format receives the pages to export plus the user's options and returns files. Rendering helpers
 * (`renderPageToCanvas`, `renderPageToSvg`) always render from document JSON, never from the live
 * canvases, so editing aids can never leak into an export.
 */
import type { DocPage, DoryDocument } from '@/types/document'
import type { EditorEngine } from '../editor'
import { Registry } from '../registry'
import { getSizePresets } from '@/lib/sizePresets'
import { type FileNaming, SIMPLE_NAMING, documentFilename } from './filenames'
import type { VideoOptions } from './video/options'
import type { Binding, FoldLayout } from './imposition'

/** The quality stops of the Download dialog, by the name REST and MCP exports take too. */
export const QUALITY_PRESETS = { small: 65, balanced: 82, best: 95, original: 100 } as const
export type QualityPreset = keyof typeof QUALITY_PRESETS

export interface ExportOptions {
  /** Output pixels per design pixel (PNG / JPG / WebP / AVIF). */
  scale: number
  /** As typed: `2x`, `1080w` or `1350h` (see `size.ts`). Replaces `scale` when it reads as a size. */
  size?: string
  /** 0.1..1 (JPG, WebP, AVIF). */
  quality: number
  /** The quality stop `quality` came from, when it came from one. */
  qualityPreset?: QualityPreset
  /** Lossy formats: the largest file wanted per page; the quality goes down until it fits. */
  maxBytes?: number
  /** PNG: 256 makes a palette PNG (on the server), when that is smaller. */
  pngColors?: 'full' | 256
  /** Recompress on the server after rendering (`optimizer`, or the instance's default). */
  optimize?: boolean
  optimizer?: string
  /** Leave metadata out of the file (default on). */
  stripMetadata?: boolean
  /** JPG that loads blurry first, then sharp. */
  progressive?: boolean
  transparent: boolean
  /** Print bleed in mm (PDF): the pages grow by this much on every side. 0 = none. */
  bleedMm: number
  /** Print crop marks around the trim (PDF); the pages grow by a margin that carries them. */
  cropMarks: boolean
  /** Two design pages on each side of a folded sheet. Omitted for ordinary PDFs. */
  imposition?: { layout: FoldLayout; signaturePages: number; binding: Binding; sides?: 'both' | 'front' | 'back' }
  /** Video and GIF: size, frame rate, quality, sound. A video format without it uses its defaults. */
  video?: VideoOptions
}

export interface ExportFile {
  blob: Blob
  filename: string
}

export interface ExportContext {
  engine: EditorEngine
  document: DoryDocument
  /** Pages to export, in document order, with their 0-based index in the document. */
  pages: { page: DocPage; index: number }[]
  options: ExportOptions
  title: string
  /** How the files are named (simple or structured, and the run's timestamp). Simple when absent. */
  naming?: FileNaming
  /** Report progress in 0..1, and what is going on while the progress bar is not moving. */
  onProgress(fraction: number, stage?: ExportStage): void
  /** Something the person should know about the files (a server step that failed and was skipped). */
  onNote?(message: string): void
  signal: AbortSignal
}

/** What an export is busy with: shown under the progress bar. */
export type ExportStage = 'rendering' | 'uploading' | 'printing'

export interface ExportFormat {
  id: string
  label: string
  /** Short helper text under the format name. */
  description?: string
  extension: string
  mime: string
  /** Made by the print server rather than in the browser; the dialog says which. */
  server?: boolean
  /** Which option controls apply. */
  controls: {
    scale?: boolean
    quality?: boolean
    transparent?: boolean
    /** Bleed and crop marks. */
    print?: boolean
    /** Video options, progress and a preview instead of a plain download. */
    video?: boolean
    /** A picture the server can optimize or convert (`EditorAdapter.optimizeImage`). */
    optimize?: boolean
  }
  /** Lower first. */
  order?: number
  /** Hidden when this returns false (e.g. server PDF without an adapter method). */
  available?(engine: EditorEngine): boolean
  run(ctx: ExportContext): Promise<ExportFile[]>
}

export const exportFormats = new Registry<ExportFormat>((a, b) => (a.order ?? 100) - (b.order ?? 100))

export function registerExportFormat(format: ExportFormat): () => void {
  return exportFormats.register(format)
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { scale: 1, quality: 0.92, transparent: false, bleedMm: 0, cropMarks: false }

/**
 * `Title-01.png`, `Title-02.png` … file names for multi-page raster/SVG exports (`Title.png` for a single file). The
 * number has at least two digits, and as many as the design's page count needs so the files sort in page order.
 */
export function pageFilename(title: string, extension: string, pageNumber: number, total: number, designPages = total): string {
  const base = sanitizeFilename(title) || 'design'
  const digits = Math.max(2, String(designPages).length)
  return total > 1 ? `${base}-${String(pageNumber).padStart(digits, '0')}.${extension}` : `${base}.${extension}`
}

/**
 * A file's name under the run's naming: `simple` (the name the format always gave it) as it is, otherwise the structured
 * name. `page` is the 0-based page index of a per-page file, null for a file that holds several pages; `size` is the page
 * size the name shows (the first page's for such a file).
 */
export function exportFilename(
  ctx: Pick<ExportContext, 'document' | 'title' | 'naming'>,
  simple: string,
  extension: string,
  size: { width: number; height: number } | null,
  page: number | null,
  suffix?: string,
): string {
  const naming = ctx.naming ?? SIMPLE_NAMING
  if (naming.style !== 'structured') return simple
  return documentFilename(ctx.document, ctx.title, extension, size, page, naming, (id) => getSizePresets().byId.get(id), suffix)
}

export function sanitizeFilename(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s.-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .slice(0, 80)
}

/** Parses "1-3, 5" into sorted unique 1-based page numbers within `1..total`; null when invalid. */
export function parsePageRange(text: string, total: number): number[] | null {
  const out = new Set<number>()
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null
  for (const part of parts) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part)
    if (!m) return null
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    if (a < 1 || b < a || b > total) return null
    for (let i = a; i <= b; i++) out.add(i)
  }
  return [...out].sort((x, y) => x - y)
}
