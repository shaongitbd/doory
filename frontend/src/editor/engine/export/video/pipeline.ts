/**
 * The video export: a chosen set of pages becomes an MP4, a WebM or an animated GIF, entirely in the browser.
 *
 * ```
 * timeline (pages, transitions, times)      mixdown -> audio encoder -+
 *      |                                                              v
 *  frame scheduler -> composer (shared frame renderer) -> VideoEncoder -> muxer -> Blob      (MP4, WebM)
 *                                         `-> pixels -> palette, dither, LZW -> Blob          (GIF)
 * ```
 *
 * A frame is drawn, handed to the encoder and closed at once, and the encoder's queue is held short (`waitForQueue`), so
 * memory holds one page's bitmaps, a few frame-sized canvases and the compressed file as it grows, whatever the length.
 * The work runs on the main thread in slices of about ten milliseconds (`Slicer`): the frame renderer and the fonts need
 * the DOM, and the encoders themselves run off the thread in the browser. The export can be cancelled between any two
 * frames (`signal`); nothing is downloaded until the caller has the finished file.
 */
import type { DocPage, DoryDocument } from '@/types/document'
import { encodeAudio } from '../../../audio/encoder'
import { isAudible, readTracks } from '../../../audio/model'
import { mixAudio } from '../../../audio/mixer'
import { exportSources } from './clipDecoder'
import { pageSize } from '../../docOps'
import { type EncodingPlan, browserCodecs, planEncoding } from './codecs'
import { FrameComposer } from './composer'
import { type Container, createContainer } from './container'
import { VideoExportError, describeFailure, throwIfAborted } from './errors'
import { etaMs } from './estimate'
import { GifTooLargeError } from './gifProtocol'
import { FORMAT_RULES, type VideoOptions, isValidVideoOptions } from './options'
import { FrameCursor, type FramePlan, frameCount, frameDurationUs, frameTimestampUs, gifDelayCs, repeatsPrevious } from './schedule'
import { frameSize } from './geometry'
import { Slicer, waitForQueue } from './slicer'
import { clipSoundOf, compileTimeline, slotDurationsMs } from './timeline'
import { AUDIO_RATE, type Deps, type Prepared, type VideoJob, type VideoProgress, type VideoResult, type VideoWarning, fileNameFor } from './types'

/** Frames waiting in the video encoder before the next is drawn. */
const MAX_QUEUE = 4
/** A GIF above this many bytes is refused: it would not open anywhere. */
export const GIF_MAX_BYTES = 200 * 1024 * 1024
/** Seconds between keyframes. */
const KEYFRAME_SECONDS = 2
/** How often the progress callback is called at most, ms. */
const PROGRESS_EVERY_MS = 100

const defaultDeps: Deps = { codecs: browserCodecs, mix: mixAudio, encodeSound: encodeAudio, now: () => performance.now(), gifWorker: undefined }

export function prepare(document: DoryDocument, pages: readonly { page: DocPage; index: number }[], options: VideoOptions): Prepared {
  if (!isValidVideoOptions(options)) throw new VideoExportError('invalid-options', 'These video settings are not valid.')
  if (pages.length === 0) throw new VideoExportError('no-pages', 'Select at least one page.')
  const sized = pages.map((p) => ({ ...p, size: pageSize(document, p.page) }))
  const timeline = compileTimeline(sized, { pageSeconds: options.pageSeconds })
  if (timeline.totalMs > FORMAT_RULES[options.format].maxMs) throw new VideoExportError('too-long', 'The video is longer than this format allows.')
  const frame = frameSize(sized[0].size, options.resolution, options.format)
  const audible = readTracks(document).some(isAudible) || clipSoundOf(timeline).length > 0
  return { timeline, frame, frames: frameCount(timeline.totalMs, options.fps), hasSound: options.format !== 'gif' && options.audio && audible }
}

/** Makes the file. Rejects with an `AbortError` when `job.signal` fires and with a `VideoExportError` for everything else. */
export async function runVideoExport(job: VideoJob): Promise<VideoResult> {
  const deps: Deps = { ...defaultDeps, ...job.deps }
  const startedAt = deps.now()
  try {
    throwIfAborted(job.signal)
    const prepared = prepare(job.document, job.pages, job.options)
    if (job.options.format === 'gif') return await runGif(job, prepared, deps, startedAt)
    const plan = await planEncoding({ format: job.options.format, size: prepared.frame, fps: job.options.fps, quality: job.options.quality, audio: prepared.hasSound }, deps.codecs)
    if (plan.engine === 'none') throw new VideoExportError('unsupported', 'This browser cannot make video files.')
    if (plan.engine === 'recorder') {
      const { runRecorder } = await import('./recorder')
      return await runRecorder(job, prepared, plan.mime, deps, startedAt)
    }
    return await runWebCodecs(job, prepared, plan, deps, startedAt)
  } catch (error) {
    throw describeFailure(error)
  }
}

