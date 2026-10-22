import { describe, expect, it } from 'vitest'
import { readClip } from './model'
import { barEndMs, moveClip, trimClipEnd, trimClipStart } from './timeline'

const clip = (extra: Record<string, unknown> = {}) => readClip({ type: 'image', videoSrc: '/media/c.mp4', videoDurationMs: 10_000, videoStartMs: 1000, videoTrimStartMs: 2000, videoTrimEndMs: 6000, ...extra })!

describe('dragging a clip bar', () => {
  it('moves the clip, never before the page starts', () => {
    expect(moveClip(clip(), 500)).toEqual({ startMs: 1500 })
    expect(moveClip(clip(), -5000)).toEqual({ startMs: 0 })
  })

  it('trims the start and keeps the rest where it was', () => {
    expect(trimClipStart(clip(), 500)).toEqual({ startMs: 1500, trimStartMs: 2500 })
    // Dragging left gives back what was cut, until the page's start or the clip's own start.
    expect(trimClipStart(clip(), -5000)).toEqual({ startMs: 0, trimStartMs: 1000 })
    expect(trimClipStart(clip(), 9000)).toEqual({ startMs: 4900, trimStartMs: 5900 })
  })

  it('trims the end within the clip', () => {
    expect(trimClipEnd(clip(), 1000)).toEqual({ trimEndMs: 7000 })
    expect(trimClipEnd(clip(), 9000)).toEqual({ trimEndMs: 10_000 })
    expect(trimClipEnd(clip(), -9000)).toEqual({ trimEndMs: 2100 })
  })

  it('counts the bar in page time at the clip speed', () => {
    const fast = clip({ videoSpeed: 2 })
    expect(trimClipEnd(fast, 500)).toEqual({ trimEndMs: 7000 })
    expect(trimClipStart(fast, 500)).toEqual({ startMs: 1500, trimStartMs: 3000 })
    expect(barEndMs(fast, 9000)).toBe(3000)
    expect(barEndMs(clip({ videoLoop: true }), 9000)).toBe(9000)
  })
})
