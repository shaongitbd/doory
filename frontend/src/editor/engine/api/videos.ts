/**
 * Video clip commands. A clip is a picture (its poster) with `video…` props (see `clips/model.ts`), so placing,
 * moving, cropping, masking, adjusting and animating it are the picture commands; what is here is what only clips
 * have: adding one from an asset, its playback settings, "Set as background", "Blurred background", "Replace",
 * "Split" and "Detach audio". Every command is one undo step and does nothing in a read-only editor.
 *
 * A blurred background is a second clip of the same video behind the first, covering the page, blurred and a little
 * darker. It names its clip (`videoBackdropOf`) and follows its timing (start, trim, loop, speed) whenever that
 * changes here, so the two always show the same moment (the frame renderer then decodes the video once for both).
 *
 * Settings go onto the live object, like animation edits: nothing is rebuilt, and co-editing sees only the props
 * that changed (they are flat for that reason).
 */
import { type FabricImage, type FabricObject } from 'fabric'
import type { AssetRef } from '@/types/adapter'
import { newId } from '@/lib/document'
import type { DocObject, DoryDocument, ImageFilterSpec } from '@/types/document'
import { BACKDROP_TIMING_PROPS, type Clip, type ClipFilmstrip, MIN_CLIP_MS, clipPropsFromAsset, clipTimeAt, isClip, readClip } from '../../clips/model'
import { MAX_TRACKS, createTrack, readTracks, withTracks } from '../../audio/model'
import { t } from '../../strings'
import type { EditorEngine } from '../editor'
import { createImage } from '../objects/factories'
import { applyLock, asDory } from '../objects/dory'
import { applyImageFilters } from '../objects/filters'
import { applyMask } from '../objects/masks'
import { coverSlotTransform } from '../objects/slot'
import { coverFrame } from './insert'

/** The look of a new blurred background: strongly blurred, a little darker. */
export const BACKDROP_FILTERS: readonly ImageFilterSpec[] = [
  { type: 'brightness', value: -0.15 },
  { type: 'blur', value: 1 },
]

const labels = t.clips.history

/** What a clip's settings can be changed to (`ClipPatch` keys map to the object's `video…` props). */
export interface ClipPatch {
  startMs?: number
  trimStartMs?: number
  trimEndMs?: number
  loop?: boolean
  muted?: boolean
  volume?: number
  speed?: number
  fadeInMs?: number
  fadeOutMs?: number
}

const PROP: Record<keyof ClipPatch, string> = {
  startMs: 'videoStartMs',
  trimStartMs: 'videoTrimStartMs',
  trimEndMs: 'videoTrimEndMs',
  loop: 'videoLoop',
  muted: 'videoMuted',
  volume: 'videoVolume',
  speed: 'videoSpeed',
  fadeInMs: 'videoFadeInMs',
  fadeOutMs: 'videoFadeOutMs',
}

const asRecord = (o: FabricObject): Record<string, unknown> => o as unknown as Record<string, unknown>

/** True when the live object is a clip. */
export function isLiveClip(o: FabricObject | undefined | null): o is FabricImage {
  return !!o && isClip(asRecord(o))
}

/** The clip a live object holds, as the editor reads it. */
export function liveClip(o: FabricObject): Clip | null {
  return readClip(asRecord(o))
}

export class VideosApi {
  constructor(private readonly engine: EditorEngine) {}

  /* ------------------------------------------------------------- replacing */

  private replacingId: string | null = null
  private readonly replacingListeners = new Set<() => void>()

  /** The clip a pick in the Videos tool replaces, while "Replace video" waits for one. */
  get replacing(): string | null {
    return this.replacingId
  }

  subscribeReplacing = (listener: () => void): (() => void) => {
    this.replacingListeners.add(listener)
    return () => {
      this.replacingListeners.delete(listener)
    }
  }

  private setReplacing(id: string | null): void {
    if (this.replacingId === id) return
    this.replacingId = id
    for (const listener of [...this.replacingListeners]) listener()
  }

