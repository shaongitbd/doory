/**
 * The arithmetic of the timeline: time to pixels and back, the ruler, snapping, what a drag does to a bar, how the
 * lanes are ordered and when a page's animations run past its time. Pure, so it is tested without a DOM.
 */
import type { DocObject, DocPage } from '@/types/document'
import { pageDuration, pageSeconds } from '../presenter/timing'
import { type AnimSlot, DELAY_RANGE, DURATION_RANGE, type AnimSpan, TIME_STEP_MS, clampNumber, pageTiming } from './model'

/** Widest view of the time axis: 16 times the fitted scale. */
export const MAX_ZOOM = 16
/** Width of the column with the layer names, px. */
export const LABEL_WIDTH = 148
/** A bar is always at least this wide (px) so that a short animation can still be grabbed. */
export const MIN_BAR_PX = 8
/** Snapping reaches this far (px) to a bar's edge, the playhead or the page's end. */
export const SNAP_PX = 8

/** The time the timeline spans at least, ms: a page without animations still shows a ruler. */
export const MIN_SPAN_MS = 2000
/** Empty space after the last bar, ms, so that a bar can be dragged later. */
export const TAIL_MS = 1500

export function timeToX(ms: number, pxPerMs: number): number {
  return ms * pxPerMs
}

export function xToTime(x: number, pxPerMs: number): number {
  return pxPerMs > 0 ? x / pxPerMs : 0
}

/** Pixels per ms at which `lengthMs` (plus the tail) fills `trackWidth`. */
export function fitScale(trackWidth: number, lengthMs: number): number {
  const span = Math.max(MIN_SPAN_MS, lengthMs + TAIL_MS)
  return Math.max(0.005, trackWidth / span)
}

export function roundToStep(ms: number, step = TIME_STEP_MS): number {
  return Math.round(ms / step) * step
}

const TICK_STEPS = [100, 200, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000]

/** The ruler's tick spacing (ms) that keeps ticks at least `minGapPx` apart. */
export function tickStep(pxPerMs: number, minGapPx = 56): number {
  for (const step of TICK_STEPS) if (step * pxPerMs >= minGapPx) return step
  return TICK_STEPS[TICK_STEPS.length - 1]
}

export interface Tick {
  ms: number
  /** A whole-second tick that carries a label. */
  major: boolean
}

export function rulerTicks(endMs: number, step: number): Tick[] {
  const ticks: Tick[] = []
  const labelEvery = step >= 1000 ? 1 : Math.round(1000 / step)
  for (let i = 0; i * step <= endMs; i++) ticks.push({ ms: i * step, major: i % labelEvery === 0 })
  return ticks
}

/** `0:03`, `1:25`; with a tenth of a second when `precise`: `0:03.2`. */
export function formatTime(ms: number, precise = false): string {
  const safe = Math.max(0, Number.isFinite(ms) ? ms : 0)
  const total = precise ? Math.round(safe / 100) : Math.round(safe / 1000)
  const unit = precise ? 10 : 1
  const seconds = Math.floor(total / unit)
  const tenth = total % unit
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return precise ? `${m}:${s}.${tenth}` : `${m}:${s}`
}

/** `0.6 s`, `12 s`: a length for a label. */
export function formatSeconds(ms: number): string {
  const s = Math.round(ms / 100) / 10
  return `${Number.isInteger(s) ? s : s.toFixed(1)} s`
}

/**
 * `ms` moved to the nearest of `targets` when one is within `thresholdMs`, otherwise to the grid. Targets win over the
 * grid so that a bar can sit exactly where another one ends even when that is not a multiple of 100 ms.
 */
export function snapTime(ms: number, targets: readonly number[], thresholdMs: number, step = TIME_STEP_MS): number {
  let best: number | null = null
  let bestDistance = thresholdMs
  for (const target of targets) {
    const d = Math.abs(target - ms)
    if (d <= bestDistance) {
      best = target
      bestDistance = d
    }
  }
  return best ?? roundToStep(ms, step)
}

export type BarDrag = 'move' | 'start' | 'end'

export interface BarTimes {
  delayMs: number
  durationMs: number
}

/**
 * The times a bar gets when one of its parts is dragged to `ms` (the time under the pointer, less the offset the user
 * grabbed it at). `move` keeps the duration, `start` keeps the end, `end` keeps the start; delay and duration stay in
 * the document's ranges and snap to `targets` or the 100 ms grid.
 */
