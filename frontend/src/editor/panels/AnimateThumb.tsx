/**
 * A tile of the Animate panel: the preset's name under a small picture of what it does. The picture shows the
 * animation half way through; while the tile is hovered or focused it plays, and when the system asks for reduced motion
 * it stays a still.
 */
import { useLocale } from '@/i18n/useLocale'
import { memo, useCallback, useEffect, useRef } from 'react'
import type { Anim, PageTransition } from '@/types/document'
import { type ThumbColors, drawAnimationThumb, drawTransitionThumb, loopTime, stillTime } from '../animation/thumbnail'
import { useReducedMotion } from '../animation/useReducedMotion'
import { THUMB_PAGE } from '../animation/thumbnail'
import { t } from '../strings'
import styles from './Animate.module.css'

const SCALE = 2

function colorsOf(el: HTMLElement): ThumbColors {
  const css = getComputedStyle(el)
  const read = (name: string): string => css.getPropertyValue(name).trim() || 'currentColor'
  return { card: read('--color-brand'), ink: read('--color-on-brand'), ground: read('--color-bg-muted'), other: read('--color-text') }
}

type Subject = { kind: 'anim'; slot: 'enter' | 'exit' | 'emphasis'; anim: Anim } | { kind: 'transition'; transition: Pick<PageTransition, 'preset' | 'easing' | 'direction'>; durationMs: number }

interface ThumbProps {
  label: string
  subject: Subject
  selected: boolean
  onPick(): void
  testId: string
}

export const AnimateThumb = memo(function AnimateThumb({ label, subject, selected, onPick, testId }: ThumbProps) {
  useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const subjectRef = useRef(subject)
  subjectRef.current = subject
  const raf = useRef(0)

  const draw = useCallback((tMs: number): void => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const colors = colorsOf(canvas)
    const s = subjectRef.current
    if (s.kind === 'anim') drawAnimationThumb(ctx, canvas.width, canvas.height, s.slot, s.anim, tMs, colors)
    else drawTransitionThumb(ctx, canvas.width, canvas.height, s.transition, Math.min(1, tMs / s.durationMs), colors)
  }, [])

  const stillAt = useCallback((): number => {
    const s = subjectRef.current
    return s.kind === 'anim' ? stillTime(s.anim) : s.durationMs * 0.5
  }, [])

  const durationOf = (): number => {
    const s = subjectRef.current
    return s.kind === 'anim' ? s.anim.durationMs : s.durationMs
  }

  // The still picture; drawn again when the tile's animation changes.
  const key = JSON.stringify(subject)
  useEffect(() => {
    draw(stillAt())
  }, [key, draw, stillAt])

  const play = (): void => {
    if (reduced) return
    cancelAnimationFrame(raf.current)
    const start = performance.now()
    const tick = (now: number): void => {
      draw(loopTime(now - start, durationOf()))
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const stop = (): void => {
    cancelAnimationFrame(raf.current)
    draw(stillAt())
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return (
    <button
      type="button"
      className={`${styles.thumb} ${selected ? styles.thumbOn : ''}`}
      aria-pressed={selected}
      aria-label={label}
      title={reduced ? label : t.animation.panel.preview(label)}
      data-testid={testId}
      onClick={onPick}
      onPointerEnter={play}
      onPointerLeave={stop}
      onFocus={play}
      onBlur={stop}
    >
      <canvas ref={canvasRef} className={styles.thumbCanvas} width={THUMB_PAGE.width * SCALE} height={THUMB_PAGE.height * SCALE} aria-hidden="true" />
      <span className={styles.thumbLabel}>{label}</span>
    </button>
  )
})

