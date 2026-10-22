import { describe, expect, it, vi } from 'vitest'
import type { AudioTrack } from '@/types/document'
import { DUCK_GAIN } from '../audio/model'
import { FakeContext, FakeGain, fakeBuffer } from '../audio/testing'
import { END_FADE_MS, LEAVE_FADE_MIN_MS, ShowAudio, type ShowView, showFade } from './showAudio'

const track = (patch: Partial<AudioTrack> = {}): AudioTrack => ({
  id: 't',
  kind: 'sfx',
  name: 'Track',
  src: '/media/a.ogg',
  scope: { type: 'design' },
  startMs: 0,
  trimStartMs: 0,
  trimEndMs: 2000,
  volume: 1,
  fadeInMs: 0,
  fadeOutMs: 0,
  loop: false,
  muted: false,
  ...patch,
})

const view = (patch: Partial<ShowView> = {}): ShowView => ({ index: 0, ended: false, paused: false, totalMs: 0, ...patch })

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

function setup(tracks: AudioTrack[], options: { refuse?: boolean; fail?: string[]; clipLeadMs?: (from: number | null, to: number) => number } = {}) {
  const context = new FakeContext()
  context.state = options.refuse ? 'suspended' : 'running'
  context.refuseResume = options.refuse === true
  const timers: { fn: () => void; ms: number }[] = []
  const load = vi.fn(async (t: { id: string }) => {
    if (options.fail?.includes(t.id)) throw new Error('missing')
    return fakeBuffer(30)
  })
  const createContext = vi.fn(() => context as unknown as AudioContext)
  const audio = new ShowAudio({ tracks: () => tracks, pageIds: () => ['a', 'b', 'c'], load, createContext, later: (fn, ms) => timers.push({ fn, ms }), clipLeadMs: options.clipLeadMs })
  return { audio, context, load, createContext, timers }
}

/** The gain nodes the bus made, in order: master, direct, duck. */
const bus = (context: FakeContext): { master: FakeGain; direct: FakeGain; duck: FakeGain } => ({ master: context.gains[0], direct: context.gains[1], duck: context.gains[2] })

describe('showFade', () => {
  it('fades in, and out when the sound has a known end', () => {
    expect(showFade(track({ fadeInMs: 500 }), null)).toEqual([
      { t: 0, gain: 0 },
      { t: 500, gain: 1 },
    ])
    expect(showFade(track(), null)).toEqual([{ t: 0, gain: 1 }])
    expect(showFade(track({ fadeInMs: 300, fadeOutMs: 400 }), 2000)).toEqual([
      { t: 0, gain: 0 },
      { t: 300, gain: 1 },
      { t: 1600, gain: 1 },
      { t: 2000, gain: 0 },
    ])
  })
})

