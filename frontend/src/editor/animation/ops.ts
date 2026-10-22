/**
 * Pure edits of an object's `animation` and of a page's `transition`. The engine's `AnimationApi` and `PagesApi`
 * apply them to the live objects and the document; the panel and the timeline only call those. Every function returns
 * a new value (or the argument itself when nothing changes) and writes only what the document format allows: numbers
 * inside their ranges, directions the preset offers, and no empty `animation`.
 */
import type { Anim, AnimDirection, AnimEasing, DoryDocument, DocPage, ObjectAnimation, PageTransition } from '@/types/document'
import { pageSeconds } from '../presenter/timing'
import { type AnimSlot, DELAY_RANGE, DURATION_RANGE, TRANSITION_RANGE, clampNumber, isDirection, normalizeAnim, normalizeObjectAnimation, pageTiming } from './model'
import { type InOutPreset, type EmphasisPreset, emphasisPresets, inOutPresets, transitionPresets } from './presets'

export function presetFor(slot: AnimSlot, id: string): InOutPreset | EmphasisPreset | undefined {
  return slot === 'emphasis' ? emphasisPresets.get(id) : inOutPresets.get(id)
}

/** Directions the preset offers (none for a preset without direction or one that is not registered). */
export function directionsOf(slot: AnimSlot, id: string): readonly AnimDirection[] {
  if (slot === 'emphasis') return []
  return inOutPresets.get(id)?.directions ?? []
}

/** True when the preset can step through the lines, words and letters of text. */
export function supportsTextUnits(slot: AnimSlot, id: string): boolean {
  return slot !== 'emphasis' && inOutPresets.get(id)?.textUnits === true
}

/** An exit starts slowly and ends fast, the mirror of an enter's arrival. */
function exitEasing(easing: AnimEasing): AnimEasing {
  return easing === 'linear' ? 'linear' : 'ease-in'
}

/** When the page is done with its animations: the page has built up and its time has run. */
export function pageEndMs(page: Pick<DocPage, 'objects' | 'durationSec'>): number {
  return pageTiming(page).introMs + pageSeconds(page) * 1000
}

/**
 * Where a new animation starts when the user has not placed it: an enter at the start of the page, an emphasis when
 * the object has come in, an exit so that it ends together with the page.
 */
export function defaultDelay(slot: AnimSlot, current: ObjectAnimation | undefined, durationMs: number, page: Pick<DocPage, 'objects' | 'durationSec'>): number {
  const enterEnd = current?.enter ? current.enter.delayMs + current.enter.durationMs : 0
  if (slot === 'enter') return 0
  if (slot === 'emphasis') return clampNumber(enterEnd, DELAY_RANGE.min, DELAY_RANGE.max)
  return clampNumber(Math.max(enterEnd, pageEndMs(page) - durationMs), DELAY_RANGE.min, DELAY_RANGE.max)
}

/**
 * `current` with `presetId` in `slot`. The preset's own duration, easing and direction apply; what the user placed
 * (delay), how strong they made it (intensity) and what they chose for text (by, loop) stays when it still fits.
 * `null` when the preset is not registered.
 */
export function withPreset(current: ObjectAnimation | undefined, slot: AnimSlot, presetId: string, page: Pick<DocPage, 'objects' | 'durationSec'>): ObjectAnimation | null {
  const preset = presetFor(slot, presetId)
  if (!preset) return null
  const previous = current?.[slot]
  const durationMs = clampNumber(preset.defaults.durationMs, DURATION_RANGE.min, DURATION_RANGE.max)
  const anim: Anim = {
    preset: presetId,
    durationMs,
    delayMs: previous ? previous.delayMs : defaultDelay(slot, current, durationMs, page),
    easing: slot === 'exit' ? exitEasing(preset.defaults.easing) : preset.defaults.easing,
  }
  const directions = directionsOf(slot, presetId)
  if (directions.length > 0) {
    const kept = previous?.direction && directions.includes(previous.direction) ? previous.direction : undefined
    anim.direction = kept ?? preset.defaults.direction ?? directions[0]
  }
  if (supportsTextUnits(slot, presetId) && previous?.by) anim.by = previous.by
  if (slot === 'emphasis') {
    const loop = previous ? previous.loop : preset.defaults.loop
    if (loop === true) anim.loop = true
  }
  const intensity = previous?.intensity ?? preset.defaults.intensity
  if (intensity !== undefined) anim.intensity = intensity
  return { ...current, [slot]: anim }
}

