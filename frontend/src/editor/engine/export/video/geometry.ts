/**
 * The frame of a video and how a page sits in it. A video has one fixed size; pages of other shapes are fitted
 * (the whole page, bars around it) or filled (the frame is covered, the page is cropped). Pure arithmetic.
 */
import type { DocPage } from '@/types/document'
import { parseColor, rgbaToHex } from '../../colors'
import { FORMAT_RULES, type FitMode, type Resolution, type VideoFormat } from './options'

export interface Size {
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The largest side of a frame (DCI 4K). Encoders and browsers refuse more, and a frame this big needs 35 MB of pixels. */
export const MAX_FRAME_SIDE = 4096
/** The most pixels of a frame: 3840 x 2160. */
export const MAX_FRAME_PIXELS = 3840 * 2160

/** Rounds down to an even number (4:2:0 video has half-resolution colour), at least 2. */
export const evenFloor = (n: number): number => Math.max(2, Math.floor(n / 2) * 2)

/**
 * The size of the video frame. `design` is the first page's size, shrunk (never enlarged) so that its longer side is
 * at most the format's limit; a number is the length of the shorter side (1080 gives 1920 x 1080 for a 16:9 design, a
 * 1080 x 1080 square for a square one). Every frame is within `MAX_FRAME_SIDE` and `MAX_FRAME_PIXELS` and has even sides.
 */
export function frameSize(first: Size, resolution: Resolution, format: VideoFormat): Size {
  const width = Math.max(1, first.width)
  const height = Math.max(1, first.height)
  const long = Math.max(width, height)
  const short = Math.min(width, height)
  let scale = resolution === 'design' ? Math.min(1, FORMAT_RULES[format].designMaxSide / long) : resolution / short
  scale = Math.min(scale, MAX_FRAME_SIDE / long, Math.sqrt(MAX_FRAME_PIXELS / (width * height)))
  return { width: evenFloor(width * scale), height: evenFloor(height * scale) }
}

/**
 * Where a page of `page` px goes in a frame, and the factor that takes page px to frame px. `fit` is the largest
 * rectangle of the page's shape inside the frame, centred; `fill` the smallest one that covers it. A page whose shape
 * is the frame's within a pixel of rounding takes the whole frame (no hairline bars).
 */
export function placePage(page: Size, frame: Size, mode: FitMode): { rect: Rect; scale: number } {
  const sx = frame.width / page.width
  const sy = frame.height / page.height
  const scale = mode === 'fill' ? Math.max(sx, sy) : Math.min(sx, sy)
  const width = page.width * scale
  const height = page.height * scale
  const nearly = (a: number, b: number): boolean => Math.abs(a - b) <= 1
  if (nearly(width, frame.width) && nearly(height, frame.height)) return { rect: { x: 0, y: 0, width: frame.width, height: frame.height }, scale }
  return { rect: { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height }, scale }
}

/** True when the page covers the frame exactly, so its bitmap can be handed to the encoder without a copy. */
export function coversFrame(rect: Rect, frame: Size): boolean {
  return rect.x === 0 && rect.y === 0 && rect.width === frame.width && rect.height === frame.height
}

/** Composites `a` over white: the colour a viewer sees of a translucent page colour. */
function opaqueHex(color: string): string | null {
  const rgba = parseColor(color)
  if (!rgba) return null
  const over = (c: number): number => Math.round(c * rgba.a + 255 * (1 - rgba.a))
  return rgbaToHex({ r: over(rgba.r), g: over(rgba.g), b: over(rgba.b), a: 1 })
}

/**
 * The colour of the bars around a page: the page's own colour, so a page that does not fill the frame looks like a
 * page on a table of its colour. A gradient gives its first stop; a picture, whose colour is not known without loading
 * it, gives black (the same as the slideshow's stage).
 */
export function barColour(page: Pick<DocPage, 'background'>): string {
  const background = page.background
  if (background.type === 'solid') return opaqueHex(background.color) ?? '#000000'
  if (background.type === 'gradient') {
    const first = [...background.stops].sort((a, b) => a.offset - b.offset)[0]
    return (first && opaqueHex(first.color)) ?? '#000000'
  }
  return '#000000'
}
