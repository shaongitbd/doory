import { describe, expect, it } from 'vitest'
import type { PageRef } from './timeline'
import { clipSoundOf, compileTimeline, slotDurationsMs, timelineMoves } from './timeline'
import { allPages, anim, deck, doc, page, push, rect } from './testing'

describe('compileTimeline', () => {
  it('lays pages end to end: transition, build-up and the page time make a slot', () => {
    const timeline = compileTimeline(allPages(deck()), { pageSeconds: null })
    const [a, b, c] = timeline.segments
    // a: 1.5 s build-up + 4 s; no transition on the first page.
    expect(a).toMatchObject({ startMs: 0, transitionMs: 0, introMs: 1500, holdMs: 4000, bodyMs: 5500, durationMs: 5500, endMs: 5500, bodyStartMs: 0 })
    // b: push (800 ms) + no build-up + 3 s.
    expect(b).toMatchObject({ startMs: 5500, transitionMs: 800, introMs: 0, holdMs: 3000, durationMs: 3800, bodyStartMs: 6300, endMs: 9300 })
    expect(b.transition?.preset).toBe('push')
    // c: fade (500 ms) + the enter that ends at 700 ms + the default 5 s for a page without a time.
    expect(c).toMatchObject({ startMs: 9300, transitionMs: 500, introMs: 700, holdMs: 5000, durationMs: 6200, endMs: 15_500 })
    expect(timeline.totalMs).toBe(15_500)
  })

  it('has every segment start where the one before it ends', () => {
    const { segments } = compileTimeline(allPages(deck()), { pageSeconds: null })
    segments.forEach((s, i) => {
      if (i > 0) expect(s.startMs).toBe(segments[i - 1].endMs)
      expect(s.durationMs).toBe(s.transitionMs + s.bodyMs)
      expect(s.endMs - s.startMs).toBe(s.durationMs)
    })
  })

  it('gives the first page no transition even when it has one, and ignores a transition that does not play', () => {
    const document = doc([
      page('a', { transition: push }),
      page('b', { transition: { preset: 'none', durationMs: 900, easing: 'linear' } }),
      page('c', { transition: { preset: 'from-the-future', durationMs: 900, easing: 'linear' } }),
    ])
    const { segments } = compileTimeline(allPages(document), { pageSeconds: null })
    expect(segments.map((s) => s.transitionMs)).toEqual([0, 0, 0])
    expect(segments.map((s) => s.transition)).toEqual([null, null, null])
  })

  it('holds a static design for each page\'s time, five seconds when a page has none', () => {
    const document = doc([page('a', { durationSec: 2 }), page('b'), page('c', { durationSec: 10 })])
    const timeline = compileTimeline(allPages(document), { pageSeconds: null })
    expect(timeline.segments.map((s) => s.durationMs)).toEqual([2000, 5000, 10_000])
    expect(timeline.totalMs).toBe(17_000)
    expect(timelineMoves(timeline)).toBe(false)
  })

  it('uses one time for every page when the person fixes it', () => {
    const timeline = compileTimeline(allPages(deck()), { pageSeconds: 2 })
    expect(timeline.segments.map((s) => s.holdMs)).toEqual([2000, 2000, 2000])
    expect(timeline.totalMs).toBe(1500 + 2000 + 800 + 2000 + 500 + 700 + 2000)
  })

  it('compiles the pages in the order given, with the transition of the page that comes in, from the page chosen before it', () => {
    const document = deck()
    const refs: PageRef[] = [allPages(document)[2], allPages(document)[0]]
    const { segments } = compileTimeline(refs, { pageSeconds: null })
    expect(segments.map((s) => s.pageIndex)).toEqual([2, 0])
    expect(segments[0].transitionMs).toBe(0)
    expect(segments[1].transitionMs).toBe(0)
  })

  it('knows when a page stops changing, and that a loop never does', () => {
    const document = doc([
      page('still'),
      page('moves', { objects: [rect('x', { enter: anim('fade', { durationMs: 1200, delayMs: 300 }) })] }),
      page('loops', { objects: [rect('y', { emphasis: anim('pulse', { durationMs: 1000, loop: true }) })] }),
    ])
    const { segments } = compileTimeline(allPages(document), { pageSeconds: null })
    expect(segments.map((s) => s.settledMs)).toEqual([0, 1500, Number.POSITIVE_INFINITY])
  })

  it('reports whether anything moves', () => {
    expect(timelineMoves(compileTimeline(allPages(deck()), { pageSeconds: null }))).toBe(true)
    expect(timelineMoves(compileTimeline(allPages(doc([page('a'), page('b', { transition: push })])), { pageSeconds: null }))).toBe(true)
  })

  it('has no segments for no pages', () => {
    expect(compileTimeline([], { pageSeconds: null })).toEqual({ segments: [], totalMs: 0 })
  })
})

describe('slotDurationsMs', () => {
  it('lists the length of every page of the document for the audio mix, and 0 for a page that is not in the video', () => {
    const document = deck()
    const refs = allPages(document).filter((r) => r.index !== 1)
    const timeline = compileTimeline(refs, { pageSeconds: null })
    // Page c keeps its fade: it comes in after page a, the page chosen before it.
    expect(slotDurationsMs(3, timeline)).toEqual([5500, 0, 6200])
  })
})

describe('video clips on the timeline', () => {
  const clip = (id: string, over: Record<string, unknown> = {}) => ({ id, type: 'image', videoSrc: '/media/c.mp4', videoAudioSrc: '/media/a.m4a', videoDurationMs: 12_000, ...over })

  it('a page without a time of its own lasts as long as its clip, and moves until it ends', () => {
    const timeline = compileTimeline(allPages(doc([page('a', { objects: [clip('c', { videoTrimEndMs: 8000 })] })])), { pageSeconds: null })
    const [segment] = timeline.segments
    expect(segment.holdMs).toBe(8000)
    expect(segment.settledMs).toBe(8000)
    expect(timelineMoves(timeline)).toBe(true)
  })

  it('a looping clip never settles; a page time of its own wins', () => {
    const timeline = compileTimeline(allPages(doc([page('a', { durationSec: 3, objects: [clip('c', { videoLoop: true })] })])), { pageSeconds: null })
    expect(timeline.segments[0].holdMs).toBe(3000)
    expect(timeline.segments[0].settledMs).toBe(Number.POSITIVE_INFINITY)
  })

  it('starts a page’s clip sounds after the transition into it', () => {
    const timeline = compileTimeline(allPages(doc([page('a', { durationSec: 2 }), page('b', { transition: push, objects: [clip('c', { videoStartMs: 100 })] })])), { pageSeconds: null })
    const [sound] = clipSoundOf(timeline)
    expect(sound).toMatchObject({ id: 'video:c', scope: { type: 'page', pageId: 'b' }, startMs: 100 + push.durationMs })
  })
})
