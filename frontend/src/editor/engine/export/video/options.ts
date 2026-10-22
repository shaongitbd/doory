/**
 * What a person chooses for a video or an animated GIF, and the rules those choices follow. Pure: no DOM, no codecs.
 *
 * The state is plain data (`VideoOptions`), read tolerantly from storage (`readVideoOptions`: every field is checked on
 * its own and an unknown value falls back to the default) and changed through small functions that keep it valid
 * (`withFormat` moves the frame rate and the resolution to values the new format offers).
 */

export type VideoFormat = 'mp4' | 'webm' | 'gif'
export type VideoQuality = 'small' | 'balanced' | 'high'
/**
 * `fit` shows the whole page with bars where its shape differs from the frame, `blur` the same with the page itself,
 * blurred, in the bars (a horizontal video on a vertical frame, say); `fill` covers the frame and crops.
 */
export type FitMode = 'fit' | 'fill' | 'blur'
/** `design` is the size of the first page; a number is the length of the shorter side of the frame in px (720, 1080 ...). */
export type Resolution = 'design' | 240 | 360 | 480 | 720 | 1080 | 2160

export interface VideoOptions {
  format: VideoFormat
  resolution: Resolution
  /** Frames per second. */
  fps: number
  quality: VideoQuality
  fit: FitMode
  /** Put the design's sound in the file (video only; a design without sound has none). */
  audio: boolean
  /** GIF: how often the animation plays; 0 = forever, 1 = once, n = n times. */
  loops: number
  /** GIF: spread the colour error over neighbouring pixels (smoother gradients, larger files). */
  dither: boolean
  /** Seconds each page is held (after it has built up); `null` = every page keeps its own time (5 s when it has none). */
  pageSeconds: number | null
}

export const VIDEO_FORMATS: readonly VideoFormat[] = ['mp4', 'webm', 'gif']
export const VIDEO_QUALITIES: readonly VideoQuality[] = ['small', 'balanced', 'high']

export interface FormatRules {
  fps: readonly number[]
  resolutions: readonly Resolution[]
  defaultFps: number
  defaultResolution: Resolution
  /** The longest file the browser is asked to make, ms. Memory is the compressed file plus the audio mix. */
  maxMs: number
  /** The longest side the "design size" option keeps, px. */
  designMaxSide: number
}

export const FORMAT_RULES: Readonly<Record<VideoFormat, FormatRules>> = {
  mp4: { fps: [24, 30, 60], resolutions: ['design', 480, 720, 1080, 2160], defaultFps: 30, defaultResolution: 'design', maxMs: 10 * 60_000, designMaxSide: 1920 },
  webm: { fps: [24, 30, 60], resolutions: ['design', 480, 720, 1080, 2160], defaultFps: 30, defaultResolution: 'design', maxMs: 10 * 60_000, designMaxSide: 1920 },
  gif: { fps: [5, 10, 15, 20], resolutions: [240, 360, 480, 720], defaultFps: 15, defaultResolution: 480, maxMs: 2 * 60_000, designMaxSide: 720 },
}

/** Page time bounds, the same 1-600 s the page time chip accepts. */
export const PAGE_SECONDS_RANGE = { min: 1, max: 600 } as const
/** Most plays a GIF can be told to make (a 16-bit field in the file). */
export const MAX_LOOPS = 65_535

export function defaultVideoOptions(format: VideoFormat = 'mp4'): VideoOptions {
  const rules = FORMAT_RULES[format]
  return {
    format,
    resolution: rules.defaultResolution,
    fps: rules.defaultFps,
    quality: 'balanced',
    fit: 'fit',
    audio: true,
    loops: 0,
    dither: true,
    pageSeconds: null,
  }
}

/** The format changed: keep what the new format also offers and take its defaults for the rest. */
export function withFormat(options: VideoOptions, format: VideoFormat): VideoOptions {
  const rules = FORMAT_RULES[format]
  const fallback = defaultVideoOptions(format)
  return {
    ...options,
    format,
    fps: rules.fps.includes(options.fps) ? options.fps : fallback.fps,
    resolution: rules.resolutions.includes(options.resolution) ? options.resolution : fallback.resolution,
  }
}

const isFormat = (v: unknown): v is VideoFormat => typeof v === 'string' && (VIDEO_FORMATS as readonly string[]).includes(v)
const isQuality = (v: unknown): v is VideoQuality => typeof v === 'string' && (VIDEO_QUALITIES as readonly string[]).includes(v)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Options from stored or foreign JSON. Each field is validated on its own: a value that is not allowed for the format
 * becomes that format's default, a malformed object becomes the defaults.
 */
export function readVideoOptions(raw: unknown, fallbackFormat: VideoFormat = 'mp4'): VideoOptions {
  if (!isRecord(raw)) return defaultVideoOptions(fallbackFormat)
  const format = isFormat(raw.format) ? raw.format : fallbackFormat
  const rules = FORMAT_RULES[format]
  const base = defaultVideoOptions(format)
  const loops = raw.loops
  const seconds = raw.pageSeconds
  return {
    format,
    resolution: rules.resolutions.find((r) => r === raw.resolution) ?? base.resolution,
    fps: rules.fps.find((f) => f === raw.fps) ?? base.fps,
    quality: isQuality(raw.quality) ? raw.quality : base.quality,
    fit: raw.fit === 'fill' || raw.fit === 'blur' ? raw.fit : 'fit',
    audio: typeof raw.audio === 'boolean' ? raw.audio : base.audio,
    loops: typeof loops === 'number' && Number.isInteger(loops) && loops >= 0 && loops <= MAX_LOOPS ? loops : base.loops,
    dither: typeof raw.dither === 'boolean' ? raw.dither : base.dither,
    pageSeconds: typeof seconds === 'number' && Number.isFinite(seconds) ? clampPageSeconds(seconds) : null,
  }
}

/** Whole seconds within the page time bounds. */
export function clampPageSeconds(seconds: number): number {
  return Math.min(PAGE_SECONDS_RANGE.max, Math.max(PAGE_SECONDS_RANGE.min, Math.round(seconds)))
}

/** True when the options can be run as they are (they come from `readVideoOptions` or the UI, never trusted blindly). */
export function isValidVideoOptions(options: VideoOptions): boolean {
  const rules = FORMAT_RULES[options.format]
  return (
    rules !== undefined &&
    rules.fps.includes(options.fps) &&
    rules.resolutions.includes(options.resolution) &&
    isQuality(options.quality) &&
    (options.fit === 'fit' || options.fit === 'fill' || options.fit === 'blur') &&
    Number.isInteger(options.loops) &&
    options.loops >= 0 &&
    options.loops <= MAX_LOOPS &&
    (options.pageSeconds === null || (Number.isFinite(options.pageSeconds) && options.pageSeconds >= PAGE_SECONDS_RANGE.min && options.pageSeconds <= PAGE_SECONDS_RANGE.max))
  )
}
