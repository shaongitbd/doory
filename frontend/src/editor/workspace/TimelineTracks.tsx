/**
 * The lanes of the timeline: a ruler, one lane per animated object with a bar for each of its animations, the playhead
 * and the end of the page. Bars are dragged (move, or either edge to change the length), snap to a tenth of a second and
 * to each other, and every change goes through `editor.animation.patch`, so a drag is one undo step and reaches
 * collaborators as the property it is. All of it is also reachable by keyboard.
 */
import { Folder, Image as ImageIcon, LayoutGrid, LogIn, LogOut, Minus, QrCode, Shapes, Sparkles, Square, Type } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '../context'
import { type AnimSpan, TIME_STEP_MS } from '../animation/model'
import type { TimelineSection } from '../animation/sections'
import { playbackOf, usePlaybackValue } from '../animation/playback'
import { objectName, presetLabel, slotLabel } from '../animation/labels'
import {
  type BarDrag,
  LABEL_WIDTH,
  type Lane,
  type Overrun,
  MIN_BAR_PX,
  SNAP_PX,
  dragBar,
  fitScale,
  formatSeconds,
  formatTime,
  rulerTicks,
  snapTargets,
  tickStep,
  timeToX,
  xToTime,
} from '../animation/timelineMath'
import { kindOfDoc } from '../engine/objects/kinds'
import { t } from '../strings'
import styles from './Timeline.module.css'

const SLOT_ICON = { enter: LogIn, exit: LogOut, emphasis: Sparkles } as const

function KindIcon({ kind }: { kind: string }) {
  const Icon = kind === 'text' ? Type : kind === 'image' ? ImageIcon : kind === 'line' ? Minus : kind === 'group' ? Folder : kind === 'image-grid' ? LayoutGrid : kind === 'qr' ? QrCode : kind === 'element' ? Shapes : Square
  return <Icon size={14} aria-hidden="true" />
}

/* ------------------------------------------------------------------------------------------------
 * A bar
 * ---------------------------------------------------------------------------------------------- */

interface BarProps {
  span: AnimSpan
  pxPerMs: number
  late: boolean
  selected: boolean
  readOnly: boolean
  loopEndMs: number | null
  onStart(span: AnimSpan, part: BarDrag, e: React.PointerEvent<HTMLDivElement>): void
  onMove(e: React.PointerEvent<HTMLDivElement>): void
  onEnd(): void
  onKey(span: AnimSpan, e: React.KeyboardEvent<HTMLDivElement>): void
}

const Bar = memo(function Bar({ span, pxPerMs, late, selected, readOnly, loopEndMs, onStart, onMove, onEnd, onKey }: BarProps) {
  const left = timeToX(span.startMs, pxPerMs)
  const width = Math.max(MIN_BAR_PX, timeToX(span.anim.durationMs, pxPerMs))
  const Icon = SLOT_ICON[span.slot]
  const preset = presetLabel(span.slot, span.anim.preset)
  const looping = span.slot === 'emphasis' && span.anim.loop === true
  const ghost = looping && loopEndMs !== null && loopEndMs > span.endMs ? timeToX(loopEndMs - span.endMs, pxPerMs) : 0
  return (
    <div
      className={styles.bar}
      data-slot={span.slot}
      data-selected={selected || undefined}
      data-late={late || undefined}
      data-looping={looping || undefined}
      data-testid={`tl-bar-${span.objectId}-${span.slot}`}
      role="button"
      tabIndex={0}
      aria-label={t.animation.timeline.bar(slotLabel(span.slot), preset, formatTime(span.startMs, true), formatSeconds(span.anim.durationMs))}
      aria-keyshortcuts={readOnly ? undefined : 'ArrowLeft ArrowRight Alt+ArrowLeft Alt+ArrowRight Delete'}
      title={readOnly ? undefined : t.animation.timeline.barKeys}
      style={{ left, width }}
      onPointerDown={(e) => onStart(span, (e.target as HTMLElement).dataset.edge === 'start' ? 'start' : (e.target as HTMLElement).dataset.edge === 'end' ? 'end' : 'move', e)}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onKeyDown={(e) => onKey(span, e)}
    >
      {readOnly ? null : <span className={styles.handle} data-edge="start" aria-hidden="true" />}
      <span className={styles.barText}>
        <Icon size={12} aria-hidden="true" />
        <span>{preset}</span>
      </span>
      {readOnly ? null : <span className={`${styles.handle} ${styles.handleEnd}`} data-edge="end" aria-hidden="true" />}
      {ghost > 0 ? <span className={styles.ghost} style={{ width: ghost }} aria-hidden="true" /> : null}
    </div>
  )
})

/* ------------------------------------------------------------------------------------------------
 * The playhead
 * ---------------------------------------------------------------------------------------------- */

/** How far left of the page-end line a time label is covered by the flag: the flag's width and the label's. */
const FLAG_REACH_PX = 92

