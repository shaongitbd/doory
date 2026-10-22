/**
 * "Add something to the page": text, shapes, lines, images, catalog elements, QR codes, placeholders and
 * arbitrary document objects (paste, templates, third-party kinds). Every method places the new object on
 * the active page, selects it and records one history step.
 */
import { type FabricImage, type FabricObject, IText, Point } from 'fabric'
import type { AssetRef } from '@/types/adapter'
import type { CropRect } from '../upscale/types'
import type { ElementItem } from '@/types/api'
import type { DocObject, MaskShape } from '@/types/document'
import type { EditorEngine } from '../editor'
import { UploadError } from '../assets'
import { applyMask } from '../objects/masks'
import { applySlotClip } from '../objects/masks'
import { coverSlotTransform, shiftSlot, slotOf } from '../objects/slot'
import { asDory } from '../objects/dory'
import { DEFAULT_QR } from '../objects/qr'
import {
  TEXT_PRESETS,
  type TextPreset,
  BODY_FONT,
  HEADING_FONT,
  SHAPE_FILL,
  TEXT_COLOR,
  createEllipse,
  createIText,
  createImage,
  createLine,
  createPathShape,
  createPlaceholder,
  createPolygon,
  createQrCode,
  createRect,
  createStar,
  createTextbox,
  createTriangle,
  createElementFromSvg,
  defaultShapeSize,
  photoBox,
  shapeUnit,
  softShape,
  stickerSize,
  textScale,
} from '../objects/factories'
import { primaryFamily } from '../text/fontStack'
import { applyCurve } from '../objects/curvedText'
import { CURVE_DEFAULT_AMOUNT } from '../text/curve'
import { applyListStyle } from '../text/lists'
import { applyImageFilters } from '../objects/filters'
import { deserializeObjects } from '../serialization'
import { cloneObjects } from '../docOps'
import { pickFiles } from '../files'
import { t } from '../../strings'
import { reidTree } from './arrange'
import { clipPropsFromAsset, isClip } from '../../clips/model'

export type ShapeKind = 'rect' | 'rounded' | 'ellipse' | 'triangle' | 'polygon' | 'star' | 'diamond' | 'line' | 'arrow' | 'divider' | 'frame'

const MAX_SVG_BYTES = 2 * 1024 * 1024

export class InsertApi {
  constructor(private readonly engine: EditorEngine) {}

  /**
   * Where the next insert goes: the centre of the active page, or the first spot down and to the right of it that nothing
   * is centred on yet. Tools stay open while several things are added, so each one lands a step from the last instead of
   * exactly on top of it. The step follows the page size (4 % of its shorter side), so it reads the same on any page.
   */
  center(): { x: number; y: number } {
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    const view = this.engine.activeView()
    const cx = page.width / 2
    const cy = page.height / 2
    if (!view) return { x: cx, y: cy }
    const step = Math.max(16, Math.round(Math.min(page.width, page.height) * 0.04))
    const centres = view.canvas.getObjects().map((o) => o.getCenterPoint())
    // A little under a step either way: a font pairing sits its two lines just above and below the spot it was given.
    const taken = (x: number, y: number): boolean => centres.some((c) => Math.abs(c.x - x) < step * 0.8 && Math.abs(c.y - y) < step * 0.8)
    let i = 0
    while (i < 8 && taken(cx + i * step, cy + i * step)) i++
    return { x: cx + i * step, y: cy + i * step }
  }

  /** Adds already-built Fabric objects to the active page. */
  async add(
    objects: FabricObject[],
    label: string,
    opts: { announce?: string; edit?: boolean; pageId?: string; commit?: boolean } = {},
  ): Promise<void> {
    if (this.engine.readOnly || objects.length === 0) return
    const pageId = opts.pageId ?? this.engine.state.activePageId
    const view = await this.engine.whenView(pageId)
    if (pageId !== this.engine.state.activePageId) this.engine.setActivePage(pageId)
    for (const o of objects) {
      view.configure(o)
      view.canvas.add(o)
    }
    view.selectObjects(objects)
    if (opts.edit && objects[0] instanceof IText) {
      const text = objects[0]
      text.enterEditing()
      text.selectAll()
    }
    view.canvas.requestRenderAll()
    if (opts.commit !== false) this.engine.commit(pageId, { label })
    else this.engine.refreshSelection()
    this.engine.announce(opts.announce ?? t.announce.added(label.replace(/^Add /, '')))
  }

  /* -------------------------------------------------------------------- text */

