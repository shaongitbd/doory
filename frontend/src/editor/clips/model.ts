/**
 * Video clips in a design: what a clip object says about its video, and the time arithmetic it implies.
 *
 * A clip is a picture (Fabric `image`) whose `src` is the clip's poster, so every surface that draws stills (the
 * editing canvas, thumbnails, PNG/SVG/PDF downloads, the server's image export) shows the poster without knowing
 * about video. What makes it a clip are flat `video…` properties beside it: flat because co-editing merges an
 * object property by property, so two people trimming and changing the volume at once don't overwrite each other.
 *
 * Times are ms. `videoTrimStartMs` / `videoTrimEndMs` are positions in the source (the part that plays, like an
 * audio track's trim), `videoStartMs` is when it starts on the page clock (0: as the page comes in), `videoSpeed`
 * how fast it plays. A clip that doesn't loop shows its first frame before it starts and its last after it ends.
 *
 * Reading is forgiving: anything out of range is clamped, so a document from elsewhere can't break playback.
 */
import type { DocObject, DocPage } from '@/types/document'
import type { AssetRef } from '@/types/adapter'

/** The props a clip object carries (serialized with the object, see `engine/objects/builtinKinds.ts`). */
export const CLIP_PROPS = [
  'videoSrc',
  'videoAudioSrc',
  'videoFilmstrip',
  'videoDurationMs',
  'videoStartMs',
  'videoTrimStartMs',
  'videoTrimEndMs',
  'videoLoop',
  'videoMuted',
  'videoVolume',
  'videoSpeed',
  'videoFadeInMs',
  'videoFadeOutMs',
  'videoHideBefore',
  'videoHideAfter',
  'videoBackdropOf',
] as const

/** The props that only time or mix the clip: changing one never needs the object rebuilt. */
export const CLIP_TIMING_PROPS = CLIP_PROPS.filter((p) => p !== 'videoSrc' && p !== 'videoAudioSrc' && p !== 'videoFilmstrip' && p !== 'videoBackdropOf')

/** The props a clip's blurred background follows: it shows the same picture at every moment. */
export const BACKDROP_TIMING_PROPS = ['videoStartMs', 'videoTrimStartMs', 'videoTrimEndMs', 'videoLoop', 'videoSpeed', 'videoHideBefore', 'videoHideAfter'] as const

/** The longest clip a design holds (the server's limit and the video export's). */
export const MAX_CLIP_MS = 600_000
/** The shortest part of a clip that can be kept by trimming. */
export const MIN_CLIP_MS = 100
export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4] as const
export const MIN_SPEED = 0.25
export const MAX_SPEED = 4
export const MAX_FADE_MS = 10_000

export interface ClipFilmstrip {
  url: string
  frames: number
  intervalMs: number
  tileWidth: number
  tileHeight: number
}

/** A clip as the editor reads it. Every number is in range and the trim is the right way round. */
export interface Clip {
  src: string
  /** The clip's sound as a file of its own; empty for a silent clip. */
  audioSrc: string
  filmstrip: ClipFilmstrip | null
  durationMs: number
  startMs: number
  trimStartMs: number
  trimEndMs: number
  loop: boolean
  muted: boolean
  volume: number
  speed: number
  fadeInMs: number
  fadeOutMs: number
  /** Set on a clip's blurred background: the id of the clip it belongs to (it follows that clip's timing). */
  backdropOf: string
  /**
   * The clip is not shown before it starts / after it ends (instead of standing on its first / last picture): the
   * parts of a split clip, which take turns in the same place.
   */
  hideBefore: boolean
  hideAfter: boolean
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const wholeMs = (v: unknown, lo: number, hi: number, fallback: number): number => (isNumber(v) ? Math.round(clamp(v, lo, hi)) : fallback)

/** A same-site path or an https address (never `blob:`, `data:` or another scheme). */
function playableSrc(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 2048) return ''
  if (v.startsWith('https://')) return v
  return v.startsWith('/') && !v.startsWith('//') ? v : ''
}

function readFilmstrip(v: unknown): ClipFilmstrip | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const url = playableSrc(r.url)
  const frames = wholeMs(r.frames, 1, 600, 0)
  const intervalMs = wholeMs(r.intervalMs, 1, MAX_CLIP_MS, 0)
  const tileWidth = wholeMs(r.tileWidth, 1, 4096, 0)
  const tileHeight = wholeMs(r.tileHeight, 1, 4096, 0)
  return url && frames && intervalMs && tileWidth && tileHeight ? { url, frames, intervalMs, tileWidth, tileHeight } : null
}

/** True when `obj` (a stored object or a live Fabric one) is a video clip: a picture that names a clip. */
export function isClip(obj: { type?: unknown } & Record<string, unknown>): boolean {
  return typeof obj.type === 'string' && obj.type.toLowerCase() === 'image' && typeof obj.videoSrc === 'string' && obj.videoSrc.length > 0
}

