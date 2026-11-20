/**
 * The Record tab: a voiceover from the microphone. The person starts it, sees the browser's permission prompt, gets a
 * 3-2-1 countdown with a live level meter, records, listens back and then keeps it (as a track of the whole design or of
 * this page) or retakes it. Every way the microphone can be unavailable has its own plain message.
 */
import { Mic, Pause, Play, RotateCcw, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useEditor, useEditorState } from '../context'
import { formatSeconds } from '../animation/timelineMath'
import { type Peaks, computePeaks } from '../audio/peaks'
import { type RecorderState, VoiceRecorder, browserDeps, formatClock } from '../audio/recorder'
import { audioRuntime, usePreview } from '../audio/runtime'
import { decodeBytes } from '../audio/sources'
import { t } from '../strings'
import { audioErrorMessage, recordingErrorMessage } from '../audio/messages'
import { Button } from '../ui/Button'
import { AudioWaveform } from './AudioWaveform'
import styles from './Audio.module.css'

function useRecorder(): VoiceRecorder {
  const recorder = useMemo(() => new VoiceRecorder(browserDeps()), [])
  useEffect(() => () => recorder.dispose(), [recorder])
  return recorder
}

function Meter({ level }: { level: number }) {
  return (
    <div className={styles.meter} role="meter" aria-label={t.audio.record.level} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} data-testid="audio-meter">
      <span style={{ transform: `scaleX(${level})` }} />
    </div>
  )
}

