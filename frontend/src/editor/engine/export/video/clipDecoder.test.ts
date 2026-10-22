import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Demuxed, DecoderSource, demux, keyIndexAtOrBefore } from './clipDecoder'

/** A stand-in for mp4box: `mp4.onAppend` plays what the demuxer would report for a chunk of the file. */
interface FakeMp4File {
  onReady?: (info: unknown) => void
  onSamples?: (id: number, user: unknown, samples: unknown[]) => void
  onError?: (module: string, message: string) => void
}
const mp4 = vi.hoisted(() => ({ onAppend: null as ((file: FakeMp4File) => void) | null }))
vi.mock('mp4box', () => ({
  createFile: () => {
    const file: FakeMp4File & Record<string, unknown> = {
      getTrackById: () => ({}),
      setExtractionOptions: () => undefined,
      start: () => undefined,
      flush: () => undefined,
      releaseUsedSamples: () => undefined,
      appendBuffer: () => mp4.onAppend?.(file),
    }
    return file
  },
  MP4BoxBuffer: { fromArrayBuffer: (buffer: ArrayBuffer) => buffer },
  DataStream: class {},
  Endianness: { BIG_ENDIAN: 0 },
}))

/** A download of `chunks` chunks; `cancel` says whether it was stopped. */
function download(chunks: number) {
  let left = chunks
  const reader = {
    read: vi.fn(async () => (left-- > 0 ? { done: false, value: new Uint8Array(8) } : { done: true, value: undefined })),
    cancel: vi.fn(async () => undefined),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, body: { getReader: () => reader } })),
  )
  return reader
}

/** A sample every 100 ms of source, a key sample every second. */
function demuxed(seconds = 3): Demuxed {
  const samples = Array.from({ length: seconds * 10 }, (_, i) => ({ timestampUs: i * 100_000, durationUs: 100_000, key: i % 10 === 0, data: new Uint8Array([i]) }))
  return { config: { codec: 'avc1.64001f', codedWidth: 16, codedHeight: 9 }, samples }
}

class FakeFrame {
  closed = false
  constructor(
    readonly timestamp: number,
    readonly duration: number,
  ) {}
  close(): void {
    this.closed = true
  }
}

/** Decodes at once: each chunk comes back as a frame with its timestamp (no reordering). */
class FakeDecoder {
  static instances: FakeDecoder[] = []
  state = 'unconfigured'
  decodeQueueSize = 0
  decoded: number[] = []
  resets = 0
  private listeners: (() => void)[] = []
  constructor(readonly init: { output(frame: unknown): void; error(e: Error): void }) {
    FakeDecoder.instances.push(this)
  }
  static isConfigSupported = vi.fn(async () => ({ supported: true }))
  configure(): void {
    this.state = 'configured'
  }
  decode(chunk: { timestamp: number; duration: number }): void {
    this.decoded.push(chunk.timestamp)
    this.decodeQueueSize++
    queueMicrotask(() => {
      this.decodeQueueSize--
      this.init.output(new FakeFrame(chunk.timestamp, chunk.duration))
    })
  }
  async flush(): Promise<void> {}
  reset(): void {
    this.resets++
    this.state = 'unconfigured'
  }
  close(): void {
    this.state = 'closed'
  }
  addEventListener(_type: string, listener: () => void): void {
    this.listeners.push(listener)
  }
}

class FakeChunk {
  readonly timestamp: number
  readonly duration: number
  constructor(init: { timestamp: number; duration: number }) {
    this.timestamp = init.timestamp
    this.duration = init.duration
  }
}

function source(data = demuxed()) {
  vi.stubGlobal('VideoDecoder', FakeDecoder)
  vi.stubGlobal('EncodedVideoChunk', FakeChunk)
  FakeDecoder.instances = []
  const loader = vi.fn(async () => data)
  return { src: new DecoderSource({ url: '/media/c.mp4', speed: 1 }, () => undefined, loader), loader }
}

const shownAt = (src: DecoderSource): number | null => (src.frame() as unknown as FakeFrame | null)?.timestamp ?? null

describe('finding where to decode from', () => {
  it('starts at the key sample at or before the time', () => {
    const { samples } = demuxed()
    expect(keyIndexAtOrBefore(samples, 0)).toBe(0)
    expect(keyIndexAtOrBefore(samples, 1_500_000)).toBe(10)
    expect(keyIndexAtOrBefore(samples, 2_999_999)).toBe(20)
    expect(keyIndexAtOrBefore(samples, -5)).toBe(0)
  })
})