/** The clip `obj` holds, or null when it isn't one. */
export function readClip(obj: Record<string, unknown>): Clip | null {
  if (!isClip(obj)) return null
  const src = playableSrc(obj.videoSrc)
  if (!src) return null
  const durationMs = wholeMs(obj.videoDurationMs, MIN_CLIP_MS, MAX_CLIP_MS, MAX_CLIP_MS)
  let trimStartMs = wholeMs(obj.videoTrimStartMs, 0, durationMs, 0)
  let trimEndMs = wholeMs(obj.videoTrimEndMs, 0, durationMs, durationMs)
  if (trimEndMs < trimStartMs) [trimStartMs, trimEndMs] = [trimEndMs, trimStartMs]
  if (trimEndMs - trimStartMs < MIN_CLIP_MS) {
    trimEndMs = Math.min(durationMs, trimStartMs + MIN_CLIP_MS)
    trimStartMs = Math.max(0, trimEndMs - MIN_CLIP_MS)
  }
  return {
    src,
    audioSrc: playableSrc(obj.videoAudioSrc),
    filmstrip: readFilmstrip(obj.videoFilmstrip),
    durationMs,
    startMs: wholeMs(obj.videoStartMs, 0, MAX_CLIP_MS, 0),
    trimStartMs,
    trimEndMs,
    loop: obj.videoLoop === true,
    muted: obj.videoMuted === true,
    volume: isNumber(obj.videoVolume) ? Math.round(clamp(obj.videoVolume, 0, 1) * 1000) / 1000 : 1,
    speed: isNumber(obj.videoSpeed) ? clamp(obj.videoSpeed, MIN_SPEED, MAX_SPEED) : 1,
    fadeInMs: wholeMs(obj.videoFadeInMs, 0, MAX_FADE_MS, 0),
    fadeOutMs: wholeMs(obj.videoFadeOutMs, 0, MAX_FADE_MS, 0),
    backdropOf: typeof obj.videoBackdropOf === 'string' && obj.videoBackdropOf.length <= 64 ? obj.videoBackdropOf : '',
    hideBefore: obj.videoHideBefore === true,
    hideAfter: obj.videoHideAfter === true,
  }
}

/** How long the kept part of the clip plays on the page clock (at its speed). */
export function clipLengthMs(clip: Pick<Clip, 'trimStartMs' | 'trimEndMs' | 'speed'>): number {
  return (clip.trimEndMs - clip.trimStartMs) / clip.speed
}

/** When the clip ends on the page clock; `Infinity` for a looping clip (it plays as long as the page is up). */
export function clipEndMs(clip: Clip): number {
  return clip.loop ? Infinity : clip.startMs + clipLengthMs(clip)
}

/**
 * The position in the source to show at `pageMs` on the page clock: the first kept frame before the clip starts,
 * the last after it ends (unless it loops).
 */
export function clipTimeAt(clip: Pick<Clip, 'startMs' | 'trimStartMs' | 'trimEndMs' | 'speed' | 'loop'>, pageMs: number): number {
  const span = clip.trimEndMs - clip.trimStartMs
  const played = (pageMs - clip.startMs) * clip.speed
  if (!(played > 0)) return clip.trimStartMs
  if (clip.loop) return clip.trimStartMs + (played % span)
  return clip.trimStartMs + Math.min(played, span)
}

/** True when the clip is shown at `pageMs`: always, unless it hides outside the time it plays (a split part). */
export function clipShownAt(clip: Clip, pageMs: number): boolean {
  if (clip.hideBefore && pageMs < clip.startMs) return false
  return !(clip.hideAfter && pageMs >= clipEndMs(clip))
}

/** True while the clip moves at `pageMs` (between its start and its end). */
export function clipPlaysAt(clip: Clip, pageMs: number): boolean {
  return pageMs >= clip.startMs && pageMs < clipEndMs(clip)
}

/** The clips on a page, in z-order. */
export function pageClips(page: Pick<DocPage, 'objects'>): Clip[] {
  const out: Clip[] = []
  for (const obj of page.objects) {
    const clip = readClip(obj)
    if (clip) out.push(clip)
  }
  return out
}

export interface PageClipTiming {
  /** When the last clip that ends has ended, ms on the page clock (0 without clips). */
  endMs: number
  /** Some clip loops: the page keeps moving for as long as it is up. */
  loops: boolean
  count: number
}

const timingCache = new WeakMap<readonly DocObject[], PageClipTiming>()

/** What the clips of a page add to its timing. Cached per objects array (the document is immutable). */
export function pageClipTiming(page: Pick<DocPage, 'objects'>): PageClipTiming {
  const hit = timingCache.get(page.objects)
  if (hit) return hit
  let endMs = 0
  let loops = false
  let count = 0
  for (const clip of pageClips(page)) {
    count++
    const end = clipEndMs(clip)
    if (end === Infinity) loops = true
    else endMs = Math.max(endMs, end)
  }
  const timing = { endMs, loops, count }
  timingCache.set(page.objects, timing)
  return timing
}

/** The props of a new clip object for a ready video asset (its `src` is the poster). */
export function clipPropsFromAsset(ref: AssetRef): Record<string, unknown> {
  const info = ref.video
  const durationMs = Math.min(MAX_CLIP_MS, Math.max(MIN_CLIP_MS, Math.round(info?.durationMs ?? 0)))
  const props: Record<string, unknown> = {
    videoSrc: ref.url,
    videoDurationMs: durationMs,
    videoStartMs: 0,
    videoTrimStartMs: 0,
    videoTrimEndMs: durationMs,
    videoLoop: false,
    videoMuted: false,
    videoVolume: 1,
    videoSpeed: 1,
    videoFadeInMs: 0,
    videoFadeOutMs: 0,
  }
  if (info?.audioUrl) props.videoAudioSrc = info.audioUrl
  const strip = info?.filmstrip
  if (strip) props.videoFilmstrip = { url: strip.url, frames: strip.frames, intervalMs: strip.interval_ms, tileWidth: strip.tile_width, tileHeight: strip.tile_height }
  return props
}
