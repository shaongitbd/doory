import { useEffect, useState } from 'react'
import type { DocPage } from '@/types/document'
import type { EditorEngine } from '../../engine/editor'
import { pageMultiplier } from '../../engine/export/formats'
import { encodeRaster } from '../../engine/export/encode'
import { type RasterFormat, RASTER_MIME, browserEncodes, hasAlpha, isLossy, serverConverts, wantsServer } from '../../engine/export/raster'
import type { ExportOptions } from '../../engine/export/registry'
import { canvasToBlob, renderPageToCanvas, safeMultiplier } from '../../engine/render'

/** The preview is drawn at the file's own pixels up to this long side; bigger files are estimated from it. */
const PREVIEW_MAX_SIDE = 1600
/** How bytes grow with pixels: a bit less than linearly, since bigger pictures compress better. */
const GROWTH = 0.86
/** Wait for the controls to settle before encoding, and longer before asking the server. */
const ENCODE_DELAY = 120
const SERVER_DELAY = 450

export interface PreviewInput {
  engine: EditorEngine
  page: DocPage | null
  size: { width: number; height: number }
  /** The chosen picture format; null for PDF, SVG and video (only the page is shown). */
  format: RasterFormat | null
  options: ExportOptions
  /** The picture formats this editor offers, for the estimated sizes. */
  formats: RasterFormat[]
}

export interface PreviewState {
  /** The page as drawn (lossless): the left side of the compare. */
  original: string | null
  /** The chosen format as it will come out: the right side. */
  after: string | null
  /** Estimated bytes per page at the file's size, per format; the chosen one includes optimizing. */
  sizes: Partial<Record<RasterFormat, number>>
  /** The chosen format before optimizing, estimated the same way. */
  bytesBefore: number | null
  /** Estimates only (the AVIF size before the server was asked, every size of a scaled-down preview). */
  approximate: Partial<Record<RasterFormat, boolean>>
  /** The server's note, or that it could not be asked. */
  note: string | null
  failed: boolean
}

const EMPTY: PreviewState = { original: null, after: null, sizes: {}, bytesBefore: null, approximate: {}, note: null, failed: false }

function objectUrl(blob: Blob): string | null {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null
}

/** An effect's cleanup that revokes `url` (when it is replaced or the preview goes). */
function revokeLater(url: string | null): (() => void) | undefined {
  return url ? () => URL.revokeObjectURL?.(url) : undefined
}

/** JPG has no alpha: a transparent drawing is put on white first, as the export does. */
function onWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const flat = document.createElement('canvas')
  flat.width = canvas.width
  flat.height = canvas.height
  const ctx = flat.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, flat.width, flat.height)
  ctx.drawImage(canvas, 0, 0)
  return flat
}

/**
 * Draws the page for the compare preview and estimates the file sizes: the browser encodes the preview in every format
 * it can (sizes scaled up when the preview is smaller than the file), and the server converts and optimizes it for the
 * chosen format when the download would go there too.
 */
