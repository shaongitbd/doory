/** A waveform drawn on a canvas from peaks, with an optional played part and a click-to-seek surface. */
import { useEffect, useRef } from 'react'
import { useContrast } from '@/lib/contrast'
import { type Peaks, barsFor, displayGain } from '../audio/peaks'
import { t } from '../strings'
import styles from './Audio.module.css'

interface WaveformProps {
  peaks: Peaks | null
  /** The part of the sound to draw, ms (the whole sound by default). */
  fromMs?: number
  toMs?: number
  /** 0..1 of the drawn part already played. */
  progress?: number
  /** Dim everything outside [selectFrom, selectTo] (ms of the sound), for the trim editor. */
  selectFromMs?: number
  selectToMs?: number
  height?: number
  name: string
  loading?: boolean
  onSeek?(fraction: number): void
}

const BAR = 3
const GAP = 2

function themeColor(el: HTMLElement, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback
}

/** `--wave-idle` / `--wave-played` set by a parent recolour the bars (the timeline draws them on its own colours). */
function waveColor(el: HTMLElement, own: string, token: string, fallback: string): string {
  return themeColor(el, own, themeColor(el, token, fallback))
}

export function AudioWaveform({ peaks, fromMs = 0, toMs, progress, selectFromMs, selectToMs, height = 36, name, loading, onSeek }: WaveformProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const total = peaks?.durationMs ?? 0
  const to = toMs ?? total

  // The bar colours come from the tokens, which high contrast changes: draw again when it does.
  const contrast = useContrast().effective
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let frame = 0
    const draw = (): void => {
      const width = canvas.clientWidth
      if (width === 0) return
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)
      const count = Math.max(1, Math.floor((width + GAP) / (BAR + GAP)))
      const idle = waveColor(canvas, '--wave-idle', '--color-text-subtle', '#8f8589')
      const played = waveColor(canvas, '--wave-played', '--color-brand', '#6a52d9')
      const dim = themeColor(canvas, '--color-border-strong', '#d3cacc')
      const bars = peaks ? barsFor(peaks, fromMs, to, count) : new Float32Array(count)
      const gain = peaks ? displayGain(peaks) : 1
      const span = Math.max(1, to - fromMs)
      for (let i = 0; i < count; i++) {
        const mid = fromMs + ((i + 0.5) / count) * span
        const inside = selectFromMs === undefined || selectToMs === undefined || (mid >= selectFromMs && mid <= selectToMs)
        const isPlayed = progress !== undefined && (i + 0.5) / count <= progress
        ctx.fillStyle = !inside ? dim : isPlayed ? played : idle
        const h = Math.max(2, Math.round(Math.min(1, bars[i] * gain) * (height - 4)))
        ctx.globalAlpha = inside ? (isPlayed ? 1 : 0.75) : 0.6
        ctx.beginPath()
        if (typeof ctx.roundRect === 'function') ctx.roundRect(i * (BAR + GAP), (height - h) / 2, BAR, h, 1.5)
        else ctx.rect(i * (BAR + GAP), (height - h) / 2, BAR, h)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    draw()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => (frame = requestAnimationFrame(draw)))
    observer?.observe(canvas)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [peaks, fromMs, to, progress, selectFromMs, selectToMs, height, contrast])

  return (
    <canvas
      ref={ref}
      className={styles.waveform}
      style={{ height }}
      role="img"
      aria-label={loading && !peaks ? t.audio.waveform.loading : t.audio.waveform.label(name)}
      data-loading={loading && !peaks ? true : undefined}
      data-seekable={onSeek ? true : undefined}
      data-testid="audio-waveform"
      onClick={
        onSeek
          ? (e) => {
              const box = e.currentTarget.getBoundingClientRect()
              onSeek(Math.min(1, Math.max(0, (e.clientX - box.left) / Math.max(1, box.width))))
            }
          : undefined
      }
    />
  )
}
