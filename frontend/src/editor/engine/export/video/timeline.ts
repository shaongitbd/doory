/**
 * The timeline of a video: the chosen pages one after another, each with the transition that brings it in and the
 * time it is held. Pure (the document in, numbers out), so it is tested without a browser.
 *
 * A page's slot is what the slideshow counts under auto-advance: its transition, plus the moment it has built up (the
 * end of its last enter animation), plus its own time (`durationSec`, or `pageSeconds` when the person fixed one for
 * every page, or 5 s when it has none). Audio is mixed over the same slots (`slotDurationsMs`).
 *
 *   |-- transition --|---- build-up ----|------------- hold -------------|
 *   ^ segment start    ^ body start (page clock 0)                         ^ segment end
 *
 * During the transition the page that was left stands still as it rested; the new page is at the start of its clock.
 */
import type { AudioTrack, DocPage, PageTransition } from '@/types/document'
import { pageTiming } from '../../../animation/model'
import { playableTransition } from '../../../animation/sampler'
import { pageSeconds } from '../../../presenter/timing'
import type { PageSize } from '../../docOps'
import { clipTracks } from '../../../clips/audio'

export interface PageRef {
  page: DocPage
  /** Position in the document, 0-based. */
  index: number
  size: PageSize
}

export interface Segment {
  /** Position in the video, 0-based. */
  index: number
  /** Position of the page in the document, 0-based. */
  pageIndex: number
  page: DocPage
  size: PageSize
  startMs: number
  endMs: number
  durationMs: number
  /** The transition that brings the page in; `null` for the first page and for a page without one that plays. */
  transition: PageTransition | null
  transitionMs: number
  /** Where the page clock starts: `startMs + transitionMs`. */
  bodyStartMs: number
  /** The page clock's length: the build-up plus the hold. */
  bodyMs: number
  introMs: number
  holdMs: number
  /** The page clock after which the page no longer changes; `Infinity` while something loops. */
  settledMs: number
}

export interface Timeline {
  segments: readonly Segment[]
  totalMs: number
}

export interface TimelineOptions {
  /** Seconds every page is held; `null` = each page's own time. */
  pageSeconds: number | null
}

/** Whole milliseconds, so that every boundary of the timeline is an integer and the scheduler needs no tolerance. */
const whole = (ms: number): number => Math.max(0, Math.round(ms))

export function holdSecondsOf(page: Pick<DocPage, 'durationSec' | 'objects'>, options: TimelineOptions): number {
  return options.pageSeconds ?? pageSeconds(page)
}

/** Compiles the pages (in the order they play) into segments. The first page has no transition. */
export function compileTimeline(pages: readonly PageRef[], options: TimelineOptions): Timeline {
  const segments: Segment[] = []
  let at = 0
  pages.forEach((ref, index) => {
    const timing = pageTiming(ref.page)
    const transition = index === 0 ? null : playableTransition(ref.page.transition)
    const transitionMs = transition ? whole(transition.durationMs) : 0
    const introMs = whole(timing.introMs)
    const holdMs = whole(holdSecondsOf(ref.page, options) * 1000)
    const bodyMs = introMs + holdMs
    const durationMs = transitionMs + bodyMs
    segments.push({
      index,
      pageIndex: ref.index,
      page: ref.page,
      size: ref.size,
      startMs: at,
      endMs: at + durationMs,
      durationMs,
      transition,
      transitionMs,
      bodyStartMs: at + transitionMs,
      bodyMs,
      introMs,
      holdMs,
      settledMs: timing.loops ? Number.POSITIVE_INFINITY : whole(timing.endMs),
    })
    at += durationMs
  })
  return { segments, totalMs: at }
}

/**
 * How long each page of the document is on screen in the video, in document order, for the audio mixdown: the segment
 * length for a page that is in the video and 0 for one that is not.
 */
export function slotDurationsMs(documentPages: number, timeline: Timeline): number[] {
  const slots = new Array<number>(documentPages).fill(0)
  for (const segment of timeline.segments) slots[segment.pageIndex] = segment.durationMs
  return slots
}

/** True when the video moves at all: a page has an animation or a transition that plays. */
export function timelineMoves(timeline: Timeline): boolean {
  return timeline.segments.some((s) => s.transition !== null || s.settledMs > 0)
}

/**
 * The sound of the video clips on the video's pages. The video's clock starts a page with the transition into it,
 * while its clips start when it has come in: each page's clip sounds start later by its transition.
 */
export function clipSoundOf(timeline: Timeline): AudioTrack[] {
  const lead = new Map(timeline.segments.map((s) => [s.page.id, s.transitionMs]))
  return clipTracks({ pages: timeline.segments.map((s) => s.page) }, (pageId) => lead.get(pageId) ?? 0)
}