function Playhead({ pxPerMs, scroller }: { pxPerMs: number; scroller: React.RefObject<HTMLDivElement | null> }) {
  const time = usePlaybackValue((s) => s.timeMs)
  const playing = usePlaybackValue((s) => s.playing)
  const x = timeToX(time, pxPerMs)
  useEffect(() => {
    const el = scroller.current
    if (!playing || !el) return
    const visibleStart = el.scrollLeft
    const visibleEnd = el.scrollLeft + el.clientWidth - LABEL_WIDTH
    if (x > visibleEnd - 24 || x < visibleStart) el.scrollTo?.({ left: Math.max(0, x - 80) })
  }, [x, playing, scroller])
  return (
    <div className={styles.playhead} style={{ transform: `translateX(${LABEL_WIDTH + x}px)` }} aria-hidden="true" data-testid="tl-playhead">
      <span className={styles.playheadHandle} />
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * The tracks
 * ---------------------------------------------------------------------------------------------- */

interface TracksProps {
  lanes: readonly Lane[]
  /** Rows added by other features (`animation/sections.ts`), drawn after the lanes. */
  sections: readonly TimelineSection[]
  pageId: string
  spans: readonly AnimSpan[]
  /** Width of the area for the time axis, px. */
  trackWidth: number
  /** The length the axis shows at least, ms (the preview length). */
  lengthMs: number
  zoom: number
  readOnly: boolean
  selected: ReadonlySet<string>
  marker: number | null
  overrun: Overrun | null
  /** Called with the time under a ruler press, to move the playhead. */
  onScrub(ms: number, phase: 'start' | 'move' | 'end'): void
}

interface DragState {
  span: AnimSpan
  part: BarDrag
  from: { delayMs: number; durationMs: number }
  grabMs: number
  targets: number[]
  lengthMs: number
}

export function TimelineTracks({ lanes, sections, pageId, spans, trackWidth, lengthMs, zoom, readOnly, selected, marker, overrun, onScrub }: TracksProps) {
  const editor = useEditor()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [frozen, setFrozen] = useState<number | null>(null)
  const length = frozen ?? lengthMs
  const pxPerMs = fitScale(trackWidth, length) * zoom
  const contentWidth = Math.max(trackWidth, timeToX(length + 1500, pxPerMs))
  const step = tickStep(pxPerMs)
  const ticks = useMemo(() => rulerTicks(contentWidth / pxPerMs, step), [contentWidth, pxPerMs, step])
  const lateIds = useMemo(() => new Set((overrun?.spans ?? []).map((s) => `${s.objectId}:${s.slot}`)), [overrun])
  const playback = playbackOf(editor)
  const trackRefs = useRef(new Map<string, HTMLDivElement>())

  const timeAt = useCallback(
    (clientX: number, objectId: string): number => {
      const track = trackRefs.current.get(objectId)
      return track ? xToTime(clientX - track.getBoundingClientRect().left, pxPerMs) : 0
    },
    [pxPerMs],
  )

  const loopEnd = marker ?? length

  const startDrag = useCallback(
    (span: AnimSpan, part: BarDrag, e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      if (!(editor.state.selection.ids.length === 1 && editor.state.selection.ids[0] === span.objectId)) editor.select([span.objectId])
      if (readOnly) return
      const pointerMs = timeAt(e.clientX, span.objectId)
      const edge = part === 'end' ? span.endMs : span.startMs
      dragRef.current = {
        span,
        part,
        from: { delayMs: span.anim.delayMs, durationMs: span.anim.durationMs },
        grabMs: pointerMs - edge,
        targets: snapTargets(spans, span, [playback.state.timeMs, marker]),
        lengthMs,
      }
      setFrozen(lengthMs)
      editor.sealHistory()
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    [editor, readOnly, spans, marker, lengthMs, playback, timeAt],
  )

  const moveDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const ms = timeAt(e.clientX, drag.span.objectId) - drag.grabMs
      const times = dragBar(drag.part, drag.from, ms, drag.targets, SNAP_PX / pxPerMs)
      editor.animation.patch(drag.span.slot, times, [drag.span.objectId], `timeline:${drag.span.objectId}:${drag.span.slot}`)
    },
    [editor, pxPerMs, timeAt],
  )

  const endDrag = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    setFrozen(null)
    editor.sealHistory()
  }, [editor])

  const onKey = useCallback(
    (span: AnimSpan, e: React.KeyboardEvent<HTMLDivElement>) => {
      if (readOnly) return
      const amount = e.shiftKey ? 1000 : TIME_STEP_MS
      const ids = [span.objectId]
      const key = `timeline-key:${span.objectId}:${span.slot}`
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const sign = e.key === 'ArrowLeft' ? -1 : 1
        if (e.altKey) editor.animation.patch(span.slot, { durationMs: span.anim.durationMs + sign * amount }, ids, key)
        else editor.animation.patch(span.slot, { delayMs: span.anim.delayMs + sign * amount }, ids, key)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        e.stopPropagation()
        editor.animation.remove(span.slot, ids)
      }
    },
    [editor, readOnly],
  )

  const scrubFrom = (e: React.PointerEvent<HTMLDivElement>, phase: 'start' | 'move'): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    onScrub(xToTime(e.clientX - rect.left, pxPerMs), phase)
  }

  return (
    <div ref={scrollerRef} className={styles.scroller} data-testid="tl-scroller">
      <div className={styles.grid} style={{ width: LABEL_WIDTH + contentWidth }}>
        <div className={styles.rulerRow}>
          <div className={styles.corner} />
          <div
            className={styles.ruler}
            style={{ width: contentWidth }}
            role="slider"
            tabIndex={0}
            aria-label={t.animation.timeline.scrub}
            aria-valuemin={0}
            aria-valuemax={Math.round(length)}
            aria-valuenow={Math.round(playback.state.timeMs)}
            aria-valuetext={formatTime(playback.state.timeMs, true)}
            title={t.animation.timeline.ruler}
            data-testid="tl-ruler"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId)
              scrubFrom(e, 'start')
            }}
            onPointerMove={(e) => {
              if (e.buttons !== 0 || e.currentTarget.hasPointerCapture?.(e.pointerId)) scrubFrom(e, 'move')
            }}
            onPointerUp={(e) => {
              e.currentTarget.releasePointerCapture?.(e.pointerId)
              onScrub(0, 'end')
            }}
            onKeyDown={(e) => {
              const delta = e.shiftKey ? 1000 : TIME_STEP_MS
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault()
                onScrub(playback.state.timeMs + (e.key === 'ArrowRight' ? delta : -delta), 'start')
                onScrub(0, 'end')
              } else if (e.key === 'Home') {
                e.preventDefault()
                onScrub(0, 'start')
                onScrub(0, 'end')
              }
            }}
          >
            {ticks.map((tick) => {
              const x = timeToX(tick.ms, pxPerMs)
              // The "page end" flag hangs to the left of its line; a time label that would sit under it is left out.
              const covered = marker !== null && x < timeToX(marker, pxPerMs) && x > timeToX(marker, pxPerMs) - FLAG_REACH_PX
              return (
                <span key={tick.ms} className={styles.tick} data-major={tick.major || undefined} style={{ left: x }}>
                  {tick.major && !covered ? <span className={styles.tickLabel}>{formatTime(tick.ms)}</span> : null}
                </span>
              )
            })}
            {marker !== null ? <span className={styles.endFlag} data-late={overrun ? true : undefined} style={{ left: timeToX(marker, pxPerMs) }}>{t.animation.timeline.pageEndShort}</span> : null}
          </div>
        </div>
        {lanes.map((lane) => {
          const isSelected = selected.has(lane.object.id)
          const name = objectName(lane.object)
          return (
            <div key={lane.object.id} className={styles.row} data-selected={isSelected || undefined} role="group" aria-label={t.animation.timeline.lane(name)} data-testid={`tl-lane-${lane.object.id}`}>
              <button type="button" className={styles.laneLabel} aria-pressed={isSelected} title={t.animation.timeline.selectObject(name)} onClick={() => editor.select([lane.object.id])}>
                <KindIcon kind={kindOfDoc(lane.object)} />
                <span className={styles.laneName}>{name}</span>
              </button>
              <div
                className={styles.track}
                style={{ width: contentWidth }}
                ref={(el) => {
                  if (el) trackRefs.current.set(lane.object.id, el)
                  else trackRefs.current.delete(lane.object.id)
                }}
              >
                {lane.spans.map((span) => (
                  <Bar
                    key={span.slot}
                    span={span}
                    pxPerMs={pxPerMs}
                    late={lateIds.has(`${span.objectId}:${span.slot}`)}
                    selected={isSelected}
                    readOnly={readOnly}
                    loopEndMs={loopEnd}
                    onStart={startDrag}
                    onMove={moveDrag}
                    onEnd={endDrag}
                    onKey={onKey}
                  />
                ))}
              </div>
            </div>
          )
        })}
        {sections.map((section) => (
          <section.Section key={section.id} pageId={pageId} pxPerMs={pxPerMs} contentWidth={contentWidth} lengthMs={length} readOnly={readOnly} />
        ))}
        {marker !== null ? <div className={styles.endLine} data-late={overrun ? true : undefined} style={{ transform: `translateX(${LABEL_WIDTH + timeToX(marker, pxPerMs)}px)` }} aria-hidden="true" data-testid="tl-end" /> : null}
        <Playhead pxPerMs={pxPerMs} scroller={scrollerRef} />
      </div>
    </div>
  )
}
