/**
 * The animation model: what a document may say about motion, how strictly the editor reads it, and the timing
 * arithmetic that a page's animations imply. The server checks the same limits.
 *
 * Reading is forgiving, writing is strict. A document from another tool may hold anything under `animation` or
 * `transition`: `normalizeAnim` & co. limit every number to its range, drop what is not understood, and never throw;
 * a preset id the editor does not know is *kept* (so it survives a save) and simply plays as "none".
 */
import type { Anim, AnimDirection, AnimEasing, AnimTextUnit, DocObject, DocPage, DoryDocument, ObjectAnimation, PageTransition } from '@/types/document'
import { isEasing } from './easing'
import { pageClipTiming } from '../clips/model'

export type AnimSlot = 'enter' | 'exit' | 'emphasis'
export const SLOTS: readonly AnimSlot[] = ['enter', 'exit', 'emphasis']

export const DURATION_RANGE = { min: 100, max: 10_000 } as const
export const DELAY_RANGE = { min: 0, max: 60_000 } as const
export const TRANSITION_RANGE = { min: 200, max: 3000 } as const
/** The grain of the timeline: bars snap to this, and the editor writes whole multiples of it. */
export const TIME_STEP_MS = 100
export const PRESET_ID_PATTERN = /^[a-z0-9-]{1,40}$/

export const DIRECTIONS: readonly AnimDirection[] = ['left', 'right', 'up', 'down', 'in', 'out']
export const TEXT_UNITS: readonly AnimTextUnit[] = ['object', 'line', 'word', 'letter']

