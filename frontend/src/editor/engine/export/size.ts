/**
 * The output size of an image export as people type it: a scale (`2x`), a width (`1080w`) or a height (`1350h`). The
 * server reads the same text (`apps/exports/services.parse_size`) for `size` in REST and MCP exports.
 */

/** The scales the server accepts; the browser keeps to them too, so a size typed here means the same over the API. */
export const MIN_SCALE = 0.1
export const MAX_SCALE = 4

const SIZE = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*([x×wh])?\s*$/i

export interface ParsedSize {
  kind: 'x' | 'w' | 'h'
  value: number
}

/** `2x` → { kind: 'x', value: 2 }; a bare number is a scale. Null when the text is not a size. */
export function readSize(text: string): ParsedSize | null {
  const match = SIZE.exec(text)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = (match[2] ?? 'x').toLowerCase()
  return { kind: unit === 'w' ? 'w' : unit === 'h' ? 'h' : 'x', value }
}

/** The scale `text` asks of a page of `width` × `height` px, whatever it is; null when the text is not a size. */
export function sizeScale(text: string, width: number, height: number): number | null {
  const size = readSize(text)
  if (!size || width <= 0 || height <= 0) return null
  return size.kind === 'w' ? size.value / width : size.kind === 'h' ? size.value / height : size.value
}

/**
 * The scale `text` asks of a page of `width` × `height` px, or null when the text is not a size or the scale is outside
 * MIN_SCALE..MAX_SCALE (`8000w` of a 1080 px page). Each page of a design with mixed sizes gets its own scale.
 */
export function parseSize(text: string, width: number, height: number): number | null {
  const scale = sizeScale(text, width, height)
  return scale !== null && scale >= MIN_SCALE - 1e-9 && scale <= MAX_SCALE + 1e-9 ? scale : null
}

/** The pixels a page becomes at `scale`, rounded like the renderer. */
export function scaledPixels(width: number, height: number, scale: number): { width: number; height: number } {
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
