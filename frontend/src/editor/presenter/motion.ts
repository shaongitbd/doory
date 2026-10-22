/**
 * What a slideshow plays besides still pages: each page's animations and the transition that brings it in. The plan is
 * made once from the snapshot the slideshow works on; `reduced` is the viewer's wish for reduced motion, which turns
 * every transition into a short fade and plays no object animation at all (the pages then appear as they rest).
 *
 * Page time. A page stays up for its time (`DocPage.durationSec`, or the default when the design has none) counted from
 * the moment it has built up, so its auto-advance time is its transition plus the end of its last enter animation plus
 * that time; `motionDurations` adds the first two to the times `timing.ts` resolves. The state machine, the page
 * clock and the presenter view all see one number and need no idea of animation.
 */
import type { DocPage, DoryDocument, PageTransition } from '@/types/document'
import type { FrameRenderer } from '../animation/frameRenderer'
import { createFrameRenderer } from '../animation/frameRenderer'
import { type PageTiming, pageHasAnimation, pageTiming, reverseDirection } from '../animation/model'
import { playableTransition } from '../animation/sampler'
import { transitionPresets } from '../animation/presets'
import type { EditorEngine } from '../engine/editor'
import { getPageSize } from '../engine/pageSizes'
import { DURATION_MAX_SEC } from './timing'
import { elementSources } from '../clips/elementSource'

/** The fade that stands in for every transition when the viewer asked for reduced motion. */
export const REDUCED_TRANSITION: PageTransition = { preset: 'fade', durationMs: 250, easing: 'ease-in-out' }

export interface PageMotion {
  /** The page as it is drawn: without its animations when motion is reduced. */
  page: DocPage
  /** How it comes in from another page; `null` when it appears at once. */
  transition: PageTransition | null
  timing: PageTiming
}

export interface MotionPlan {
  pages: PageMotion[]
  reduced: boolean
  /** Some page has something that moves: the slideshow needs the animated stage. */
  moves: boolean
}

function withoutAnimation(page: DocPage): DocPage {
  if (!pageHasAnimation(page)) return page
  const objects = page.objects.map((o) => {
    if (o.animation === undefined) return o
    const copy = { ...o }
    delete copy.animation
    return copy
  })
  return { ...page, objects }
}

export function planMotion(doc: Pick<DoryDocument, 'pages'>, reduced: boolean): MotionPlan {
  const pages = doc.pages.map((original): PageMotion => {
    const page = reduced ? withoutAnimation(original) : original
    const wanted = playableTransition(original.transition)
    return { page, transition: wanted ? (reduced ? REDUCED_TRANSITION : wanted) : null, timing: pageTiming(page) }
  })
  return { pages, reduced, moves: pages.some((p) => p.transition !== null || p.timing.spans.length > 0 || p.timing.clips > 0) }
}

/**
 * The transition that plays when the show goes from page `from` to page `to`: the incoming page's own, the other way
 * round when going back; none for the first page shown, for staying on a page, or when the page has none.
 */
export function transitionBetween(plan: MotionPlan, from: number | null, to: number, wrapsForward = false): PageTransition | null {
  const transition = plan.pages[to]?.transition ?? null
  if (!transition || from === null || from === to) return null
  const back = to < from && !wrapsForward
  if (!back || transition.preset === REDUCED_TRANSITION.preset) return transition
  const direction = transition.direction ?? transitionPresets.get(transition.preset)?.defaults.direction
  const reversed = reverseDirection(direction)
  return reversed ? { ...transition, direction: reversed } : transition
}

/**
 * Seconds each page stays up under auto-advance: the time `timing.ts` resolves plus the page's transition and the time
 * it takes to build up. A page that waits for the presenter (`null`) keeps waiting.
 */
export function motionDurations(base: readonly (number | null)[], plan: MotionPlan): (number | null)[] {
  return base.map((sec, i) => {
    const page = plan.pages[i]
    if (sec === null || !page) return sec
    return Math.min(DURATION_MAX_SEC, sec + ((page.transition?.durationMs ?? 0) + page.timing.introMs) / 1000)
  })
}

