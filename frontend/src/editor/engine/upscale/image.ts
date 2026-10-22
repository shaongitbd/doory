/** Decoding to RGBA and encoding the result, using only the browser's own canvas APIs. */
import { MAX_OUTPUT_PIXELS, UpscaleError } from './types'

export interface DecodedImage {
  rgba: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

/**
 * Decodes `blob` into straight RGBA bytes. The whole photo is decoded even when the design only
 * shows a crop, because the upscaled asset keeps the uncropped source.
 */
export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    throw new UpscaleError('This image cannot be decoded.')
  }
  try {
    const { width, height } = bitmap
    if (width < 1 || height < 1 || width * height > MAX_OUTPUT_PIXELS) {
      throw new UpscaleError('The image is too large to upscale.')
    }
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new UpscaleError('A canvas could not be created for this image.')
    context.drawImage(bitmap, 0, 0)
    const { data } = context.getImageData(0, 0, width, height)
    return { rgba: data, width, height }
  } finally {
    bitmap.close()
  }
}

/** A photo this size still fits in a lossless PNG most of the time; larger ones start as WebP. */
const LOSSLESS_LIMIT_PIXELS = 12_000_000

export async function encodeResult(rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number, method: 'photo' | 'pixel', maxBytes = Number.POSITIVE_INFINITY): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) throw new UpscaleError('A canvas could not be created for the result.')
  context.putImageData(new ImageData(rgba, width, height), 0, 0)

  // Pixel art keeps exact colours in a PNG. A small photograph gets the same lossless treatment; a
  // large one would make a very big PNG, so it starts as WebP and only falls back to lower qualities
  // when the upload limit requires it.
  if (method === 'pixel' || width * height <= LOSSLESS_LIMIT_PIXELS) {
    const png = await canvas.convertToBlob({ type: 'image/png' })
    if (png.size <= maxBytes) return png
    if (method === 'pixel') throw new UpscaleError('The result is too large to upload. Choose a smaller factor.')
  }

  let blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.95 })
  // A browser without a WebP encoder answers with a PNG; there is nothing better to try.
  if (blob.type !== 'image/webp') {
    if (blob.size <= maxBytes) return blob
    throw new UpscaleError('The result is too large to upload. Choose a smaller factor.')
  }
  for (const quality of [0.88, 0.8, 0.7]) {
    if (blob.size <= maxBytes) return blob
    blob = await canvas.convertToBlob({ type: 'image/webp', quality })
  }
  if (blob.size > maxBytes) throw new UpscaleError('The result is too large to upload. Choose a smaller factor.')
  return blob
}
