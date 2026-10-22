/**
 * The sound of a slideshow. A show is not a timeline: the presenter moves between pages whenever they like (or the
 * page times move it), so sound follows what is on screen instead of a pre-computed schedule.
 *
 *  - A track of the whole design starts with the show and keeps its own clock, so music runs on across the pages.
 *  - A track of one page starts when the page comes up (after its own start offset) and fades out when the page is left;
 *    coming back to the page plays it again from the start.
 *  - A looping track plays for as long as its scope is up; any other track plays once.
 *  - Voiceovers lower the other sound (`DUCK_GAIN`) with the same attack and release as the editor's player and the
 *    mixdown, recomputed whenever a voiceover starts or stops early.
 *  - Pausing the slideshow suspends the audio context, so everything waits and carries on together; the end screen
 *    fades the sound out and freezes the design clock, so going back resumes the music where it was.
 *
 * Browsers only start sound after a user gesture. The presentation is opened by one, and `unlock()` (called from any key
 * press or click in the show) resumes the context if the browser still held it back.
 */
import type { AudioTrack } from '@/types/document'
import { type RunningVoice, applyCurve, createBus, curveFrom, startVoice } from '../audio/graph'
import type { Bus } from '../audio/graph'
import { DUCK_ATTACK_MS, DUCK_RELEASE_MS, ducks, isAudible, trimmedLengthMs } from '../audio/model'
import { type GainPoint, duckCurve, fitFades, mergeSpans } from '../audio/plan'
import type { SourceLoader } from '../audio/sources'
import { isClipVoice } from '../clips/audio'

export interface ShowView {
  index: number
  ended: boolean
  /** The slideshow is paused (only possible with auto-advance on). */
  paused: boolean
  /** Wall time of the show; going back down means "start again". */
  totalMs: number
}

export interface ShowAudioState {
  /** Some track of the design can sound in this show. */
  available: boolean
  /** The presenter switched the sound off (it keeps running silently so that switching on again is in time). */
  muted: boolean
  /** The browser has not let the sound start yet: a key press or click will. */
  blocked: boolean
  /** Names of the tracks whose file could not be loaded. */
  failed: readonly string[]
}

export interface ShowAudioDeps {
  tracks(): readonly AudioTrack[]
  pageIds(): readonly string[]
  load: SourceLoader
  createContext(): AudioContext
  later(handler: () => void, ms: number): number
  /**
   * How long after page `to` comes up its video clips start, coming from page `from` (`null`: the first page shown):
   * the transition that actually plays in between. The clips' sounds wait as long; none when left out.
   */
  clipLeadMs?(from: number | null, to: number): number
}

/** Seconds between "now" and a sound that starts at once, so scheduling never lands in the past. */
const LEAD_SEC = 0.05
/** What a page's sound does when the page is left: its own fade-out, but never shorter than this or longer than the cap. */
export const LEAVE_FADE_MIN_MS = 250
export const LEAVE_FADE_MAX_MS = 2000
/** The sound fades over this long when the end screen comes up. */
export const END_FADE_MS = 800
/** A restart or going away cuts the sound over this long (a hard stop clicks). */
const CUT_FADE_MS = 120
const MUTE_TIME_CONSTANT = 0.03
const FAR_FUTURE_SEC = 86_400

interface Live {
  track: AudioTrack
  node: RunningVoice
  /** `null` for the design's tracks, else the page index the track belongs to. */
  page: number | null
  /** When it is heard, on the context clock, seconds (a loop plays until it is stopped). */
  startSec: number
  endSec: number
}

/** Gain over the life of a voice: its fade-in, and its fade-out when it has a known end (`lengthMs`). */
export function showFade(track: AudioTrack, lengthMs: number | null): GainPoint[] {
  if (lengthMs === null) return [{ t: 0, gain: track.fadeInMs > 0 ? 0 : 1 }, ...(track.fadeInMs > 0 ? [{ t: track.fadeInMs, gain: 1 }] : [])]
  const { fadeIn, fadeOut } = fitFades(track.fadeInMs, track.fadeOutMs, lengthMs)
  const points: GainPoint[] = [{ t: 0, gain: fadeIn > 0 ? 0 : 1 }]
  if (fadeIn > 0) points.push({ t: fadeIn, gain: 1 })
  if (fadeOut > 0) points.push({ t: lengthMs - fadeOut, gain: 1 })
  points.push({ t: lengthMs, gain: fadeOut > 0 ? 0 : 1 })
  return points
}

