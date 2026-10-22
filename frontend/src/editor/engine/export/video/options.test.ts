import { describe, expect, it } from 'vitest'
import { FORMAT_RULES, defaultVideoOptions, isValidVideoOptions, readVideoOptions, withFormat } from './options'

describe('video options', () => {
  it('start from sensible defaults for each format', () => {
    expect(defaultVideoOptions('mp4')).toMatchObject({ format: 'mp4', fps: 30, resolution: 'design', quality: 'balanced', fit: 'fit', audio: true, pageSeconds: null })
    expect(defaultVideoOptions('gif')).toMatchObject({ format: 'gif', fps: 15, resolution: 480, loops: 0 })
    for (const format of ['mp4', 'webm', 'gif'] as const) expect(isValidVideoOptions(defaultVideoOptions(format))).toBe(true)
  })

  it('keep a GIF at 15 frames a second or fewer by default and never offer more than 20', () => {
    expect(defaultVideoOptions('gif').fps).toBeLessThanOrEqual(15)
    expect(Math.max(...FORMAT_RULES.gif.fps)).toBeLessThanOrEqual(20)
  })

  it('move to values the new format offers when the format changes, and keep the shared ones', () => {
    const video = { ...defaultVideoOptions('mp4'), fps: 60, resolution: 1080 as const, quality: 'high' as const }
    const gif = withFormat(video, 'gif')
    expect(gif).toMatchObject({ format: 'gif', fps: 15, resolution: 480, quality: 'high' })
    expect(withFormat(video, 'webm')).toMatchObject({ format: 'webm', fps: 60, resolution: 1080 })
    expect(isValidVideoOptions(gif)).toBe(true)
  })

  it('are read from storage field by field: what is not allowed becomes the default', () => {
    const read = readVideoOptions({ format: 'webm', fps: 25, resolution: 720, quality: 'enormous', fit: 'fill', audio: 'yes', loops: -3, dither: false, pageSeconds: 7.4 })
    expect(read).toEqual({ format: 'webm', fps: 30, resolution: 720, quality: 'balanced', fit: 'fill', audio: true, loops: 0, dither: false, pageSeconds: 7 })
  })

  it('are the defaults when what was stored is not an object', () => {
    for (const bad of [null, undefined, 'mp4', 12, [], true]) expect(readVideoOptions(bad)).toEqual(defaultVideoOptions('mp4'))
    expect(readVideoOptions('x', 'gif')).toEqual(defaultVideoOptions('gif'))
  })

  it('limit a fixed page time to the 1 to 600 seconds a page can have', () => {
    expect(readVideoOptions({ pageSeconds: 0 }).pageSeconds).toBe(1)
    expect(readVideoOptions({ pageSeconds: 9999 }).pageSeconds).toBe(600)
    expect(readVideoOptions({ pageSeconds: Number.NaN }).pageSeconds).toBeNull()
    expect(readVideoOptions({ pageSeconds: '5' }).pageSeconds).toBeNull()
  })

  it('refuse a GIF frame rate or a loop count the format cannot hold', () => {
    expect(isValidVideoOptions({ ...defaultVideoOptions('gif'), fps: 60 })).toBe(false)
    expect(isValidVideoOptions({ ...defaultVideoOptions('gif'), loops: 70_000 })).toBe(false)
    expect(isValidVideoOptions({ ...defaultVideoOptions('mp4'), pageSeconds: 0 })).toBe(false)
  })

  it('takes blurred bars as a way to fit pages of another shape', () => {
    expect(readVideoOptions({ format: 'mp4', fit: 'blur' }).fit).toBe('blur')
    expect(isValidVideoOptions({ ...defaultVideoOptions('mp4'), fit: 'blur' })).toBe(true)
    expect(readVideoOptions({ format: 'mp4', fit: 'stretch' }).fit).toBe('fit')
  })
})