describe('demuxing a clip', () => {
  afterEach(() => {
    mp4.onAppend = null
    vi.unstubAllGlobals()
  })

  it('stops the download when the file cannot be read', async () => {
    const reader = download(5)
    mp4.onAppend = (file) => file.onError?.('isofile', 'bad box')
    await expect(demux('/media/c.mp4')).rejects.toThrow('bad box')
    expect(reader.read).toHaveBeenCalledOnce()
    expect(reader.cancel).toHaveBeenCalled()
  })
})

describe('the exporter’s clip source', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the picture of each time, decoding forward', async () => {
    const { src, loader } = source()
    await src.ready(0)
    expect(shownAt(src)).toBe(0)
    await src.ready(250)
    expect(shownAt(src)).toBe(200_000)
    const versions = src.version
    await src.ready(260) // still the same picture: nothing is decoded again
    expect(src.version).toBe(versions)
    await src.ready(550)
    expect(shownAt(src)).toBe(500_000)
    expect(loader).toHaveBeenCalledOnce()
    // Small steps forward keep decoding where it was: the decoder was set up once.
    expect(FakeDecoder.instances[0].resets).toBe(1)
  })

  it('jumps ahead from the nearest key sample instead of decoding everything between', async () => {
    const { src } = source()
    await src.ready(0)
    await src.ready(2550)
    expect(shownAt(src)).toBe(2_500_000)
    const decoded = FakeDecoder.instances[0].decoded
    expect(decoded).toContain(2_000_000)
    expect(decoded).not.toContain(1_000_000)
  })

  it('goes back (a loop, a trim) from the key sample before the time', async () => {
    const { src } = source()
    await src.ready(2550)
    await src.ready(1150)
    expect(shownAt(src)).toBe(1_100_000)
  })

  it('shows the first picture for a time before it and the last after the end', async () => {
    const data = demuxed(1)
    data.samples = data.samples.map((s) => ({ ...s, timestampUs: s.timestampUs + 40_000 }))
    const { src } = source(data)
    await src.ready(0)
    expect(shownAt(src)).toBe(40_000)
    await src.ready(5000)
    expect(shownAt(src)).toBe(940_000)
  })

  it('says the decoder failed even when the picture asked for is already shown', async () => {
    const { src } = source()
    await src.ready(0)
    FakeDecoder.instances[0].init.error(new Error('broken'))
    await expect(src.ready(0)).rejects.toThrow('broken')
  })

  it('stops loading when it is let go of meanwhile, and makes nothing for it', async () => {
    vi.stubGlobal('VideoDecoder', FakeDecoder)
    vi.stubGlobal('EncodedVideoChunk', FakeChunk)
    FakeDecoder.instances = []
    let finish: (data: Demuxed) => void = () => undefined
    const loader = vi.fn((_url: string, _signal?: AbortSignal) => new Promise<Demuxed>((resolve) => (finish = resolve)))
    const src = new DecoderSource({ url: '/media/c.mp4', speed: 1 }, () => undefined, loader)
    const ready = src.ready(0)
    src.dispose()
    expect(loader.mock.calls[0][1]?.aborted).toBe(true)
    finish(demuxed())
    await ready
    expect(FakeDecoder.instances).toHaveLength(0)
    expect(src.frame()).toBeNull()
  })

  it('makes no stand-in player when the stopped download fails', async () => {
    vi.stubGlobal('VideoDecoder', FakeDecoder)
    vi.stubGlobal('EncodedVideoChunk', FakeChunk)
    let fail: (error: Error) => void = () => undefined
    const loader = vi.fn(() => new Promise<Demuxed>((_resolve, reject) => (fail = reject)))
    const src = new DecoderSource({ url: '/media/gone.mp4', speed: 1 }, () => undefined, loader)
    const ready = src.ready(0)
    src.dispose()
    fail(new DOMException('Aborted', 'AbortError'))
    await ready
    expect(document.querySelector('#doory-clip-sources video[src$="gone.mp4"]')).toBeNull()
  })

  it('closes every picture it lets go of', async () => {
    const { src } = source()
    await src.ready(0)
    const first = src.frame() as unknown as FakeFrame
    await src.ready(500)
    expect(first.closed).toBe(true)
    const last = src.frame() as unknown as FakeFrame
    src.dispose()
    expect(last.closed).toBe(true)
    expect(FakeDecoder.instances[0].state).toBe('closed')
  })

  it('plays the clip in a video element when the codec is not supported', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    const { src } = source()
    FakeDecoder.isConfigSupported.mockResolvedValueOnce({ supported: false })
    const ready = src.ready(0)
    // The element source waits for its <video> to load, which jsdom never does: it is enough that no decoder was made.
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(FakeDecoder.instances).toHaveLength(0)
    expect(document.querySelector('#doory-clip-sources video')).not.toBeNull()
    src.dispose()
    await ready
  })
})