export function usePreview({ engine, page, size, format, options, formats }: PreviewInput): PreviewState {
  const [state, setState] = useState<PreviewState>(EMPTY)
  const [drawn, setDrawn] = useState<{ canvas: HTMLCanvasElement; png: Blob; factor: number } | null>(null)

  const output = safeMultiplier(size.width, size.height, pageMultiplier(options, size))
  const scale = Math.min(output, PREVIEW_MAX_SIDE / Math.max(size.width, size.height))
  const transparent = options.transparent && (format === null || hasAlpha(format))

  // Each side's picture is let go once the next one is shown, or when the dialog closes.
  useEffect(() => revokeLater(state.original), [state.original])
  useEffect(() => revokeLater(state.after), [state.after])

  // Draw the page (again only when what is drawn changes).
  useEffect(() => {
    if (!page) return
    let live = true
    const timer = setTimeout(() => {
      renderPageToCanvas(page, size, engine.loadContext, { multiplier: scale, transparent })
        .then(async (canvas) => {
          const png = await canvasToBlob(canvas, 'image/png')
          if (!live) return
          const factor = Math.max(1, (output * output) / (scale * scale))
          const original = objectUrl(png)
          setDrawn({ canvas, png, factor })
          setState((s) => ({ ...s, original, failed: false }))
        })
        .catch(() => live && setState((s) => ({ ...s, failed: true })))
    }, ENCODE_DELAY)
    return () => {
      live = false
      clearTimeout(timer)
    }
    // `size` is read through its width and height.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, page, size.width, size.height, scale, output, transparent])

  const { quality, maxBytes, pngColors, optimize, optimizer, stripMetadata, progressive } = options
  const formatKey = formats.join(',')
  // Encode in every format the browser makes, and the chosen one as the download will (server included).
  useEffect(() => {
    if (!drawn) return
    let live = true
    const controller = new AbortController()
    const grow = (bytes: number): number => Math.round(bytes * Math.pow(drawn.factor, GROWTH))
    const approx = drawn.factor > 1.01
    const run = async (): Promise<void> => {
      const sizes: Partial<Record<RasterFormat, number>> = {}
      const approximate: Partial<Record<RasterFormat, boolean>> = {}
      const blobs: Partial<Record<RasterFormat, Blob>> = { png: drawn.png }
      const flat = onWhite(drawn.canvas)
      for (const f of formats) {
        // A newer change started its own run: this one stops between formats instead of finishing for nothing.
        if (!live) return
        if (f === 'png') blobs.png = drawn.png
        else if (browserEncodes(f)) {
          const blob = await canvasToBlob(f === 'jpg' ? flat : drawn.canvas, RASTER_MIME[f], quality)
          if (blob.type === RASTER_MIME[f]) blobs[f] = blob
        }
        if (blobs[f]) {
          sizes[f] = grow(blobs[f].size)
          approximate[f] = approx
        }
      }
      // No browser makes AVIF: until the server is asked, it is guessed from WebP (or JPG), as it tends to be smaller.
      if (formats.includes('avif') && sizes.avif === undefined) {
        const base = sizes.webp ?? (sizes.jpg !== undefined ? sizes.jpg * 0.75 : undefined)
        if (base !== undefined) {
          sizes.avif = Math.round(base * 0.8)
          approximate.avif = true
        }
      }
      if (!live) return
      let after: Blob | null = format ? (blobs[format] ?? null) : null
      let before: number | null = format && sizes[format] !== undefined ? (sizes[format] as number) : null
      let note: string | null = null
      const server = format !== null && serverConverts(engine.adapter, format) && wantsServer(format, options)
      if (format && (server || (isLossy(format) && maxBytes))) {
        if (server) await new Promise((resolve) => setTimeout(resolve, SERVER_DELAY))
        if (!live) return
        // The cap is for the whole file; the preview is smaller, so its share is too.
        const share = maxBytes ? Math.max(1000, Math.round(maxBytes / Math.pow(drawn.factor, GROWTH))) : undefined
        const source = format === 'jpg' ? flat : drawn.canvas
        try {
          const result = await encodeRaster(source, format, { quality, maxBytes: share, pngColors, transparent, optimize, optimizer, stripMetadata, progressive }, engine.adapter, controller.signal)
          if (!live) return
          after = result.blob
          if (result.format === format) {
            sizes[format] = grow(result.blob.size)
            approximate[format] = approx
            before = grow(result.bytesBefore)
          }
          note = result.note ?? null
        } catch {
          return
        }
      }
      const url = after ? objectUrl(after) : null
      setState((s) => ({ ...s, after: url, sizes, approximate, bytesBefore: before, note }))
    }
    const timer = setTimeout(() => void run(), ENCODE_DELAY)
    return () => {
      live = false
      clearTimeout(timer)
      controller.abort()
    }
    // `options` is read through the fields listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, engine, format, formatKey, quality, maxBytes, pngColors, optimize, optimizer, stripMetadata, progressive, transparent])

  return page ? state : EMPTY
}