  /** "Replace video": the next video picked in the Videos tool replaces the selected clip (the tool opens for it). */
  startReplace(id?: string): boolean {
    const obj = this.target(id)
    const objectId = obj ? asDory(obj).id : undefined
    if (this.engine.readOnly || !objectId) return false
    this.setReplacing(objectId)
    this.engine.patchUi({ panelId: 'videos' })
    return true
  }

  cancelReplace(): void {
    this.setReplacing(null)
  }

  /** What picking a video in the Videos tool does: replace the clip waiting for one, or add the video to the page. */
  async use(ref: AssetRef): Promise<void> {
    const replacing = this.replacingId
    if (replacing && this.target(replacing)) {
      this.setReplacing(null)
      await this.replace(replacing, ref)
      return
    }
    this.setReplacing(null)
    await this.fromAsset(ref)
  }

  /** The live clip on the active page with this id, or the selected one. */
  private target(id?: string): FabricImage | null {
    const view = this.engine.activeView()
    if (!view) return null
    const obj = id ? view.getById(id) : view.selectedObjects().length === 1 ? view.selectedObjects()[0] : undefined
    return isLiveClip(obj) && !asDory(obj).rawDoc ? obj : null
  }

  /** The clip with this id (or the selected one) on the active page. */
  get(id?: string): Clip | null {
    const obj = this.target(id)
    return obj ? liveClip(obj) : null
  }

  /**
   * Changes the settings of a clip: one undo step, or one per gesture when the calls share `coalesceKey` (a trim drag).
   * Values are clamped to what the clip allows. Returns false when nothing changed.
   */
  update(id: string | undefined, patch: ClipPatch, label: string = labels.update, coalesceKey?: string): boolean {
    if (this.engine.readOnly) return false
    const obj = this.target(id)
    const clip = obj ? liveClip(obj) : null
    if (!obj || !clip) return false
    const record = asRecord(obj)
    const merged: Record<string, unknown> = { ...record }
    for (const [key, value] of Object.entries(patch) as [keyof ClipPatch, unknown][]) if (value !== undefined) merged[PROP[key]] = value
    const next = readClip({ ...merged, type: 'image' })
    if (!next) return false
    const values: Record<string, unknown> = {
      videoStartMs: next.startMs,
      videoTrimStartMs: next.trimStartMs,
      videoTrimEndMs: next.trimEndMs,
      videoLoop: next.loop,
      videoMuted: next.muted,
      videoVolume: next.volume,
      videoSpeed: next.speed,
      videoFadeInMs: next.fadeInMs,
      videoFadeOutMs: next.fadeOutMs,
    }
    const changed = Object.entries(values).filter(([key, value]) => record[key] !== value)
    if (changed.length === 0) return false
    for (const [key, value] of changed) record[key] = value
    obj.set('dirty', true)
    this.followTiming(obj)
    this.engine.commitActive({ label, coalesceKey })
    return true
  }

  /** The blurred backgrounds of a clip on the active page. */
  private backdropsOf(id: string | undefined): FabricImage[] {
    const view = this.engine.activeView()
    if (!view || !id) return []
    return view.canvas.getObjects().filter((o): o is FabricImage => isLiveClip(o) && asRecord(o).videoBackdropOf === id)
  }

  /** The ids of a clip's blurred backgrounds on the active page, from the document (the canvas may not have them yet). */
  private backdropIdsOf(id: string): Set<string> {
    const page = this.engine.getPage(this.engine.state.activePageId)
    return new Set((page?.objects ?? []).filter((o) => o.videoBackdropOf === id).map((o) => o.id))
  }

  /** Gives the clip's blurred backgrounds its timing (without committing: the caller does). */
  private followTiming(obj: FabricImage): void {
    const record = asRecord(obj)
    for (const backdrop of this.backdropsOf(asDory(obj).id)) {
      const other = asRecord(backdrop)
      for (const key of BACKDROP_TIMING_PROPS) other[key] = record[key]
      backdrop.set('dirty', true)
    }
  }