/** Calls `onProgress` at most every 100 ms, and always for the first and the last. */
function progressReporter(job: VideoJob, deps: Deps, startedAt: number, framesStartAt: { value: number }, weights: { sound: number; finishing: number }) {
  let lastAt = Number.NEGATIVE_INFINITY
  return (stage: VideoProgress['stage'], frame: number, frames: number, soundFraction = 0, bytes: number | null = null, force = false): void => {
    const now = deps.now()
    if (!force && now - lastAt < PROGRESS_EVERY_MS) return
    lastAt = now
    const framesShare = 1 - weights.sound - weights.finishing
    const fraction =
      stage === 'sound' ? weights.sound * soundFraction : stage === 'frames' ? weights.sound + framesShare * (frames === 0 ? 0 : frame / frames) : 1
    job.onProgress?.({ stage, fraction: Math.min(1, fraction), frame, frames, elapsedMs: now - startedAt, etaMs: stage === 'frames' ? etaMs(frame, frames, now - framesStartAt.value) : null, bytes })
  }
}

/* ------------------------------------------------------------------------------------------------
 * MP4 and WebM
 * ---------------------------------------------------------------------------------------------- */

async function runWebCodecs(job: VideoJob, prepared: Prepared, plan: Extract<EncodingPlan, { engine: 'webcodecs' }>, deps: Deps, startedAt: number): Promise<VideoResult> {
  const { options, signal } = job
  const { timeline, frame, frames } = prepared
  const fps = options.fps
  const framesStartAt = { value: startedAt }
  const report = progressReporter(job, deps, startedAt, framesStartAt, { sound: prepared.hasSound ? 0.1 : 0, finishing: 0.03 })
  const warnings: VideoWarning[] = []
  if (plan.notes.includes('video-fallback')) warnings.push('video-fallback')
  if (plan.notes.includes('audio-fallback')) warnings.push('audio-fallback')
  if (plan.notes.includes('no-audio')) warnings.push('no-audio')

  // Sound first: it needs the whole design, and its memory is released before the first frame is drawn.
  let sound: Awaited<ReturnType<typeof encodeAudio>> | null = null
  if (prepared.hasSound && plan.audio) {
    report('sound', 0, frames, 0, null, true)
    const durations = slotDurationsMs(job.document.pages.length, timeline)
    const mix = await deps.mix(job.document, durations, AUDIO_RATE, { load: job.host.loadSound, signal, onProgress: (f) => report('sound', 0, frames, f * 0.85), extraTracks: clipSoundOf(timeline) })
    throwIfAborted(signal)
    sound = await deps.encodeSound(mix, plan.audio.format, { signal, onProgress: (f) => report('sound', 0, frames, 0.85 + f * 0.15) })
    if (sound.format === 'wav') {
      sound = null
      warnings.push('no-audio')
    }
  }

  const container = await createContainer({
    kind: options.format as 'mp4' | 'webm',
    family: plan.video.family,
    width: frame.width,
    height: frame.height,
    fps,
    audio: sound ? { codec: plan.audio?.format ?? 'opus', sampleRate: sound.sampleRate, numberOfChannels: sound.numberOfChannels, description: sound.description } : null,
  })

  let failure: unknown = null
  let audioNext = 0
  /** Hands the container the sound that belongs before `untilUs`, so the two tracks are written side by side. */
  const feedSound = (untilUs: number): void => {
    if (!sound) return
    while (audioNext < sound.chunks.length && sound.chunks[audioNext].timestampUs <= untilUs) {
      container.addAudio(sound.chunks[audioNext])
      audioNext += 1
    }
  }
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        const data = new Uint8Array(chunk.byteLength)
        chunk.copyTo(data)
        feedSound(chunk.timestamp + 500_000)
        container.addVideo({ data, key: chunk.type === 'key', timestampUs: chunk.timestamp, durationUs: chunk.duration ?? frameDurationUs(Math.round((chunk.timestamp * fps) / 1_000_000), fps) }, meta)
      } catch (error) {
        failure ??= error
      }
    },
    error: (error) => {
      failure ??= error
    },
  })
  const composer = new FrameComposer({ frame, fit: options.fit, loadContext: job.host.loadContext, readback: false, media: exportSources })
  try {
    encoder.configure(plan.video.config)
    const cursor = new FrameCursor(timeline, fps)
    const slicer = new Slicer()
    const keyEvery = fps * KEYFRAME_SECONDS
    framesStartAt.value = deps.now()
    for (let i = 0; i < frames; i++) {
      throwIfAborted(signal)
      if (failure) throw failure
      const bitmap = await composer.draw(cursor.at(i))
      const picture = new VideoFrame(bitmap, { timestamp: frameTimestampUs(i, fps), duration: frameDurationUs(i, fps) })
      try {
        encoder.encode(picture, { keyFrame: i % keyEvery === 0 })
      } finally {
        picture.close()
      }
      await waitForQueue(encoder, MAX_QUEUE)
      report('frames', i + 1, frames)
      await slicer.tick()
    }
    throwIfAborted(signal)
    report('finishing', frames, frames, 0, null, true)
    await encoder.flush()
    if (failure) throw failure
    feedSound(Number.POSITIVE_INFINITY)
    return finished(job, prepared, container, { frames, video: plan.video.label, audio: sound ? (plan.audio?.label ?? null) : null, warnings }, deps, startedAt)
  } finally {
    if (encoder.state !== 'closed') encoder.close()
    composer.dispose()
  }
}

