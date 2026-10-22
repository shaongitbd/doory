import { FabricImage } from 'fabric'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocObject } from '@/types/document'
import { setupEditor } from '../../animation/testing'
import { readTracks } from '../../audio/model'
import { readClip } from '../../clips/model'
import type { AssetRef } from '@/types/adapter'
import { installImageStub } from '../../test/imageStub'
import type { EditorEngine } from '../editor'

const clipObject = (over: Partial<DocObject> = {}): DocObject => ({
  id: 'clip',
  type: 'image',
  name: 'Beach',
  src: '/media/poster.webp',
  left: 400,
  top: 300,
  width: 160,
  height: 90,
  originX: 'center',
  originY: 'center',
  videoSrc: '/media/c.mp4',
  videoAudioSrc: '/media/a.m4a',
  videoDurationMs: 8000,
  videoTrimStartMs: 0,
  videoTrimEndMs: 8000,
  ...over,
})

describe('video clip commands', () => {
  let restoreImages: () => void
  let engine: EditorEngine
  beforeAll(() => {
    restoreImages = installImageStub({ width: 160, height: 90 })
  })
  afterAll(() => restoreImages())
  beforeEach(async () => {
    vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined)
    // jsdom has no pixels to filter: a blurred background's filters would fail to build it.
    vi.spyOn(FabricImage.prototype, 'applyFilters').mockImplementation(() => undefined)
    ;({ engine } = await setupEditor({ objects: [clipObject(), { id: 'pic', type: 'image', src: '/media/p.png', left: 10, top: 10, width: 160, height: 90 }] }))
  })
  afterEach(async () => {
    // Let Fabric's scheduled repaint run while the drawing is still stubbed.
    await new Promise((resolve) => requestAnimationFrame(resolve))
    engine.dispose()
    vi.restoreAllMocks()
  })

  const stored = (): DocObject => engine.getDocument().pages[0].objects.find((o) => o.id === 'clip')!
  /** Lets the canvas catch up with a document change (objects it has to build are made asynchronously). */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 20))
  }

  it('reads the clip, keeps its poster as `src` and its kind as video', () => {
    expect(engine.videos.get('clip')).toMatchObject({ src: '/media/c.mp4', audioSrc: '/media/a.m4a', durationMs: 8000 })
    engine.select(['clip'])
    expect(engine.state.selection.kinds).toEqual(['video'])
    expect(stored().src).toBe('/media/poster.webp')
  })

  it('changes settings as one undo step per gesture, clamped', async () => {
    engine.videos.update('clip', { trimEndMs: 6000 }, 'Trim video', 'drag')
    engine.videos.update('clip', { trimEndMs: 5000 }, 'Trim video', 'drag')
    engine.videos.update('clip', { speed: 100, volume: -1 })
    expect(readClip(stored())).toMatchObject({ trimEndMs: 5000, speed: 4, volume: 0 })
    await engine.undo()
    expect(readClip(stored())).toMatchObject({ trimEndMs: 5000, speed: 1, volume: 1 })
    await engine.undo()
    expect(readClip(stored())?.trimEndMs).toBe(8000)
  })

  it('writes only the settings it was given, and what clamping moves because of them', () => {
    expect(engine.videos.update('clip', { volume: 0.5 })).toBe(true)
    const after = stored()
    expect(after.videoVolume).toBe(0.5)
    // The clip never had these: a co-editor's change to them is not overwritten by defaults.
    for (const key of ['videoFadeInMs', 'videoFadeOutMs', 'videoSpeed', 'videoStartMs', 'videoLoop', 'videoMuted']) expect(after).not.toHaveProperty(key)
    // A trim end before the start swaps the two: both are written.
    engine.videos.update('clip', { trimStartMs: 3000 })
    engine.videos.update('clip', { trimEndMs: 1000 })
    expect([stored().videoTrimStartMs, stored().videoTrimEndMs]).toEqual([1000, 3000])
    // Too short a trim moves the end along.
    engine.videos.update('clip', { trimStartMs: 2950 })
    expect([stored().videoTrimStartMs, stored().videoTrimEndMs]).toEqual([2950, 3050])
    expect(stored()).not.toHaveProperty('videoFadeInMs')
    expect(engine.videos.update('clip', { volume: 0.5 })).toBe(false)
  })

  it('does nothing to plain pictures', () => {
    expect(engine.videos.update('pic', { muted: true })).toBe(false)
    expect(engine.videos.get('pic')).toBeNull()
  })

  it('detaches the sound into a page track and mutes the clip, in one step', async () => {
    engine.videos.update('clip', { startMs: 500, trimStartMs: 1000, volume: 0.5 })
    expect(engine.videos.detachAudio('clip')).toBe(true)
    const [track] = readTracks(engine.getDocument())
    expect(track).toMatchObject({ kind: 'upload', name: 'Beach', src: '/media/a.m4a', scope: { type: 'page' }, startMs: 500, trimStartMs: 1000, trimEndMs: 8000, volume: 0.5 })
    expect(stored().videoMuted).toBe(true)
    await engine.undo()
    expect(readTracks(engine.getDocument())).toHaveLength(0)
    expect(stored().videoMuted).not.toBe(true)
  })

  it('cannot detach the sound of a clip that plays faster or slower (a track would drift from it)', async () => {
    const { commands, isCommandEnabled } = await import('../../commands')
    await import('../../builtins/commands')
    const detach = commands.get('video.detachAudio')!
    engine.select(['clip'])
    expect(isCommandEnabled(detach, { editor: engine, state: engine.state })).toBe(true)
    engine.videos.update('clip', { speed: 2 })
    expect(isCommandEnabled(detach, { editor: engine, state: engine.state })).toBe(false)
    expect(engine.videos.detachAudio('clip')).toBe(false)
    expect(readTracks(engine.getDocument())).toHaveLength(0)
  })

  it('cannot detach the sound of a silent clip', async () => {
    engine.dispose()
    ;({ engine } = await setupEditor({ objects: [clipObject({ videoAudioSrc: undefined })] }))
    expect(engine.videos.detachAudio('clip')).toBe(false)
    expect(readTracks(engine.getDocument())).toHaveLength(0)
  })

  it('sets a clip as the background: covers the page, at the back, locked', () => {
    expect(engine.videos.setAsBackground('clip')).toBe(true)
    const objects = engine.getDocument().pages[0].objects
    expect(objects[0].id).toBe('clip')
    const clip = objects[0]
    expect(clip.locked).toBe(true)
    // 800 x 600 page, 160 x 90 clip: scaled to cover.
    expect(Number(clip.scaleX) * 160).toBeGreaterThanOrEqual(800)
    expect(Number(clip.scaleY) * 90).toBeGreaterThanOrEqual(600)
    expect([clip.left, clip.top]).toEqual([400, 300])
  })

  it('sets a cropped clip as the background with the whole video, not the crop window moved to the corner', async () => {
    engine.dispose()
    ;({ engine } = await setupEditor({ objects: [clipObject({ cropX: 40, cropY: 20, width: 80, height: 45 })] }))
    expect(engine.videos.setAsBackground('clip')).toBe(true)
    const clip = stored()
    expect([clip.cropX, clip.cropY, clip.width, clip.height]).toEqual([0, 0, 160, 90])
    expect(Number(clip.scaleX) * 160).toBeGreaterThanOrEqual(800)
    expect(Number(clip.scaleY) * 90).toBeGreaterThanOrEqual(600)
  })

  it('adds a blurred background behind everything, which follows the clip', async () => {
    expect(engine.videos.blurredBackground('clip')).toBe(true)
    const objects = engine.getDocument().pages[0].objects
    const backdrop = objects[0]
    expect(backdrop).toMatchObject({ videoBackdropOf: 'clip', videoMuted: true, locked: true, videoSrc: '/media/c.mp4', name: 'Beach (blurred background)' })
    expect(backdrop.filters).toEqual([{ type: 'brightness', value: -0.15 }, { type: 'blur', value: 1 }])
    expect(Number(backdrop.scaleX) * Number(backdrop.width)).toBeGreaterThanOrEqual(800)
    expect(Number(backdrop.scaleY) * Number(backdrop.height)).toBeGreaterThanOrEqual(600)
    // A second one is refused; the backdrop itself gets none.
    expect(engine.videos.blurredBackground('clip')).toBe(false)
    await settle()
    expect(engine.videos.blurredBackground(backdrop.id)).toBe(false)
    // Timing edits carry over, other settings don't.
    engine.videos.update('clip', { trimStartMs: 2000, speed: 2, volume: 0.3 })
    const followed = engine.getDocument().pages[0].objects[0]
    expect(readClip(followed)).toMatchObject({ trimStartMs: 2000, speed: 2, volume: 1, muted: true })
  })

  it('splits a clip at the playhead into two that play one after the other', async () => {
    engine.videos.update('clip', { startMs: 1000, trimStartMs: 500 })
    expect(engine.videos.split('clip', 1000)).toBeNull() // at its very start
    expect(engine.videos.split('clip', 9000)).toBeNull() // after its end
    const second = engine.videos.split('clip', 3000)
    expect(second).not.toBeNull()
    const objects = engine.getDocument().pages[0].objects
    const first = readClip(objects.find((o) => o.id === 'clip')!)!
    const rest = readClip(objects.find((o) => o.id === second)!)!
    expect([first.startMs, first.trimStartMs, first.trimEndMs]).toEqual([1000, 500, 2500])
    expect([rest.startMs, rest.trimStartMs, rest.trimEndMs]).toEqual([3000, 2500, 8000])
    // They take turns: the first stands aside after its end, the second until its start.
    expect([first.hideAfter, first.hideBefore, rest.hideBefore, rest.hideAfter]).toEqual([true, false, true, false])
    // Right above the first, with the same frame, and selected once the canvas has it.
    expect(objects.findIndex((o) => o.id === second)).toBe(objects.findIndex((o) => o.id === 'clip') + 1)
    await settle()
    expect(engine.state.selection.ids).toEqual([second])
    await engine.undo()
    expect(engine.getDocument().pages[0].objects.filter((o) => o.videoSrc)).toHaveLength(1)
  })

  it('splits the blurred background with its clip', () => {
    engine.videos.blurredBackground('clip')
    const second = engine.videos.split('clip', 4000)!
    const objects = engine.getDocument().pages[0].objects
    const backdrops = objects.filter((o) => o.videoBackdropOf)
    expect(backdrops.map((o) => o.videoBackdropOf).sort()).toEqual(['clip', second].sort())
    expect(backdrops.map((o) => [o.videoTrimStartMs ?? 0, o.videoTrimEndMs]).sort()).toEqual([[0, 4000], [4000, 8000]])
  })

  it('replaces the video of a clip, keeping its frame and settings, through the Videos tool', async () => {
    engine.videos.update('clip', { volume: 0.4, trimStartMs: 1000 })
    const before = engine.getDocument().pages[0].objects.find((o) => o.id === 'clip')!
    const ref: AssetRef = {
      id: 'v2',
      url: '/media/new.mp4',
      thumbUrl: '',
      width: 160,
      height: 90,
      name: 'New',
      kind: 'video',
      video: { status: 'ready', error: '', posterUrl: '/media/new-poster.webp', audioUrl: '', durationMs: 4000, fps: 30, filmstrip: null },
    }
    engine.select(['clip'])
    expect(engine.videos.startReplace()).toBe(true)
    expect(engine.state.ui.panelId).toBe('videos')
    await engine.videos.use(ref)
    expect(engine.videos.replacing).toBeNull()
    const after = engine.getDocument().pages[0].objects.find((o) => o.id === 'clip')!
    expect(after).toMatchObject({ src: '/media/new-poster.webp', videoSrc: '/media/new.mp4', assetId: 'v2', videoVolume: 0.4, videoTrimStartMs: 0, videoTrimEndMs: 4000, videoDurationMs: 4000 })
    expect(after.videoAudioSrc).toBeUndefined()
    expect(Number(after.scaleX) * Number(after.width)).toBeCloseTo(Number(before.scaleX) * Number(before.width), 0)
    expect(engine.getDocument().pages[0].objects.filter((o) => o.videoSrc)).toHaveLength(1)
  })

  it('keeps picture tools away from clips', async () => {
    engine.select(['clip'])
    engine.style.setPlaceholder(true)
    expect(stored().isPlaceholder).toBeUndefined()
  })
})
