/**
 * The exporter's clip source: the exact picture of a clip at each frame of the video, decoded with WebCodecs.
 *
 * The server makes every clip an H.264 MP4 with its index first and a key frame at least every two seconds, so the clip
 * is demuxed once (mp4box.js, while it downloads) into its encoded samples, and frames are decoded forward as the
 * export asks for later and later times. A loop or a trim that goes back restarts from the key frame at or before the
 * time wanted. Only one decoded picture is held at a time (plus the few the decoder hands over ahead of it).
 *
 * Where WebCodecs can't decode the clip (no `VideoDecoder`, or the codec isn't supported), the clip is played by a
 * `<video>` that seeks to each frame instead: slower and less exact, but it works everywhere.
 */
import type { ClipFrameSource, ClipMedia, ClipMediaFactory } from '../../../animation/clipSource'
import { createElementSource } from '../../../clips/elementSource'

export interface EncodedSample {
  /** Presentation time, µs. */
  timestampUs: number
  durationUs: number
  key: boolean
  data: Uint8Array<ArrayBuffer>
}

export interface Demuxed {
  config: VideoDecoderConfig
  /** In decoding order. */
  samples: EncodedSample[]
}

export class ClipDecodeError extends Error {
  constructor(message = 'A video clip could not be read.') {
    super(message)
    this.name = 'ClipDecodeError'
  }
}

/** How many samples the decoder is given ahead, and how many decoded pictures may wait to be shown. */
const QUEUE_AHEAD = 6
/** How long to wait for the decoder before feeding it again anyway, ms. */
const WAKE_MS = 250

/** The last key sample at or before `timestampUs` (0 when there is none before it). */
export function keyIndexAtOrBefore(samples: readonly Pick<EncodedSample, 'timestampUs' | 'key'>[], timestampUs: number): number {
  let found = 0
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].key && samples[i].timestampUs <= timestampUs) found = i
    // Samples are in decoding order; a key sample far beyond the time ends the search.
    if (samples[i].key && samples[i].timestampUs > timestampUs) break
  }
  return found
}

/** The codec's own description (the `avcC` box of the sample entry, without its header), as `VideoDecoder` wants it. */
async function describe(file: { getTrackById(id: number): unknown }, trackId: number): Promise<Uint8Array | undefined> {
  const { DataStream, Endianness } = await import('mp4box')
  const trak = file.getTrackById(trackId) as { mdia?: { minf?: { stbl?: { stsd?: { entries?: Record<string, { write?(s: unknown): void } | undefined>[] } } } } }
  for (const entry of trak.mdia?.minf?.stbl?.stsd?.entries ?? []) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C
    if (box?.write) {
      const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN)
      box.write(stream)
      return new Uint8Array(stream.buffer, 8)
    }
  }
  return undefined
}

/** Downloads a clip and splits it into its encoded video samples. */
export async function demux(url: string, signal?: AbortSignal): Promise<Demuxed> {
  const { createFile, MP4BoxBuffer } = await import('mp4box')
  const file = createFile()
  const samples: EncodedSample[] = []
  let failure: Error | null = null
  let ready: Promise<VideoDecoderConfig> | null = null
  file.onError = (_module: string, message: string) => {
    failure = new ClipDecodeError(`A video clip could not be read: ${message}`)
  }
  file.onReady = (info) => {
    const track = info.videoTracks[0]
    if (!track) {
      failure = new ClipDecodeError('A video clip has no video in it.')
      return
    }
    ready = describe(file, track.id).then((description) => ({
      codec: track.codec,
      codedWidth: track.video?.width ?? track.track_width,
      codedHeight: track.video?.height ?? track.track_height,
      ...(description ? { description } : {}),
    }))
    file.setExtractionOptions(track.id, undefined, { nbSamples: 250 })
    file.start()
  }
  file.onSamples = (id, _user, list) => {
    for (const sample of list) {
      if (!sample.data) continue
      samples.push({
        timestampUs: Math.round((sample.cts * 1_000_000) / sample.timescale),
        durationUs: Math.round((sample.duration * 1_000_000) / sample.timescale),
        key: sample.is_sync,
        data: sample.data,
      })
    }
    if (list.length > 0) file.releaseUsedSamples(id, list[list.length - 1].number + 1)
  }

  const response = await fetch(url, { signal, credentials: 'same-origin' })
  if (!response.ok || !response.body) throw new ClipDecodeError()
  const reader = response.body.getReader()
  let offset = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = MP4BoxBuffer.fromArrayBuffer(value.slice().buffer, offset)
    offset += value.byteLength
    file.appendBuffer(chunk)
    if (failure) throw failure
  }
  file.flush()
  if (failure) throw failure
  if (!ready || samples.length === 0) throw new ClipDecodeError()
  return { config: await ready, samples }
}

/** A clip decoded frame by frame for the exporter (see the module comment). */
export class DecoderSource implements ClipFrameSource {
  private loading: Promise<Demuxed | null> | null = null
  private demuxed: Demuxed | null = null
  private decoder: VideoDecoder | null = null
  private fallback: ClipFrameSource | null = null
  /** Decoded pictures not shown yet, earliest first. */
  private queue: VideoFrame[] = []
  private current: VideoFrame | null = null
  private next = 0
  private flushed = false
  private failure: Error | null = null
  private wake: (() => void) | null = null
  private shown = 0
  private disposed = false