  async text(preset: TextPreset): Promise<void> {
    const spec = TEXT_PRESETS[preset]
    await this.engine.fonts.load(primaryFamily(spec.font), spec.weight)
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    await this.add([createTextbox(page, this.center(), { preset })], t.history.addText, { edit: true })
  }

  /**
   * Adds a curved-text object ("Arc up" / "Arc down"). `up` bends the baseline into an arch (negative
   * curve amount), `down` into a valley; the amount can be changed afterwards with `style.setCurve`.
   */
  async curvedText(direction: 'up' | 'down'): Promise<void> {
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    await this.engine.fonts.load(primaryFamily(HEADING_FONT), 700)
    const k = textScale(page.width, page.height)
    const obj = createIText(t.textPanel.curved, this.center(), {
      fontFamily: HEADING_FONT,
      fontSize: Math.round(28 * k),
      fontWeight: 700,
      fill: TEXT_PRESETS.heading.color,
      textAlign: 'center',
    })
    applyCurve(obj, direction === 'up' ? -CURVE_DEFAULT_AMOUNT : CURVE_DEFAULT_AMOUNT)
    await this.add([obj], t.history.addCurvedText)
  }

  /** Adds a bulleted or numbered list with three sample lines. */
  async list(style: 'bullet' | 'number'): Promise<void> {
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    await this.engine.fonts.load(primaryFamily(BODY_FONT), 400)
    const obj = createTextbox(page, this.center(), { text: applyListStyle(t.textPanel.listSample.join('\n'), style), preset: 'body', textAlign: 'left' })
    Object.assign(obj, { listStyle: style })
    await this.add([obj], style === 'bullet' ? t.history.addBulletedList : t.history.addNumberedList)
  }

  /** Click-to-type / drag-to-create. `rect.x` is the horizontal centre of the box, `y` the top of the first line. */
  async textAt(pageId: string, rect: { x: number; y: number; width: number }): Promise<void> {
    const spec = TEXT_PRESETS.body
    await this.engine.fonts.load(primaryFamily(spec.font), spec.weight)
    const page = this.engine.pageSizeOf(pageId)
    const k = textScale(page.width, page.height)
    const width = rect.width > 0 ? rect.width : Math.round(300 * k)
    const t0 = createTextbox(page, { x: rect.x, y: rect.y }, { text: '', preset: 'body', width, textAlign: 'left', fontSize: Math.round(20 * k), fill: '#1a1a2e' })
    const centerX = rect.width > 0 ? rect.x : rect.x + width / 2
    t0.set({ left: centerX, top: rect.y + t0.getScaledHeight() / 2 })
    t0.setCoords()
    this.engine.setTool('select')
    await this.add([t0], t.history.addText, { edit: true, pageId, commit: false })
  }

  /* ------------------------------------------------------------------ shapes */

  /**
   * Adds a basic shape. Default sizes and styles (a 120 x 80 rectangle, an 80 px circle, a
   * 160 px line … on a 559 px page, scaled to other page sizes) in the brand colour.
   */
  async shape(kind: ShapeKind): Promise<void> {
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    const k = textScale(page.width, page.height)
    const unit = shapeUnit(page)
    const at = this.center()
    let obj: FabricObject
    let label: string
    switch (kind) {
      case 'rect':
        obj = softShape(createRect(at, Math.round(120 * k), Math.round(6 * k), unit), page)
        label = t.history.addRectangle
        break
      case 'rounded':
        obj = softShape(createRect(at, Math.round(120 * k), Math.round(20 * k), unit), page)
        label = t.history.addRoundedRectangle
        break
      case 'ellipse':
        obj = softShape(createEllipse(at, unit), page)
        label = t.history.addEllipse
        break
      case 'triangle':
        obj = softShape(createTriangle(at, unit, Math.round(70 * k)), page)
        label = t.history.addTriangle
        break
      case 'polygon':
        obj = softShape(createPolygon(at, unit, 6), page)
        label = t.history.addPolygon
        break
      case 'star':
        obj = softShape(createStar(at, Math.round(62 * k), 5, 0.45), page)
        label = t.history.addStar
        break
      case 'diamond':
        obj = softShape(createPolygon(at, Math.round(60 * k), 4), page)
        label = t.history.addDiamond
        break
      case 'line':
        obj = createLine(at, { length: Math.round(160 * k), width: Math.max(1, Math.round(3 * k)), color: SHAPE_FILL })
        label = t.history.addLine
        break
      case 'arrow':
        obj = createLine(at, { length: Math.round(160 * k), width: Math.max(1, Math.round(3 * k)), color: SHAPE_FILL, arrowEnd: 'triangle' })
        label = t.history.addArrow
        break
      case 'divider': {
        // A thin dashed rule, 43 % of the width of an A5 page.
        const width = Math.max(1, Math.round(k))
        obj = createLine(at, { length: Math.round(240 * k), width, dash: [Math.round(8 * k), Math.round(4 * k)] })
        label = t.history.addDivider
        break
      }
      case 'frame': {
        // An empty outlined portrait frame (200 x 280 on an A5 page) for text or photos to sit in.
        obj = createRect(at, Math.round(200 * k), Math.round(8 * k), Math.round(280 * k))
        obj.set({ fill: 'transparent', stroke: TEXT_COLOR, strokeWidth: Math.max(1, Math.round(2 * k)) })
        label = t.history.addFrame
        break
      }
    }
    await this.add([obj], label)
  }