const leaveFadeMs = (track: AudioTrack): number => Math.min(LEAVE_FADE_MAX_MS, Math.max(LEAVE_FADE_MIN_MS, track.fadeOutMs))

export class ShowAudio {
  private state: ShowAudioState
  private readonly listeners = new Set<() => void>()
  private context: AudioContext | null = null
  private bus: Bus | null = null
  private view: ShowView | null = null
  private live: Live[] = []
  /** Position of the design's own clock (ms) at context time `anchor`; it only runs while `designRunning`. */
  private designMs = 0
  private anchor = 0
  private designRunning = false
  private pageIndex = -1
  private designToken = 0
  private pageToken = 0
  private muted = false

  constructor(private readonly deps: ShowAudioDeps) {
    this.state = { available: this.canSound(), muted: false, blocked: false, failed: [] }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): ShowAudioState => this.state

  private set(patch: Partial<ShowAudioState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of [...this.listeners]) listener()
  }

  private audible(): AudioTrack[] {
    return this.deps.tracks().filter(isAudible)
  }

  private canSound(): boolean {
    const pages = new Set(this.deps.pageIds())
    return this.audible().some((track) => track.scope.type === 'design' || pages.has(track.scope.pageId))
  }

  /** Tells the audio what the slideshow is doing. Call it whenever the page, the pause or the end screen changes. */
  setView(view: ShowView): void {
    const previous = this.view
    this.view = view
    if (!this.state.available) return
    const restarted = previous !== null && view.totalMs + 50 < previous.totalMs
    if (restarted) this.restart()
    // The wall clock ticks all the time; only a change of page, pause or end screen (or a restart) needs attention.
    if (previous && !restarted && previous.index === view.index && previous.ended === view.ended && previous.paused === view.paused) return
    void this.sync()
  }

  /** The presenter's sound switch. */
  setMuted(muted: boolean): void {
    this.muted = muted
    this.set({ muted })
    this.applyMaster()
  }

  /** Call from a key press or click in the show: lets a sound that the browser held back start. */
  async unlock(): Promise<void> {
    const context = this.context
    if (!context || !this.state.blocked || this.view?.paused) return
    try {
      await context.resume()
    } catch {
      return
    }
    if (context.state === 'running') this.set({ blocked: false })
  }

  private ensureContext(): { context: AudioContext; bus: Bus } | null {
    if (!this.context || !this.bus) {
      try {
        this.context = this.deps.createContext()
      } catch {
        this.context = null
        return null
      }
      this.bus = createBus(this.context)
      this.applyMaster(true)
    }
    return { context: this.context, bus: this.bus }
  }

  private applyMaster(immediate = false): void {
    if (!this.context || !this.bus) return
    const gain = this.bus.master.gain
    const target = this.muted ? 0 : 1
    if (immediate) gain.value = target
    else gain.setTargetAtTime(target, this.context.currentTime, MUTE_TIME_CONSTANT)
  }

  private position(context: AudioContext): number {
    return this.designRunning && Number.isFinite(this.anchor) ? this.designMs + (context.currentTime - this.anchor) * 1000 : this.designMs
  }

  private async sync(): Promise<void> {
    const view = this.view
    if (!view || !this.state.available) return
    if (view.ended) {
      this.halt()
      return
    }
    const ready = this.ensureContext()
    if (!ready) return
    const { context } = ready
    if (!this.designRunning) void this.startDesign(ready.bus, context)
    if (view.index !== this.pageIndex) {
      const from = this.pageIndex >= 0 ? this.pageIndex : null
      if (from !== null) this.leavePage(context)
      void this.enterPage(view.index, from, ready.bus, context)
    }
    await this.applyRunState(context, view)
  }

  private async applyRunState(context: AudioContext, view: ShowView): Promise<void> {
    try {
      if (view.paused) {
        if (context.state === 'running') await context.suspend()
        return
      }
      if (context.state === 'suspended') await context.resume()
    } catch {
      // The browser refused; the state below says so.
    }
    this.set({ blocked: context.state === 'suspended' && !view.paused })
  }

  /* -------------------------------------------------------------------------------- design tracks */

  private async startDesign(bus: Bus, context: AudioContext): Promise<void> {
    this.designRunning = true
    this.anchor = Number.NaN
    const token = ++this.designToken
    const tracks = this.audible().filter((track) => track.scope.type === 'design')
    const loaded = await this.loadAll(tracks)
    if (token !== this.designToken || this.context !== context) return
    const from = this.designMs
    this.anchor = context.currentTime + LEAD_SEC
    for (const { track, buffer } of loaded) {
      const lengthMs = track.loop ? null : trimmedLengthMs(track)
      const endMs = lengthMs === null ? null : track.startMs + lengthMs
      if (endMs !== null && endMs <= from) continue
      const late = Math.max(0, from - track.startMs)
      const wait = Math.max(0, track.startMs - from)
      const at = this.anchor + wait / 1000
      const fade = curveFrom(
        showFade(track, lengthMs).map((p) => ({ t: p.t + track.startMs, gain: p.gain })),
        from,
      ).map((p) => ({ at: this.anchor + (p.t - from) / 1000, gain: p.gain }))
      const windowMs = Math.max(1, trimmedLengthMs(track))
      const offsetMs = track.trimStartMs + (track.loop ? late % windowMs : late)
      const playSec = endMs === null ? null : (endMs - Math.max(from, track.startMs)) / 1000
      this.addLive(bus, { track, buffer }, null, at, offsetMs, playSec, fade)
    }
    this.rebuildDuck(context)
  }

  /* -------------------------------------------------------------------------------- page tracks */

  private async enterPage(index: number, from: number | null, bus: Bus, context: AudioContext): Promise<void> {
    this.pageIndex = index
    const token = ++this.pageToken
    const pageId = this.deps.pageIds()[index]
    const tracks = this.audible().filter((track) => track.scope.type === 'page' && track.scope.pageId === pageId)
    if (tracks.length === 0) return
    const enteredAt = context.currentTime
    const clipLeadMs = Math.max(0, this.deps.clipLeadMs?.(from, index) ?? 0)
    const loaded = await this.loadAll(tracks)
    if (token !== this.pageToken || this.context !== context) return
    const now = context.currentTime
    for (const { track, buffer } of loaded) {
      const lengthMs = track.loop ? null : trimmedLengthMs(track)
      const startMs = track.startMs + (isClipVoice(track) ? clipLeadMs : 0)
      const at = Math.max(now + LEAD_SEC, enteredAt + startMs / 1000)
      const fade = showFade(track, lengthMs).map((p) => ({ at: at + p.t / 1000, gain: p.gain }))
      this.addLive(bus, { track, buffer }, index, at, track.trimStartMs, lengthMs === null ? null : lengthMs / 1000, fade)
    }
    this.rebuildDuck(context)
  }

  private leavePage(context: AudioContext): void {
    const now = context.currentTime
    this.pageToken++
    for (const entry of this.live) {
      if (entry.page === null || entry.endSec <= now) continue
      const fadeSec = leaveFadeMs(entry.track) / 1000
      entry.node.stop(now, fadeSec)
      // Still audible while it fades, so it keeps the other sound lowered until it is gone.
      entry.endSec = Math.min(entry.endSec, now + fadeSec)
    }
    this.rebuildDuck(context)
  }

  /* -------------------------------------------------------------------------------- shared */

  private async loadAll(tracks: readonly AudioTrack[]): Promise<{ track: AudioTrack; buffer: AudioBuffer }[]> {
    const failed: string[] = []
    const loaded = await Promise.all(
      tracks.map(async (track) => {
        try {
          return { track, buffer: await this.deps.load(track) }
        } catch {
          failed.push(track.name || track.src)
          return null
        }
      }),
    )
    if (failed.length > 0) this.set({ failed: [...new Set([...this.state.failed, ...failed])] })
    return loaded.filter((item): item is { track: AudioTrack; buffer: AudioBuffer } => item !== null)
  }

  private addLive(bus: Bus, item: { track: AudioTrack; buffer: AudioBuffer }, page: number | null, at: number, offsetMs: number, playSec: number | null, fade: readonly { at: number; gain: number }[]): void {
    const { track, buffer } = item
    const node = startVoice(bus, {
      buffer,
      loop: track.loop,
      trimStartSec: track.trimStartMs / 1000,
      trimEndSec: track.trimEndMs / 1000,
      volume: track.volume,
      ducks: ducks(track) && track.kind !== 'voiceover',
      at,
      offsetSec: offsetMs / 1000,
      playSec,
      fade,
    })
    this.live.push({ track, node, page, startSec: at, endSec: playSec === null ? at + FAR_FUTURE_SEC : at + playSec })
  }

  /** The ducking curve for the voiceovers that are playing or about to, from now on. Also frees voices that have ended. */
  private rebuildDuck(context: AudioContext): void {
    const bus = this.bus
    if (!bus) return
    const now = context.currentTime
    this.live = this.live.filter((entry) => {
      if (entry.endSec + 0.2 >= now) return true
      entry.node.dispose()
      return false
    })
    const spans = this.live.filter((entry) => entry.track.kind === 'voiceover').map((entry) => ({ startMs: entry.startSec * 1000, endMs: entry.endSec * 1000 }))
    bus.duck.gain.cancelScheduledValues(now)
    if (spans.length === 0) {
      bus.duck.gain.setTargetAtTime(1, now, 0.05)
      return
    }
    const merged = mergeSpans(spans, DUCK_ATTACK_MS + DUCK_RELEASE_MS)
    const curve = curveFrom(duckCurve(merged, merged[merged.length - 1].endMs + DUCK_RELEASE_MS), now * 1000)
    applyCurve(
      bus.duck.gain,
      curve.map((p) => ({ at: p.t / 1000, gain: p.gain })),
    )
  }

  /** The end screen: fade everything out and remember where the design's clock stopped. */
  private halt(): void {
    const context = this.context
    if (!context) return
    this.designToken++
    this.pageToken++
    this.designMs = this.position(context)
    this.designRunning = false
    this.pageIndex = -1
    const now = context.currentTime
    for (const entry of this.live) {
      entry.node.stop(now, END_FADE_MS / 1000)
      this.deps.later(() => entry.node.dispose(), END_FADE_MS + 100)
    }
    this.live = []
    this.rebuildDuck(context)
  }

  /** "Start again": everything off, the design's clock back at zero. */
  private restart(): void {
    const context = this.context
    this.designToken++
    this.pageToken++
    this.designMs = 0
    this.designRunning = false
    this.pageIndex = -1
    if (!context) return
    const now = context.currentTime
    for (const entry of this.live) {
      entry.node.stop(now, CUT_FADE_MS / 1000)
      this.deps.later(() => entry.node.dispose(), CUT_FADE_MS + 100)
    }
    this.live = []
  }

  /** The show is closing (or being rebuilt): silence, release the context. The object can be used again afterwards. */
  dispose(): void {
    const context = this.context
    this.designToken++
    this.pageToken++
    this.designMs = 0
    this.designRunning = false
    this.pageIndex = -1
    this.view = null
    this.context = null
    this.bus = null
    const live = this.live
    this.live = []
    if (!context) return
    const now = context.currentTime
    for (const entry of live) entry.node.stop(now, CUT_FADE_MS / 1000)
    this.deps.later(() => {
      for (const entry of live) entry.node.dispose()
      void context.close().catch(() => undefined)
    }, CUT_FADE_MS + 150)
  }
}
