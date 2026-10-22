import { describe, expect, it } from 'vitest'
import type { DocObject, DocPage } from '@/types/document'
import {
  animationOf,
  documentHasMotion,
  normalizeAnim,
  normalizeObjectAnimation,
  normalizeTransition,
  pageHasAnimation,
  pageHasMotion,
  pageTiming,
  reverseDirection,
} from './model'

const obj = (id: string, animation?: unknown): DocObject => ({ id, type: 'rect', left: 0, top: 0, width: 10, height: 10, ...(animation === undefined ? {} : { animation }) })
const page = (objects: DocObject[], extra: Partial<DocPage> = {}): DocPage => ({ id: 'p', background: { type: 'solid', color: '#ffffff' }, objects, ...extra })

describe('normalizeAnim', () => {
  it('keeps a valid animation as it is', () => {
    const anim = { preset: 'rise', durationMs: 700, delayMs: 200, easing: 'ease-out', direction: 'up', by: 'word', loop: true, intensity: 0.8 }
    expect(normalizeAnim(anim)).toEqual(anim)
  })

  it('limits durations, delays and intensity to their ranges and rounds to whole milliseconds', () => {
    expect(normalizeAnim({ preset: 'fade', durationMs: 5, delayMs: -4, easing: 'linear' })).toMatchObject({ durationMs: 100, delayMs: 0 })
    expect(normalizeAnim({ preset: 'fade', durationMs: 99999, delayMs: 99999, easing: 'linear' })).toMatchObject({ durationMs: 10000, delayMs: 60000 })
    expect(normalizeAnim({ preset: 'fade', durationMs: 333.6, delayMs: 10.4, easing: 'linear', intensity: 4 })).toMatchObject({ durationMs: 334, delayMs: 10, intensity: 1 })
  })

  it('replaces what is not a number or a known name by defaults and drops the rest', () => {
    const anim = normalizeAnim({ preset: 'fade', durationMs: 'long', delayMs: Number.NaN, easing: 'wobble', direction: 'sideways', by: 'paragraph', loop: 'yes', extra: 1 })
    expect(anim).toEqual({ preset: 'fade', durationMs: 600, delayMs: 0, easing: 'ease-out' })
  })

  it('does not step by "object" (that is the absence of a unit)', () => {
    expect(normalizeAnim({ preset: 'fade', durationMs: 500, delayMs: 0, easing: 'linear', by: 'object' })).not.toHaveProperty('by')
  })

  it.each([null, undefined, 3, 'fade', [], {}, { preset: 4 }, { preset: '' }, { preset: 'Has Space' }, { preset: 'UPPER' }, { preset: 'x'.repeat(41) }])('ignores %j', (raw) => {
    expect(normalizeAnim(raw)).toBeNull()
  })

  it('keeps a preset the editor does not know', () => {
    expect(normalizeAnim({ preset: 'from-the-future', durationMs: 500, delayMs: 0, easing: 'linear' })?.preset).toBe('from-the-future')
  })
})

describe('normalizeObjectAnimation and animationOf', () => {
  it('reads the three slots and nothing else', () => {
    const raw = { enter: { preset: 'fade', durationMs: 500, delayMs: 0, easing: 'linear' }, exit: 'nope', emphasis: { preset: 'pulse', durationMs: 800, delayMs: 1000, easing: 'ease-in-out', loop: true }, other: 1 }
    const out = normalizeObjectAnimation(raw)
    expect(Object.keys(out ?? {})).toEqual(['enter', 'emphasis'])
  })

  it('is null without a usable slot', () => {
    expect(normalizeObjectAnimation({})).toBeNull()
    expect(normalizeObjectAnimation({ enter: {} })).toBeNull()
    expect(normalizeObjectAnimation([])).toBeNull()
    expect(animationOf(obj('a'))).toBeNull()
  })

  it('is computed once per animation value', () => {
    const o = obj('a', { enter: { preset: 'fade', durationMs: 500, delayMs: 0, easing: 'linear' } })
    expect(animationOf(o)).toBe(animationOf(o))
  })
})

