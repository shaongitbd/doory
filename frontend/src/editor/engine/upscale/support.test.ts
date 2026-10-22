import { describe, expect, it } from 'vitest'
import { LOW_MEMORY_MAX_PIXELS, maxOutputPixels } from './support'
import { MAX_OUTPUT_PIXELS, fitsOutput } from './types'

const DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

describe('maxOutputPixels', () => {
  it('allows the full limit on a desktop with plenty of memory or no memory hint', () => {
    expect(maxOutputPixels({ userAgent: DESKTOP_CHROME, platform: 'Win32', deviceMemory: 8 })).toBe(MAX_OUTPUT_PIXELS)
    expect(maxOutputPixels({ userAgent: DESKTOP_CHROME, platform: 'Win32' })).toBe(MAX_OUTPUT_PIXELS)
    expect(maxOutputPixels({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(MAX_OUTPUT_PIXELS)
    expect(maxOutputPixels(undefined)).toBe(MAX_OUTPUT_PIXELS)
  })

  it('caps a device with 4 GB of memory or less at about 16.7 megapixels', () => {
    expect(LOW_MEMORY_MAX_PIXELS).toBe(4096 * 4096)
    expect(maxOutputPixels({ userAgent: DESKTOP_CHROME, platform: 'Linux armv8l', deviceMemory: 4 })).toBe(LOW_MEMORY_MAX_PIXELS)
    expect(maxOutputPixels({ userAgent: DESKTOP_CHROME, platform: 'Win32', deviceMemory: 2 })).toBe(LOW_MEMORY_MAX_PIXELS)
    expect(maxOutputPixels({ userAgent: DESKTOP_CHROME, platform: 'Win32', deviceMemory: 0.5 })).toBe(LOW_MEMORY_MAX_PIXELS)
  })

  it('caps iPhone and iPad, including an iPad that reports itself as a Mac', () => {
    expect(maxOutputPixels({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })).toBe(LOW_MEMORY_MAX_PIXELS)
    expect(maxOutputPixels({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(LOW_MEMORY_MAX_PIXELS)
  })

  it('makes fitsOutput refuse what the device cannot hold', () => {
    const limit = maxOutputPixels({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })
    expect(fitsOutput({ width: 4096, height: 4096 }, limit)).toBe(true)
    expect(fitsOutput({ width: 4096, height: 4097 }, limit)).toBe(false)
    expect(fitsOutput({ width: 6000, height: 4000 })).toBe(true)
    expect(fitsOutput({ width: 6000, height: 4000 }, limit)).toBe(false)
    // A larger device limit never raises the upscaler's own limit.
    expect(fitsOutput({ width: 8000, height: 8000 }, Number.POSITIVE_INFINITY)).toBe(false)
  })
})
