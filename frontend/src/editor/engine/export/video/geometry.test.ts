import { describe, expect, it } from 'vitest'
import { MAX_FRAME_PIXELS, MAX_FRAME_SIDE, barColour, coversFrame, frameSize, placePage } from './geometry'

describe('frameSize', () => {
  it('keeps the design size when it is within the limit, with even sides', () => {
    expect(frameSize({ width: 1280, height: 720 }, 'design', 'mp4')).toEqual({ width: 1280, height: 720 })
    expect(frameSize({ width: 1001, height: 701 }, 'design', 'mp4')).toEqual({ width: 1000, height: 700 })
  })

  it('shrinks a large design to 1920 on the longer side and never enlarges a small one', () => {
    expect(frameSize({ width: 3840, height: 2160 }, 'design', 'webm')).toEqual({ width: 1920, height: 1080 })
    expect(frameSize({ width: 400, height: 300 }, 'design', 'mp4')).toEqual({ width: 400, height: 300 })
    expect(frameSize({ width: 1080, height: 1920 }, 'design', 'mp4')).toEqual({ width: 1080, height: 1920 })
  })

  it('reads a number as the shorter side: 1080 is 1920 x 1080 for 16:9, a square for a square, a tall frame for a portrait', () => {
    expect(frameSize({ width: 1280, height: 720 }, 1080, 'mp4')).toEqual({ width: 1920, height: 1080 })
    expect(frameSize({ width: 1000, height: 1000 }, 720, 'mp4')).toEqual({ width: 720, height: 720 })
    expect(frameSize({ width: 1080, height: 1350 }, 480, 'mp4')).toEqual({ width: 480, height: 600 })
    expect(frameSize({ width: 400, height: 300 }, 720, 'mp4')).toEqual({ width: 960, height: 720 })
  })

  it('never exceeds the largest frame', () => {
    const size = frameSize({ width: 16000, height: 9000 }, 2160, 'mp4')
    expect(size.width).toBeLessThanOrEqual(MAX_FRAME_SIDE)
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_FRAME_PIXELS)
    // A very wide banner is held to the longest side, not to the shorter one.
    const banner = frameSize({ width: 3000, height: 500 }, 2160, 'mp4')
    expect(banner.width).toBeLessThanOrEqual(MAX_FRAME_SIDE)
    expect(banner.width / banner.height).toBeCloseTo(6, 1)
  })

  it('holds a GIF at 720 px on its longer side for the design size', () => {
    expect(frameSize({ width: 1920, height: 1080 }, 'design', 'gif')).toEqual({ width: 720, height: 404 })
  })

  it('survives a degenerate design', () => {
    expect(frameSize({ width: 0, height: 0 }, 'design', 'mp4')).toEqual({ width: 2, height: 2 })
  })
})

describe('placePage', () => {
  const frame = { width: 1920, height: 1080 }

  it('fits a page of another shape inside the frame, centred, with bars', () => {
    const { rect, scale } = placePage({ width: 1000, height: 1000 }, frame, 'fit')
    expect(scale).toBeCloseTo(1.08)
    expect(rect).toEqual({ x: 420, y: 0, width: 1080, height: 1080 })
    expect(coversFrame(rect, frame)).toBe(false)
  })

  it('fills the frame with the same page, cropping what overhangs', () => {
    const { rect, scale } = placePage({ width: 1000, height: 1000 }, frame, 'fill')
    expect(scale).toBeCloseTo(1.92)
    expect(rect).toMatchObject({ x: 0, width: 1920, height: 1920 })
    expect(rect.y).toBeCloseTo(-420)
  })

  it('gives a page of the frame\'s shape the whole frame, even when rounding leaves a pixel over', () => {
    const { rect } = placePage({ width: 1001, height: 701 }, { width: 1000, height: 700 }, 'fit')
    expect(rect).toEqual({ x: 0, y: 0, width: 1000, height: 700 })
    expect(coversFrame(rect, { width: 1000, height: 700 })).toBe(true)
  })

  it('letterboxes a landscape page in a portrait frame', () => {
    const { rect } = placePage({ width: 1280, height: 720 }, { width: 1080, height: 1920 }, 'fit')
    expect(rect.width).toBeCloseTo(1080)
    expect(rect.height).toBeCloseTo(607.5)
    expect(rect.y).toBeCloseTo((1920 - 607.5) / 2)
  })
})

describe('barColour', () => {
  it('is the page colour for a solid page, composed over white when it is translucent', () => {
    expect(barColour({ background: { type: 'solid', color: '#E11D48' } })).toBe('#e11d48')
    expect(barColour({ background: { type: 'solid', color: '#00000080' } })).toBe('#7f7f7f')
    expect(barColour({ background: { type: 'solid', color: 'rgb(10, 20, 30)' } })).toBe('#0a141e')
  })

  it('is the first stop of a gradient and black for a picture or a colour it cannot read', () => {
    expect(barColour({ background: { type: 'gradient', kind: 'linear', stops: [{ offset: 1, color: '#000000' }, { offset: 0, color: '#ff0000' }] } })).toBe('#ff0000')
    expect(barColour({ background: { type: 'image', src: 'https://example.test/a.png', fit: 'cover' } })).toBe('#000000')
    expect(barColour({ background: { type: 'solid', color: 'not a colour' } })).toBe('#000000')
  })
})

describe('blurred bars', () => {
  it('place the page as fitting does (the bars are drawn behind it)', () => {
    const frame = { width: 1920, height: 1080 }
    expect(placePage({ width: 1080, height: 1920 }, frame, 'blur')).toEqual(placePage({ width: 1080, height: 1920 }, frame, 'fit'))
  })
})