/* ------------------------------------------------------------------------------------------------
 * Prepared pages
 * ---------------------------------------------------------------------------------------------- */

type MakeRenderer = (page: DocPage, multiplier: number) => Promise<FrameRenderer>

interface Entry {
  page: DocPage
  renderer: FrameRenderer
  used: number
}

/**
 * Frame renderers of the pages around the current one, prepared before they are needed (the next page's fonts, images
 * and bitmaps are ready when the presenter advances). Bounded by count; the least recently used one goes first, except
 * the page on screen. Renders that are in flight are shared.
 */
export class MotionCache {
  private readonly entries = new Map<string, Entry>()
  private readonly pending = new Map<string, Promise<FrameRenderer>>()
  private clock = 0
  private generation = 0
  private current: string | null = null

  constructor(
    private readonly make: MakeRenderer,
    private readonly sizeOf: (page: DocPage) => { width: number; height: number },
    private readonly limit = 4,
  ) {}

  private key(page: DocPage, width: number): string {
    return `${page.id}@${Math.round(width)}`
  }

  /** The renderer when it is already prepared, without starting anything. */
  peek(page: DocPage, width: number): FrameRenderer | null {
    const entry = this.entries.get(this.key(page, width))
    if (!entry || entry.page !== page) return null
    entry.used = ++this.clock
    return entry.renderer
  }

  /** The renderer of `page` at `width` device pixels wide (preparing it if needed; concurrent calls share the work). */
  get(page: DocPage, width: number): Promise<FrameRenderer> {
    const cached = this.peek(page, width)
    if (cached) return Promise.resolve(cached)
    const key = this.key(page, width)
    const running = this.pending.get(key)
    if (running) return running
    const generation = this.generation
    const work = this.make(page, Math.round(width) / this.sizeOf(page).width)
      .then((renderer) => {
        if (generation !== this.generation) {
          renderer.dispose()
          return renderer
        }
        this.store(key, page, renderer)
        return renderer
      })
      .finally(() => {
        if (this.pending.get(key) === work) this.pending.delete(key)
      })
    this.pending.set(key, work)
    return work
  }

  /** Starts preparing a page without waiting (the next one). A failure is left to the call that needs the page. */
  prefetch(page: DocPage | undefined, width: number): void {
    if (page) this.get(page, width).catch(() => undefined)
  }

  /** The page on screen is never evicted. The clips of every other prepared page stop playing. */
  keep(page: DocPage, width: number): void {
    this.current = this.key(page, width)
    for (const [key, entry] of this.entries) if (key !== this.current) entry.renderer.suspendMedia()
  }

  /** Forgets every renderer (the stage changed size); preparations that are still running finish but are not kept. */
  clear(): void {
    this.generation++
    for (const e of this.entries.values()) e.renderer.dispose()
    this.entries.clear()
    this.pending.clear()
    this.current = null
  }

  dispose(): void {
    this.clear()
  }

  private store(key: string, page: DocPage, renderer: FrameRenderer): void {
    this.entries.set(key, { page, renderer, used: ++this.clock })
    while (this.entries.size > this.limit) {
      let oldest: string | null = null
      let oldestUsed = Number.POSITIVE_INFINITY
      for (const [k, e] of this.entries) {
        if (k !== key && k !== this.current && e.used < oldestUsed) {
          oldest = k
          oldestUsed = e.used
        }
      }
      if (oldest === null) break
      this.entries.get(oldest)?.renderer.dispose()
      this.entries.delete(oldest)
    }
  }
}

/** A cache that renders with the editor's own loaders, so fonts, uploads and effects match the editor and exports. */
export function createMotionCache(editor: EditorEngine, snapshot: DoryDocument): MotionCache {
  return new MotionCache(
    (page, multiplier) => createFrameRenderer(page, getPageSize(snapshot, page.id), editor.loadContext, { multiplier, media: elementSources }),
    (page) => getPageSize(snapshot, page.id),
  )
}
