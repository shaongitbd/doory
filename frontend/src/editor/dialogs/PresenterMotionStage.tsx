/**
 * The stage of a slideshow that has motion in it. Same page box, same letterboxing and the same test hooks as
 * `PresenterStage`; what is different is how a page gets on the glass. Every page is a `FrameRenderer` (prepared ahead,
 * see `presenter/motion.ts`): arriving at a page draws its first frame, plays the page's transition from a picture of
 * the page that was left (both laid out on the whole stage, so pages of different shapes transition too), and then
 * runs the page's animations on the page clock until the last of them has ended (a looping emphasis keeps running).
 *
 * While the next page is being prepared the page that is left stays up (a transition needs it); without a transition
 * the stage shows the quiet placeholder, never the page before it, as in the plain stage.
 */
import { useEffect, useRef, useState } from 'react'
import type { DocPage, DoryDocument } from '@/types/document'
import { type FrameRenderer } from '../animation/frameRenderer'
import { sampleTransition } from '../animation/sampler'
import { drawTransition } from '../animation/transitionRenderer'
import { getPageSize } from '../engine/pageSizes'
import { type MotionCache, type MotionPlan, transitionBetween } from '../presenter/motion'
import { type Rect, type Size, frameGeometry } from '../presenter/fit'
import { useElementSize } from '../presenter/useElementSize'
import { t } from '../strings'
import styles from './Presenter.module.css'

/** How long the stage may hold still before the pages are prepared again for its new size (window drag, notes opening). */
const RESIZE_SETTLE_MS = 150
const NO_SIZE: Size = { width: 0, height: 0 }

interface Shown {
  index: number
  css: Rect
}

interface MotionStageProps {
  doc: DoryDocument
  index: number
  plan: MotionPlan
  cache: MotionCache
  /** Looping is on: going from the last page to the first is going forward. */
  loop: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  children?: React.ReactNode
}

function surface(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

/** A picture of the whole stage with `source` drawn where the page goes (`css` px of the stage, `dpr` device pixels per px). */
function onStage(source: CanvasImageSource, css: Rect, stage: Size, dpr: number): HTMLCanvasElement {
  const canvas = surface(stage.width * dpr, stage.height * dpr)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(source, css.x * dpr, css.y * dpr, css.width * dpr, css.height * dpr)
  }
  return canvas
}

/** Whether the show goes from `from` to `to` as a forward step even though `to` is the earlier page (the end of a loop). */
const wraps = (loop: boolean, from: number, to: number, count: number): boolean => loop && from === count - 1 && to === 0

