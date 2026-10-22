import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AudioTrack } from '@/types/document'
import { buildClock } from './clock'
import { createBlankDocument } from '@/lib/document'
import { type PcmSource, mixAudio, renderMixPure } from './mixer'
import { DUCK_ATTACK_MS, DUCK_GAIN } from './model'
import { planMix } from './plan'

const RATE = 8000

/** A source of constant value `level` lasting `seconds`, or a ramp when `ramp` is set (sample i = i / length). */
function source(seconds: number, options: { level?: number; ramp?: boolean; rate?: number; channels?: number; right?: number } = {}): PcmSource {
  const rate = options.rate ?? RATE
  const length = Math.round(seconds * rate)
  const channels = options.channels ?? 1
  const data = Array.from({ length: channels }, (_, c) =>
    Float32Array.from({ length }, (_, i) => (options.ramp ? i / length : c === 1 && options.right !== undefined ? options.right : (options.level ?? 1))),
  )
  return { sampleRate: rate, numberOfChannels: channels, length, getChannelData: (c) => data[c] }
}

const track = (patch: Partial<AudioTrack> = {}): AudioTrack => ({
  id: 't',
  kind: 'sfx',
  name: 't',
  src: '/media/a.ogg',
  scope: { type: 'design' },
  startMs: 0,
  durationMs: 1000,
  trimStartMs: 0,
  trimEndMs: 1000,
  volume: 1,
  fadeInMs: 0,
  fadeOutMs: 0,
  loop: false,
  muted: false,
  ...patch,
})

const clock = buildClock(['a', 'b'], [2000, 3000]) // 5 s

function render(tracks: AudioTrack[], sources: Record<string, PcmSource>, rate = RATE, pageClock = clock) {
  return renderMixPure(planMix(tracks, pageClock), new Map(Object.entries(sources)), rate)
}

const at = (mix: ReturnType<typeof render>, ms: number, channel: 0 | 1 = 0): number => mix.channels[channel][Math.floor((ms * mix.sampleRate) / 1000)]
const peak = (mix: ReturnType<typeof render>): number => Math.max(...mix.channels[0].map(Math.abs), ...mix.channels[1].map(Math.abs))