/** The finished take: playback, waveform, and what to do with it. */
function Take({ state, recorder }: { state: Extract<RecorderState, { status: 'recorded' }>; recorder: VoiceRecorder }) {
  const editor = useEditor()
  const { previewer } = audioRuntime(editor)
  const preview = usePreview()
  const mode = useEditorState((s) => s.mode)
  const urlRef = useRef<string | null>(null)
  const [peaks, setPeaks] = useState<Peaks | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const key = 'recording'
  const playing = preview.key === key && preview.status === 'playing'

  useEffect(() => {
    let cancelled = false
    state.blob
      .arrayBuffer()
      .then(decodeBytes)
      .then(computePeaks)
      .then((p) => {
        if (!cancelled) setPeaks(p)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      previewer.stop()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [state.blob, previewer])

  const objectUrl = (): string => {
    urlRef.current ??= URL.createObjectURL(state.blob)
    return urlRef.current
  }

  const keep = async (scope: 'design' | 'page'): Promise<void> => {
    setSaving(true)
    setProblem(null)
    try {
      await editor.audio.addRecording(state.blob, scope === 'design' ? { type: 'design' } : { type: 'page', pageId: editor.state.activePageId })
      editor.toast(t.audio.record.saved, 'success')
      recorder.reset()
    } catch (error) {
      setProblem(audioErrorMessage(error, t.audio.errors.recordSave))
      setSaving(false)
    }
  }

  return (
    <div className={styles.take} data-testid="audio-take">
      <p className={styles.rowTitle}>
        <span className={styles.rowName}>{t.audio.record.review}</span>
        <span className={styles.rowMeta}>{formatSeconds(state.durationMs)}</span>
      </p>
      <div className={styles.takePlayer}>
        <Button
          size="sm"
          variant="soft"
          pressed={playing}
          aria-label={t.audio.record.playback}
          icon={playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          data-testid="audio-take-play"
          onClick={() => void previewer.toggle(key, async () => objectUrl(), { durationMs: state.durationMs })}
        >
          {playing ? t.audio.transport.pause : t.audio.record.play}
        </Button>
        <AudioWaveform peaks={peaks} name={t.audio.record.review} height={36} loading={peaks === null} progress={preview.key === key ? Math.min(1, preview.positionMs / Math.max(1, state.durationMs)) : undefined} />
      </div>
      {mode === 'guest' ? <p className={styles.fine}>{t.audio.record.guestNote}</p> : null}
      {problem ? (
        <p className={styles.warn} role="alert" data-testid="audio-record-error">
          {problem}
        </p>
      ) : null}
      <div className={styles.cardActions}>
        <Button size="sm" variant="primary" disabled={saving} onClick={() => void keep('design')} data-testid="audio-record-save-design">
          {saving ? t.audio.record.saving : t.audio.library.addToDesign}
        </Button>
        <Button size="sm" variant="soft" disabled={saving} onClick={() => void keep('page')} data-testid="audio-record-save-page">
          {t.audio.library.addToPage}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} icon={<RotateCcw size={13} aria-hidden="true" />} onClick={() => recorder.retake()} data-testid="audio-record-retake">
          {t.audio.record.retake}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={() => recorder.reset()} data-testid="audio-record-discard">
          {t.audio.record.discard}
        </Button>
      </div>
    </div>
  )
}

export function AudioRecordTab() {
  const readOnly = useEditorState((s) => s.readOnly)
  const recorder = useRecorder()
  const state = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot)
  const [blocked, setBlocked] = useState(false)
  const started = useRef(false)

  // If the browser already says "never", say it before the person presses anything.
  useEffect(() => {
    if (started.current || typeof navigator === 'undefined' || !navigator.permissions) return
    started.current = true
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => setBlocked(status.state === 'denied'))
      .catch(() => undefined)
  }, [])

  if (readOnly) return <p className={styles.empty}>{t.audio.errors.readOnly}</p>

  return (
    <div className={styles.tab} data-testid="audio-record" data-state={state.status}>
      <h3 className={styles.sectionTitle}>{t.audio.record.title}</h3>
      {state.status === 'idle' || state.status === 'error' ? <p className={styles.hint}>{t.audio.record.intro}</p> : null}

      {state.status === 'idle' ? (
        <>
          {blocked ? (
            <p className={styles.warn} role="alert" data-testid="audio-record-denied">
              {t.audio.record.blocked}
            </p>
          ) : null}
          <Button variant="primary" icon={<Mic size={16} aria-hidden="true" />} onClick={() => void recorder.begin()} data-testid="audio-record-start">
            {t.audio.record.start}
          </Button>
        </>
      ) : null}

      {state.status === 'requesting' ? (
        <div className={styles.recorder} role="status" data-testid="audio-record-requesting">
          <span className={styles.spinner} aria-hidden="true" />
          <p>{t.audio.record.requesting}</p>
          <p className={styles.hint}>{t.audio.record.requestingHint}</p>
        </div>
      ) : null}

      {state.status === 'countdown' ? (
        <div className={styles.recorder} data-testid="audio-record-countdown">
          <p className={styles.countdown} role="timer" aria-live="assertive" aria-label={t.audio.record.countdown(state.remaining)}>
            {state.remaining}
          </p>
          <Meter level={state.level} />
          <Button size="sm" variant="ghost" onClick={() => recorder.stop()} data-testid="audio-record-cancel">
            {t.audio.record.cancel}
          </Button>
        </div>
      ) : null}

      {state.status === 'recording' ? (
        <div className={styles.recorder} data-testid="audio-record-recording">
          <p className={styles.recording}>
            <span className={styles.dot} aria-hidden="true" />
            {t.audio.record.recording}
            <span className={styles.elapsed} role="timer" aria-label={t.audio.record.elapsed(formatClock(state.elapsedMs))}>
              {formatClock(state.elapsedMs)}
            </span>
          </p>
          <Meter level={state.level} />
          <Button variant="danger" icon={<Square size={14} aria-hidden="true" />} onClick={() => recorder.stop()} data-testid="audio-record-stop">
            {t.audio.record.stop}
          </Button>
        </div>
      ) : null}

      {state.status === 'recorded' ? <Take state={state} recorder={recorder} /> : null}

      {state.status === 'error' ? (
        <div className={styles.problem} role="alert" data-testid="audio-record-error" data-reason={state.reason}>
          <p>{recordingErrorMessage(state.reason)}</p>
          <Button size="sm" variant="soft" onClick={() => void recorder.begin()} data-testid="audio-record-retry">
            {t.audio.record.tryAgain}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
