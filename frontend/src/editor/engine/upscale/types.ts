/**
 * Shared types and limits for the pure-code upscaler.
 *
 * Everything here is plain arithmetic on typed arrays, so the work can run in a worker and in unit
 * tests. The resampler is a windowed-sinc (Lanczos) filter with an anti-ringing clamp and an optional
 * luminance detail pass; there is no model, no network request and no third-party image library.
 */

export type UpscaleMethod = 'photo' | 'pixel'

export interface Size {
  width: number
  height: number
}

/** A rectangle in source pixels (the visible crop of a photo). */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** Options that can cross the worker boundary. */
export interface UpscaleRequestOptions {
  /** Zoom factor; 2 means twice as wide and twice as tall. */
  scale: number
  /** `photo` (Lanczos + detail) or `pixel` (nearest neighbour). */
  method?: UpscaleMethod
  /** Strength of the detail pass, 0..1. */
  detail?: number
  /** The largest encoded result the asset store accepts (PNG is used when it fits). */
  maxBytes?: number
}

export interface UpscaleOptions extends UpscaleRequestOptions {
  /** Progress from 0 to 100. */
  onProgress?: (percent: number) => void
}

/**
 * The server's limits for an uploaded picture, mirrored from MAX_DIMENSION and MAX_PIXELS in
 * backend/apps/core/images.py: a result over either is refused on upload, so it is never computed.
 */
export const SERVER_MAX_SIDE = 12_000
export const SERVER_MAX_PIXELS = 80_000_000

/**
 * About 48 megapixels: enough for 2x of a 12-megapixel photo, and small enough that the float working
 * buffers (one horizontal plane at a time) stay in the low hundreds of megabytes. Never above the
 * server's own limits.
 */
export const MAX_OUTPUT_PIXELS = Math.min(48_000_000, SERVER_MAX_PIXELS)
export const MAX_OUTPUT_SIDE = SERVER_MAX_SIDE
export const MAX_SCALE = 8
export const DEFAULT_DETAIL = 0.25

export class UpscaleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpscaleError'
  }
}

export function targetSize(width: number, height: number, scale: number): Size {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new UpscaleError('The image size must be positive.')
  }
  if (!Number.isFinite(scale) || scale < 1 || scale > MAX_SCALE) {
    throw new UpscaleError(`The scale must be between 1 and ${MAX_SCALE}.`)
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Whether a result of `size` can be made and uploaded; `maxPixels` lowers the pixel limit for this device. */
export function fitsOutput(size: Size, maxPixels: number = MAX_OUTPUT_PIXELS): boolean {
  const pixels = Math.min(maxPixels, MAX_OUTPUT_PIXELS)
  return size.width >= 1 && size.height >= 1 && size.width <= MAX_OUTPUT_SIDE && size.height <= MAX_OUTPUT_SIDE && size.width * size.height <= pixels
}

export function assertOutput(size: Size): void {
  if (!fitsOutput(size)) {
    throw new UpscaleError(`The result (${size.width} × ${size.height} px) is too large. Choose a smaller factor.`)
  }
}
