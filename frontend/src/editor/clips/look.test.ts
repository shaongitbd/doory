import { describe, expect, it } from 'vitest'
import { isPlainLook, lookOf } from './look'

describe('the look of a clip', () => {
  it('is plain without adjustments', () => {
    expect(isPlainLook(lookOf(undefined))).toBe(true)
    expect(isPlainLook(lookOf([]))).toBe(true)
  })

  it('maps the picture adjustments to a canvas filter', () => {
    const look = lookOf([
      { type: 'brightness', value: -0.12 },
      { type: 'contrast', value: 0.2 },
      { type: 'saturation', value: -1 },
      { type: 'hue', value: 0.5 },
      { type: 'grayscale', value: 1 },
      { type: 'sepia', value: 1 },
    ])
    expect(look.css).toBe('brightness(0.880) contrast(1.200) saturate(0.000) hue-rotate(90deg) grayscale(1) sepia(1)')
    expect(look.blur).toBe(0)
  })

  it('keeps blur and vignette apart (they are drawn, not filtered)', () => {
    const look = lookOf([{ type: 'blur', value: 0.5 }, { type: 'vignette', value: 0.4 }])
    expect(look.css).toBe('none')
    expect(look.vignette).toBe(0.4)
    // Fabric's triangle reaching 0.5 * 0.25 * 0.12 of the shorter side, as a Gaussian of the same spread.
    expect(look.blur).toBeCloseTo((0.5 * 0.03) / Math.sqrt(6), 6)
    expect(isPlainLook(look)).toBe(false)
  })
})