export function PresenterMotionStage({ doc, index, plan, cache, loop, onPointerDown, onPointerUp, children }: MotionStageProps) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const [settled, setSettled] = useState<Size>(NO_SIZE)
  const [readyIndex, setReadyIndex] = useState<number | null>(null)
  const [failed, setFailed] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  const frameRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  /** What the frame canvas holds: which page, and where it sat. */
  const shownRef = useRef<Shown | null>(null)
  /** When the page on the glass started its animations (kept across a resize, so the page does not start over). */
  const startedRef = useRef<{ index: number; at: number } | null>(null)
  const overlayLive = useRef(false)
  const page: DocPage = doc.pages[index]

  if (settled.width === 0 && size.width > 0) setSettled(size)
  useEffect(() => {
    if (size.width === 0) return
    const timer = window.setTimeout(() => setSettled(size), RESIZE_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [size])

  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const shown = frameGeometry(size, getPageSize(doc, page.id), dpr)
  const pixelWidth = frameGeometry(settled, getPageSize(doc, page.id), dpr).pixels.width
  const css = shown.css

  useEffect(() => {
    cache.clear()
    return () => cache.clear()
  }, [cache, settled.width, settled.height, dpr])

  useEffect(() => {
    const frame = frameRef.current
    const overlay = overlayRef.current
    if (pixelWidth === 0 || !frame || !overlay) return
    let alive = true
    let raf = 0
    const previous = shownRef.current
    const motion = plan.pages[index]
    const transition = previous ? transitionBetween(plan, previous.index, index, wraps(loop, previous.index, index, doc.pages.length)) : null
    const stage: Size = { width: size.width, height: size.height }
    const surfaceSize = { width: Math.max(1, Math.round(stage.width * dpr)), height: Math.max(1, Math.round(stage.height * dpr)) }

    // The page that is left, as a picture of the whole stage (what is still on the overlay if a transition was running).
    let from: HTMLCanvasElement | null = null
    if (transition && previous) {
      if (overlayLive.current) {
        from = surface(overlay.width, overlay.height)
        from.getContext('2d')?.drawImage(overlay, 0, 0)
      } else if (frame.width > 1) from = onStage(frame, previous.css, stage, dpr)
    }
    if (from) {
      overlay.width = surfaceSize.width
      overlay.height = surfaceSize.height
      overlay.getContext('2d')?.drawImage(from, 0, 0, overlay.width, overlay.height)
      overlay.dataset.live = 'true'
      overlayLive.current = true
    }
    setReadyIndex((current) => (current === index ? current : null))

    const showOverlayOff = (): void => {
      overlay.dataset.live = 'false'
      overlayLive.current = false
    }

    cache
      .get(motion.page, pixelWidth)
      .then((renderer: FrameRenderer) => {
        if (!alive) return
        cache.keep(motion.page, pixelWidth)
        if (frame.width !== renderer.width || frame.height !== renderer.height) {
          frame.width = renderer.width
          frame.height = renderer.height
        }
        const ctx = frame.getContext('2d')
        if (!ctx) return
        const paint = (t: number): void => {
          ctx.drawImage(renderer.render(t), 0, 0)
        }
        paint(0)
        shownRef.current = { index, css }
        setFailed(null)
        setReadyIndex(index)

        const animate = (origin: number): void => {
          renderer.setMediaClock(true, 1)
          const tick = (now: number): void => {
            if (!alive) return
            const elapsed = now - origin
            paint(Math.max(0, elapsed))
            if (elapsed < renderer.timing.endMs || renderer.timing.loops) raf = requestAnimationFrame(tick)
          }
          raf = requestAnimationFrame(tick)
        }

        // Only a page that is still the one on the glass carries on (the stage was resized); coming back to it starts it over.
        const continuing = previous?.index === index && startedRef.current?.index === index ? startedRef.current.at : null
        if (transition && from) {
          const to = onStage(frame, css, stage, dpr)
          const octx = overlay.getContext('2d')
          let began: number | null = null
          const step = (now: number): void => {
            if (!alive || !octx) return
            began ??= now
            const p = Math.min(1, (now - began) / transition.durationMs)
            drawTransition(octx, sampleTransition(transition, p), from, to, overlay.width, overlay.height)
            if (p < 1) raf = requestAnimationFrame(step)
            else {
              showOverlayOff()
              startedRef.current = { index, at: now }
              animate(now)
            }
          }
          raf = requestAnimationFrame(step)
        } else {
          showOverlayOff()
          raf = requestAnimationFrame((now) => {
            if (!alive) return
            const at = continuing ?? now
            startedRef.current = { index, at }
            animate(at)
            paint(Math.max(0, now - at))
          })
        }
      })
      .catch(() => {
        if (alive) {
          showOverlayOff()
          setFailed(index)
        }
      })

    // The pages on either side are prepared while this one is on the glass, so the next step finds them ready.
    for (const neighbour of [doc.pages[index + 1], doc.pages[index - 1]]) {
      const n = neighbour ? plan.pages[doc.pages.indexOf(neighbour)] : undefined
      if (n) cache.prefetch(n.page, frameGeometry(settled, getPageSize(doc, neighbour.id), dpr).pixels.width)
    }
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      cache.peek(motion.page, pixelWidth)?.setMediaClock(false, 1)
    }
    // `css` and `size` describe the box this run draws into; they are read at the time the page is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, plan, doc, index, pixelWidth, settled, dpr, loop, attempt])

  const ready = readyIndex === index
  const name = (page.name ?? '').trim()
  const label = t.presenter.stage(index + 1, doc.pages.length, name)
  const missing = !ready && failed === index
  return (
    <div ref={ref} className={styles.stage} data-testid="present-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className={styles.frameBox} style={{ left: css.x, top: css.y, width: css.width, height: css.height }} data-testid="present-frame-box">
        <canvas ref={frameRef} className={styles.frame} data-ready={ready} role="img" aria-label={label} data-testid="present-frame" data-page-id={page.id} />
        {!ready && !missing ? <div className={styles.preparing} role="status" aria-label={t.presenter.preparing} data-testid="present-preparing" /> : null}
        {missing ? (
          <div className={styles.failed} role="alert">
            <p>{t.presenter.renderFailed}</p>
            <button type="button" className={styles.textButton} onClick={() => setAttempt((n) => n + 1)}>
              {t.presenter.retry}
            </button>
          </div>
        ) : null}
      </div>
      <canvas ref={overlayRef} className={styles.transition} aria-hidden="true" data-live="false" data-testid="present-transition" />
      {children}
    </div>
  )
}
