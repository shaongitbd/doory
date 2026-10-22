/**
 * A clip's frames side by side, cut from the sprite the server made (`videoFilmstrip`): the frames of `fromMs` to
 * `toMs` spread over the box, as on the timeline bar and in the trim popover. Decorative: the bar or the sliders
 * carry the meaning.
 */
import type { CSSProperties } from 'react'
import { cssUrl } from '@/lib/cssUrl'
import { useResolvedSrc } from '../hooks/useResolvedSrc'
import type { ClipFilmstrip } from './model'

interface FilmstripProps {
  strip: ClipFilmstrip | null
  /** Poster to show when the clip has no filmstrip. */
  poster?: string
  fromMs: number
  toMs: number
  /** Tiles to draw across the box. */
  tiles: number
  className?: string
  style?: CSSProperties
}

export function Filmstrip({ strip, poster, fromMs, toMs, tiles, className, style }: FilmstripProps) {
  const url = useResolvedSrc(strip?.url ?? poster ?? '')
  const count = Math.max(1, Math.round(tiles))
  const box: CSSProperties = { display: 'flex', overflow: 'hidden', pointerEvents: 'none', ...style }
  if (!url) return <span className={className} style={box} aria-hidden="true" />
  const frames = strip?.frames ?? 1
  return (
    <span className={className} style={box} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const at = fromMs + ((toMs - fromMs) * (i + 0.5)) / count
        const frame = strip ? Math.min(frames - 1, Math.max(0, Math.floor(at / strip.intervalMs))) : 0
        return (
          <span
            key={i}
            style={{
              flex: '1 1 0',
              minWidth: 0,
              backgroundImage: cssUrl(url),
              backgroundRepeat: 'no-repeat',
              // Each tile shows one frame of the sprite, scaled to the tile's height.
              backgroundSize: strip ? `${frames * 100}% 100%` : 'cover',
              backgroundPosition: strip ? `${frames > 1 ? (frame / (frames - 1)) * 100 : 0}% 50%` : 'center',
            }}
          />
        )
      })}
    </span>
  )
}