  /**
   * Puts a blurred copy of the clip behind everything, covering the page (a horizontal video on a vertical page, say).
   * Returns false when there is nothing to do (no clip, or it already has one).
   */
  blurredBackground(id?: string): boolean {
    if (this.engine.readOnly) return false
    const obj = this.target(id)
    const objectId = obj ? asDory(obj).id : undefined
    if (!obj || !objectId || liveClip(obj)?.backdropOf) return false
    if (this.backdropIdsOf(objectId).size > 0) {
      this.engine.toast(t.clips.toolbar.hasBackdrop, 'info')
      return false
    }
    const pageId = this.engine.state.activePageId
    const doc = this.engine.getDocument()
    const source = doc.pages.find((p) => p.id === pageId)?.objects.find((o) => o.id === objectId)
    if (!source) return false
    const page = this.engine.pageSizeOf(pageId)
    const natural = obj.getOriginalSize()
    const width = natural.width || obj.width || 1
    const height = natural.height || obj.height || 1
    const scale = Math.max(page.width / width, page.height / height)
    const backdrop: DocObject = {
      ...source,
      id: newId(),
      name: t.clips.toolbar.backdropName(typeof source.name === 'string' && source.name ? source.name : t.clips.kind),
      left: page.width / 2,
      top: page.height / 2,
      originX: 'center',
      originY: 'center',
      width,
      height,
      cropX: 0,
      cropY: 0,
      scaleX: scale,
      scaleY: scale,
      angle: 0,
      skewX: 0,
      skewY: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      locked: true,
      videoMuted: true,
      videoBackdropOf: objectId,
      filters: [...BACKDROP_FILTERS],
    }
    for (const key of ['maskShape', 'maskRadius', 'slot', 'animation', 'link', 'field', 'shadow', 'effects', 'clipPath', 'isPlaceholder', 'videoFadeInMs', 'videoFadeOutMs']) delete backdrop[key]
    const pages = doc.pages.map((p) => (p.id === pageId ? { ...p, objects: [backdrop, ...p.objects] } : p))
    this.engine.applyDocument({ ...doc, pages }, { label: labels.backdrop, selection: [objectId] })
    this.engine.refreshSelection()
    return true
  }

  /**
   * Swaps the video of a clip, keeping its frame on the page (size, position, crop window, mask, adjustments) and its
   * playback settings; the new clip plays whole. Its blurred background takes the new video too.
   */
  async replace(id: string | undefined, ref: AssetRef): Promise<boolean> {
    if (this.engine.readOnly || ref.kind !== 'video' || !ref.video || ref.video.status !== 'ready') return false
    const obj = this.target(id)
    const objectId = obj ? asDory(obj).id : undefined
    if (!obj || !objectId) return false
    const poster = ref.video.posterUrl
    const url = await this.engine.assets.resolve(poster)
    const props = clipPropsFromAsset(ref)
    const keep = ['videoStartMs', 'videoLoop', 'videoMuted', 'videoVolume', 'videoSpeed', 'videoFadeInMs', 'videoFadeOutMs', 'videoBackdropOf']
    const swap = async (img: FabricImage, frame: (img: FabricImage, w: number, h: number) => void): Promise<void> => {
      const record = asRecord(img)
      const kept = Object.fromEntries(keep.filter((k) => record[k] !== undefined).map((k) => [k, record[k]]))
      const d = asDory(img)
      await img.setSrc(url, { crossOrigin: 'anonymous' })
      d.docSrc = poster
      d.assetId = ref.id
      if (!ref.video?.audioUrl) delete record.videoAudioSrc
      delete record.videoFilmstrip
      img.set({ ...props, ...kept })
      const natW = img.getElement().width || img.width || 1
      const natH = img.getElement().height || img.height || 1
      img.set({ cropX: 0, cropY: 0, width: natW, height: natH })
      frame(img, natW, natH)
      if (d.filterSpecs && d.filterSpecs.length > 0) applyImageFilters(img, d.filterSpecs)
      applyMask(img)
      img.setCoords()
    }
    const frameW = obj.getScaledWidth()
    const frameH = obj.getScaledHeight()
    await swap(obj, (img, natW, natH) => {
      const slot = asDory(img).slot
      if (slot) {
        const cover = coverSlotTransform(slot, natW, natH)
        img.set({ left: cover.cx, top: cover.cy, scaleX: cover.scale, scaleY: cover.scale, angle: slot.angle })
      } else coverFrame(img, frameW, frameH)
    })
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    for (const backdrop of this.backdropsOf(objectId)) {
      await swap(backdrop, (img, natW, natH) => {
        const scale = Math.max(page.width / natW, page.height / natH)
        img.set({ left: page.width / 2, top: page.height / 2, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale })
      })
    }
    this.followTiming(obj)
    this.engine.activeView()?.canvas.requestRenderAll()
    this.engine.commitActive({ label: labels.replace })
    this.engine.refreshSelection()
    return true
  }

