import { describe, expect, it } from 'vitest'
import type { DoryDocument } from '@/types/document'
import { clipTracks, hasClipSound, isClipVoice, soundTracks } from './audio'

const clip = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'image', videoSrc: '/media/c.mp4', videoAudioSrc: '/media/a.m4a', videoDurationMs: 8000, videoTrimStartMs: 1000, videoTrimEndMs: 5000, videoStartMs: 500, ...extra })
const doc = (objects: Record<string, unknown>[], extra: Partial<DoryDocument> = {}): DoryDocument =>
  ({ schemaVersion: 1, width: 100, height: 100, unit: 'px', pages: [{ id: 'p1', background: { type: 'solid', color: '#fff' }, objects }], ...extra }) as DoryDocument

describe('clip sounds', () => {
  it('are page tracks that follow the clip', () => {
    const [track] = clipTracks(doc([clip('v1', { videoVolume: 0.4, videoFadeInMs: 300, videoLoop: true })]))
    expect(track).toMatchObject({ id: 'video:v1', kind: 'upload', src: '/media/a.m4a', scope: { type: 'page', pageId: 'p1' }, startMs: 500, trimStartMs: 1000, trimEndMs: 5000, volume: 0.4, fadeInMs: 300, loop: true, duckUnderVoiceover: false })
    expect(isClipVoice(track)).toBe(true)
  })

  it('leave out silent, muted, quiet and sped-up clips', () => {
    const silent = clip('a', { videoAudioSrc: undefined })
    const muted = clip('b', { videoMuted: true })
    const quiet = clip('c', { videoVolume: 0 })
    const fast = clip('d', { videoSpeed: 2 })
    expect(clipTracks(doc([silent, muted, quiet, fast]))).toEqual([])
    expect(hasClipSound(doc([silent]))).toBe(false)
  })

  it('start later by the lead the exporter gives a page', () => {
    expect(clipTracks(doc([clip('v1')]), () => 700)[0].startMs).toBe(1200)
  })

  it('come after the design tracks, and the list is kept while nothing changes', () => {
    const design = doc([clip('v1')], { audioTracks: [{ id: 't1', kind: 'music', name: 'M', src: '/media/m.mp3', scope: { type: 'design' }, startMs: 0, trimStartMs: 0, trimEndMs: 1000, volume: 1, fadeInMs: 0, fadeOutMs: 0, loop: false, muted: false }] })
    const tracks = soundTracks(design)
    expect(tracks.map((t) => t.id)).toEqual(['t1', 'video:v1'])
    expect(soundTracks(design)).toBe(tracks)
  })
})
