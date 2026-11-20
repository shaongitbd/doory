/** Play the sound of the page in view, or of the whole design, from the Audio tool. */
import { Pause, Play, Square } from 'lucide-react'
import { useEditor, useEditorState } from '../context'
import { formatTime } from '../animation/timelineMath'
import type { PlayRange } from '../audio/player'
import { audioRuntime, usePlayer } from '../audio/runtime'
import { t } from '../strings'
import { Button } from '../ui/Button'
import styles from './Audio.module.css'

const sameRange = (a: PlayRange | null, b: PlayRange): boolean => a !== null && a.mode === b.mode && (a.mode === 'all' || (b.mode === 'page' && a.pageId === b.pageId))

export function AudioTransport() {
  const editor = useEditor()
  const { player } = audioRuntime(editor)
  const state = usePlayer()
  const pageId = useEditorState((s) => s.activePageId)
  // Re-read when the tracks change: the buttons are disabled while there is nothing to hear.
  const tracks = useEditorState((s) => s.doc.audioTracks)
  const pageRange: PlayRange = { mode: 'page', pageId }
  const allRange: PlayRange = { mode: 'all' }
  const canPage = tracks !== undefined && player.hasAudio(pageRange)
  const canAll = tracks !== undefined && player.hasAudio(allRange)

  const button = (range: PlayRange, label: string, enabled: boolean, testId: string) => {
    const mine = sameRange(state.range, range)
    const playing = mine && state.status === 'playing'
    const paused = mine && state.status === 'paused'
    const loading = mine && state.status === 'loading'
    return (
      <Button
        size="sm"
        variant={playing || paused ? 'primary' : 'soft'}
        disabled={!enabled || loading}
        aria-busy={loading || undefined}
        title={enabled ? undefined : t.audio.transport.nothing}
        data-testid={testId}
        icon={playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        onClick={() => void player.toggle(range)}
      >
        {playing ? t.audio.transport.pause : paused ? t.audio.transport.resume : label}
      </Button>
    )
  }

  const active = state.status !== 'idle'
  return (
    <section className={styles.transport} aria-label={t.audio.transport.region} data-testid="audio-transport" data-state={state.status}>
      <div className={styles.transportButtons}>
        {button(pageRange, t.audio.transport.playPage, canPage, 'audio-play-page')}
        {button(allRange, t.audio.transport.playAll, canAll, 'audio-play-all')}
        {active ? (
          <Button size="sm" variant="ghost" icon={<Square size={13} aria-hidden="true" />} onClick={() => player.stop()} data-testid="audio-stop">
            {t.audio.transport.stop}
          </Button>
        ) : null}
      </div>
      {active ? (
        <div className={styles.transportTime} role="timer" aria-label={t.audio.transport.time(formatTime(state.positionMs - state.startMs, true), formatTime(state.endMs - state.startMs, true))} data-testid="audio-time">
          <span>{formatTime(Math.max(0, state.positionMs - state.startMs), true)}</span>
          <div className={styles.transportBar} aria-hidden="true">
            <span style={{ transform: `scaleX(${state.endMs > state.startMs ? Math.min(1, Math.max(0, (state.positionMs - state.startMs) / (state.endMs - state.startMs))) : 0})` }} />
          </div>
          <span>{formatTime(state.endMs - state.startMs, true)}</span>
        </div>
      ) : null}
      {state.status === 'loading' ? (
        <p className={styles.note} role="status">
          {t.audio.transport.loading}
        </p>
      ) : null}
      {state.blocked ? (
        <p className={styles.warn} role="alert">
          {t.audio.transport.blocked}
        </p>
      ) : null}
      {state.error ? (
        <p className={styles.warn} role="alert">
          {t.audio.transport.failed}
        </p>
      ) : null}
      {state.failed.length > 0 ? (
        <p className={styles.warn} role="alert" data-testid="audio-failed">
          {t.audio.transport.failed} ({state.failed.join(', ')})
        </p>
      ) : null}
    </section>
  )
}