  /**
   * Cuts a clip in two at `pageMs` on the page clock: the clip keeps what plays before, a copy just above it (same
   * frame on the page) plays the rest from there. Its blurred background is cut too. Returns the new clip's id, or
   * null when `pageMs` is not inside the part of the clip that plays.
   */
  split(id: string | undefined, pageMs: number): string | null {
    if (this.engine.readOnly) return null
    const obj = this.target(id)
    const clip = obj ? liveClip(obj) : null
    const objectId = obj ? asDory(obj).id : undefined
    if (!obj || !clip || !objectId || clip.loop) return null
    const at = clipTimeAt(clip, pageMs)
    if (pageMs <= clip.startMs || at - clip.trimStartMs < MIN_CLIP_MS || clip.trimEndMs - at < MIN_CLIP_MS) return null
    const cut = Math.round(at)
    const pageId = this.engine.state.activePageId
    const doc = this.engine.getDocument()
    const page = doc.pages.find((p) => p.id === pageId)
    if (!page) return null
    const secondId = newId()
    const backdropIds = this.backdropIdsOf(objectId)
    const objects: DocObject[] = []
    for (const o of page.objects) {
      if (o.id === objectId || backdropIds.has(o.id)) {
        const second: DocObject = { ...o, id: o.id === objectId ? secondId : newId(), videoStartMs: Math.round(pageMs), videoTrimStartMs: cut }
        if (o.id !== objectId) second.videoBackdropOf = secondId
        delete second.animation // the second part continues the first: it does not come in again
        // The two parts take turns in the same place: the first stands aside once it has played, the second until it starts.
        objects.push({ ...o, videoTrimEndMs: cut, videoFadeOutMs: 0, videoHideAfter: true }, { ...second, videoFadeInMs: 0, videoHideBefore: true })
      } else objects.push(o)
    }
    this.engine.applyDocument({ ...doc, pages: doc.pages.map((p) => (p.id === pageId ? { ...p, objects } : p)) }, { label: labels.split, selection: [secondId] })
    void this.selectWhenBuilt(secondId)
    return secondId
  }

