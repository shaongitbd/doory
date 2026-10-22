/**
 * The video rows of the timeline (a registered section, `animation/sections.ts`): one row per clip on the page in
 * view, its bar showing the kept part of the clip as a filmstrip. Drag the bar to move the clip on the page clock, drag
 * an edge to trim it; arrow keys move it by a tenth of a second (with Alt they trim its end). Everything goes through
 * `editor.videos.update`, so a drag is one undo step.
 */
import { Clapperboard } from 'lucide-react'
import { useCallback, useRef } from 'react'
import type { DocObject } from '@/types/document'
import { useEditor, useEditorState } from '../context'
import { TIME_STEP_MS } from '../animation/model'
import { MIN_BAR_PX, formatTime, pageHoldEndMs, timeToX, xToTime } from '../animation/timelineMath'
import type { TimelineSectionProps } from '../animation/sections'
import { Filmstrip } from '../clips/Filmstrip'
import { type Clip, clipLengthMs, readClip } from '../clips/model'
import { barEndMs, moveClip, trimClipEnd, trimClipStart } from '../clips/timeline'
import { t } from '../strings'
import { TimelineRow } from './TimelineRow'
import styles from './TimelineAudio.module.css'

const COPY = t.clips.timeline
type Part = 'move' | 'start' | 'end'

interface Drag {
  id: string
  part: Part
  from: Clip
  originMs: number
}

function nameOf(obj: DocObject): string {
  return typeof obj.name === 'string' && obj.name.trim() ? obj.name : t.clips.kind
}

export function ClipsSection({ pageId, pxPerMs, contentWidth, readOnly }: TimelineSectionProps) {
  const editor = useEditor()
  const page = useEditorState((s) => s.doc.pages.find((p) => p.id === pageId))
  const selected = useEditorState((s) => s.selection.ids)
  const drag = useRef<Drag | null>(null)
  const pageEnd = page ? pageHoldEndMs(page) : 0
  const clips = (page?.objects ?? []).map((obj) => ({ obj, clip: readClip(obj) })).filter((c): c is { obj: DocObject; clip: Clip } => c.clip !== null)

  const timeAt = useCallback((e: React.PointerEvent<HTMLElement>): number => {
    const track = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
    return xToTime(e.clientX - track.left, pxPerMs)
  }, [pxPerMs])

  const onStart = (id: string, clip: Clip, e: React.PointerEvent<HTMLDivElement>): void => {
    if (readOnly || e.button !== 0) return
    e.preventDefault()
    if (editor.state.activePageId === pageId && !editor.state.selection.ids.includes(id)) editor.select([id], pageId)
    const edge = (e.target as HTMLElement).dataset.edge
    drag.current = { id, part: edge === 'start' ? 'start' : edge === 'end' ? 'end' : 'move', from: clip, originMs: timeAt(e) }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    const delta = Math.round((timeAt(e) - d.originMs) / TIME_STEP_MS) * TIME_STEP_MS
    const key = `clip-bar:${d.id}:${d.part}`
    if (d.part === 'move') editor.videos.update(d.id, moveClip(d.from, delta), t.clips.history.move, key)
    else if (d.part === 'start') editor.videos.update(d.id, trimClipStart(d.from, delta), t.clips.history.trim, key)
    else editor.videos.update(d.id, trimClipEnd(d.from, delta), t.clips.history.trim, key)
  }
  const onEnd = (): void => {
    drag.current = null
  }
  const onKey = (id: string, clip: Clip, e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (readOnly || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const delta = (e.key === 'ArrowLeft' ? -1 : 1) * TIME_STEP_MS
    if (e.altKey) editor.videos.update(id, trimClipEnd(clip, delta), t.clips.history.trim, `clip-bar-key:${id}:end`)
    else editor.videos.update(id, moveClip(clip, delta), t.clips.history.move, `clip-bar-key:${id}:move`)
  }

  return (
    <>
      {clips.map(({ obj, clip }) => {
        const name = nameOf(obj)
        const end = barEndMs(clip, pageEnd)
        const left = timeToX(clip.startMs, pxPerMs)
        const width = Math.max(MIN_BAR_PX, timeToX(end - clip.startMs, pxPerMs))
        const playWidth = Math.min(width, Math.max(MIN_BAR_PX, timeToX(clipLengthMs(clip), pxPerMs)))
        const label = COPY.bar(name, formatTime(clip.startMs, true), formatTime(clip.startMs + clipLengthMs(clip), true))
        return (
          <TimelineRow key={obj.id} label={name} name={COPY.row(name)} icon={<Clapperboard size={13} aria-hidden="true" />} contentWidth={contentWidth} selected={selected.includes(obj.id)} testId={`tl-clip-row-${obj.id}`}>
            <div
              className={styles.bar}
              data-muted={clip.muted || undefined}
              data-testid={`tl-clip-bar-${obj.id}`}
              role="button"
              tabIndex={0}
              aria-label={label}
              title={readOnly ? label : `${label}. ${COPY.moveHint}`}
              style={{ left, width }}
              onPointerDown={(e) => onStart(obj.id, clip, e)}
              onPointerMove={onMove}
              onPointerUp={onEnd}
              onPointerCancel={onEnd}
              onKeyDown={(e) => onKey(obj.id, clip, e)}
            >
              {readOnly ? null : <span className={styles.handle} data-edge="start" aria-hidden="true" />}
              <Filmstrip
                className={styles.wave}
                strip={clip.filmstrip}
                poster={typeof obj.src === 'string' ? obj.src : undefined}
                fromMs={clip.trimStartMs}
                toMs={clip.trimEndMs}
                tiles={Math.max(1, Math.round(playWidth / 32))}
                style={{ width: playWidth, borderRadius: 3 }}
              />
              {clip.loop && width > playWidth ? <span className={styles.loopTail} style={{ left: playWidth }} aria-hidden="true" /> : null}
              {readOnly || clip.loop ? null : <span className={`${styles.handle} ${styles.handleEnd}`} data-edge="end" aria-hidden="true" />}
            </div>
          </TimelineRow>
        )
      })}
    </>
  )
}
