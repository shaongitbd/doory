/**
 * What a drag on a clip's timeline bar does. Pure arithmetic on the page clock: the bar runs from the clip's start for
 * the kept part of the clip at its speed, so a millisecond of bar is `speed` milliseconds of the source.
 */
import { type Clip, MAX_CLIP_MS, MIN_CLIP_MS, clipLengthMs } from './model'

export type ClipTimes = Pick<Clip, 'startMs' | 'trimStartMs' | 'trimEndMs' | 'speed' | 'durationMs'>
export type ClipEdit = Partial<Pick<Clip, 'startMs' | 'trimStartMs' | 'trimEndMs'>>

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** The whole bar moves by `deltaMs` on the page clock; it cannot start before the page does. */
export function moveClip(from: ClipTimes, deltaMs: number): ClipEdit {
  return { startMs: Math.round(clamp(from.startMs + deltaMs, 0, MAX_CLIP_MS)) }
}

/**
 * The left edge moves by `deltaMs` on the page clock: the part of the clip before the new edge is cut off (or given
 * back) and the rest stays where it was, so the start moves with the trim.
 */
export function trimClipStart(from: ClipTimes, deltaMs: number): ClipEdit {
  const lowest = Math.max(-from.trimStartMs / from.speed, -from.startMs)
  const highest = (from.trimEndMs - MIN_CLIP_MS - from.trimStartMs) / from.speed
  const d = clamp(deltaMs, lowest, Math.max(lowest, highest))
  return { startMs: Math.round(from.startMs + d), trimStartMs: Math.round(from.trimStartMs + d * from.speed) }
}

/** The right edge moves by `deltaMs` on the page clock: more or less of the clip plays. */
export function trimClipEnd(from: ClipTimes, deltaMs: number): ClipEdit {
  return { trimEndMs: Math.round(clamp(from.trimEndMs + deltaMs * from.speed, from.trimStartMs + MIN_CLIP_MS, from.durationMs)) }
}

/** Where the bar ends on the page clock (`pageEndMs` for a looping clip, which plays as long as the page is up). */
export function barEndMs(clip: Clip, pageEndMs: number): number {
  return clip.loop ? Math.max(clip.startMs + clipLengthMs(clip), pageEndMs) : clip.startMs + clipLengthMs(clip)
}
