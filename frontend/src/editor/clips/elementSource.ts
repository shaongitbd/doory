/**
 * The preview's clip source: a hidden, muted `<video>` that plays along with the page clock (the clip's sound is part
 * of the audio mix, not of this element). While the clock stands still it seeks to the frame asked for; while it
 * runs, the element plays on its own: a small drift is taken up by playing a little faster or slower, and only a
 * jump (a scrub, a loop, a slow tab) seeks. A seek is never started while another one is landing, or the element
 * would never get to play.
 */
import type { ClipFrameSource, ClipMedia, ClipMediaFactory } from '../animation/clipSource'

/** Drift (ms of the source) beyond which a playing element is put back by a seek. */
export const DRIFT_MS = 750
/** Drift beyond which a playing element plays faster or slower to catch up (up to `MAX_NUDGE`). */
const NUDGE_MS = 40
const MAX_NUDGE = 0.25
/** A seek within this much of where the element already is would not change the picture. */
const SAME_FRAME_MS = 10

/**
 * The holder of the elements. It stays inside the viewport, one pixel and all but transparent: iOS only decodes a video
 * that is in the document, and Chrome pauses a muted video it considers off screen.
 */
function holder(): HTMLElement {
  let el = document.getElementById('doory-clip-sources')
  if (!el) {
    el = document.createElement('div')
    el.id = 'doory-clip-sources'
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1'
    document.body.append(el)
  }
  return el
}

export function createElementSource(media: ClipMedia, onFrame: () => void): ClipFrameSource {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.disablePictureInPicture = true
  video.setAttribute('playsinline', '')
  video.style.cssText = 'display:block;width:1px;height:1px'
  video.src = media.url
  holder().append(video)

  let version = 0
  let wanted = 0
  let playing = false
  let moving = false
  let rate = 1
  let disposed = false
  const waiters: (() => void)[] = []

  const hasFrame = (): boolean => video.readyState >= 2
  const settle = (): void => {
    if (!hasFrame() || video.seeking) return
    for (const resolve of waiters.splice(0)) resolve()
  }
  const bump = (): void => {
    version++
    settle()
    onFrame()
  }
  const watchFrames = (): void => {
    if (disposed || typeof video.requestVideoFrameCallback !== 'function') return
    video.requestVideoFrameCallback(() => {
      bump()
      watchFrames()
    })
  }
  video.addEventListener('loadeddata', bump)
  video.addEventListener('seeked', () => {
    bump()
    apply() // the clock may have moved on while the seek landed
  })
  if (typeof video.requestVideoFrameCallback === 'function') watchFrames()
  else video.addEventListener('timeupdate', bump)

  const seek = (ms: number): void => {
    if (Math.abs(video.currentTime * 1000 - ms) <= SAME_FRAME_MS && !video.seeking) return
    video.currentTime = ms / 1000
  }

  function apply(): void {
    if (disposed) return
    const run = playing && moving && rate > 0
    const base = media.speed * rate
    if (run) {
      const behind = wanted - video.currentTime * 1000
      if (video.seeking) return
      if (Math.abs(behind) > DRIFT_MS) seek(wanted)
      const nudge = Math.abs(behind) > NUDGE_MS ? Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, behind / 1000)) : 0
      video.playbackRate = Math.max(0.0625, Math.min(16, base * (1 + nudge)))
      if (video.paused) void video.play().catch(() => undefined)
    } else {
      video.playbackRate = Math.max(0.0625, Math.min(16, base))
      if (!video.paused) video.pause()
      if (!video.seeking) seek(wanted)
    }
  }

  return {
    get version() {
      return version
    },
    want(ms: number, nowMoving: boolean): void {
      wanted = ms
      moving = nowMoving
      apply()
    },
    ready(ms: number): Promise<void> {
      wanted = ms
      moving = false
      apply()
      if (hasFrame() && !video.seeking) return Promise.resolve()
      return new Promise((resolve) => waiters.push(resolve))
    },
    frame(): CanvasImageSource | null {
      return hasFrame() ? video : null
    },
    setClock(nowPlaying: boolean, nowRate: number): void {
      playing = nowPlaying
      rate = nowRate
      apply()
    },
    suspend(): void {
      playing = false
      if (!video.paused) video.pause()
    },
    dispose(): void {
      disposed = true
      for (const resolve of waiters.splice(0)) resolve()
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
    },
  }
}

/** The factory the preview and the slideshow hand to the frame renderer. */
export const elementSources: ClipMediaFactory = createElementSource
