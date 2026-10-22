import { useEffect } from 'react'
import { useEditor, useEditorState } from '../context'
import { disposeAudioRuntime } from '../audio/runtimeStore'
import { hasClipSound } from '../clips/audio'
import { loadable } from '../ui/loadable'

// The player is only needed once the design has sound: its code (the audio graph, decoding, the mixer) comes with the first track.
const Sync = loadable(() => import('./AudioSync').then((m) => m.AudioSync), { fallback: null, failed: () => null })

/**
 * Mounted once next to the other editor-wide hosts. While the design has audio tracks it mounts `AudioSync` (the
 * timeline's playhead drives the sound); when the editor goes away it releases the audio context, whichever part used it.
 */
export function AudioSyncHost() {
  const editor = useEditor()
  const hasSound = useEditorState((s) => (s.doc.audioTracks?.length ?? 0) > 0 || hasClipSound(s.doc))
  useEffect(() => () => disposeAudioRuntime(editor), [editor])
  return hasSound ? <Sync /> : null
}
