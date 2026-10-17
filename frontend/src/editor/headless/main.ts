/**
 * Entry point of `render.html`: a page with no UI that the server's headless browser opens to draw a design page as
 * a PNG. The server calls `window.__dooryRender(input)` once `window.__dooryRenderReady` is true. Design fonts come only
 * from `input.fonts` (the app's bundled UI fonts are other families, e.g. "Plus Jakarta Sans Variable").
 */
import { canvasToBlob } from '../engine/render'
import { type RenderErrorCode, type RenderInput, RenderError, renderDesignPage } from './render'

export type RenderResponse =
  | { ok: true; png: string; width: number; height: number; pageId: string; pageIndex: number; placeholders: number; missingFonts: string[] }
  | { ok: false; error: { code: RenderErrorCode | 'render_failed'; message: string } }

declare global {
  interface Window {
    __dooryRender?: (input: RenderInput) => Promise<RenderResponse>
    __dooryRenderReady?: boolean
  }
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1))
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'))
    reader.readAsDataURL(blob)
  })
}

window.__dooryRender = async (input) => {
  try {
    const { canvas, ...page } = await renderDesignPage(input)
    const png = await base64(await canvasToBlob(canvas, 'image/png'))
    return { ok: true, png, width: canvas.width, height: canvas.height, ...page }
  } catch (error) {
    if (error instanceof RenderError) return { ok: false, error: { code: error.code, message: error.message } }
    return { ok: false, error: { code: 'render_failed', message: error instanceof Error ? error.message : String(error) } }
  }
}
window.__dooryRenderReady = true