export function dragBar(kind: BarDrag, from: BarTimes, ms: number, targets: readonly number[], thresholdMs: number): BarTimes {
  const end = from.delayMs + from.durationMs
  if (kind === 'move') {
    // Either edge of the bar may snap; the nearer one wins.
    const startSnap = snapTime(ms, targets, thresholdMs)
    const endSnap = snapTime(ms + from.durationMs, targets, thresholdMs) - from.durationMs
    const delay = Math.abs(startSnap - ms) <= Math.abs(endSnap - ms) ? startSnap : endSnap
    return { delayMs: clampNumber(delay, DELAY_RANGE.min, DELAY_RANGE.max), durationMs: from.durationMs }
  }
  if (kind === 'start') {
    const start = clampNumber(snapTime(ms, targets, thresholdMs), Math.max(DELAY_RANGE.min, end - DURATION_RANGE.max), Math.min(DELAY_RANGE.max, end - DURATION_RANGE.min))
    return { delayMs: start, durationMs: end - start }
  }
  const finish = snapTime(ms, targets, thresholdMs)
  return { delayMs: from.delayMs, durationMs: clampNumber(finish - from.delayMs, DURATION_RANGE.min, DURATION_RANGE.max) }
}

/** Times that a dragged bar snaps to: the edges of every other bar, the playhead, the start and the end of the page. */
export function snapTargets(spans: readonly AnimSpan[], dragged: { objectId: string; slot: AnimSlot }, extra: readonly (number | null)[]): number[] {
  const targets: number[] = [0]
  for (const span of spans) {
    if (span.objectId === dragged.objectId && span.slot === dragged.slot) continue
    targets.push(span.startMs, span.endMs)
  }
  for (const t of extra) if (t !== null) targets.push(t)
  return targets
}

/* ------------------------------------------------------------------------------------------------
 * Lanes and the page's time
 * ---------------------------------------------------------------------------------------------- */

export interface Lane {
  object: DocObject
  /** Position in the page's stack, 0 = bottom. */
  z: number
  spans: AnimSpan[]
  start: number
}

/** One lane per animated object: the one that starts first on top, objects that start together highest in the stack first. */
export function lanesOf(page: Pick<DocPage, 'objects'>): Lane[] {
  const spans = pageTiming(page).spans
  const byObject = new Map<string, AnimSpan[]>()
  for (const span of spans) byObject.set(span.objectId, [...(byObject.get(span.objectId) ?? []), span])
  const lanes: Lane[] = []
  page.objects.forEach((object, z) => {
    const own = byObject.get(object.id)
    if (own) lanes.push({ object, z, spans: own, start: Math.min(...own.map((s) => s.startMs)) })
  })
  return lanes.sort((a, b) => a.start - b.start || b.z - a.z)
}

/** How long a page stays up under auto-advance: the time it takes to build up plus its time (the default when it has none). */
export function pageHoldEndMs(page: Pick<DocPage, 'objects' | 'durationSec'>): number {
  return pageTiming(page).introMs + pageSeconds(page) * 1000
}

/** Where the page ends on the timeline, or `null` when the page has no time of its own. */
export function pageMarkerMs(page: Pick<DocPage, 'objects' | 'durationSec'>): number | null {
  return pageDuration(page) === null ? null : pageHoldEndMs(page)
}

export interface Overrun {
  /** How much later than the page the last animation ends, ms. */
  overMs: number
  spans: AnimSpan[]
}

/** The animations that end after the page does (looping emphasis runs for as long as the page does and never counts). */
export function overrunOf(page: Pick<DocPage, 'objects' | 'durationSec'>): Overrun | null {
  const marker = pageMarkerMs(page)
  if (marker === null) return null
  const late = pageTiming(page).spans.filter((s) => !(s.slot === 'emphasis' && s.anim.loop === true) && s.endMs > marker)
  if (late.length === 0) return null
  return { overMs: Math.max(...late.map((s) => s.endMs)) - marker, spans: late }
}

/** The page time (seconds) that would make everything fit: the animations' end less the build-up time, rounded up. */
export function fittingDurationSec(page: Pick<DocPage, 'objects' | 'durationSec'>): number {
  const timing = pageTiming(page)
  return Math.max(1, Math.ceil((timing.endMs - timing.introMs) / 1000))
}

/**
 * How long a preview runs: until the last animation has ended and the page time (if it has one) is over; a page with
 * only looping emphasis shows a few cycles.
 */
export function previewLengthMs(page: Pick<DocPage, 'objects' | 'durationSec'>): number {
  const timing = pageTiming(page)
  const marker = pageMarkerMs(page) ?? 0
  const loops = timing.loops ? Math.max(0, ...timing.spans.filter((s) => s.anim.loop === true).map((s) => s.endMs)) + 1500 : 0
  // A page with clips plays for as long as it is up (a looping clip has no end of its own).
  const clips = timing.clips > 0 ? pageHoldEndMs(page) : 0
  return Math.max(timing.endMs, marker, loops, clips, 500)
}

/** The most pixels the preview bitmaps hold: a page at a high zoom is drawn smaller and scaled by the browser. */
const MAX_PREVIEW_PIXELS = 12_000_000

/** Output pixels per page pixel for the preview: the zoom at the device's pixel ratio, limited to a sensible bitmap size. */
export function previewMultiplier(zoom: number, dpr: number, size: { width: number; height: number }): number {
  const wanted = Math.max(0.05, zoom * Math.max(1, dpr))
  return Math.min(wanted, Math.sqrt(MAX_PREVIEW_PIXELS / Math.max(1, size.width * size.height)))
}
