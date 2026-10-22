/**
 * Page timing and speaker notes: the limits the document accepts and the rules a presentation follows.
 *
 * `DocPage.durationSec` is the time a page stays up when the slideshow advances by itself; `DocPage.notes` is the
 * speaker's text. Both are optional and absent when unset (never `undefined`, never `null`): the collaboration layer
 * stores a property per key, and the server validates the same bounds (`apps/designs/validators.py`).
 */
import type { DocPage } from '@/types/document'
import { pageClipTiming } from '../clips/model'

/** The shortest and longest time a page can be given, in seconds. */
export const DURATION_MIN_SEC = 1
export const DURATION_MAX_SEC = 600
/** Time per page when auto-advance is on and the design has no page time at all. */
export const DEFAULT_DURATION_SEC = 5
/** Speaker notes are plain text of at most this many UTF-16 units (the server counts code points, so it is looser). */
export const NOTES_MAX_LENGTH = 5000

/** `sec` limited to 1-600 and rounded to a whole second, or `null` when it is not a finite number. */
export function clampDuration(sec: unknown): number | null {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return null
  return Math.min(DURATION_MAX_SEC, Math.max(DURATION_MIN_SEC, Math.round(sec)))
}

/** The page's own time when it is a usable number (documents from other tools may hold anything), else `null`. */
export function pageDuration(page: Pick<DocPage, 'durationSec'>): number | null {
  const sec = page.durationSec
  return typeof sec === 'number' && Number.isFinite(sec) && sec >= DURATION_MIN_SEC && sec <= DURATION_MAX_SEC ? sec : null
}

/**
 * How long a page plays, in seconds: its own time, or else the default stretched to its video clips, so a clip on a
 * page that was never timed plays to its end (a looping clip fills whatever time the page has).
 */
export function pageSeconds(page: Pick<DocPage, 'durationSec' | 'objects'>): number {
  const own = pageDuration(page)
  if (own !== null) return own
  const clipsEndSec = Math.ceil(pageClipTiming(page).endMs / 1000)
  return Math.min(DURATION_MAX_SEC, Math.max(DEFAULT_DURATION_SEC, clipsEndSec))
}

/** True when at least one page has its own time: the design is "timed" and auto-advance starts switched on. */
export function hasTimings(pages: readonly Pick<DocPage, 'durationSec'>[]): boolean {
  return pages.some((p) => pageDuration(p) !== null)
}

/**
 * Seconds each page stays up while auto-advance is on; `null` means the page waits for the presenter.
 *
 * A timed design (some page has a time) follows its pages: a page without a time waits, which is what the
 * "No auto-advance" choice of the time popover means. A design without any time uses `fallbackSec` for every page,
 * so switching auto-advance on always does something.
 */
export function resolveDurations(pages: readonly Pick<DocPage, 'durationSec'>[], fallbackSec: number = DEFAULT_DURATION_SEC): (number | null)[] {
  const timed = hasTimings(pages)
  return pages.map((p) => (timed ? pageDuration(p) : fallbackSec))
}

/** `5 s`, `45 s`, `1:30`, `10:00`: how a page time reads on its chip. */
export function formatDuration(sec: number): string {
  const whole = Math.max(0, Math.round(sec))
  if (whole < 60) return `${whole} s`
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** `0:07`, `12:05`, `1:02:03`: a clock reading for the presenter's timers. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const two = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}
