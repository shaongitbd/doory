/**
 * The audio rows of the timeline (a registered section, `animation/sections.ts`): one row per track that sounds on the
 * page in view, on the page's own clock. A bar shows the part of the sound that plays, as a waveform; drag it to move
 * the track, drag its edges to trim, and it snaps to a tenth of a second, to the other bars, the playhead and the end
 * of the page. Each row has a mute and a solo switch. Everything goes through `editor.audio`, so a drag is one undo
 * step and reaches collaborators as the track it is.
 *
 * Tracks of the whole design are drawn here too, where they reach this page: a piece of music that began on an earlier
 * page enters from the left edge, and a bar cut by the end of the page says so.
 */
import { msg } from '@/i18n/catalog'
import { Headphones, Layers, File, FileAudio, Mic, Music, Plus, Sparkles, Volume2, VolumeX } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import type { AudioTrack, AudioTrackKind } from '@/types/document'
import { useEditor, useEditorState } from '../context'
import { TIME_STEP_MS } from '../animation/model'
import { MIN_BAR_PX, SNAP_PX, formatSeconds, formatTime, snapTime, timeToX, xToTime } from '../animation/timelineMath'
import { playbackOf } from '../animation/playback'
import type { TimelineSectionProps } from '../animation/sections'
import { scopeLabel } from '../audio/labels'
import { catalogueStore } from '../audio/library'
import { trimmedLengthMs } from '../audio/model'
import { audioRuntime, usePlayer } from '../audio/runtime'
import { type TimelineItem, type TrackTimes, moveEdit, timesOf, trimEndEdit, trimStartEdit } from '../audio/timelineModel'
import { useTimelineItems } from '../audio/useTimelineItems'
import { useWaveform } from '../audio/useWaveform'
import { AudioWaveform } from '../panels/AudioWaveform'
import { t } from '../strings'
import { TimelineRow } from './TimelineRow'
import styles from './TimelineAudio.module.css'

const COPY = t.audio.timeline
const KIND_ICON: Record<AudioTrackKind, typeof Music> = { music: Music, voiceover: Mic, sfx: Sparkles, upload: FileAudio }
const BAR_KEY_MS = 1000

type Part = 'move' | 'start' | 'end'

interface DragState {
  id: string
  part: Part
  from: TrackTimes
  sourceMs: number
  /** Where the pointer was on the bar, ms from the edge it grabbed. */
  grabMs: number
  startMs: number
  fullEndMs: number
  targets: number[]
}

interface BarProps {
  item: TimelineItem
  pxPerMs: number
  readOnly: boolean
  dim: boolean
  onStart(item: TimelineItem, part: Part, e: React.PointerEvent<HTMLDivElement>): void
  onMove(e: React.PointerEvent<HTMLDivElement>): void
  onEnd(): void
  onKey(item: TimelineItem, e: React.KeyboardEvent<HTMLDivElement>): void
  pages: readonly string[]
}

