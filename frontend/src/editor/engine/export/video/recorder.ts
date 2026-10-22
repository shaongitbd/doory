/**
 * The fallback for browsers that cannot encode video frame by frame (no `VideoEncoder`): the design is played on a
 * canvas in real time and `MediaRecorder` records the canvas's capture stream, with the sound of the design on an
 * audio track. A recording takes as long as the video, a busy or hidden tab drops frames (the picture keeps the
 * right time, it only loses smoothness), and the browser decides the codec and the bitrate's fine print. Chromium
 * writes a WebM without a length; `webmDuration` puts it back so players can show and seek the whole file.
 */
import { VideoExportError, throwIfAborted } from './errors'
import { videoBitrate } from './estimate'
import { FrameComposer } from './composer'
import { FrameCursor } from './schedule'
import { Slicer } from './slicer'
import { AUDIO_RATE, type Deps, type Prepared, type VideoJob, type VideoResult, type VideoWarning, fileNameFor } from './types'
import { clipSoundOf, slotDurationsMs } from './timeline'
import { patchWebmDuration } from './webmDuration'
import { exportSources } from './clipDecoder'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface CaptureTrack extends MediaStreamTrack {
  requestFrame?(): void
}

/** Starts the sound of the design on a stream destination; `null` when the browser will not run an audio context. */
async function soundTrack(job: VideoJob, prepared: Prepared, deps: Deps): Promise<{ track: MediaStreamTrack; start(): void; close(): void } | null> {
  if (typeof AudioContext === 'undefined') return null
  const mix = await deps.mix(job.document, slotDurationsMs(job.document.pages.length, prepared.timeline), AUDIO_RATE, { load: job.host.loadSound, signal: job.signal, extraTracks: clipSoundOf(prepared.timeline) })
  const context = new AudioContext({ sampleRate: AUDIO_RATE })
  await context.resume().catch(() => undefined)
  if (context.state !== 'running') {
    void context.close()
    return null
  }
  const destination = context.createMediaStreamDestination()
  const source = context.createBufferSource()
  source.buffer = mix
  source.connect(destination)
  return {
    track: destination.stream.getAudioTracks()[0],
    start: () => source.start(),
    close: () => void context.close(),
  }
}

export async function runRecorder(job: VideoJob, prepared: Prepared, mime: string, deps: Deps, startedAt: number): Promise<VideoResult> {
  const { options, signal } = job
  const { timeline, frame, frames } = prepared
  const fps = options.fps
  const warnings: VideoWarning[] = ['real-time']
  const composer = new FrameComposer({ frame, fit: options.fit, loadContext: job.host.loadContext, readback: false, media: exportSources })
  const canvas = document.createElement('canvas')
  canvas.width = frame.width
  canvas.height = frame.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new VideoExportError('unsupported', 'This browser cannot draw on a canvas.')
  const stream = canvas.captureStream(0)
  const video = stream.getVideoTracks()[0] as CaptureTrack
  let sound: Awaited<ReturnType<typeof soundTrack>> = null
  let recorder: MediaRecorder | null = null
  try {
    if (prepared.hasSound) {
      sound = await soundTrack(job, prepared, deps)
      if (sound) stream.addTrack(sound.track)
      else warnings.push('no-audio')
    }
    throwIfAborted(signal)
    const chunks: Blob[] = []
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: videoBitrate('vp9', frame, fps, options.quality) })
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    const stopped = new Promise<void>((resolve, reject) => {
      recorder!.onstop = () => resolve()
      recorder!.onerror = () => reject(new VideoExportError('encoder', 'The browser stopped recording.'))
    })
    // The first page is prepared before the clock starts, so the recording begins with a picture.
    const cursor = new FrameCursor(timeline, fps)
    ctx.drawImage(await composer.draw(cursor.at(0)), 0, 0, frame.width, frame.height)
    recorder.start(500)
    sound?.start()
    const began = performance.now()
    const slicer = new Slicer()
    let drawn = -1
    let captured = 0
    for (;;) {
      throwIfAborted(signal)
      const elapsed = performance.now() - began
      if (elapsed >= timeline.totalMs) break
      const i = Math.min(frames - 1, Math.floor((elapsed * fps) / 1000))
      if (i !== drawn) {
        ctx.drawImage(await composer.draw(cursor.at(i)), 0, 0, frame.width, frame.height)
        video.requestFrame?.()
        drawn = i
        captured += 1
        job.onProgress?.({ stage: 'frames', fraction: Math.min(0.97, elapsed / timeline.totalMs), frame: i + 1, frames, elapsedMs: deps.now() - startedAt, etaMs: Math.max(0, Math.round(timeline.totalMs - elapsed)), bytes: null })
      }
      await slicer.tick()
      await sleep(Math.max(1, 1000 / fps / 2))
    }
    job.onProgress?.({ stage: 'finishing', fraction: 1, frame: frames, frames, elapsedMs: deps.now() - startedAt, etaMs: 0, bytes: null })
    recorder.stop()
    await stopped
    const type = mime.split(';')[0]
    let blob = new Blob(chunks, { type })
    if (type === 'video/webm') blob = await patchWebmDuration(blob, timeline.totalMs)
    return {
      blob,
      filename: fileNameFor(job.title, type === 'video/mp4' ? 'mp4' : 'webm'),
      mime: type,
      format: type === 'video/mp4' ? 'mp4' : 'webm',
      durationMs: timeline.totalMs,
      width: frame.width,
      height: frame.height,
      fps,
      frames: captured,
      video: 'MediaRecorder',
      audio: sound ? 'MediaRecorder' : null,
      warnings,
      elapsedMs: deps.now() - startedAt,
    }
  } finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    for (const track of stream.getTracks()) track.stop()
    sound?.close()
    composer.dispose()
  }
}
