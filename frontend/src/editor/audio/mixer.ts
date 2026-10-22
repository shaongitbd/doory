/**
 * The mixdown: `mixAudio(document, pageDurationsMs, sampleRate)` renders the whole design's sound into one
 * `AudioBuffer`, the way the video exporter needs it. Scopes, trims, fades, volume, loops and ducking all come from the
 * mix plan (`plan.ts`), which the live preview and the presenter read as well.
 *
 * Two renderers share the plan. `renderMixPure` is plain arithmetic on Float32Arrays (no DOM, no Web Audio: it is what
 * the unit tests pin down and the fallback where `OfflineAudioContext` is missing); `renderMixOffline` builds the same
 * voices as an `OfflineAudioContext` graph, which is faster and resamples with the browser's own quality. A browser test
 * renders one plan with both and compares them.
 */
import type { AudioTrack, DoryDocument } from '@/types/document'
import { buildClock, MAX_CLOCK_MS } from './clock'
import { isAudible, readTracks } from './model'
import { type MixPlan, type Voice, planMix } from './plan'
import { AudioLoadError, type SourceLoader, defaultSourceLoader } from './sources'

/** Decoded sound in the shape both renderers read: what `AudioBuffer` offers, without being one. */
export interface PcmSource {
  sampleRate: number
  numberOfChannels: number
  length: number
  getChannelData(channel: number): Float32Array
}

export interface PcmMix {
  sampleRate: number
  numberOfChannels: 2
  length: number
  channels: [Float32Array, Float32Array]
}

export interface MixOptions {
  /**
   * Supplies the decoded sound of a track. The default fetches `https://` and `/media/…` sources itself; a guest's
   * `idb://` file needs the editor's loader (`editor.audio.mixdown` passes it).
   */
  load?: SourceLoader
  /** Called with 0..1 while sources load and the mix renders. */
  onProgress?(fraction: number): void
  signal?: AbortSignal
  /** Play only this track (the editor's solo). */
  soloId?: string | null
  /** Tracks that are not the document's own, mixed in with them (the sound of video clips). */
  extraTracks?: readonly AudioTrack[]
}

const samples = (ms: number, rate: number): number => Math.round((ms * rate) / 1000)

/** Which source channel feeds output channel `c` (0 left, 1 right): mono feeds both, more than two use the first two. */
const channelFor = (source: PcmSource, c: 0 | 1): Float32Array => source.getChannelData(Math.min(c, source.numberOfChannels - 1))

/**
 * Renders the plan with plain arithmetic. Each voice reads its source at the position the plan gives (trimmed, looped),
 * interpolating linearly when the rates differ, and is scaled by volume x fade x duck.
 */
export function renderMixPure(plan: MixPlan, sources: ReadonlyMap<string, PcmSource>, sampleRate: number): PcmMix {
  const length = Math.max(1, samples(plan.clock.totalMs, sampleRate))
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  for (const voice of plan.voices) {
    const source = sources.get(voice.track.id)
    if (source && source.length > 0) addVoice(left, right, voice, source, sampleRate)
  }
  return { sampleRate, numberOfChannels: 2, length, channels: [left, right] }
}

function addVoice(left: Float32Array, right: Float32Array, voice: Voice, source: PcmSource, rate: number): void {
  const { placement } = voice
  const first = Math.max(0, samples(placement.startMs, rate))
  const last = Math.min(left.length, samples(placement.endMs, rate))
  const srcL = channelFor(source, 0)
  const srcR = channelFor(source, 1)
  const ratio = source.sampleRate / rate
  const startSrc = (placement.track.trimStartMs * source.sampleRate) / 1000
  const windowSrc = Math.max(1, (placement.windowMs * source.sampleRate) / 1000)
  const loop = placement.track.loop
  // The curves are evaluated by walking a segment pointer, not by searching from the start for every sample.
  const fade = voice.fade
  const duck = voice.duck
  let fadeIndex = 1
  let duckIndex = 1
  for (let i = first; i < last; i++) {
    const tMs = (i * 1000) / rate
    while (fadeIndex < fade.length - 1 && tMs > fade[fadeIndex].t) fadeIndex++
    let gain = voice.volume * segmentValue(fade, fadeIndex, tMs)
    if (duck) {
      while (duckIndex < duck.length - 1 && tMs > duck[duckIndex].t) duckIndex++
      gain *= segmentValue(duck, duckIndex, tMs)
    }
    if (gain === 0) continue
    const played = (i - first) * ratio
    const offset = loop ? played % windowSrc : Math.min(played, windowSrc - 1)
    const p = startSrc + offset
    const i0 = Math.floor(p)
    const frac = p - i0
    const i1 = i0 + 1 < source.length ? i0 + 1 : i0
    if (i0 >= source.length) continue
    left[i] += (srcL[i0] + (srcL[i1] - srcL[i0]) * frac) * gain
    right[i] += (srcR[i0] + (srcR[i1] - srcR[i0]) * frac) * gain
  }
}

function segmentValue(curve: readonly { t: number; gain: number }[], index: number, t: number): number {
  if (curve.length === 1) return curve[0].gain
  const a = curve[index - 1]
  const b = curve[index]
  if (t <= a.t) return a.gain
  if (t >= b.t) return b.gain
  return a.gain + ((b.gain - a.gain) * (t - a.t)) / (b.t - a.t)
}

