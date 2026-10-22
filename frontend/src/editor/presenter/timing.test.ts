import { describe, expect, it } from 'vitest'
import type { DocObject } from '@/types/document'
import { clampDuration, DEFAULT_DURATION_SEC, formatClock, formatDuration, hasTimings, pageDuration, pageSeconds, resolveDurations } from './timing'

const clip = (over: Record<string, unknown>): DocObject => ({ id: 'v', type: 'image', left: 0, top: 0, width: 10, height: 10, src: '/p.png', videoSrc: '/v.mp4', videoDurationMs: 60_000, videoTrimStartMs: 0, videoTrimEndMs: 60_000, ...over })
const untimed = (objects: DocObject[] = []) => ({ objects })

describe('clampDuration', () => {
  it('rounds and limits to 1-600', () => {
    expect(clampDuration(5)).toBe(5)
    expect(clampDuration(0.2)).toBe(1)
    expect(clampDuration(2.5)).toBe(3)
    expect(clampDuration(601)).toBe(600)
    expect(clampDuration(-3)).toBe(1)
  })

  it('refuses everything that is not a finite number', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '5', null, undefined, {}, true]) expect(clampDuration(bad)).toBeNull()
  })
})

describe('pageDuration and resolveDurations', () => {
  it('only accepts a usable number in range', () => {
    expect(pageDuration({ durationSec: 8 })).toBe(8)
    expect(pageDuration({})).toBeNull()
    expect(pageDuration({ durationSec: 0 })).toBeNull()
    expect(pageDuration({ durationSec: 601 })).toBeNull()
    expect(pageDuration({ durationSec: Number.NaN })).toBeNull()
    expect(pageDuration({ durationSec: '4' as unknown as number })).toBeNull()
  })

  it('uses the default for every page of a design without any time', () => {
    expect(hasTimings([{}, {}])).toBe(false)
    expect(resolveDurations([untimed(), untimed(), untimed()])).toEqual([DEFAULT_DURATION_SEC, DEFAULT_DURATION_SEC, DEFAULT_DURATION_SEC])
    expect(resolveDurations([untimed(), untimed()], 12)).toEqual([12, 12])
  })

  it('stretches the default to the video clips of a design without any time, as the timeline does', () => {
    const pages = [untimed([clip({ videoTrimEndMs: 12_400 })]), untimed([clip({ videoStartMs: 1000, videoTrimEndMs: 2000 })]), untimed([clip({ videoLoop: true })])]
    expect(resolveDurations(pages)).toEqual([13, DEFAULT_DURATION_SEC, DEFAULT_DURATION_SEC])
    expect(resolveDurations(pages)).toEqual(pages.map((p) => pageSeconds(p)))
    expect(resolveDurations(pages, 20)).toEqual([20, 20, 20])
  })

  it('follows the pages of a timed design: a page without a time waits', () => {
    expect(hasTimings([{}, { durationSec: 3 }])).toBe(true)
    expect(resolveDurations([{ durationSec: 2, objects: [] }, untimed([clip({})]), { durationSec: 30, objects: [] }])).toEqual([2, null, 30])
  })

  it('treats an unusable time as no time', () => {
    expect(resolveDurations([{ durationSec: 0, objects: [] }, { durationSec: 9, objects: [] }])).toEqual([null, 9])
    expect(resolveDurations([{ durationSec: 0, objects: [] }])).toEqual([DEFAULT_DURATION_SEC])
  })
})

describe('formatting', () => {
  it('formats page times', () => {
    expect(formatDuration(5)).toBe('5 s')
    expect(formatDuration(59)).toBe('59 s')
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(90)).toBe('1:30')
    expect(formatDuration(600)).toBe('10:00')
  })

  it('formats clock readings', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(7_400)).toBe('0:07')
    expect(formatClock(725_000)).toBe('12:05')
    expect(formatClock(3_723_000)).toBe('1:02:03')
    expect(formatClock(-5)).toBe('0:00')
  })
})