const Bar = memo(function Bar({ item, pxPerMs, readOnly, dim, onStart, onMove, onEnd, onKey, pages }: BarProps) {
  const { track } = item
  const wave = useWaveform(track, { precise: false })
  const visStart = Math.max(0, item.startMs)
  const visEnd = Math.min(item.endMs, item.scopeEndMs)
  const windowEnd = Math.min(item.fullEndMs, visEnd)
  const clippedStart = item.startMs < 0
  const cutEnd = !track.loop && item.fullEndMs > item.scopeEndMs
  const loops = track.loop && item.fullEndMs < visEnd
  const left = timeToX(visStart, pxPerMs)
  const width = Math.max(MIN_BAR_PX, timeToX(visEnd - visStart, pxPerMs))
  const waveWidth = Math.max(0, timeToX(windowEnd - visStart, pxPerMs))
  const fromMs = track.trimStartMs + (visStart - item.startMs)
  const toMs = track.trimStartMs + (windowEnd - item.startMs)
  const name = track.name || t.audio.tracks.kinds[track.kind]
  const label = COPY.bar(name, t.audio.tracks.kinds[track.kind], scopeLabel(track, pages), formatTime(Math.max(0, item.startMs), true), formatSeconds(trimmedLengthMs(track)))
  const part = (e: React.PointerEvent<HTMLDivElement>): Part => ((e.target as HTMLElement).dataset.edge === 'start' ? 'start' : (e.target as HTMLElement).dataset.edge === 'end' ? 'end' : 'move')

  return (
    <div
      className={styles.bar}
      data-kind={track.kind}
      data-scope={track.scope.type}
      data-muted={track.muted || undefined}
      data-dim={dim || undefined}
      data-clipped={clippedStart || undefined}
      data-cut={cutEnd || undefined}
      data-testid={`tl-audio-bar-${track.id}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-keyshortcuts={readOnly ? undefined : 'ArrowLeft ArrowRight Alt+ArrowLeft Alt+ArrowRight Delete'}
      title={readOnly ? label : `${label}. ${COPY.barKeys}`}
      style={{ left, width }}
      onPointerDown={(e) => onStart(item, part(e), e)}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onKeyDown={(e) => onKey(item, e)}
    >
      {readOnly || clippedStart ? null : <span className={styles.handle} data-edge="start" aria-hidden="true" />}
      <span className={styles.wave} style={{ width: waveWidth }} aria-hidden="true">
        <AudioWaveform peaks={wave.peaks} name={name} height={18} fromMs={fromMs} toMs={toMs} loading={wave.status === 'loading'} />
      </span>
      {loops ? <span className={styles.loopTail} style={{ left: waveWidth }} aria-hidden="true" /> : null}
      <span className={styles.scope} aria-hidden="true">
        {track.scope.type === 'design' ? <Layers size={10} /> : <File size={10} />}
      </span>
      {readOnly || cutEnd ? null : <span className={`${styles.handle} ${styles.handleEnd}`} data-edge="end" style={track.loop ? { left: waveWidth, right: 'auto' } : undefined} aria-hidden="true" />}
    </div>
  )
})

interface RowSwitchProps {
  track: AudioTrack
  soloed: boolean
  readOnly: boolean
}

function RowSwitches({ track, soloed, readOnly }: RowSwitchProps) {
  const editor = useEditor()
  const { player } = audioRuntime(editor)
  const name = track.name || t.audio.tracks.kinds[track.kind]
  return (
    <span className={styles.switches} data-active={track.muted || soloed || undefined}>
      <button
        type="button"
        className={styles.switch}
        aria-pressed={track.muted}
        aria-label={track.muted ? t.audio.tracks.unmute(name) : t.audio.tracks.mute(name)}
        title={track.muted ? t.audio.tracks.unmute(name) : t.audio.tracks.mute(name)}
        disabled={readOnly}
        data-testid={`tl-audio-mute-${track.id}`}
        onClick={() => editor.audio.setMuted(track.id, !track.muted)}
      >
        {track.muted ? <VolumeX size={13} aria-hidden="true" /> : <Volume2 size={13} aria-hidden="true" />}
      </button>
      <button
        type="button"
        className={styles.switch}
        aria-pressed={soloed}
        aria-label={`${COPY.solo}: ${name}`}
        title={`${COPY.solo}: ${name}`}
        data-testid={`tl-audio-solo-${track.id}`}
        onClick={() => player.setSolo(soloed ? null : track.id)}
      >
        <Headphones size={13} aria-hidden="true" />
      </button>
    </span>
  )
}

/** The audio rows of the timeline. */
export function AudioSection({ pageId, pxPerMs, contentWidth, readOnly }: TimelineSectionProps) {
  const editor = useEditor()
  const items = useTimelineItems(pageId)
  const pageIds = useEditorState((s) => s.doc.pages)
  const pages = useMemo(() => pageIds.map((p) => p.id), [pageIds])
  const player = usePlayer()
  const drag = useRef<DragState | null>(null)
  const playback = playbackOf(editor)
  // Library tracks draw the catalogue's peaks at once; the catalogue is only asked for when there is such a track.
  const wantsCatalogue = items.some((i) => i.track.libraryId !== undefined)
  useEffect(() => {
    if (wantsCatalogue) catalogueStore.ensure()
  }, [wantsCatalogue])

  const startDrag = useCallback(
    (item: TimelineItem, part: Part, e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || readOnly) return
      const bar = e.currentTarget
      const trackLeft = bar.parentElement?.getBoundingClientRect().left ?? 0
      const pointerMs = xToTime(e.clientX - trackLeft, pxPerMs)
      const edge = part === 'end' ? item.fullEndMs : item.startMs
      const others = items.filter((i) => i.track.id !== item.track.id).flatMap((i) => [i.startMs, Math.min(i.endMs, i.scopeEndMs)])
      drag.current = {
        id: item.track.id,
        part,
        from: timesOf(item.track),
        sourceMs: item.track.durationMs ?? item.track.trimEndMs,
        grabMs: pointerMs - edge,
        startMs: item.startMs,
        fullEndMs: item.fullEndMs,
        targets: [0, item.scopeEndMs, playback.state.timeMs, ...others],
      }
      editor.sealHistory()
      bar.setPointerCapture?.(e.pointerId)
    },
    [editor, items, playback, pxPerMs, readOnly],
  )

  const moveDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d) return
      const trackLeft = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0
      const wanted = xToTime(e.clientX - trackLeft, pxPerMs) - d.grabMs
      const threshold = SNAP_PX / pxPerMs
      const key = `audio-bar:${d.id}:${d.part}`
      if (d.part === 'move') {
        const startSnap = snapTime(wanted, d.targets, threshold)
        const length = d.fullEndMs - d.startMs
        const endSnap = snapTime(wanted + length, d.targets, threshold) - length
        const start = Math.abs(startSnap - wanted) <= Math.abs(endSnap - wanted) ? startSnap : endSnap
        editor.audio.update(d.id, moveEdit(d.from, start - d.startMs), t.audio.history.move, key)
      } else if (d.part === 'start') {
        editor.audio.update(d.id, trimStartEdit(d.from, snapTime(wanted, d.targets, threshold) - d.startMs), t.audio.history.trim, key)
      } else {
        editor.audio.update(d.id, trimEndEdit(d.from, snapTime(wanted, d.targets, threshold) - d.fullEndMs, d.sourceMs), t.audio.history.trim, key)
      }
    },
    [editor, pxPerMs],
  )

  const endDrag = useCallback(() => {
    if (!drag.current) return
    drag.current = null
    editor.sealHistory()
  }, [editor])

  const onKey = useCallback(
    (item: TimelineItem, e: React.KeyboardEvent<HTMLDivElement>) => {
      if (readOnly) return
      const id = item.track.id
      const amount = e.shiftKey ? BAR_KEY_MS : TIME_STEP_MS
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const delta = (e.key === 'ArrowLeft' ? -1 : 1) * amount
        if (e.altKey) editor.audio.update(id, trimEndEdit(timesOf(item.track), delta, item.track.durationMs ?? item.track.trimEndMs), t.audio.history.trim, `audio-bar-key:${id}:end`)
        else editor.audio.update(id, moveEdit(timesOf(item.track), delta), t.audio.history.move, `audio-bar-key:${id}:move`)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        e.stopPropagation()
        editor.audio.remove(id)
      }
    },
    [editor, readOnly],
  )

  if (items.length === 0) {
    if (readOnly) return null
    return (
      <TimelineRow label={COPY.group} icon={<Music size={14} aria-hidden="true" />} contentWidth={contentWidth} name={COPY.group} testId="tl-audio-empty">
        <button type="button" className={styles.add} data-testid="tl-audio-add" onClick={() => editor.patchUi({ panelId: 'audio' })}>
          <Plus size={13} aria-hidden="true" />
          {COPY.add}
        </button>
      </TimelineRow>
    )
  }

  return (
    <>
      {items.map((item) => {
        const { track } = item
        const Icon = KIND_ICON[track.kind]
        const name = track.name || t.audio.tracks.kinds[track.kind]
        const soloed = player.soloId === track.id
        return (
          <TimelineRow
            key={track.id}
            icon={<Icon size={14} aria-hidden="true" />}
            label={
              <span className={styles.labelBody}>
                <span className={styles.labelName}>{name}</span>
                <RowSwitches track={track} soloed={soloed} readOnly={readOnly} />
              </span>
            }
            contentWidth={contentWidth}
            name={COPY.lane(name)}
            className={styles.audioRow}
            testId={`tl-audio-${track.id}`}
          >
            <Bar item={item} pxPerMs={pxPerMs} readOnly={readOnly} dim={player.soloId !== null && !soloed} pages={pages} onStart={startDrag} onMove={moveDrag} onEnd={endDrag} onKey={onKey} />
          </TimelineRow>
        )
      })}
    </>
  )
}

/** The compact list of a narrow screen: a line per track with its times and a mute switch. */
export function AudioList({ pageId, readOnly }: { pageId: string; readOnly: boolean }) {
  const editor = useEditor()
  const items = useTimelineItems(pageId)
  const pageIds = useEditorState((s) => s.doc.pages)
  const pages = useMemo(() => pageIds.map((p) => p.id), [pageIds])
  if (items.length === 0) return null
  return (
    <ul className={styles.list} aria-label={COPY.group} data-testid="tl-audio-list">
      {items.map(({ track, startMs, endMs, scopeEndMs }) => {
        const name = track.name || t.audio.tracks.kinds[track.kind]
        return (
          <li key={track.id} className={styles.listItem} data-muted={track.muted || undefined}>
            <span className={styles.listName}>{name}</span>
            <span className={styles.listMeta}>
              {scopeLabel(track, pages)} · {formatTime(Math.max(0, startMs), true)} {msg('to')} {formatTime(Math.min(endMs, scopeEndMs), true)}
            </span>
            {readOnly ? null : (
              <button type="button" className={styles.switch} aria-pressed={track.muted} aria-label={track.muted ? t.audio.tracks.unmute(name) : t.audio.tracks.mute(name)} onClick={() => editor.audio.setMuted(track.id, !track.muted)}>
                {track.muted ? <VolumeX size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
