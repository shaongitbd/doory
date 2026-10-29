export { upscaleImage, type UpscaleProgress } from './client'
/** The id of the upscale task on servers (`POST /api/v1/ai/upscale/`). */
export const UPSCALE_TASK = 'upscale'
export { LOW_MEMORY_MAX_PIXELS, isUpscaleSupported, maxOutputPixels, type DeviceInfo } from './support'
export {
  DEFAULT_DETAIL,
  MAX_OUTPUT_PIXELS,
  MAX_OUTPUT_SIDE,
  MAX_SCALE,
  UpscaleError,
  assertOutput,
  fitsOutput,
  targetSize,
  type CropRect,
  type Size,
  type UpscaleMethod,
  type UpscaleOptions,
  type UpscaleRequestOptions,
} from './types'
