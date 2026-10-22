import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { DoryDocument } from '@/types/document'
import { useEditor } from '../context'
import { useLatest } from '../hooks/useLatest'
import { t } from '../strings'
import { readTracks } from '../audio/model'
import { transitionOf } from '../animation/model'
import { clipTracks } from '../clips/audio'
import type { SlideshowState } from './machine'
import { ShowAudio, type ShowAudioState } from './showAudio'

export interface ShowSound extends ShowAudioState {
  setMuted(muted: boolean): void
}

/**
 * The sound of a slideshow of `doc` (the snapshot the show works on), following `state`. Everything that makes it
 * sound is in `showAudio.ts`; this hook builds it for the editor's source loader and keeps it in step with the show.
 */
export function useShowAudio(doc: DoryDocument, state: SlideshowState, onNotice: (text: string) => void): ShowSound {
  const editor = useEditor()
  const notify = useLatest(onNotice)
  const audio = useMemo(
    () =>
      new ShowAudio({
        // The clips' sounds start when their page has come in, after the transition into it (as the pictures do).
        tracks: () => [...readTracks(doc), ...clipTracks(doc, (pageId) => transitionOf(doc.pages.find((p) => p.id === pageId) ?? { transition: undefined })?.durationMs ?? 0)],
        pageIds: () => doc.pages.map((page) => page.id),
        load: (track, signal) => editor.audio.sources.load(track, signal),
        createContext: () => new AudioContext(),
        later: (handler, ms) => window.setTimeout(handler, ms),
      }),
    [doc, editor],
  )
  const sound = useSyncExternalStore(audio.subscribe, audio.getSnapshot)

  // Tell the show when the browser holds the sound back, and when a file could not be loaded (once each).
  useEffect(() => {
    let blocked = false
    let failed = 0
    return audio.subscribe(() => {
      const now = audio.getSnapshot()
      if (now.blocked && !blocked) notify.current(t.audio.presenter.blocked)
      if (now.failed.length > failed) notify.current(t.audio.presenter.failed(now.failed.join(', ')))
      blocked = now.blocked
      failed = now.failed.length
    })
  }, [audio, notify])

  useEffect(() => {
    audio.setView({ index: state.index, ended: state.ended, paused: state.paused, totalMs: state.totalMs })
  }, [audio, state.index, state.ended, state.paused, state.totalMs])

  // The browser may hold the sound back until a gesture; any key press or click in the show lets it through.
  useEffect(() => {
    const unlock = (): void => void audio.unlock()
    document.addEventListener('pointerdown', unlock, true)
    document.addEventListener('keydown', unlock, true)
    return () => {
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
      audio.dispose()
    }
  }, [audio])

  return useMemo(() => ({ ...sound, setMuted: (muted: boolean) => audio.setMuted(muted) }), [sound, audio])
}
