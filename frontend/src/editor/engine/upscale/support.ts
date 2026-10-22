import { MAX_OUTPUT_PIXELS } from './types'

/** The upscaler needs a module worker, an offscreen canvas and the browser's image decoder. */
export function isUpscaleSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function'
}

/**
 * 4096 x 4096 (about 16.7 megapixels): the largest canvas iOS and iPadOS draw, and a safe ceiling
 * for a device with little memory.
 */
export const LOW_MEMORY_MAX_PIXELS = 16_777_216

/** The parts of `navigator` the device limit reads; `deviceMemory` is only in Chromium browsers. */
export interface DeviceInfo {
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
  deviceMemory?: number
}

/** iPhone, iPod and iPad; iPadOS Safari reports itself as a Mac, and only the touch screen tells them apart. */
function isAppleMobile(device: DeviceInfo): boolean {
  if (/iPhone|iPad|iPod/.test(device.userAgent ?? '')) return true
  return device.platform === 'MacIntel' && (device.maxTouchPoints ?? 0) > 1
}

/**
 * The largest result, in pixels, this device can hold: lower on iOS and iPadOS (every browser there
 * has WebKit's canvas limit) and on a device that reports 4 GB of memory or less.
 */
export function maxOutputPixels(device: DeviceInfo | undefined = globalThis.navigator): number {
  if (!device) return MAX_OUTPUT_PIXELS
  const lowMemory = typeof device.deviceMemory === 'number' && device.deviceMemory > 0 && device.deviceMemory <= 4
  return isAppleMobile(device) || lowMemory ? Math.min(MAX_OUTPUT_PIXELS, LOW_MEMORY_MAX_PIXELS) : MAX_OUTPUT_PIXELS
}