describe('normalizeTransition', () => {
  it('limits the duration to 200..3000 ms', () => {
    expect(normalizeTransition({ preset: 'fade', durationMs: 50, easing: 'linear' })?.durationMs).toBe(200)
    expect(normalizeTransition({ preset: 'fade', durationMs: 90000, easing: 'linear' })?.durationMs).toBe(3000)
    expect(normalizeTransition({ preset: 'fade', durationMs: 'x', easing: 'bad' })).toEqual({ preset: 'fade', durationMs: 700, easing: 'ease-in-out' })
  })

  it('keeps a direction it knows and ignores anything else', () => {
    expect(normalizeTransition({ preset: 'push', durationMs: 700, easing: 'linear', direction: 'left' })?.direction).toBe('left')
    expect(normalizeTransition({ preset: 'push', durationMs: 700, easing: 'linear', direction: 'back' })).not.toHaveProperty('direction')
    expect(normalizeTransition(null)).toBeNull()
    expect(normalizeTransition({ durationMs: 700 })).toBeNull()
  })
})

describe('page timing', () => {
  const enter = (delayMs: number, durationMs: number) => ({ enter: { preset: 'fade', durationMs, delayMs, easing: 'linear' } })

  it('finds when the page has built up and when its last animation ends', () => {
    const timing = pageTiming(
      page([
        obj('a', enter(0, 600)),
        obj('b', { ...enter(300, 900), exit: { preset: 'fade', durationMs: 500, delayMs: 4000, easing: 'ease-in' } }),
        obj('c'),
      ]),
    )
    expect(timing.spans).toHaveLength(3)
    expect(timing.introMs).toBe(1200)
    expect(timing.endMs).toBe(4500)
    expect(timing.loops).toBe(false)
  })

  it('leaves a looping emphasis out of the end and reports it', () => {
    const timing = pageTiming(page([obj('a', { ...enter(0, 500), emphasis: { preset: 'float', durationMs: 2400, delayMs: 500, easing: 'linear', loop: true } })]))
    expect(timing.endMs).toBe(500)
    expect(timing.loops).toBe(true)
    const once = pageTiming(page([obj('a', { emphasis: { preset: 'pulse', durationMs: 800, delayMs: 500, easing: 'linear' } })]))
    expect(once.endMs).toBe(1300)
    expect(once.introMs).toBe(0)
  })

  it('is empty for a page without animation', () => {
    expect(pageTiming(page([obj('a')]))).toEqual({ spans: [], introMs: 0, endMs: 0, loops: false, clips: 0 })
  })

  it('lasts until its video clips have played, and loops with a looping clip', () => {
    const clip = (id: string, extra: Record<string, unknown>) => ({ ...obj(id), type: 'image', videoSrc: '/media/c.mp4', videoDurationMs: 8000, ...extra })
    expect(pageTiming(page([clip('a', { videoStartMs: 1000, videoTrimEndMs: 5000 })]))).toMatchObject({ endMs: 6000, loops: false, clips: 1 })
    expect(pageTiming(page([clip('a', { videoSpeed: 2 })]))).toMatchObject({ endMs: 4000 })
    expect(pageTiming(page([clip('a', { videoLoop: true })]))).toMatchObject({ endMs: 0, loops: true, clips: 1 })
  })
})

describe('motion of pages and documents', () => {
  it('knows when something moves', () => {
    const still = page([obj('a')])
    const animated = page([obj('a', { enter: { preset: 'fade', durationMs: 500, delayMs: 0, easing: 'linear' } })])
    const moved = page([], { transition: { preset: 'fade', durationMs: 700, easing: 'linear' } })
    expect(pageHasAnimation(still)).toBe(false)
    expect(pageHasAnimation(animated)).toBe(true)
    expect(pageHasMotion(moved)).toBe(true)
    expect(pageHasMotion(still)).toBe(false)
    expect(documentHasMotion({ pages: [still, still] })).toBe(false)
    expect(documentHasMotion({ pages: [still, animated] })).toBe(true)
  })

  it('reverses a direction', () => {
    expect(reverseDirection('left')).toBe('right')
    expect(reverseDirection('up')).toBe('down')
    expect(reverseDirection('in')).toBe('out')
    expect(reverseDirection(undefined)).toBeUndefined()
  })
})