/**
 * `current` with `patch` applied to `slot`, every value limited the way the document format asks (a patch value of
 * `undefined` removes the setting). Nothing changes when the slot is empty. A direction the preset does not offer, a
 * unit for a preset without text units and a loop outside emphasis are dropped.
 */
export function withPatch(current: ObjectAnimation | undefined, slot: AnimSlot, patch: Partial<Anim>): ObjectAnimation | undefined {
  const previous = current?.[slot]
  if (!current || !previous) return current
  const merged = normalizeAnim({ ...previous, ...patch, preset: previous.preset })
  if (!merged) return current
  const directions = directionsOf(slot, merged.preset)
  if (merged.direction && !directions.includes(merged.direction)) delete merged.direction
  if (merged.by && !supportsTextUnits(slot, merged.preset)) delete merged.by
  if (merged.loop && slot !== 'emphasis') delete merged.loop
  return { ...current, [slot]: merged }
}

/** `current` without `slot`; `undefined` when nothing is left (an object never keeps an empty `animation`). */
export function withoutSlot(current: ObjectAnimation | undefined, slot: AnimSlot): ObjectAnimation | undefined {
  if (!current || !current[slot]) return current
  const next: ObjectAnimation = { ...current }
  delete next[slot]
  return next.enter || next.exit || next.emphasis ? next : undefined
}

/** A stored value as the editor edits it: only what it understands, `undefined` when that is nothing. */
export function readAnimation(raw: unknown): ObjectAnimation | undefined {
  return normalizeObjectAnimation(raw) ?? undefined
}

export function hasSlot(raw: unknown, slot: AnimSlot): boolean {
  return readAnimation(raw)?.[slot] !== undefined
}

/* ------------------------------------------------------------------------------------------------
 * Page transitions
 * ---------------------------------------------------------------------------------------------- */

/** The transition a preset starts with (its own duration, easing and direction). `null` for a preset that is not registered. */
export function newTransition(presetId: string): PageTransition | null {
  const preset = transitionPresets.get(presetId)
  if (!preset) return null
  const transition: PageTransition = {
    preset: presetId,
    durationMs: clampNumber(preset.defaults.durationMs, TRANSITION_RANGE.min, TRANSITION_RANGE.max),
    easing: preset.defaults.easing,
  }
  const direction = preset.defaults.direction ?? preset.directions?.[0]
  if (direction) transition.direction = direction
  return transition
}

/** `current` with `patch` applied: duration limited to 200..3000 ms, a direction the preset offers. */
export function patchTransition(current: PageTransition, patch: Partial<PageTransition>): PageTransition {
  const next: PageTransition = { ...current, ...patch, preset: current.preset }
  next.durationMs = clampNumber(Math.round(Number.isFinite(next.durationMs) ? next.durationMs : current.durationMs), TRANSITION_RANGE.min, TRANSITION_RANGE.max)
  const allowed = transitionPresets.get(next.preset)?.directions ?? []
  if (!next.direction || !isDirection(next.direction) || !allowed.includes(next.direction)) delete next.direction
  return next
}

function withTransition(page: DocPage, transition: PageTransition | null): DocPage {
  const same = JSON.stringify(page.transition ?? null) === JSON.stringify(transition)
  if (same) return page
  const next: DocPage = { ...page }
  if (transition === null) delete next.transition
  else next.transition = transition
  return next
}

/** Sets the transition into one page (`null` removes it). An unchanged page keeps its identity. */
export function setPageTransition(doc: DoryDocument, pageId: string, transition: PageTransition | null): DoryDocument {
  const index = doc.pages.findIndex((p) => p.id === pageId)
  if (index < 0) return doc
  const page = withTransition(doc.pages[index], transition)
  if (page === doc.pages[index]) return doc
  const pages = doc.pages.slice()
  pages[index] = page
  return { ...doc, pages }
}

/** Gives every page the same transition (`null` clears them all). */
export function setAllPageTransitions(doc: DoryDocument, transition: PageTransition | null): DoryDocument {
  const pages = doc.pages.map((page) => withTransition(page, transition))
  return pages.every((page, i) => page === doc.pages[i]) ? doc : { ...doc, pages }
}