  /** Selects an object a document change has just added, once the canvas has built it (that takes a moment). */
  private async selectWhenBuilt(id: string): Promise<void> {
    for (let i = 0; i < 120; i++) {
      if (this.engine.activeView()?.getById(id)) {
        this.engine.select([id])
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
  }

  /**
   * Adds a ready clip to a page, fitted inside it. With a single unfilled placeholder selected the clip fills that frame
   * instead, like a picture would.
   */
  async fromAsset(ref: AssetRef, at?: { x: number; y: number }, pageId?: string): Promise<void> {
    if (this.engine.readOnly || ref.kind !== 'video' || !ref.video || ref.video.status !== 'ready') return
    const target = pageId ?? this.engine.state.activePageId
    const view = this.engine.viewOf(target)
    const selected = view?.selectedObjects() ?? []
    if (!at && selected.length === 1 && asDory(selected[0]).isPlaceholder && asDory(selected[0]).id) {
      await this.engine.insert.fillPlaceholderWith(target, asDory(selected[0]).id as string, ref)
      return
    }
    try {
      const poster = ref.video.posterUrl
      const url = await this.engine.assets.resolve(poster)
      const page = this.engine.pageSizeOf(target)
      // A clip is fitted to the page, so it goes in the middle of it (not a step aside, as smaller inserts do).
      const img = await createImage({ src: poster, url, assetId: ref.id }, at ?? { x: page.width / 2, y: page.height / 2 }, { width: page.width, height: page.height })
      img.set(clipPropsFromAsset(ref))
      asDory(img).name = ref.name
      await this.engine.insert.add([img], labels.add, { pageId: target, announce: t.clips.announce.added })
    } catch {
      this.engine.toast(t.errors.imageLoad, 'error')
    }
  }

  /** Makes a clip fill the page behind everything else, locked in place (what "Set as background" means for a video). */
  setAsBackground(id?: string): boolean {
    if (this.engine.readOnly) return false
    const view = this.engine.activeView()
    const obj = this.target(id)
    if (!view || !obj) return false
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    const scale = Math.max(page.width / (obj.width || 1), page.height / (obj.height || 1))
    obj.set({ left: page.width / 2, top: page.height / 2, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale, angle: 0, skewX: 0, skewY: 0, cropX: 0, cropY: 0 })
    asDory(obj).locked = true
    applyLock(obj)
    view.canvas.sendObjectToBack(obj)
    obj.setCoords()
    view.canvas.discardActiveObject()
    view.canvas.requestRenderAll()
    this.engine.commitActive({ label: labels.background })
    return true
  }

  /**
   * Moves the clip's sound to an audio track of the page (same start, trim and volume) and mutes the clip: one undo step.
   * Afterwards the sound can be moved, trimmed, faded and ducked like any track.
   */
  detachAudio(id?: string): boolean {
    if (this.engine.readOnly) return false
    const obj = this.target(id)
    const clip = obj ? liveClip(obj) : null
    const objectId = obj ? asDory(obj).id : undefined
    if (!obj || !clip || !clip.audioSrc || !objectId) return false
    const doc = this.engine.getDocument()
    const tracks = readTracks(doc)
    if (tracks.length >= MAX_TRACKS) {
      this.engine.toast(t.audio.errors.limit, 'error')
      return false
    }
    const pageId = this.engine.state.activePageId
    const track = createTrack({
      kind: 'upload',
      name: asDory(obj).name || t.clips.kind,
      src: clip.audioSrc,
      durationMs: clip.durationMs,
      scope: { type: 'page', pageId },
      startMs: clip.startMs,
      assetId: asDory(obj).assetId,
    })
    Object.assign(track, { trimStartMs: clip.trimStartMs, trimEndMs: clip.trimEndMs, volume: clip.volume, loop: clip.loop, fadeInMs: clip.fadeInMs, fadeOutMs: clip.fadeOutMs })
    const pages = doc.pages.map((page) =>
      page.id !== pageId ? page : { ...page, objects: page.objects.map((o): DocObject => (o.id === objectId ? { ...o, videoMuted: true } : o)) },
    )
    const next: DoryDocument = withTracks({ ...doc, pages }, [...tracks, track])
    this.engine.applyDocument(next, { label: labels.detachAudio, selection: [objectId] })
    this.engine.refreshSelection() // the toolbar reads the clip's settings from the selection
    this.engine.announce(t.clips.announce.detached)
    return true
  }

  /** The filmstrip of a clip, for the timeline and the trim popover. */
  filmstrip(id?: string): ClipFilmstrip | null {
    return this.get(id)?.filmstrip ?? null
  }
}
