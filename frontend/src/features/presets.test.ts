import { getSizePresets, quickPresets } from '@/lib/sizePresets'
import {
  CUSTOM_UNITS,
  createUrl,
  formatUnitValue,
  getPreset,
  lockedCounterpart,
  parseCustomSize,
  pxToUnit,
  resolveCreateSpec,
  unitToPx,
} from './presets'

describe('unit conversion at 96 dpi', () => {
  it('converts every unit to pixels', () => {
    expect(unitToPx(1, 'in')).toBe(96)
    expect(unitToPx(25.4, 'mm')).toBeCloseTo(96, 6)
    expect(unitToPx(2.54, 'cm')).toBeCloseTo(96, 6)
    expect(unitToPx(500, 'px')).toBe(500)
  })

  it('round-trips px → unit → px', () => {
    for (const unit of CUSTOM_UNITS) {
      expect(unitToPx(pxToUnit(1234, unit), unit)).toBeCloseTo(1234, 6)
    }
  })

  it('formats values with unit-appropriate precision', () => {
    expect(formatUnitValue(1080.4, 'px')).toBe('1080')
    expect(formatUnitValue(8.2677, 'in')).toBe('8.27')
  })
})

describe('size presets', () => {
  it('has unique ids, positive in-range sizes and covers the documented sizes', () => {
    const presets = getSizePresets().presets
    const ids = presets.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of presets) {
      expect(preset.width).toBeGreaterThan(0)
      expect(preset.height).toBeGreaterThan(0)
      expect(Math.max(preset.width, preset.height)).toBeLessThanOrEqual(20000)
    }
    expect(getPreset('instagram-post')).toMatchObject({ width: 1080, height: 1080 })
    expect(getPreset('instagram-story')).toMatchObject({ width: 1080, height: 1920 })
    expect(getPreset('a4')).toMatchObject({ width: 794, height: 1123, unit: 'mm' })
    expect(getPreset('letter')).toMatchObject({ width: 816, height: 1056, unit: 'in' })
    expect(getPreset('poster')).toMatchObject({ width: 1728, height: 2304, unit: 'in' })
    expect(getPreset('business-card')).toMatchObject({ width: 336, height: 192 })
    expect(getPreset('presentation')).toMatchObject({ width: 1920, height: 1080 })
    expect(getPreset('video-4k')).toMatchObject({ width: 3840, height: 2160 })
  })

  it('resolves the slugs of the editor\'s old list too', () => {
    expect(getPreset('twitter-post')?.id).toBe('x-post')
    expect(getPreset('instagram-portrait')).toMatchObject({ width: 1080, height: 1350 })
    expect(getPreset('web-banner')).toMatchObject({ width: 728, height: 90 })
  })

  it('offers the same quick sizes as before, in the same order', () => {
    expect(quickPresets(getSizePresets()).map((p) => p.id)).toEqual(['instagram-post', 'presentation', 'poster', 'a4', 'youtube-thumbnail', 'instagram-story', 'logo'])
  })
})

describe('parseCustomSize', () => {
  it('converts physical units to whole pixels and maps cm to mm for the document unit', () => {
    expect(parseCustomSize({ width: 21, height: 29.7, unit: 'cm' })).toEqual({ ok: true, width: 794, height: 1123, unit: 'mm' })
    expect(parseCustomSize({ width: '8,5', height: '11', unit: 'in' })).toEqual({ ok: true, width: 816, height: 1056, unit: 'in' })
    expect(parseCustomSize({ width: 640, height: 480, unit: 'px' })).toEqual({ ok: true, width: 640, height: 480, unit: 'px' })
  })

  it('rejects empty, zero, negative and non-numeric values', () => {
    expect(parseCustomSize({ width: '', height: 100, unit: 'px' })).toMatchObject({ ok: false, field: 'width' })
    expect(parseCustomSize({ width: 100, height: 0, unit: 'px' })).toMatchObject({ ok: false, field: 'height' })
    expect(parseCustomSize({ width: -5, height: 100, unit: 'px' })).toMatchObject({ ok: false, field: 'width' })
    expect(parseCustomSize({ width: 'abc', height: 100, unit: 'px' })).toMatchObject({ ok: false })
  })

  it('rejects trailing garbage instead of silently parsing the leading number', () => {
    expect(parseCustomSize({ width: '1080abc', height: 100, unit: 'px' })).toMatchObject({ ok: false, field: 'width' })
    expect(parseCustomSize({ width: 100, height: '12.5.6', unit: 'px' })).toMatchObject({ ok: false, field: 'height' })
    expect(parseCustomSize({ width: '10px', height: 100, unit: 'px' })).toMatchObject({ ok: false, field: 'width' })
    // The decimal comma is still accepted, as before.
    expect(parseCustomSize({ width: '8,5', height: '11', unit: 'in' })).toEqual({ ok: true, width: 816, height: 1056, unit: 'in' })
  })

  it('enforces the 1 px minimum and 20 000 px maximum', () => {
    expect(parseCustomSize({ width: 0.001, height: 100, unit: 'mm' })).toMatchObject({ ok: false, field: 'width' })
    expect(parseCustomSize({ width: 20000, height: 20000, unit: 'px' })).toMatchObject({ ok: true })
    const tooBig = parseCustomSize({ width: 100, height: 20001, unit: 'px' })
    expect(tooBig).toMatchObject({ ok: false, field: 'height' })
    expect(tooBig.ok ? '' : tooBig.error).toContain('20,000')
    expect(parseCustomSize({ width: 300, height: 10, unit: 'in' })).toMatchObject({ ok: false, field: 'width' })
  })

  it('locks the aspect ratio in both directions', () => {
    expect(lockedCounterpart(200, 2, 'width')).toBe(100)
    expect(lockedCounterpart(100, 2, 'height')).toBe(200)
    expect(lockedCounterpart(100, 0, 'height')).toBe(100)
  })
})

describe('resolveCreateSpec / createUrl', () => {
  const spec = (query: string) => resolveCreateSpec(new URLSearchParams(query))

  it('defaults to the Instagram post preset', () => {
    expect(spec('')).toMatchObject({ kind: 'size', width: 1080, height: 1080, presetId: 'instagram-post' })
  })

  it('reads presets, custom sizes and templates', () => {
    expect(spec('preset=a4')).toMatchObject({ kind: 'size', width: 794, height: 1123, unit: 'mm', presetId: 'a4' })
    expect(spec('w=10&h=5&unit=cm')).toMatchObject({ kind: 'size', width: 378, height: 189, unit: 'mm' })
    expect(spec('template=summer-sale')).toEqual({ kind: 'template', slug: 'summer-sale' })
  })

  it('ignores invalid input instead of trusting it', () => {
    expect(spec('preset=nope')).toMatchObject({ presetId: 'instagram-post' })
    expect(spec('w=99999&h=10')).toMatchObject({ presetId: 'instagram-post' })
    expect(spec('w=abc&h=10')).toMatchObject({ presetId: 'instagram-post' })
    expect(spec('template=../etc/passwd')).toMatchObject({ kind: 'size' })
  })

  it('builds URLs that resolve back to the same spec', () => {
    expect(resolveCreateSpec(new URL(createUrl({ presetId: 'poster' }), 'http://x').searchParams)).toMatchObject({ presetId: 'poster' })
    expect(resolveCreateSpec(new URL(createUrl({ width: 300, height: 200, unit: 'mm' }), 'http://x').searchParams)).toMatchObject({ width: 1134, height: 756, unit: 'mm' })
    expect(createUrl({ template: 'x' })).toBe('/create?template=x')
  })
})