  async pathShape(shapeId: string, label: string): Promise<void> {
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    const obj = createPathShape(shapeId, this.center(), defaultShapeSize(page))
    if (obj) await this.add([obj], `Add ${label.toLowerCase()}`)
  }

  /* ------------------------------------------------------------------ images */

  /** A photo is fitted into a square of half the page's shorter side (small pictures are scaled up to it). */
  private fitFor(pageId: string): { width: number; height: number } {
    const box = photoBox(this.engine.pageSizeOf(pageId))
    return { width: box, height: box }
  }

  async imageFromAsset(ref: AssetRef, at?: { x: number; y: number }, pageId?: string): Promise<void> {
    const target = pageId ?? this.engine.state.activePageId
    try {
      const url = await this.engine.assets.resolve(ref.url)
      const img = await createImage({ src: ref.url, url, assetId: ref.id }, at ?? this.center(), this.fitFor(target))
      asDory(img).name = ref.name
      await this.add([img], t.history.addImage, { pageId: target })
    } catch {
      this.engine.toast(t.errors.imageLoad, 'error')
    }
  }

  /** Uploads files through the adapter and adds each as an image (file picker, drag-drop, paste). */
  async imageFiles(files: readonly File[], at?: { x: number; y: number }, pageId?: string): Promise<AssetRef[]> {
    const added: AssetRef[] = []
    if (files.length === 0 || this.engine.readOnly) return added
    const store = this.engine.store
    store.setState((s) => ({ uploading: s.uploading + files.length }))
    for (const file of files) {
      try {
        const ref = await this.engine.assets.upload(file, file instanceof File ? file.name : undefined)
        added.push(ref)
        store.setState((s) => ({ uploads: [ref, ...s.uploads.filter((u) => u.id !== ref.id)] }))
        await this.imageFromAsset(ref, at, pageId)
      } catch (err) {
        this.engine.toast(err instanceof UploadError ? err.message : t.errors.upload, 'error')
      } finally {
        store.setState((s) => ({ uploading: Math.max(0, s.uploading - 1) }))
      }
    }
    return added
  }

  /** Opens the system file picker and inserts the chosen images. */
  async pickAndInsertImages(): Promise<void> {
    const files = await pickFiles('image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml', true)
    await this.imageFiles(files)
  }

  /** Uploads without inserting (Uploads panel "Upload" button). */
  async pickAndUpload(): Promise<void> {
    const files = await pickFiles('image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml', true)
    const store = this.engine.store
    store.setState((s) => ({ uploading: s.uploading + files.length }))
    for (const file of files) {
      try {
        const ref = await this.engine.assets.upload(file, file.name)
        store.setState((s) => ({ uploads: [ref, ...s.uploads.filter((u) => u.id !== ref.id)] }))
      } catch (err) {
        this.engine.toast(err instanceof UploadError ? err.message : t.errors.upload, 'error')
      } finally {
        store.setState((s) => ({ uploading: Math.max(0, s.uploading - 1) }))
      }
    }
  }

  /* --------------------------------------------------------- catalog elements */

