/**
 * A clip's sound in the audio mix. The server stores each clip's sound as a file of its own (`videoAudioSrc`), so a
 * clip contributes an ordinary page-scoped track to the player, the slideshow and the export mixdown: same start, trim,
 * volume, fades and loop as the picture. These tracks are derived on the fly and never written to the document (their
 * ids start with `video:`), so the Audio tool's track list only shows the design's own tracks.
 *
 * The audio model has no playback rate: a clip that plays faster or slower than its own speed is silent.
 */
import type { AudioTrack, DoryDocument } from '@/types/document'
import { normalizeTrack, readTracks } from '../audio/model'
import { readClip } from './model'

export const CLIP_VOICE_PREFIX = 'video:'

export function isClipVoice(track: Pick<AudioTrack, 'id'>): boolean {
  return track.id.startsWith(CLIP_VOICE_PREFIX)
}

/**
 * The sound of every audible clip, as page tracks. `leadMs(pageId)` moves a page's clip sounds later: the exporter's
 * page clock starts with the transition into the page, the picture's once the page has come in.
 */
export function clipTracks(doc: Pick<DoryDocument, 'pages'>, leadMs: (pageId: string) => number = () => 0): AudioTrack[] {
  const out: AudioTrack[] = []
  for (const page of doc.pages) {
    for (const obj of page.objects) {
      const clip = readClip(obj)
      if (!clip || !clip.audioSrc || clip.muted || clip.volume <= 0 || clip.speed !== 1) continue
      const track = normalizeTrack({
        id: `${CLIP_VOICE_PREFIX}${obj.id}`,
        kind: 'upload',
        name: typeof obj.name === 'string' ? obj.name : '',
        src: clip.audioSrc,
        scope: { type: 'page', pageId: page.id },
        startMs: clip.startMs + Math.max(0, leadMs(page.id)),
        durationMs: clip.durationMs,
        trimStartMs: clip.trimStartMs,
        trimEndMs: clip.trimEndMs,
        volume: clip.volume,
        fadeInMs: clip.fadeInMs,
        fadeOutMs: clip.fadeOutMs,
        loop: clip.loop,
        duckUnderVoiceover: false,
      })
      if (track) out.push(track)
    }
  }
  return out
}

/** True when some clip of the design has a sound that plays. */
export function hasClipSound(doc: Pick<DoryDocument, 'pages'>): boolean {
  return clipTracks(doc).length > 0
}

const soundCache = new WeakMap<object, { tracks: readonly AudioTrack[]; result: readonly AudioTrack[] }>()

/** The design's tracks followed by its clips' sounds (as the editor preview plays them). Cached per document state. */
export function soundTracks(doc: Pick<DoryDocument, 'pages' | 'audioTracks'>): readonly AudioTrack[] {
  const tracks = readTracks(doc)
  const hit = soundCache.get(doc.pages)
  if (hit && hit.tracks === tracks) return hit.result
  const clips = clipTracks(doc)
  const result = clips.length === 0 ? tracks : [...tracks, ...clips]
  soundCache.set(doc.pages, { tracks, result })
  return result
}
