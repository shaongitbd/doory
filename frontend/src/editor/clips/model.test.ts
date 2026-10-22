import { describe, expect, it } from 'vitest'
import type { AssetRef } from '@/types/adapter'
import { clipEndMs, clipLengthMs, clipPropsFromAsset, clipShownAt, clipTimeAt, isClip, pageClipTiming, readClip } from './model'

const clipObject = (extra: Record<string, unknown> = {}) => ({ id: 'c', type: 'image', src: '/media/p.webp', videoSrc: '/media/c.mp4', videoDurationMs: 10_000, ...extra })

describe('reading a clip', () => {
  it('knows a clip from a picture', () => {
    expect(isClip(clipObject())).toBe(true)
    expect(isClip({ type: 'image', src: '/media/p.webp' })).toBe(false)
    expect(isClip({ type: 'rect', videoSrc: '/media/c.mp4' })).toBe(false)
    expect(isClip({ type: 'Image', videoSrc: '/media/c.mp4' })).toBe(true) // a live Fabric object says `Image`
  })

  it('fills in defaults', () => {
    expect(readClip(clipObject())).toMatchObject({ startMs: 0, trimStartMs: 0, trimEndMs: 10_000, loop: false, muted: false, volume: 1, speed: 1, audioSrc: '', filmstrip: null })
  })

  it('clamps what is out of range and swaps a reversed trim', () => {
    const clip = readClip(clipObject({ videoTrimStartMs: 9000, videoTrimEndMs: 2000, videoVolume: 3, videoSpeed: 100, videoStartMs: -5 }))
    expect(clip).toMatchObject({ trimStartMs: 2000, trimEndMs: 9000, volume: 1, speed: 4, startMs: 0 })
  })

  it('keeps at least the shortest trim', () => {
    expect(readClip(clipObject({ videoTrimStartMs: 5000, videoTrimEndMs: 5010 }))).toMatchObject({ trimStartMs: 5000, trimEndMs: 5100 })
    expect(readClip(clipObject({ videoTrimStartMs: 10_000, videoTrimEndMs: 10_000 }))).toMatchObject({ trimStartMs: 9900, trimEndMs: 10_000 })
  })

  it('refuses sources a browser must not load', () => {
    for (const videoSrc of ['blob:x', 'data:video/mp4;base64,AA', 'javascript:x', '//evil.example/c.mp4']) expect(readClip(clipObject({ videoSrc }))).toBeNull()
    expect(readClip(clipObject({ videoAudioSrc: 'blob:x' }))?.audioSrc).toBe('')
  })
})

describe('clip time', () => {
  const clip = readClip(clipObject({ videoStartMs: 1000, videoTrimStartMs: 2000, videoTrimEndMs: 6000 }))!

  it('shows the first kept frame before it starts and the last after it ends', () => {
    expect(clipTimeAt(clip, 0)).toBe(2000)
    expect(clipTimeAt(clip, 1500)).toBe(2500)
    expect(clipTimeAt(clip, 4999)).toBe(5999)
    expect(clipTimeAt(clip, 60_000)).toBe(6000)
    expect(clipEndMs(clip)).toBe(5000)
  })

  it('wraps a looping clip and plays at its speed', () => {
    const looping = { ...clip, loop: true }
    expect(clipTimeAt(looping, 5500)).toBe(2500)
    expect(clipEndMs(looping)).toBe(Infinity)
    const fast = { ...clip, speed: 2 }
    expect(clipLengthMs(fast)).toBe(2000)
    expect(clipTimeAt(fast, 1500)).toBe(3000)
  })
})

describe('when a clip shows', () => {
  it('always, unless it is a split part that stands aside outside its own time', () => {
    const clip = readClip(clipObject({ videoStartMs: 1000, videoTrimEndMs: 3000 }))!
    expect([0, 2000, 9000].map((t) => clipShownAt(clip, t))).toEqual([true, true, true])
    const later = { ...clip, hideBefore: true }
    expect([0, 999, 1000, 9000].map((t) => clipShownAt(later, t))).toEqual([false, false, true, true])
    const earlier = { ...clip, hideAfter: true }
    expect([0, 3999, 4000].map((t) => clipShownAt(earlier, t))).toEqual([true, true, false])
  })
})

describe('page timing', () => {
  it('ends with the last clip that ends; a looping one makes it loop', () => {
    const objects = [clipObject({ id: 'a', videoTrimEndMs: 3000 }), clipObject({ id: 'b', videoStartMs: 2000, videoTrimEndMs: 4000 }), { id: 'r', type: 'rect' }]
    expect(pageClipTiming({ objects })).toEqual({ endMs: 6000, loops: false, count: 2 })
    expect(pageClipTiming({ objects: [clipObject({ videoLoop: true })] })).toEqual({ endMs: 0, loops: true, count: 1 })
  })
})

describe('a clip from an asset', () => {
  it('carries the clip, its sound and its filmstrip', () => {
    const ref: AssetRef = {
      id: 'a1',
      url: '/media/c.mp4',
      thumbUrl: '/media/t.webp',
      width: 1920,
      height: 1080,
      name: 'Beach',
      kind: 'video',
      video: { status: 'ready', error: '', posterUrl: '/media/p.webp', audioUrl: '/media/a.m4a', durationMs: 12_345, fps: 30, filmstrip: { url: '/media/s.webp', frames: 25, interval_ms: 500, tile_width: 160, tile_height: 90 } },
    }
    expect(clipPropsFromAsset(ref)).toEqual({
      videoSrc: '/media/c.mp4',
      videoAudioSrc: '/media/a.m4a',
      videoDurationMs: 12_345,
      videoStartMs: 0,
      videoTrimStartMs: 0,
      videoTrimEndMs: 12_345,
      videoLoop: false,
      videoMuted: false,
      videoVolume: 1,
      videoSpeed: 1,
      videoFadeInMs: 0,
      videoFadeOutMs: 0,
      videoFilmstrip: { url: '/media/s.webp', frames: 25, intervalMs: 500, tileWidth: 160, tileHeight: 90 },
    })
  })
})