/**
 * Builds the plan's voices as an OfflineAudioContext graph and renders it. Every voice is a looping
 * `AudioBufferSourceNode` (`loopStart`/`loopEnd` hold the trim) through three gain stages, so the browser does the
 * resampling and the mixing.
 */
export async function renderMixOffline(plan: MixPlan, sources: ReadonlyMap<string, AudioBuffer>, sampleRate: number): Promise<AudioBuffer> {
  const length = Math.max(1, samples(plan.clock.totalMs, sampleRate))
  const context = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate })
  for (const voice of plan.voices) {
    const buffer = sources.get(voice.track.id)
    if (!buffer) continue
    scheduleVoice(context, context.destination, voice, buffer, 0)
  }
  return context.startRendering()
}

/** Gain stages and the source of one voice, scheduled on `context` with the clock starting at `originSec`. */
export function scheduleVoice(context: BaseAudioContext, destination: AudioNode, voice: Voice, buffer: AudioBuffer, originSec: number): AudioScheduledSourceNode[] {
  const { placement } = voice
  const source = context.createBufferSource()
  source.buffer = buffer
  const trackStart = placement.track.trimStartMs / 1000
  const trackEnd = Math.min(buffer.duration, placement.track.trimEndMs / 1000)
  const when = originSec + placement.startMs / 1000
  const duration = (placement.endMs - placement.startMs) / 1000
  if (placement.track.loop) {
    source.loop = true
    source.loopStart = trackStart
    source.loopEnd = Math.max(trackStart + 0.001, trackEnd)
  }
  const fade = context.createGain()
  curveOnto(fade.gain, voice.fade, originSec)
  const duck = context.createGain()
  if (voice.duck) curveOnto(duck.gain, voice.duck, originSec)
  const level = context.createGain()
  level.gain.value = voice.volume
  source.connect(fade).connect(duck).connect(level).connect(destination)
  source.start(when, trackStart, placement.track.loop ? duration : Math.min(duration, Math.max(0.001, trackEnd - trackStart)))
  return [source]
}

function curveOnto(param: AudioParam, curve: readonly { t: number; gain: number }[], originSec: number): void {
  param.setValueAtTime(curve[0].gain, originSec + curve[0].t / 1000)
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].t === curve[i - 1].t) param.setValueAtTime(curve[i].gain, originSec + curve[i].t / 1000)
    else param.linearRampToValueAtTime(curve[i].gain, originSec + curve[i].t / 1000)
  }
}

/** Copies a rendered mix into an `AudioBuffer` (when the browser has the constructor), else returns the arrays. */
export function toAudioBuffer(mix: PcmMix): AudioBuffer {
  const buffer = new AudioBuffer({ length: mix.length, sampleRate: mix.sampleRate, numberOfChannels: 2 })
  buffer.copyToChannel(mix.channels[0] as Float32Array<ArrayBuffer>, 0)
  buffer.copyToChannel(mix.channels[1] as Float32Array<ArrayBuffer>, 1)
  return buffer
}

/**
 * The sound of the design as one stereo `AudioBuffer` of exactly `sum(pageDurationsMs)` at `sampleRate`.
 *
 * `pageDurationsMs[i]` is how long page `i` of `document.pages` is on screen in the video. Tracks in the design scope
 * run on the whole timeline, tracks in a page scope from the start of that page and stop with it; muted and silent
 * tracks are left out; tracks whose page is not in the document are ignored. Rejects with `AudioLoadError` when a
 * file cannot be fetched or decoded (the message names the track) and with `DOMException` `AbortError` when aborted.
 */
export async function mixAudio(document: DoryDocument, pageDurationsMs: readonly number[], sampleRate: number, options: MixOptions = {}): Promise<AudioBuffer> {
  const clock = buildClock(
    document.pages.map((p) => p.id),
    pageDurationsMs,
  )
  if (clock.totalMs > MAX_CLOCK_MS) throw new AudioLoadError('too-long', 'The video is longer than the 30 minutes the audio mixdown renders.')
  if (!(sampleRate >= 8000 && sampleRate <= 192000)) throw new RangeError('sampleRate must be between 8000 and 192000')
  const plan = planMix([...readTracks(document), ...(options.extraTracks ?? [])].filter(isAudible), clock, { soloId: options.soloId })
  const loaded = await loadSources(plan, options)
  options.onProgress?.(0.9)
  const mix: AudioBuffer =
    typeof OfflineAudioContext === 'function' ? await renderMixOffline(plan, loaded, sampleRate) : toAudioBuffer(renderMixPure(plan, loaded, sampleRate))
  options.onProgress?.(1)
  return mix
}

async function loadSources(plan: MixPlan, options: MixOptions): Promise<Map<string, AudioBuffer>> {
  const out = new Map<string, AudioBuffer>()
  const wanted = plan.voices.map((v) => v.track)
  let done = 0
  await Promise.all(
    wanted.map(async (track) => {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      out.set(track.id, await (options.load ?? defaultSourceLoader)(track, options.signal))
      done += 1
      options.onProgress?.((done / wanted.length) * 0.8)
    }),
  )
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return out
}