  constructor(
    private readonly media: ClipMedia,
    private readonly onFrame: () => void,
    private readonly loader: (url: string) => Promise<Demuxed> = demux,
  ) {}

  get version(): number {
    return this.fallback ? this.fallback.version : this.shown
  }

  want(ms: number, moving: boolean): void {
    this.fallback?.want(ms, moving)
  }

  frame(): CanvasImageSource | null {
    return this.fallback ? this.fallback.frame() : this.current
  }

  setClock(playing: boolean, rate: number): void {
    this.fallback?.setClock(playing, rate)
  }

  suspend(): void {
    this.fallback?.suspend()
  }

  dispose(): void {
    this.disposed = true
    this.reset()
    this.current?.close()
    this.current = null
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close()
    this.decoder = null
    this.fallback?.dispose()
    this.wake?.()
  }

  async ready(ms: number): Promise<void> {
    const demuxed = await this.load()
    if (this.fallback) return this.fallback.ready(ms)
    if (!demuxed || !this.decoder) return
    const target = Math.round(ms * 1000)
    const { samples } = demuxed
    const showing = this.current
    const span = showing ? (showing.duration ?? samples[0]?.durationUs ?? 33_333) : 0
    if (showing && showing.timestamp <= target && target < showing.timestamp + span) return
    const key = keyIndexAtOrBefore(samples, target)
    if (!showing || target < showing.timestamp || key > this.next) this.seek(key)
    for (;;) {
      if (this.failure) throw this.failure
      if (this.disposed) return
      this.take(target)
      // The picture shown is the one for `target` once the decoder has handed over a later one (or has none left).
      if (this.current && (this.queue.length > 0 || this.flushed)) return
      if (this.flushed) return
      if (this.next >= samples.length) {
        await this.decoder.flush().catch((error: unknown) => {
          this.failure ??= error instanceof Error ? error : new ClipDecodeError()
        })
        this.flushed = true
        continue
      }
      // Bounded both ways: decoded pictures hold the decoder's memory until they are closed.
      while (this.next < samples.length && this.decoder.decodeQueueSize < QUEUE_AHEAD && this.queue.length < QUEUE_AHEAD) {
        const sample = samples[this.next++]
        this.decoder.decode(new EncodedVideoChunk({ type: sample.key ? 'key' : 'delta', timestamp: sample.timestampUs, duration: sample.durationUs, data: sample.data }))
      }
      await this.sleep()
    }
  }

  /** Moves every decoded picture at or before `target` to the front (the last of them is shown). */
  private take(target: number): void {
    while (this.queue.length > 0 && (this.queue[0].timestamp <= target || !this.current)) {
      const frame = this.queue.shift() as VideoFrame
      this.current?.close()
      this.current = frame
      this.shown++
      if (frame.timestamp > target) break // nothing earlier exists: the clip's first picture
    }
  }

  private seek(index: number): void {
    if (!this.decoder || !this.demuxed) return
    this.reset()
    // The picture shown belongs to another time: the first one decoded from the key sample replaces it.
    this.current?.close()
    this.current = null
    this.decoder.configure(this.demuxed.config)
    this.next = index
    this.flushed = false
  }

  private reset(): void {
    for (const frame of this.queue) frame.close()
    this.queue = []
    if (this.decoder && this.decoder.state === 'configured') this.decoder.reset()
  }

  private sleep(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => done(), WAKE_MS)
      const done = (): void => {
        clearTimeout(timer)
        if (this.wake === done) this.wake = null
        resolve()
      }
      this.wake = done
    })
  }

  private load(): Promise<Demuxed | null> {
    this.loading ??= (async () => {
      try {
        const demuxed = await this.loader(this.media.url)
        const support = await VideoDecoder.isConfigSupported(demuxed.config).catch(() => null)
        if (!support?.supported) {
          this.useFallback()
          return null
        }
        this.demuxed = demuxed
        this.decoder = new VideoDecoder({
          output: (frame) => {
            if (this.disposed) {
              frame.close()
              return
            }
            // Output comes in presentation order; keep it sorted anyway.
            let at = this.queue.length
            while (at > 0 && this.queue[at - 1].timestamp > frame.timestamp) at--
            this.queue.splice(at, 0, frame)
            this.wake?.()
          },
          error: (error) => {
            this.failure = new ClipDecodeError(`A video clip could not be decoded: ${error.message}`)
            this.wake?.()
          },
        })
        this.decoder.addEventListener('dequeue', () => this.wake?.())
        this.decoder.configure(demuxed.config)
        return demuxed
      } catch (error) {
        if (error instanceof ClipDecodeError) throw error
        // Not an MP4 this demuxer understands (an older clip, a browser without streams): play it instead.
        this.useFallback()
        return null
      }
    })()
    return this.loading
  }

  private useFallback(): void {
    this.fallback ??= createElementSource(this.media, this.onFrame)
  }
}

/** The sources the exporter hands to the frame renderer: decoded where WebCodecs can, seeked otherwise. */
export const exportSources: ClipMediaFactory = (media, onFrame) =>
  typeof VideoDecoder === 'function' && typeof EncodedVideoChunk === 'function' ? new DecoderSource(media, onFrame) : createElementSource(media, onFrame)