describe('renderMixPure', () => {
  it('is exactly as long as the pages together', () => {
    const mix = render([], {})
    expect(mix.length).toBe(5 * RATE)
    expect(mix.numberOfChannels).toBe(2)
    expect(peak(mix)).toBe(0)
  })

  it('is silent where nothing plays and copies a sound where it plays', () => {
    const mix = render([track({ startMs: 1000 })], { t: source(1, { level: 0.5 }) })
    expect(at(mix, 500)).toBe(0)
    expect(at(mix, 1500)).toBeCloseTo(0.5)
    expect(at(mix, 2500)).toBe(0)
    expect(peak(mix)).toBeCloseTo(0.5)
  })

  it('applies the volume', () => {
    expect(peak(render([track({ volume: 0.25 })], { t: source(1) }))).toBeCloseTo(0.25)
  })

  it('puts a mono sound in both channels and keeps a stereo sound apart', () => {
    const mono = render([track()], { t: source(1, { level: 0.6 }) })
    expect([at(mono, 100, 0), at(mono, 100, 1)]).toEqual([expect.closeTo(0.6), expect.closeTo(0.6)])
    const stereo = render([track()], { t: source(1, { channels: 2, level: 0.9, right: 0.3 }) })
    expect(at(stereo, 100, 0)).toBeCloseTo(0.9)
    expect(at(stereo, 100, 1)).toBeCloseTo(0.3)
  })

  it('adds simultaneous sounds', () => {
    const mix = render([track({ id: 'a' }), track({ id: 'b' })], { a: source(1, { level: 0.2 }), b: source(1, { level: 0.3 }) })
    expect(at(mix, 400)).toBeCloseTo(0.5)
  })

  it('plays the trimmed part of the source', () => {
    const mix = render([track({ trimStartMs: 500, trimEndMs: 750 })], { t: source(1, { ramp: true }) })
    expect(at(mix, 0)).toBeCloseTo(0.5, 2)
    expect(at(mix, 240)).toBeCloseTo(0.74, 2)
    expect(at(mix, 300)).toBe(0) // the sound is only 250 ms long
  })

  it('loops the trimmed part until the end of the design', () => {
    const mix = render([track({ loop: true, trimStartMs: 0, trimEndMs: 500 })], { t: source(1, { ramp: true }) })
    expect(at(mix, 100)).toBeCloseTo(0.1, 2)
    expect(at(mix, 600)).toBeCloseTo(0.1, 2) // one wrap later
    expect(at(mix, 4600)).toBeCloseTo(0.1, 2)
    expect(at(mix, 4990)).toBeCloseTo(0.49, 2)
  })

  it('starts a page track with its page and cuts it when the page ends', () => {
    const mix = render([track({ loop: true, scope: { type: 'page', pageId: 'b' }, startMs: 250 })], { t: source(1, { level: 0.5 }) })
    expect(at(mix, 2100)).toBe(0)
    expect(at(mix, 2300)).toBeCloseTo(0.5)
    expect(at(mix, 4900)).toBeCloseTo(0.5)
    const early = render([track({ loop: true, scope: { type: 'page', pageId: 'a' } })], { t: source(1, { level: 0.5 }) })
    expect(at(early, 1900)).toBeCloseTo(0.5)
    expect(at(early, 2100)).toBe(0)
  })

  it('fades in and out linearly', () => {
    const mix = render([track({ loop: true, fadeInMs: 1000, fadeOutMs: 1000 })], { t: source(1, { level: 1 }) })
    expect(at(mix, 0)).toBeCloseTo(0, 2)
    expect(at(mix, 500)).toBeCloseTo(0.5, 2)
    expect(at(mix, 1000)).toBeCloseTo(1, 2)
    expect(at(mix, 2500)).toBeCloseTo(1, 2)
    expect(at(mix, 4500)).toBeCloseTo(0.5, 2)
    expect(at(mix, 4999)).toBeCloseTo(0, 2)
  })

  it('lowers music under a voiceover and brings it back', () => {
    const tracks = [track({ id: 'm', kind: 'music', loop: true, volume: 0.8 }), track({ id: 'v', kind: 'voiceover', startMs: 2000, trimEndMs: 1000, volume: 0 })]
    // The voiceover is silent here (volume 0) so only the music is measured; it must not duck for a silent voiceover.
    const silent = render(tracks, { m: source(1, { level: 1 }), v: source(1) })
    expect(at(silent, 2500)).toBeCloseTo(0.8)
    const loud = render([tracks[0], { ...tracks[1], volume: 0.001 }], { m: source(1, { level: 1 }), v: source(1, { level: 0 }) })
    expect(at(loud, 1500)).toBeCloseTo(0.8)
    expect(at(loud, 2000 + DUCK_ATTACK_MS + 50)).toBeCloseTo(0.8 * DUCK_GAIN, 2)
    expect(at(loud, 4500)).toBeCloseTo(0.8)
  })

  it('does not play muted or silent tracks or tracks without a source', () => {
    const mix = render([track({ id: 'a', muted: true }), track({ id: 'b', volume: 0 }), track({ id: 'c' })], { a: source(1), b: source(1) })
    expect(peak(mix)).toBe(0)
  })

  it('resamples a source recorded at another rate', () => {
    const mix = render([track()], { t: source(1, { ramp: true, rate: 16_000 }) })
    expect(at(mix, 500)).toBeCloseTo(0.5, 2)
    expect(at(mix, 900)).toBeCloseTo(0.9, 2)
  })

  it('renders at the sample rate it is asked for', () => {
    const mix = render([track({ loop: true })], { t: source(1, { level: 0.5 }) }, 44_100)
    expect(mix.length).toBe(5 * 44_100)
    expect(mix.sampleRate).toBe(44_100)
    expect(mix.channels[0][44_100 * 3]).toBeCloseTo(0.5)
  })

  it('keeps the sum inside what the tracks add up to (no hidden gain)', () => {
    const mix = render([track({ id: 'a', loop: true, volume: 0.4 }), track({ id: 'b', loop: true, volume: 0.4 })], { a: source(1, { level: 1 }), b: source(1, { level: 1 }) })
    expect(peak(mix)).toBeCloseTo(0.8)
  })

  it('copies samples exactly when the rates match and the start is on a sample', () => {
    const data = Float32Array.from({ length: RATE }, (_, i) => Math.sin(i / 7))
    const pcm: PcmSource = { sampleRate: RATE, numberOfChannels: 1, length: RATE, getChannelData: () => data }
    const mix = render([track({ startMs: 500 })], { t: pcm })
    const offset = Math.round(0.5 * RATE)
    for (const i of [0, 1, 17, 1000, RATE - 1]) expect(mix.channels[0][offset + i]).toBeCloseTo(data[i], 6)
  })
})