/** What an unreadable duration becomes. */
const FALLBACK_DURATION_MS = 600
const FALLBACK_TRANSITION_MS = 700

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function clampNumber(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function isPresetId(value: unknown): value is string {
  return typeof value === 'string' && PRESET_ID_PATTERN.test(value)
}

export function isDirection(value: unknown): value is AnimDirection {
  return typeof value === 'string' && (DIRECTIONS as readonly string[]).includes(value)
}

export function isTextUnit(value: unknown): value is AnimTextUnit {
  return typeof value === 'string' && (TEXT_UNITS as readonly string[]).includes(value)
}

/** Whole milliseconds inside `[min, max]`; `fallback` when `value` is not a finite number. */
function boundedMs(value: unknown, range: { min: number; max: number }, fallback: number): number {
  return isNumber(value) ? clampNumber(Math.round(value), range.min, range.max) : fallback
}

/**
 * One animation as the editor understands it: numbers limited to their ranges, unknown fields dropped. `null` when
 * `raw` has no usable preset id (the whole entry is then ignored, not repaired).
 */
export function normalizeAnim(raw: unknown): Anim | null {
  if (!isRecord(raw) || !isPresetId(raw.preset)) return null
  const anim: Anim = {
    preset: raw.preset,
    durationMs: boundedMs(raw.durationMs, DURATION_RANGE, FALLBACK_DURATION_MS),
    delayMs: boundedMs(raw.delayMs, DELAY_RANGE, 0),
    easing: isEasing(raw.easing) ? raw.easing : 'ease-out',
  }
  if (isDirection(raw.direction)) anim.direction = raw.direction
  if (isTextUnit(raw.by) && raw.by !== 'object') anim.by = raw.by
  if (raw.loop === true) anim.loop = true
  if (isNumber(raw.intensity)) anim.intensity = Math.round(clampNumber(raw.intensity, 0, 1) * 100) / 100
  return anim
}

/** The usable part of an object's `animation`, or `null` when there is none. */
export function normalizeObjectAnimation(raw: unknown): ObjectAnimation | null {
  if (!isRecord(raw)) return null
  const out: ObjectAnimation = {}
  for (const slot of SLOTS) {
    const anim = normalizeAnim(raw[slot])
    if (anim) out[slot] = anim
  }
  return out.enter || out.exit || out.emphasis ? out : null
}

export function normalizeTransition(raw: unknown): PageTransition | null {
  if (!isRecord(raw) || !isPresetId(raw.preset)) return null
  const transition: PageTransition = {
    preset: raw.preset,
    durationMs: boundedMs(raw.durationMs, TRANSITION_RANGE, FALLBACK_TRANSITION_MS),
    easing: isEasing(raw.easing) ? raw.easing : 'ease-in-out',
  }
  if (isDirection(raw.direction)) transition.direction = raw.direction
  return transition
}

const objectCache = new WeakMap<object, ObjectAnimation | null>()

/**
 * The normalised animation of a document object. Cached per `animation` value (documents are immutable, an edit
 * makes a new value), so the per-frame sampler does not re-validate sixty objects sixty times a second.
 */
export function animationOf(object: DocObject): ObjectAnimation | null {
  const raw = object.animation
  if (!isRecord(raw)) return null
  const cached = objectCache.get(raw)
  if (cached !== undefined) return cached
  const value = normalizeObjectAnimation(raw)
  objectCache.set(raw, value)
  return value
}

export function transitionOf(page: Pick<DocPage, 'transition'>): PageTransition | null {
  return normalizeTransition(page.transition)
}

/* ------------------------------------------------------------------------------------------------
 * Timing
 * ---------------------------------------------------------------------------------------------- */

export interface AnimSpan {
  objectId: string
  slot: AnimSlot
  anim: Anim
  startMs: number
  /** The end of one run. A looping emphasis repeats after it. */
  endMs: number
}

/** Every animation of the page as a span on the page clock (t = 0 is the moment the page has come in). */
export function pageSpans(page: Pick<DocPage, 'objects'>): AnimSpan[] {
  const spans: AnimSpan[] = []
  for (const object of page.objects) {
    const animation = animationOf(object)
    if (!animation) continue
    for (const slot of SLOTS) {
      const anim = animation[slot]
      if (anim) spans.push({ objectId: object.id, slot, anim, startMs: anim.delayMs, endMs: anim.delayMs + anim.durationMs })
    }
  }
  return spans
}

export interface PageTiming {
  spans: AnimSpan[]
  /** When the last enter animation has finished: the page has built up. 0 without enter animations. */
  introMs: number
  /** When the last animation that ends has finished (a looping emphasis never ends and is left out). */
  endMs: number
  /** Some emphasis (or a video clip) repeats for as long as the page is up. */
  loops: boolean
  /** Video clips on the page: they move the page too, until `endMs` (or for as long as it is up when one loops). */
  clips: number
}

export function pageTiming(page: Pick<DocPage, 'objects'>): PageTiming {
  const spans = pageSpans(page)
  let introMs = 0
  let endMs = 0
  let loops = false
  for (const span of spans) {
    if (span.anim.loop === true && span.slot === 'emphasis') {
      loops = true
      continue
    }
    if (span.slot === 'enter') introMs = Math.max(introMs, span.endMs)
    endMs = Math.max(endMs, span.endMs)
  }
  const clips = pageClipTiming(page)
  return { spans, introMs, endMs: Math.max(endMs, clips.endMs), loops: loops || clips.loops, clips: clips.count }
}

/** True when anything on the page moves: an object animation of any kind. */
export function pageHasAnimation(page: Pick<DocPage, 'objects'>): boolean {
  return page.objects.some((o) => animationOf(o) !== null)
}

/** True when the page needs more than a still picture: object animations, or a transition into it. */
export function pageHasMotion(page: Pick<DocPage, 'objects' | 'transition'>): boolean {
  return pageHasAnimation(page) || transitionOf(page) !== null
}

export function documentHasMotion(doc: Pick<DoryDocument, 'pages'>): boolean {
  return doc.pages.some(pageHasMotion)
}

/** The side a direction points away from. Going back through a deck plays each transition the other way round. */
export function reverseDirection(direction: AnimDirection | undefined): AnimDirection | undefined {
  switch (direction) {
    case 'left':
      return 'right'
    case 'right':
      return 'left'
    case 'up':
      return 'down'
    case 'down':
      return 'up'
    case 'in':
      return 'out'
    case 'out':
      return 'in'
    default:
      return undefined
  }
}

export type { Anim, AnimDirection, AnimEasing, AnimTextUnit, ObjectAnimation, PageTransition }