function finished(job: VideoJob, prepared: Prepared, container: Container, facts: Pick<VideoResult, 'frames' | 'video' | 'audio' | 'warnings'>, deps: Deps, startedAt: number): VideoResult {
  const blob = container.finish()
  const { options } = job
  return {
    blob,
    filename: fileNameFor(job.title, options.format),
    mime: container.mime,
    format: options.format,
    durationMs: prepared.timeline.totalMs,
    width: prepared.frame.width,
    height: prepared.frame.height,
    fps: options.fps,
    ...facts,
    elapsedMs: deps.now() - startedAt,
  }
}

/* ------------------------------------------------------------------------------------------------
 * GIF
 * ---------------------------------------------------------------------------------------------- */

async function runGif(job: VideoJob, prepared: Prepared, deps: Deps, startedAt: number): Promise<VideoResult> {
  const { createGifSink } = await import('./gifSink')
  const { options, signal } = job
  const { timeline, frame, frames } = prepared
  const fps = options.fps
  const framesStartAt = { value: deps.now() }
  const report = progressReporter(job, deps, startedAt, framesStartAt, { sound: 0, finishing: 0.03 })
  const sink = await createGifSink({ width: frame.width, height: frame.height, loops: options.loops, dither: options.dither, maxBytes: GIF_MAX_BYTES }, deps.gifWorker)
  const composer = new FrameComposer({ frame, fit: options.fit, loadContext: job.host.loadContext, readback: true, media: exportSources })
  try {
    const cursor = new FrameCursor(timeline, fps)
    const slicer = new Slicer()
    let previous: FramePlan | null = null
    for (let i = 0; i < frames; i++) {
      throwIfAborted(signal)
      const plan = cursor.at(i)
      const delay = Math.max(1, gifDelayCs(i, fps, timeline.totalMs))
      if (repeatsPrevious(plan, previous)) {
        sink.extend(delay)
      } else {
        await composer.draw(plan)
        await sink.push(composer.pixels().data, delay)
      }
      previous = plan
      report('frames', i + 1, frames, 0, sink.bytes)
      await slicer.tick()
    }
    throwIfAborted(signal)
    report('finishing', frames, frames, 0, sink.bytes, true)
    const { blob, frames: stored } = await sink.finish()
    return {
      blob,
      filename: fileNameFor(job.title, 'gif'),
      mime: 'image/gif',
      format: 'gif',
      durationMs: timeline.totalMs,
      width: frame.width,
      height: frame.height,
      fps,
      frames: stored,
      video: 'GIF',
      audio: null,
      warnings: [],
      elapsedMs: deps.now() - startedAt,
    }
  } catch (error) {
    if (error instanceof GifTooLargeError) throw new VideoExportError('gif-too-large', 'The GIF has grown too large.')
    throw error
  } finally {
    sink.dispose()
    composer.dispose()
  }
}