  async element(item: ElementItem): Promise<void> {
    try {
      const url = await this.engine.assets.resolve(item.svg_url)
      const res = await fetch(url, { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (text.length > MAX_SVG_BYTES) throw new Error('SVG too large')
      await this.svgElement(text, item.id, item.name)
    } catch {
      this.engine.toast(t.errors.imageLoad, 'error')
    }
  }

  /** Inserts SVG markup as an element group. Works with no server (used by built-in packs). */
  async svgElement(svgText: string, elementId: string, name: string): Promise<void> {
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    const obj = await createElementFromSvg(svgText, this.center(), stickerSize(page), { elementId, name })
    await this.add([obj], `Add ${name}`)
  }

  /* --------------------------------------------------------------- misc kinds */

  async qr(spec = DEFAULT_QR): Promise<void> {
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    await this.add([await createQrCode(spec, this.center(), Math.round(defaultShapeSize(page) * 0.8))], t.history.addQrCode)
  }

  async placeholder(mask?: MaskShape): Promise<void> {
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    const size = defaultShapeSize(page)
    await this.add([createPlaceholder(this.center(), size * 1.2, size, mask)], t.history.addImagePlaceholder)
  }

  /**
   * Adds serialised objects (paste, template parts, objects of third-party kinds). Ids are regenerated.
   * `offset` shifts them (paste cascade); `recenter` centres their bounding box on the page.
   */
  async objects(docs: readonly DocObject[], label: string, opts: { offset?: number; recenterOn?: { width: number; height: number } } = {}): Promise<void> {
    const fresh = cloneObjects(docs)
    const built = await deserializeObjects(fresh, this.engine.loadContext)
    const renamed = new Map<string, string>()
    for (const o of built) reidTree(o, renamed)
    // A pasted blurred background follows the pasted copy of its clip (`cloneObjects` linked the two).
    for (const o of built) {
      const record = o as unknown as Record<string, unknown>
      if (typeof record.videoBackdropOf !== 'string') continue
      const clip = renamed.get(record.videoBackdropOf)
      if (clip) record.videoBackdropOf = clip
      else delete record.videoBackdropOf
    }
    if (opts.recenterOn) {
      const xs = built.map((o) => o.getBoundingRect())
      const left = Math.min(...xs.map((r) => r.left))
      const top = Math.min(...xs.map((r) => r.top))
      const right = Math.max(...xs.map((r) => r.left + r.width))
      const bottom = Math.max(...xs.map((r) => r.top + r.height))
      const dx = opts.recenterOn.width / 2 - (left + right) / 2
      const dy = opts.recenterOn.height / 2 - (top + bottom) / 2
      for (const o of built) {
        o.set({ left: o.left + dx, top: o.top + dy })
        shiftSlot(o, dx, dy)
      }
    } else if (opts.offset) {
      const by = opts.offset
      for (const o of built) {
        o.set({ left: o.left + by, top: o.top + by })
        shiftSlot(o, by, by)
      }
    }
    for (const o of built) o.setCoords()
    await this.add(built, label, { announce: t.announce.pasted(built.length) })
  }

  /* -------------------------------------------------------------- placeholders */

  /** Click on an unfilled placeholder: choose an image and drop it into the frame. */
  async fillPlaceholder(pageId: string, id: string): Promise<void> {
    const files = await pickFiles('image/png,image/jpeg,image/webp,image/gif,image/avif', false)
    const file = files[0]
    if (!file) return
    try {
      const ref = await this.engine.assets.upload(file, file.name)
      await this.fillPlaceholderWith(pageId, id, ref)
    } catch (err) {
      this.engine.toast(err instanceof UploadError ? err.message : t.errors.upload, 'error')
    }
  }

  /**
   * Puts a picture into a placeholder. The picture covers the frame (centred, at the frame's tilt) and is clipped to
   * the frame's shape; the frame itself stays where it is while the picture is panned, zoomed or turned inside it
   * (see objects/slot.ts). The slot keeps the sample picture the placeholder had, for "reset to placeholder".
   */
  async fillPlaceholderWith(pageId: string, id: string, ref: AssetRef): Promise<void> {
    const view = this.engine.viewOf(pageId)
    const placeholder = view?.getById(id)
    if (!view || !placeholder) return
    // A video clip fills the frame with its poster, and carries the clip.
    const clip = ref.kind === 'video' && ref.video ? clipPropsFromAsset(ref) : null
    const src = clip && ref.video ? ref.video.posterUrl : ref.url
    const url = await this.engine.assets.resolve(src)
    const img = await createImage({ src, url, assetId: ref.id }, new Point(0, 0), { width: 1, height: 1 })
    if (clip) img.set(clip)
    const pd = asDory(placeholder)
    const sample = placeholder.type === 'image' ? pd.docSrc : undefined
    const slot = slotOf(placeholder, sample)
    const cover = coverSlotTransform(slot, img.width, img.height)
    img.set({
      left: cover.cx,
      top: cover.cy,
      scaleX: cover.scale,
      scaleY: cover.scale,
      angle: slot.angle,
      opacity: placeholder.opacity,
      flipX: placeholder.flipX,
      flipY: placeholder.flipY,
      shadow: placeholder.shadow,
    })
    const d = asDory(img)
    d.id = pd.id
    d.slot = slot
    d.name = pd.name && pd.name !== t.history.imagePlaceholder ? pd.name : ref.name
    d.field = pd.field
    d.locked = pd.locked
    d.link = pd.link
    d.animation = pd.animation
    d.effects = pd.effects
    if (!clip && pd.filterSpecs && pd.filterSpecs.length > 0) {
      d.filterSpecs = pd.filterSpecs
      applyImageFilters(img, pd.filterSpecs)
    }
    applySlotClip(img)
    const index = view.canvas.getObjects().indexOf(placeholder)
    view.canvas.discardActiveObject()
    view.canvas.remove(placeholder)
    view.configure(img)
    view.canvas.insertAt(Math.max(0, index), img)
    img.setCoords()
    view.selectObjects([img])
    this.engine.commit(pageId, { label: clip ? t.clips.history.fill : t.history.addImage })
  }

  /** Replaces the selected image's source keeping its frame (size, position, mask, filters). */
  async replaceSelectedImage(ref: AssetRef, label: string = t.history.replaceImage, crop?: CropRect): Promise<void> {
    const view = this.engine.activeView()
    const obj = view?.selectedObjects()[0]
    if (!view || !obj) return
    const d = asDory(obj)
    if (d.isPlaceholder) {
      if (d.id) await this.fillPlaceholderWith(this.engine.state.activePageId, d.id, ref)
      return
    }
    if (obj.type !== 'image' || isClip(obj as unknown as Record<string, unknown>)) return
    const img = obj as FabricImage
    const frameW = img.getScaledWidth()
    const frameH = img.getScaledHeight()
    const url = await this.engine.assets.resolve(ref.url)
    await img.setSrc(url, { crossOrigin: 'anonymous' })
    d.docSrc = ref.url
    d.assetId = ref.id
    const natW = img.getElement().width || img.width || 1
    const natH = img.getElement().height || img.height || 1
    img.set({ cropX: 0, cropY: 0, width: natW, height: natH })
    if (d.slot) {
      const cover = coverSlotTransform(d.slot, natW, natH)
      img.set({ left: cover.cx, top: cover.cy, scaleX: cover.scale, scaleY: cover.scale, angle: d.slot.angle })
    } else if (crop) {
      // The new source is the whole photo at a higher resolution: keep exactly the same visible crop
      // and shrink the displayed scale by the same factor, so the picture does not move or grow.
      const x = Math.min(natW - 1, Math.max(0, crop.x))
      const y = Math.min(natH - 1, Math.max(0, crop.y))
      const width = Math.min(natW - x, Math.max(1, crop.width))
      const height = Math.min(natH - y, Math.max(1, crop.height))
      const scale = Math.min(frameW / width, frameH / height)
      img.set({ cropX: x, cropY: y, width, height, scaleX: scale, scaleY: scale })
    } else {
      coverFrame(img, frameW, frameH)
    }
    if (d.filterSpecs && d.filterSpecs.length > 0) applyImageFilters(img, d.filterSpecs)
    applyMask(img)
    img.setCoords()
    view.canvas.requestRenderAll()
    this.engine.commit(this.engine.state.activePageId, { label })
  }

  async pickAndReplaceImage(): Promise<void> {
    const files = await pickFiles('image/png,image/jpeg,image/webp,image/gif,image/avif', false)
    const file = files[0]
    if (!file) return
    try {
      await this.replaceSelectedImage(await this.engine.assets.upload(file, file.name))
    } catch (err) {
      this.engine.toast(err instanceof UploadError ? err.message : t.errors.upload, 'error')
    }
  }
}

/** Crops (via cropX/cropY) and scales an image so it exactly covers a `frameW` x `frameH` box, centred. */
export function coverFrame(img: FabricImage, frameW: number, frameH: number): void {
  const natW = img.getOriginalSize().width || img.width || 1
  const natH = img.getOriginalSize().height || img.height || 1
  const scale = Math.max(frameW / natW, frameH / natH)
  const visW = frameW / scale
  const visH = frameH / scale
  img.set({
    cropX: Math.max(0, (natW - visW) / 2),
    cropY: Math.max(0, (natH - visH) / 2),
    width: Math.min(natW, visW),
    height: Math.min(natH, visH),
    scaleX: scale,
    scaleY: scale,
  })
}