describe('mixAudio', () => {
  const doc = (tracks: AudioTrack[]) => {
    const blank = createBlankDocument(800, 600)
    return { ...blank, pages: [{ ...blank.pages[0], id: 'a' }, { ...blank.pages[0], id: 'b' }], audioTracks: tracks }
  }
  const pcm = (): AudioBuffer => source(1, { level: 0.5 }) as unknown as AudioBuffer

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refuses a sample rate outside what the browser can render', async () => {
    await expect(mixAudio(doc([]), [1000, 1000], 4000)).rejects.toBeInstanceOf(RangeError)
    await expect(mixAudio(doc([]), [1000, 1000], 400_000)).rejects.toBeInstanceOf(RangeError)
  })

  it('refuses a design longer than half an hour', async () => {
    await expect(mixAudio(doc([]), [20 * 60_000, 11 * 60_000], 48000)).rejects.toMatchObject({ name: 'AudioLoadError', code: 'too-long' })
  })

  it('names the track whose file cannot be loaded', async () => {
    const load = vi.fn(async () => {
      throw new Error('no')
    })
    await expect(mixAudio(doc([track({ id: 'x', name: 'Lost song' })]), [1000, 1000], 48000, { load })).rejects.toThrow()
    expect(load).toHaveBeenCalledOnce()
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(mixAudio(doc([track({ id: 'x' })]), [1000, 1000], 48000, { load: async () => pcm(), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('mixes in tracks that are not the document’s own (the sound of video clips)', async () => {
    class Buffer {
      readonly channels: Float32Array[]
      constructor(readonly options: { length: number; sampleRate: number; numberOfChannels: number }) {
        this.channels = Array.from({ length: options.numberOfChannels }, () => new Float32Array(options.length))
      }
      get length(): number {
        return this.options.length
      }
      get sampleRate(): number {
        return this.options.sampleRate
      }
      copyToChannel(data: Float32Array, channel: number): void {
        this.channels[channel].set(data)
      }
      getChannelData(channel: number): Float32Array {
        return this.channels[channel]
      }
    }
    vi.stubGlobal('AudioBuffer', Buffer)
    vi.stubGlobal('OfflineAudioContext', undefined)
    const document = doc([])
    const clip = track({ id: 'video:c1', startMs: 500, volume: 0.5 })
    const load = vi.fn(async () => pcm())
    const mix = await mixAudio(document, [1000, 1000], 8000, { load, extraTracks: [clip] })
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ id: 'video:c1' }), undefined)
    expect(mix.getChannelData(0)[100]).toBe(0) // before the clip's start
    expect(mix.getChannelData(0)[5000]).toBeCloseTo(0.25, 5) // a 0.5 source at half volume
    expect(document.audioTracks ?? []).toHaveLength(0)
  })

  it('reports progress up to one and mixes by plain arithmetic where there is no OfflineAudioContext', async () => {
    class Buffer {
      readonly channels: Float32Array[]
      constructor(readonly options: { length: number; sampleRate: number; numberOfChannels: number }) {
        this.channels = Array.from({ length: options.numberOfChannels }, () => new Float32Array(options.length))
      }
      get length(): number {
        return this.options.length
      }
      get sampleRate(): number {
        return this.options.sampleRate
      }
      copyToChannel(data: Float32Array, channel: number): void {
        this.channels[channel].set(data)
      }
      getChannelData(channel: number): Float32Array {
        return this.channels[channel]
      }
    }
    vi.stubGlobal('AudioBuffer', Buffer)
    vi.stubGlobal('OfflineAudioContext', undefined)
    const progress: number[] = []
    const mix = await mixAudio(doc([track({ id: 'x', volume: 0.5 })]), [1000, 1000], 8000, { load: async () => pcm(), onProgress: (p) => progress.push(p) })
    expect(mix.length).toBe(16_000)
    expect(mix.getChannelData(0)[100]).toBeCloseTo(0.25, 5)
    expect(mix.getChannelData(1)[100]).toBeCloseTo(0.25, 5)
    expect(mix.getChannelData(0)[9000]).toBe(0)
    expect(progress.at(-1)).toBe(1)
    expect([...progress].sort((a, b) => a - b)).toEqual(progress)
  })
})
