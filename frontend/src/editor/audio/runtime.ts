/**
 * What the audio tool keeps per editor: the player of the design, the previewer of single sounds, and the hooks the
 * panel, the timeline and the presenter read them through. It lives next to the engine (a `WeakMap`), not in the
 * document store: a playhead and a half-finished recording are not part of the design.
 */
import { useSyncExternalStore } from 'react'
import { useEditor } from '../context'
import type { EditorEngine } from '../engine/editor'
import { clockOf, pageDurationsMs } from './clock'
import { soundTracks } from '../clips/audio'
import { AudioPlayer, type PlayerState } from './player'
import { Previewer, type PreviewState } from './previewer'
import { catalogueStore, type CatalogueState } from './library'
import { disposeAudioRuntime, onRuntimeDispose } from './runtimeStore'

export { disposeAudioRuntime }

export interface AudioRuntime {
  player: AudioPlayer
  previewer: Previewer
  /** Stops following the document. */
  release(): void
}

const runtimes = new WeakMap<EditorEngine, AudioRuntime>()

function create(editor: EditorEngine): AudioRuntime {
  const player = new AudioPlayer({
    tracks: () => soundTracks(editor.getDocument()),
    pageIds: () => editor.getDocument().pages.map((p) => p.id),
    pageDurationsMs: () => pageDurationsMs(editor.getDocument()),
    load: (track, signal) => editor.audio.sources.load(track, signal),
    createContext: () => new AudioContext(),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (handle) => window.clearInterval(handle),
  })
  // When the design's tracks change (or an undo or a collaborator changes them) while it plays, the player follows. Nothing
  // is computed while it is idle: the store changes on every pointer move of a drag, and playing reads the document afresh.
  // The design's tracks and its clips' sounds; compared by content, as a clip's sound changes with the page's objects.
  let tracks = JSON.stringify(soundTracks(editor.getDocument()))
  let lengths = JSON.stringify(clockOf(editor.getDocument()).pages)
  const unsubscribe = editor.store.subscribe((state) => {
    const status = player.getSnapshot().status
    if (status !== 'playing' && status !== 'paused') return
    const next = JSON.stringify(soundTracks(state.doc))
    const nextLengths = JSON.stringify(clockOf(state.doc).pages)
    if (next === tracks && nextLengths === lengths) return
    tracks = next
    lengths = nextLengths
    player.refresh()
  })
  const previewer = new Previewer()
  // Only one sound at a time: starting either one silences the other.
  let previewKey: string | null = null
  previewer.subscribe(() => {
    const s = previewer.getSnapshot()
    if (s.key !== previewKey && s.status === 'loading') {
      if (player.getSnapshot().status === 'playing') void player.pause()
    }
    previewKey = s.key
  })
  player.subscribe(() => {
    if (player.getSnapshot().status === 'playing' && previewer.getSnapshot().status === 'playing') previewer.stop()
  })
  return { player, previewer, release: unsubscribe }
}

export function audioRuntime(editor: EditorEngine): AudioRuntime {
  let runtime = runtimes.get(editor)
  if (!runtime) {
    const created = create(editor)
    runtime = created
    runtimes.set(editor, created)
    onRuntimeDispose(editor, () => {
      created.release()
      created.player.dispose()
      created.previewer.dispose()
      runtimes.delete(editor)
    })
  }
  return runtime
}

export function usePlayer(): PlayerState {
  const { player } = audioRuntime(useEditor())
  return useSyncExternalStore(player.subscribe, player.getSnapshot)
}

export function usePreview(): PreviewState {
  const { previewer } = audioRuntime(useEditor())
  return useSyncExternalStore(previewer.subscribe, previewer.getSnapshot)
}

export function useCatalogue(): CatalogueState {
  catalogueStore.ensure()
  return useSyncExternalStore(catalogueStore.subscribe, catalogueStore.getSnapshot)
}
