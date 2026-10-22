import { describe, expect, it } from 'vitest'
import { upscaleImageData } from './core'
import { MAX_OUTPUT_PIXELS, MAX_OUTPUT_SIDE, SERVER_MAX_PIXELS, SERVER_MAX_SIDE, assertOutput, fitsOutput, targetSize } from './types'

function solid(width: number, height: number, rgba: readonly [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4)
  return data
}

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const at = (y * width + x) * 4
  return [data[at], data[at + 1], data[at + 2], data[at + 3]]
}

describe('upscaleImageData', () => {
  it('keeps a constant colour constant at 2x and 4x', () => {
    for (const scale of [2, 4]) {
      const out = upscaleImageData(solid(3, 2, [200, 100, 50, 255]), 3, 2, { scale })
      expect(out.width).toBe(3 * scale)
      expect(out.height).toBe(2 * scale)
      for (let i = 0; i < out.data.length; i += 4) {
        expect(Math.abs(out.data[i] - 200)).toBeLessThanOrEqual(1)
        expect(Math.abs(out.data[i + 1] - 100)).toBeLessThanOrEqual(1)
        expect(Math.abs(out.data[i + 2] - 50)).toBeLessThanOrEqual(1)
        expect(out.data[i + 3]).toBe(255)
      }
    }
  })

  it('does not leak the colour of transparent pixels into the result', () => {
    // A red pixel that is completely transparent next to transparent black.
    const out = upscaleImageData(new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 2, 2, { scale: 2 })
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(0)
      expect(out.data[i + 3]).toBe(0)
    }
  })

  it('enlarges a ramp monotonically and keeps both ends', () => {
    const ramp = new Uint8ClampedArray([0, 0, 0, 255, 85, 85, 85, 255, 170, 170, 170, 255, 255, 255, 255, 255])
    const out = upscaleImageData(ramp, 4, 1, { scale: 2 })
    for (let x = 1; x < out.width; x++) expect(out.data[x * 4]).toBeGreaterThanOrEqual(out.data[(x - 1) * 4])
    expect(out.data[0]).toBe(0)
    expect(out.data[(out.width - 1) * 4]).toBe(255)
  })

  /** `width` x 2 pixels: `left` on the left half and `right` on the right half. */
  function edge(width: number, left: readonly [number, number, number, number], right: readonly [number, number, number, number]): Uint8ClampedArray {
    const source = new Uint8ClampedArray(width * 2 * 4)
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < width; x++) source.set(x < width / 2 ? left : right, (y * width + x) * 4)
    }
    return source
  }

  it('clamps the ringing around a hard edge to the source range', () => {
    // Mid-grey on both sides, so an overshoot would show up as a value outside 64..192 rather than
    // being hidden by the 0..255 range of the bytes. No detail pass, which could sharpen past it.
    const out = upscaleImageData(edge(8, [64, 64, 64, 255], [192, 192, 192, 255]), 8, 2, { scale: 4, detail: 0 })
    for (let i = 0; i < out.data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        expect(out.data[i + channel]).toBeGreaterThanOrEqual(64)
        expect(out.data[i + channel]).toBeLessThanOrEqual(192)
      }
      expect(out.data[i + 3]).toBe(255)
    }
  })

  it('leaves no dark fringe along a semi-transparent edge', () => {
    // Both halves half transparent: the colour is divided by the resampled alpha, where an unclamped
    // undershoot turns into a dark (even black) seam.
    const out = upscaleImageData(edge(8, [64, 64, 64, 128], [192, 192, 192, 128]), 8, 2, { scale: 4, detail: 0 })
    for (let i = 0; i < out.data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        expect(out.data[i + channel]).toBeGreaterThanOrEqual(64)
        expect(out.data[i + channel]).toBeLessThanOrEqual(192)
      }
      expect(out.data[i + 3]).toBe(128)
    }
  })

  it('uses exact nearest-neighbour pixels in pixel mode', () => {
    const source = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255])
    const out = upscaleImageData(source, 2, 2, { scale: 2, method: 'pixel' })
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const sourceX = x < 2 ? 0 : 1
        const sourceY = y < 2 ? 0 : 1
        const expected = pixel(source, 2, sourceX, sourceY)
        expect(pixel(out.data, 4, x, y)).toEqual(expected)
      }
    }
  })

  it('reports progress up to 100', () => {
    const seen: number[] = []
    upscaleImageData(solid(4, 4, [255, 255, 255, 255]), 4, 4, { scale: 2, onProgress: (percent) => seen.push(percent) })
    expect(seen.at(-1)).toBe(100)
    expect(seen.length).toBeGreaterThan(1)
  })

  it('refuses a result over the memory limit', () => {
    expect(() => assertOutput(targetSize(4_000, 4_000, 4))).toThrow(/too large/)
  })

  it('targetSize keeps the aspect and rounds to whole pixels', () => {
    expect(targetSize(333, 111, 2)).toEqual({ width: 666, height: 222 })
    expect(targetSize(101, 51, 3)).toEqual({ width: 303, height: 153 })
  })

  it('fitsOutput rejects oversized sides and pixel counts', () => {
    expect(fitsOutput({ width: 10, height: 10 })).toBe(true)
    expect(fitsOutput({ width: 20_000, height: 10 })).toBe(false)
    expect(fitsOutput({ width: Math.sqrt(MAX_OUTPUT_PIXELS) + 1, height: Math.sqrt(MAX_OUTPUT_PIXELS) + 1 })).toBe(false)
  })

  it('never allows a result the server would refuse', () => {
    expect(MAX_OUTPUT_SIDE).toBeLessThanOrEqual(SERVER_MAX_SIDE)
    expect(MAX_OUTPUT_PIXELS).toBeLessThanOrEqual(SERVER_MAX_PIXELS)
  })

  it('fitsOutput accepts a side of exactly the server limit and refuses one pixel more', () => {
    expect(fitsOutput({ width: 12_000, height: 1_000 })).toBe(true)
    expect(fitsOutput({ width: 12_001, height: 1_000 })).toBe(false)
    expect(fitsOutput({ width: 1_000, height: 12_000 })).toBe(true)
    expect(fitsOutput({ width: 1_000, height: 12_001 })).toBe(false)
    // 6500 x 1500 at 2x is under the pixel limit but wider than the server takes.
    expect(fitsOutput(targetSize(6_500, 1_500, 2))).toBe(false)
    expect(fitsOutput(targetSize(6_000, 1_500, 2))).toBe(true)
  })

  it('fitsOutput accepts exactly the pixel limit and refuses one pixel more', () => {
    expect(fitsOutput({ width: 8_000, height: MAX_OUTPUT_PIXELS / 8_000 })).toBe(true)
    expect(fitsOutput({ width: 8_000, height: MAX_OUTPUT_PIXELS / 8_000 + 1 })).toBe(false)
    expect(fitsOutput({ width: 0, height: 10 })).toBe(false)
  })
})