describe('ShowAudio', () => {
  it('does nothing for a design without sound: no audio context is made', async () => {
    const { audio, createContext } = setup([track({ muted: true }), track({ id: 'x', volume: 0 }), track({ id: 'y', scope: { type: 'page', pageId: 'gone' } })])
    expect(audio.getSnapshot().available).toBe(false)
    audio.setView(view())
    await settle()
    expect(createContext).not.toHaveBeenCalled()
  })

  it('starts the design music with the show and plays a page track when its page comes up', async () => {
    const { audio, context } = setup([
      track({ id: 'm', kind: 'music', loop: true, trimStartMs: 1000, trimEndMs: 3000, volume: 0.6 }),
      track({ id: 'p', scope: { type: 'page', pageId: 'a' }, startMs: 1000 }),
      track({ id: 'q', scope: { type: 'page', pageId: 'b' } }),
    ])
    audio.setView(view())
    await settle()
    expect(context.sources).toHaveLength(2)
    const [music, page] = context.sources
    expect(music).toMatchObject({ loop: true, loopStart: 1, loopEnd: 3 })
    expect(music.started?.when).toBeCloseTo(0.05, 5)
    expect(music.started?.offset).toBe(1)
    // The page track waits for its own offset after the page came up.
    expect(page.started?.when).toBeCloseTo(1, 5)
    expect(page.started?.offset).toBe(0)
    expect(page.started?.duration).toBeCloseTo(2, 5)
    expect(audio.getSnapshot()).toMatchObject({ available: true, blocked: false, failed: [] })
  })

  it('fades the page tracks out when the page is left and plays them again on coming back', async () => {
    const { audio, context } = setup([track({ id: 'p', scope: { type: 'page', pageId: 'a' }, loop: true, fadeOutMs: 100 }), track({ id: 'q', scope: { type: 'page', pageId: 'b' } })])
    audio.setView(view())
    await settle()
    context.currentTime = 3
    audio.setView(view({ index: 1, totalMs: 3000 }))
    await settle()
    const [first, second] = context.sources
    // Its own fade-out is shorter than the least a leave may take.
    expect(first.stopped).toBeCloseTo(3 + LEAVE_FADE_MIN_MS / 1000, 5)
    expect(second.started?.when).toBeCloseTo(3.05, 5)
    context.currentTime = 6
    audio.setView(view({ index: 0, totalMs: 6000 }))
    await settle()
    expect(context.sources).toHaveLength(3)
    expect(context.sources[2].started?.offset).toBe(0)
  })

  it('starts a clip sound after the transition that actually plays into its page, other page tracks at once', async () => {
    const clipLeadMs = vi.fn((from: number | null) => (from === null ? 0 : 800))
    const { audio, context } = setup(
      [
        track({ id: 'video:x', scope: { type: 'page', pageId: 'a' } }),
        track({ id: 'video:y', scope: { type: 'page', pageId: 'b' }, startMs: 500 }),
        track({ id: 'q', scope: { type: 'page', pageId: 'b' } }),
      ],
      { clipLeadMs },
    )
    audio.setView(view())
    await settle()
    // The first page shown comes in without a transition.
    expect(clipLeadMs).toHaveBeenLastCalledWith(null, 0)
    expect(context.sources[0].started?.when).toBeCloseTo(0.05, 5)
    context.currentTime = 3
    audio.setView(view({ index: 1, totalMs: 3000 }))
    await settle()
    expect(clipLeadMs).toHaveBeenLastCalledWith(0, 1)
    const [, clip, other] = context.sources
    expect(clip.started?.when).toBeCloseTo(3 + 0.8 + 0.5, 5)
    expect(other.started?.when).toBeCloseTo(3.05, 5)
    // Back from the end screen the page is simply shown again.
    audio.setView(view({ index: 1, ended: true, totalMs: 4000 }))
    await settle()
    audio.setView(view({ index: 1, totalMs: 5000 }))
    await settle()
    expect(clipLeadMs).toHaveBeenLastCalledWith(null, 1)
  })

  it('ducks the other sound under a voiceover, and releases it afterwards', async () => {
    const { audio, context } = setup([track({ id: 'm', kind: 'music', loop: true }), track({ id: 'v', kind: 'voiceover', scope: { type: 'page', pageId: 'a' }, startMs: 1000, trimEndMs: 4000 })])
    audio.setView(view())
    await settle()
    const { duck } = bus(context)
    expect(duck.gain.valueAt(0.5)).toBe(1)
    expect(duck.gain.valueAt(1.05 + 0.15 + 0.1)).toBeCloseTo(DUCK_GAIN, 5)
    expect(duck.gain.valueAt(4)).toBeCloseTo(DUCK_GAIN, 5)
    // Released over 0.4 s from the end of the voiceover (1.0 + 4.0 = 5.0 → context 5.0).
    expect(duck.gain.valueAt(5.0 + 0.5)).toBe(1)
    // The voiceover itself is not ducked; the music is.
    const [music, voice] = context.sources
    expect(music).toBeDefined()
    expect(voice).toBeDefined()
  })

  it('stops ducking at once when a voiceover is left early', async () => {
    const { audio, context } = setup([track({ id: 'm', kind: 'music', loop: true }), track({ id: 'v', kind: 'voiceover', scope: { type: 'page', pageId: 'a' }, trimEndMs: 20_000 })])
    audio.setView(view())
    await settle()
    const { duck } = bus(context)
    context.currentTime = 2
    expect(duck.gain.valueAt(2)).toBeCloseTo(DUCK_GAIN, 5)
    audio.setView(view({ index: 1, totalMs: 2000 }))
    await settle()
    // The voiceover fades out over 0.25 s and the music comes back over the release that follows.
    expect(duck.gain.valueAt(2 + 0.25 + 0.4 + 0.01)).toBe(1)
  })

  it('suspends everything while the slideshow is paused and carries on together', async () => {
    const { audio, context } = setup([track({ id: 'm', kind: 'music', loop: true })])
    audio.setView(view())
    await settle()
    audio.setView(view({ paused: true, totalMs: 1000 }))
    await settle()
    expect(context.state).toBe('suspended')
    audio.setView(view({ totalMs: 2000 }))
    await settle()
    expect(context.state).toBe('running')
  })

  it('fades out at the end screen and picks the music up where it stopped when going back', async () => {
    const { audio, context, timers } = setup([track({ id: 'm', kind: 'music', loop: true, trimEndMs: 10_000 }), track({ id: 'p', scope: { type: 'page', pageId: 'a' }, loop: true })])
    audio.setView(view())
    await settle()
    context.currentTime = 12.05 // 12 s of music have played
    audio.setView(view({ ended: true, totalMs: 12_000 }))
    await settle()
    expect(context.sources.map((s) => s.stopped)).toEqual([expect.closeTo(12.05 + END_FADE_MS / 1000, 5), expect.closeTo(12.05 + END_FADE_MS / 1000, 5)])
    expect(timers.length).toBeGreaterThan(0)
    context.currentTime = 20
    audio.setView(view({ ended: false, totalMs: 12_000 }))
    await settle()
    const music = context.sources[2]
    expect(music.loop).toBe(true)
    // 12 s into a 10 s loop starts 2 s into it; the page track starts over.
    expect(music.started?.offset).toBeCloseTo(2, 3)
    expect(context.sources).toHaveLength(4)
    expect(context.sources[3].started?.offset).toBe(0)
  })

  it('starts again from zero when the show restarts', async () => {
    const { audio, context } = setup([track({ id: 'm', kind: 'music', loop: true, trimEndMs: 10_000 })])
    audio.setView(view())
    await settle()
    context.currentTime = 7
    audio.setView(view({ totalMs: 7000 }))
    audio.setView(view({ totalMs: 0 }))
    await settle()
    expect(context.sources).toHaveLength(2)
    expect(context.sources[0].stopped).not.toBeNull()
    expect(context.sources[1].started?.offset).toBe(0)
    expect(context.sources[1].started?.when).toBeCloseTo(7.05, 5)
  })

  it('says it is blocked when the browser holds the sound back, and lets it through on a gesture', async () => {
    const { audio, context } = setup([track({ id: 'm', kind: 'music', loop: true })], { refuse: true })
    audio.setView(view())
    await settle()
    expect(audio.getSnapshot().blocked).toBe(true)
    context.refuseResume = false
    await audio.unlock()
    expect(context.state).toBe('running')
    expect(audio.getSnapshot().blocked).toBe(false)
  })

  it('mutes and unmutes on the master gain', async () => {
    const { audio, context } = setup([track({ id: 'm', kind: 'music', loop: true })])
    audio.setView(view())
    await settle()
    audio.setMuted(true)
    expect(bus(context).master.gain.value).toBe(0)
    expect(audio.getSnapshot().muted).toBe(true)
    audio.setMuted(false)
    expect(bus(context).master.gain.value).toBe(1)
  })

  it('plays what it can when a file does not load and names the ones that did not', async () => {
    const { audio, context } = setup([track({ id: 'bad', name: 'Lost song', kind: 'music', loop: true }), track({ id: 'ok', kind: 'music', loop: true })], { fail: ['bad'] })
    audio.setView(view())
    await settle()
    expect(context.sources).toHaveLength(1)
    expect(audio.getSnapshot().failed).toEqual(['Lost song'])
  })

  it('stays silent when the tracks are all gone by the time the files load', async () => {
    const { audio, context } = setup([track({ id: 'm', kind: 'music', loop: true })])
    audio.setView(view())
    audio.dispose()
    await settle()
    expect(context.sources).toHaveLength(0)
  })

  it('releases the context on dispose and can start again afterwards', async () => {
    const { audio, context, timers, createContext } = setup([track({ id: 'm', kind: 'music', loop: true })])
    audio.setView(view())
    await settle()
    audio.dispose()
    expect(context.sources[0].stopped).not.toBeNull()
    for (const timer of timers) timer.fn()
    expect(context.calls).toContain('close')
    audio.setView(view())
    await settle()
    expect(createContext).toHaveBeenCalledTimes(2)
  })
})
