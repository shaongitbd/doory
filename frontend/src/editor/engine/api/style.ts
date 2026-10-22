/**
 * Property edits on the current selection: fill, stroke, opacity, text styling, effects, shape parameters,
 * image adjustments, masks, upscaling, recolouring, links and QR content. Continuous controls (sliders, colour
 * scrubbing) pass a `key` so their steps coalesce into one undo step.
 */
import { type FabricImage, type FabricObject, IText, Point, Polygon, Rect, Shadow, util } from 'fabric'
import type { ArrowHead, DocField, DocTextFit, ImageFilterSpec, MaskShape, ObjectEffects, ShadowSpec } from '@/types/document'
import type { AssetRef } from '@/types/adapter'
import type { EditorEngine } from '../editor'
import { BACKGROUND_REMOVAL_TASK, BackgroundRemovalError, DEVICE_OPTION, removeBackground as runRemoval, type BgRemovalPhase } from '../bgRemoval'
import { UpscaleError, fitsOutput, maxOutputPixels, targetSize, upscaleImage as runUpscale, type CropRect, type UpscaleMethod, type UpscaleProgress } from '../upscale'
import { MAX_UPLOAD_BYTES } from '../assets'
import { DoryLine } from '../objects/DoryLine'
import { asDory } from '../objects/dory'
import { SVG_EDIT_LIMITS, applyColorMap, elementColors, isSvgSource, parseSvgElement, shapeCount, svgEditProblem } from '../objects/elements'
import { applyEffects } from '../objects/effects'
import { readField } from '../fields'
import { type FillSpec, buildFill } from '../objects/fills'
import { FILTER_PRESETS, applyImageFilters, normalizeSpecs, withSpec } from '../objects/filters'
import { applyMask } from '../objects/masks'
import { hasSlot } from '../objects/slot'
import { createPlaceholder, createPolygon, createStar } from '../objects/factories'
import { type TextPatch, applyTextFit, applyTextPatch, refitTextbox, sanitizeTextPatch } from '../objects/textStyle'
import { CORNER_RADIUS_MAX, STROKE_WIDTH_MAX, clampOrUndefined } from '../numbers'
import { qrDataUrl } from '../objects/qr'
import type { QrSpec } from '../objects/dory'
import { normalizeColor } from '../colors'
import type { ImageFilterType } from '@/types/document'
import { coverFrame } from './insert'
import { t } from '../../strings'
import { isLiveClip } from './videos'

/** The normalised URL when `raw` is an absolute http(s) address, otherwise null. */
export function safeLinkUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

export type DashStyle = 'solid' | 'dashed' | 'dotted'

export interface StrokePatch {
  color?: string | null
  width?: number
  dash?: DashStyle
}

export function dashArray(style: DashStyle, width: number): number[] | null {
  const w = Math.max(1, width)
  if (style === 'dashed') return [w * 3, w * 2]
  if (style === 'dotted') return [0.01, w * 2.2]
  return null
}

export function dashStyleOf(arr: readonly number[] | null | undefined): DashStyle {
  if (!arr || arr.length === 0) return 'solid'
  return arr[0] < 0.5 ? 'dotted' : 'dashed'
}

/** The same visible crop in the pixels of an image enlarged by `scale` (clamped to its new size). */
export function scaledCrop(crop: CropRect, width: number, height: number, scale: number): CropRect {
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  const x = Math.min(targetWidth - 1, Math.max(0, Math.round(crop.x * scale)))
  const y = Math.min(targetHeight - 1, Math.max(0, Math.round(crop.y * scale)))
  return {
    x,
    y,
    width: Math.min(targetWidth - x, Math.max(1, Math.round(crop.width * scale))),
    height: Math.min(targetHeight - y, Math.max(1, Math.round(crop.height * scale))),
  }
}

export class StyleApi {
  constructor(private readonly engine: EditorEngine) {}

  private targets(): FabricObject[] {
    const view = this.engine.activeView()
    if (!view) return []
    return view.selectedObjects().filter((o) => !asDory(o).rawDoc)
  }

  private finish(label: string, key?: string): void {
    const view = this.engine.activeView()
    view?.canvas.requestRenderAll()
    this.engine.commitActive({ label, coalesceKey: key })
    this.engine.refreshSelection()
  }

  private each(fn: (o: FabricObject) => void, label: string, key?: string): void {
    const objs = this.targets()
    if (objs.length === 0) return
    for (const o of objs) {
      fn(o)
      o.set('dirty', true)
    }
    this.finish(label, key)
  }

  /* -------------------------------------------------------------- fill/stroke */

  setFill(spec: FillSpec, key = 'fill'): void {
    if (spec.type === 'solid') this.engine.rememberColor(normalizeColor(spec.color))
    this.each((o) => {
      if (o instanceof DoryLine) {
        if (spec.type === 'solid') o.set('stroke', spec.color)
        return
      }
      if (o instanceof IText) {
        const patch: TextPatch = { fill: spec }
        applyTextPatch(o, patch)
        return
      }
      o.set('fill', buildFill(spec))
    }, t.history.changeFill, key)
  }

  setStroke(input: StrokePatch, key = 'stroke'): void {
    const width = clampOrUndefined(input.width, 0, STROKE_WIDTH_MAX)
    const patch: StrokePatch = { ...input, width }
    if (input.width !== undefined && width === undefined) return
    this.each((o) => {
      const currentWidth = o.strokeWidth
      if (patch.color !== undefined) {
        if (patch.color === null) o.set({ stroke: null, strokeWidth: 0 })
        else {
          this.engine.rememberColor(normalizeColor(patch.color))
          o.set({ stroke: patch.color, strokeWidth: currentWidth > 0 ? currentWidth : Math.max(2, patch.width ?? 2) })
        }
      }
      if (patch.width !== undefined) {
        o.set('strokeWidth', Math.max(0, patch.width))
        if (patch.width > 0 && !o.stroke) o.set('stroke', '#000000')
      }
      if (patch.dash !== undefined) {
        o.set({ strokeDashArray: dashArray(patch.dash, o.strokeWidth || 2), strokeLineCap: patch.dash === 'dotted' ? 'round' : o.strokeLineCap })
      }
      o.set('strokeUniform', true)
    }, t.history.changeBorder, key)
  }

  setOpacity(opacity: number): void {
    const value = clampOrUndefined(opacity, 0, 1)
    if (value === undefined) return
    this.each((o) => o.set('opacity', value), t.history.changeTransparency, 'opacity')
  }

  setCornerRadius(radius: number): void {
    const value = clampOrUndefined(radius, 0, CORNER_RADIUS_MAX)
    if (value === undefined) return
    this.each((o) => {
      if (o instanceof Rect) o.set({ rx: value, ry: value })
    }, t.history.changeCornerRadius, 'radius')
  }

  /** Generic drop shadow for shapes and images (text uses `setEffect`). */
  setShadow(spec: ShadowSpec | null): void {
    this.each((o) => {
      if (o instanceof IText) {
        this.patchEffects(o, { shadow: spec ?? undefined })
        return
      }
      const effects = { ...(asDory(o).effects ?? {}) }
      if (spec) effects.shadow = spec
      else delete effects.shadow
      asDory(o).effects = Object.keys(effects).length ? effects : undefined
      o.shadow = spec ? new Shadow({ ...spec }) : null
    }, t.history.changeShadow, 'shadow')
  }

  /* ------------------------------------------------------------------- text */

  text(input: TextPatch, label: string = t.history.formatText, key?: string): void {
    const patch = sanitizeTextPatch(input)
    if (Object.keys(patch).length === 0) return
    if (patch.fill?.type === 'solid') this.engine.rememberColor(normalizeColor(patch.fill.color))
    if (patch.fontFamily) this.engine.rememberFont(patch.fontFamily)
    const objs = this.targets().filter((o): o is IText => o instanceof IText)
    if (objs.length === 0) return
    const needsFont = patch.fontFamily !== undefined || patch.fontWeight !== undefined || patch.fontStyle !== undefined
    const run = (): void => {
      for (const t0 of objs) applyTextPatch(t0, patch)
      this.finish(label, key)
    }
    if (needsFont) {
      const first = objs[0]
      void this.engine.fonts
        .load(patch.fontFamily ?? first.fontFamily, patch.fontWeight ?? first.fontWeight ?? 400, patch.fontStyle ?? first.fontStyle ?? 'normal')
        .then(run)
    } else run()
  }

  private patchEffects(obj: FabricObject, patch: ObjectEffects): void {
    const next: ObjectEffects = { ...(asDory(obj).effects ?? {}) }
    for (const key of ['shadow', 'outline', 'glow', 'background'] as const) {
      if (key in patch) {
        if (patch[key] === undefined) delete next[key]
        else Object.assign(next, { [key]: patch[key] })
      }
    }
    applyEffects(obj, next)
    if (obj instanceof IText) {
      if (asDory(obj).fit && !asDory(obj).curveAmount) refitTextbox(obj)
      else obj.initDimensions()
    }
  }

  /** Sets (or removes with `undefined`) individual text effects. */
  setEffects(patch: ObjectEffects, key = 'effects'): void {
    this.each((o) => this.patchEffects(o, patch), t.history.changeEffects, key)
  }

  setCurve(amount: number): void {
    this.text({ curveAmount: amount }, t.history.curveText, 'curve')
  }

  /** Enables, updates or clears (`null`) shrink-to-fit on the selected text boxes. */
  setTextFit(fit: DocTextFit | null, key?: string): void {
    const objs = this.targets().filter((o): o is IText => o instanceof IText)
    if (objs.length === 0) return
    for (const t0 of objs) applyTextFit(t0, fit)
    this.finish(t.history.formatText, key)
  }

  /* ----------------------------------------------------------------- shapes */

  private swap(oldObj: FabricObject, next: FabricObject): void {
    const view = this.engine.activeView()
    if (!view) return
    const d = asDory(oldObj)
    const nd = asDory(next)
    nd.id = d.id
    nd.name = d.name
    nd.locked = d.locked
    next.set({
      left: oldObj.left,
      top: oldObj.top,
      angle: oldObj.angle,
      flipX: oldObj.flipX,
      flipY: oldObj.flipY,
      fill: oldObj.fill,
      stroke: oldObj.stroke,
      strokeWidth: oldObj.strokeWidth,
      strokeDashArray: oldObj.strokeDashArray,
      opacity: oldObj.opacity,
      shadow: oldObj.shadow,
    })
    nd.effects = d.effects
    const index = view.canvas.getObjects().indexOf(oldObj)
    view.canvas.remove(oldObj)
    view.configure(next)
    view.canvas.insertAt(Math.max(0, index), next)
    next.setCoords()
    view.selectObjects([next])
  }

  setPolygonSides(sides: number): void {
    const obj = this.targets()[0]
    if (!(obj instanceof Polygon) || asDory(obj).shapeKind !== 'polygon') return
    const next = createPolygon({ x: 0, y: 0 }, 100, sides)
    next.set({ scaleX: obj.scaleX, scaleY: obj.scaleY })
    this.swap(obj, next)
    this.finish(t.history.changePolygon, 'polygon')
  }

  setStarShape(patch: { points?: number; innerRatio?: number }): void {
    const obj = this.targets()[0]
    if (!(obj instanceof Polygon) || asDory(obj).shapeKind !== 'star') return
    const d = asDory(obj)
    const next = createStar({ x: 0, y: 0 }, 100, patch.points ?? d.starPoints ?? 5, patch.innerRatio ?? d.innerRatio ?? 0.45)
    next.set({ scaleX: obj.scaleX, scaleY: obj.scaleY })
    this.swap(obj, next)
    this.finish(t.history.changeStar, 'star')
  }

  setLine(patch: { arrowStart?: ArrowHead; arrowEnd?: ArrowHead; width?: number; color?: string; dash?: DashStyle }): void {
    this.each((o) => {
      if (!(o instanceof DoryLine)) return
      if (patch.arrowStart !== undefined) o.set('arrowStart', patch.arrowStart)
      if (patch.arrowEnd !== undefined) o.set('arrowEnd', patch.arrowEnd)
      if (patch.width !== undefined) o.set('strokeWidth', Math.max(1, patch.width))
      if (patch.color !== undefined) {
        this.engine.rememberColor(normalizeColor(patch.color))
        o.set('stroke', patch.color)
      }
      if (patch.dash !== undefined) o.set('strokeDashArray', dashArray(patch.dash, o.strokeWidth))
    }, t.history.changeLine, 'line')
  }

  /* ----------------------------------------------------------------- images */

  /** The selected pictures; video clips are left out (a cut-out or a new picture would only change their poster). */
  private images(): FabricImage[] {
    return this.targets().filter((o): o is FabricImage => o.type === 'image' && !isLiveClip(o))
  }

  /** The selected pictures and video clips: what adjustments (filters, presets) apply to. */
  private adjustable(): FabricImage[] {
    return this.targets().filter((o): o is FabricImage => o.type === 'image')
  }

  /** The selected photo's full source size and the crop it currently shows, if any. */
  selectedImageSource(): { width: number; height: number; crop: CropRect | null } | null {
    const img = this.images()[0]
    if (!img) return null
    const natural = img.getOriginalSize()
    const width = Math.max(1, Math.round(natural.width || img.width || 1))
    const height = Math.max(1, Math.round(natural.height || img.height || 1))
    const rawX = Number.isFinite(img.cropX) ? img.cropX : 0
    const rawY = Number.isFinite(img.cropY) ? img.cropY : 0
    const rawWidth = Number.isFinite(img.width) && img.width > 0 ? img.width : width
    const rawHeight = Number.isFinite(img.height) && img.height > 0 ? img.height : height
    const x = Math.min(width - 1, Math.max(0, Math.round(rawX)))
    const y = Math.min(height - 1, Math.max(0, Math.round(rawY)))
    const cropWidth = Math.min(width - x, Math.max(1, Math.round(rawWidth)))
    const cropHeight = Math.min(height - y, Math.max(1, Math.round(rawHeight)))
    const cropped = x > 0 || y > 0 || cropWidth < width || cropHeight < height
    return { width, height, crop: cropped ? { x, y, width: cropWidth, height: cropHeight } : null }
  }

  setFilters(specs: readonly ImageFilterSpec[], key = 'filters'): void {
    const list = normalizeSpecs(specs)
    const imgs = this.adjustable()
    if (imgs.length === 0) return
    for (const img of imgs) {
      asDory(img).filterSpecs = list
      applyImageFilters(img, list)
    }
    this.finish(t.history.adjustImage, key)
  }

  setFilter(type: ImageFilterType, value: number): void {
    const imgs = this.adjustable()
    const current = asDory(imgs[0] ?? ({} as FabricObject)).filterSpecs
    this.setFilters(withSpec(current, type, value), `filter:${type}`)
  }

  applyFilterPreset(id: string): void {
    const preset = FILTER_PRESETS.find((p) => p.id === id)
    if (preset) this.setFilters(preset.specs, 'filter-preset')
  }

  setMask(shape: MaskShape | undefined, radius?: number): void {
    // A photo in a placeholder frame takes its shape from the frame; "reset to placeholder" changes that.
    const objs = this.targets().filter((o) => (o.type === 'image' || asDory(o).isPlaceholder) && !hasSlot(o))
    if (objs.length === 0) return
    for (const o of objs) {
      const d = asDory(o)
      d.maskShape = shape
      if (radius !== undefined) d.maskRadius = radius
      applyMask(o)
      o.setCoords()
    }
    this.finish(shape ? t.history.changeFrame : t.history.removeFrame, radius !== undefined ? 'mask-radius' : undefined)
  }

  /**
   * Marks the selected shapes or images as photo placeholders (clicking one then asks for a picture, which
   * fills it with the placeholder's own shape as the frame) or clears the mark. Lines cannot be placeholders.
   */
  setPlaceholder(on: boolean): void {
    const objs = this.targets().filter((o) => !(o instanceof DoryLine) && !isLiveClip(o))
    if (objs.length === 0) return
    for (const o of objs) {
      asDory(o).isPlaceholder = on ? true : undefined
      o.set('dirty', true)
    }
    this.finish(on ? t.history.usePlaceholder : t.history.stopPlaceholder, 'placeholder')
  }

  /**
   * "Reset to placeholder": swaps each selected picture that fills a placeholder for an empty placeholder with the
   * frame the picture was clipped to (same position, size, tilt and shape), at the same place in the layer stack.
   */
  resetToPlaceholder(): void {
    const view = this.engine.activeView()
    if (!view || this.engine.readOnly) return
    const slots = this.targets().filter(hasSlot)
    if (slots.length === 0) return
    const fresh: FabricObject[] = []
    view.canvas.discardActiveObject()
    for (const img of slots) {
      const d = asDory(img)
      const slot = d.slot
      if (!slot) continue
      const placeholder = createPlaceholder({ x: slot.cx, y: slot.cy }, slot.width, slot.height, slot.mask)
      placeholder.set('angle', slot.angle)
      const pd = asDory(placeholder)
      pd.id = d.id
      pd.field = d.field
      if (slot.radius !== undefined) pd.maskRadius = slot.radius
      applyMask(placeholder)
      const index = view.canvas.getObjects().indexOf(img)
      view.canvas.remove(img)
      view.configure(placeholder)
      view.canvas.insertAt(Math.max(0, index), placeholder)
      placeholder.setCoords()
      fresh.push(placeholder)
    }
    view.selectObjects(fresh)
    this.finish(t.history.resetPlaceholder)
  }

  /** Re-fits a cropped image so it covers its current frame (used by "Fit"/reset). */
  resetCrop(): void {
    this.each((o) => {
      if (o.type !== 'image') return
      const img = o as FabricImage
      const w = img.getScaledWidth()
      const h = img.getScaledHeight()
      img.set({ cropX: 0, cropY: 0, width: img.getOriginalSize().width, height: img.getOriginalSize().height })
      const k = Math.min(w / img.width, h / img.height)
      img.set({ scaleX: k, scaleY: k })
      applyMask(img)
    }, t.history.resetCrop)
  }

  /** Aspect-ratio crop of the selected image around its centre. */
  cropToAspect(ratio: number): void {
    this.each((o) => {
      if (o.type !== 'image') return
      const img = o as FabricImage
      const w = img.getScaledWidth()
      coverFrame(img, w, w / ratio)
      applyMask(img)
      img.setCoords()
    }, t.history.crop)
  }

  /**
   * Cuts the background out of the selected image and swaps the result in. `option` picks how: `device` (the
   * default) runs the in-browser model, any other option id runs on a server through the adapter's AI service.
   * Either way the cut-out is a new asset and the swap is one undo step. Resolves `false` without touching the
   * design when cancelled or when the selection moved to another object while it ran.
   */
  async removeBackground(onProgress?: (phase: BgRemovalPhase, percent: number) => void, signal?: AbortSignal, option: string = DEVICE_OPTION): Promise<boolean> {
    const img = this.images()[0]
    if (!img || signal?.aborted) return false
    const stale = (): boolean => signal?.aborted === true || this.images()[0] !== img
    const ai = option === DEVICE_OPTION ? null : this.engine.adapter.services.ai
    if (option !== DEVICE_OPTION && !ai) throw new BackgroundRemovalError('No server option is available here.')
    let result: Blob | AssetRef
    try {
      const getImage = async () => (await fetch(img.getSrc(), { signal })).blob()
      result = ai
        ? await ai.run(BACKGROUND_REMOVAL_TASK, { model: option, image: getImage, assetId: asDory(img).assetId, signal })
        : await runRemoval(await getImage(), onProgress, signal)
    } catch (error) {
      // Cancel is not a failure: the engine has stopped its work and the design stays as it was.
      if (signal?.aborted) return false
      throw error
    }
    if (stale()) return false
    const ref = result instanceof Blob ? await this.engine.assets.upload(result, 'cutout.png') : result
    if (stale()) return false
    await this.engine.insert.replaceSelectedImage(ref)
    return true
  }

  /**
   * Whether the selected picture can be upscaled: a raster picture, not an SVG (the worker cannot
   * decode one, and a vector has no pixels to add). Video clips are never among `images()`.
   */
  canUpscale(): boolean {
    const img = this.images()[0]
    return img !== undefined && !isSvgSource(asDory(img).docSrc ?? img.getSrc())
  }

  /**
   * Increases the resolution of the whole selected photo with the pure-code upscaler and swaps the
   * result in, keeping the frame and the visible crop. Resolves `false` when cancelled, when the
   * selection moved while it ran, or when the selection is an SVG or a video clip.
   */
  async upscale(options: { scale: number; method?: UpscaleMethod; detail?: number }, onProgress?: UpscaleProgress, signal?: AbortSignal): Promise<boolean> {
    const img = this.images()[0]
    if (!img || !this.canUpscale() || this.engine.readOnly || asDory(img).locked || signal?.aborted) return false
    const source = this.selectedImageSource()
    if (!source) return false
    const target = targetSize(source.width, source.height, options.scale)
    // Refuse up front what this device cannot hold, rather than failing after the work.
    if (!fitsOutput(target, maxOutputPixels())) throw new UpscaleError(t.dialog.upscaleTooLarge)
    const stale = (): boolean => signal?.aborted === true || this.images()[0] !== img
    let result: Blob
    try {
      const blob = await (await fetch(img.getSrc(), { signal })).blob()
      result = await runUpscale(blob, { ...options, maxBytes: MAX_UPLOAD_BYTES }, onProgress, signal)
    } catch (error) {
      // Cancel is not a failure: the engine has stopped its work and the design stays as it was.
      if (signal?.aborted) return false
      throw error
    }
    if (stale()) return false
    const ext = result.type === 'image/webp' ? 'webp' : 'png'
    const ref = await this.engine.assets.upload(result, `upscaled-${target.width}x${target.height}.${ext}`)
    if (stale()) return false
    const crop = source.crop ? scaledCrop(source.crop, source.width, source.height, options.scale) : null
    await this.engine.insert.replaceSelectedImage(ref, t.history.upscale, crop ?? undefined)
    return true
  }

  /* --------------------------------------------------------- elements, links, QR */

  /** Whether the selected picture is an uploaded SVG that "Edit colors" can turn into shapes. */
  canEditSvgColors(): boolean {
    const img = this.images()[0]
    return this.targets().length === 1 && img !== undefined && isSvgSource(asDory(img).docSrc ?? img.getSrc())
  }

  /**
   * Turns the selected uploaded SVG picture into editable shapes in the same place (one undo step), so its
   * colors can be changed like an element's. Refused, with a message, for a cropped, framed or filtered
   * picture, for drawings too big to store in the design, and for parts the shape parser can't reproduce.
   */
  async editSvgColors(): Promise<boolean> {
    const view = this.engine.activeView()
    const img = this.images()[0]
    if (!view || !img || !this.canEditSvgColors()) return false
    const d = asDory(img)
    const natW = img.getElement().width || img.width || 1
    const natH = img.getElement().height || img.height || 1
    const cropped = (img.cropX ?? 0) > 0 || (img.cropY ?? 0) > 0 || (img.width ?? natW) < natW - 0.5 || (img.height ?? natH) < natH - 0.5
    if (cropped || img.clipPath || d.maskShape || (d.filterSpecs?.length ?? 0) > 0) {
      this.engine.toast(t.errors.svgEditPlain, 'error')
      return false
    }
    let parsed: Awaited<ReturnType<typeof parseSvgElement>>
    try {
      const text = await (await fetch(img.getSrc())).text()
      const problem = svgEditProblem(text)
      if (problem) {
        this.engine.toast(problem === 'too_large' ? t.errors.svgEditTooLarge : t.errors.svgEditUnsupported, 'error')
        return false
      }
      parsed = await parseSvgElement(text)
    } catch {
      this.engine.toast(t.errors.svgEditFailed, 'error')
      return false
    }
    const { object: next, svgWidth, svgHeight } = parsed
    if (shapeCount(next) > SVG_EDIT_LIMITS.shapes) {
      this.engine.toast(t.errors.svgEditTooLarge, 'error')
      return false
    }
    if (elementColors(next).length === 0) {
      this.engine.toast(t.errors.svgEditNoColors, 'error')
      return false
    }
    if (!this.images().includes(img)) return false // the selection moved on while the file loaded
    // The picture shows the SVG's whole canvas (margins included) across its own width x height, and the shapes
    // are in that canvas's coordinates: map them through the picture's transform so they land where they were.
    const kx = (img.width || 1) / Math.max(svgWidth, 1)
    const ky = (img.height || 1) / Math.max(svgHeight, 1)
    const shapes = next.getCenterPoint()
    const local = new Point(-(img.width || 1) / 2 + shapes.x * kx, -(img.height || 1) / 2 + shapes.y * ky)
    const at = util.transformPoint(local, img.calcTransformMatrix())
    next.set({
      originX: 'center',
      originY: 'center',
      left: at.x,
      top: at.y,
      scaleX: (img.scaleX || 1) * kx,
      scaleY: (img.scaleY || 1) * ky,
      angle: img.angle,
      flipX: img.flipX,
      flipY: img.flipY,
      opacity: img.opacity,
      shadow: img.shadow,
    })
    const nd = asDory(next)
    nd.id = d.id
    nd.name = d.name
    nd.locked = d.locked
    nd.assetId = d.assetId
    nd.elementId = `upload:${d.assetId ?? 'svg'}`
    nd.effects = d.effects
    const index = view.canvas.getObjects().indexOf(img)
    view.canvas.remove(img)
    view.configure(next)
    view.canvas.insertAt(Math.max(0, index), next)
    next.setCoords()
    view.selectObjects([next])
    this.finish(t.history.editColors)
    return true
  }

  recolor(from: string, to: string): void {
    this.each((o) => {
      const map = { ...(asDory(o).colorMap ?? {}) }
      map[normalizeColor(from)] = normalizeColor(to)
      applyColorMap(o, map)
    }, t.history.recolor, `recolor:${from}`)
    this.engine.rememberColor(normalizeColor(to))
  }

  resetColors(): void {
    this.each((o) => applyColorMap(o, undefined), t.history.resetColors)
  }

  /** Sets or clears a hyperlink. Only http(s) addresses are accepted; anything else is ignored. */
  setLink(url: string | null): void {
    const safe = url === null ? null : safeLinkUrl(url)
    if (url !== null && safe === null) return
    this.each((o) => {
      asDory(o).link = safe ? { url: safe } : undefined
    }, safe ? t.history.addLink : t.history.removeLink)
  }

  /** Tags the selected object as a template field, or clears the tag (`null`). An invalid key is ignored. */
  setField(field: DocField | null): void {
    const tag = field === null ? null : readField(field)
    if (field !== null && tag === null) return
    if (this.targets().length !== 1) return
    this.each((o) => {
      asDory(o).field = tag ?? undefined
    }, tag ? t.history.setField : t.history.removeField)
  }

  async setQr(patch: Partial<QrSpec>): Promise<void> {
    const obj = this.targets()[0] as FabricImage | undefined
    const current = obj ? asDory(obj).qr : undefined
    if (!obj || !current) return
    const next: QrSpec = { ...current, ...patch }
    const url = await qrDataUrl(next)
    await obj.setSrc(url, { crossOrigin: 'anonymous' })
    asDory(obj).qr = next
    this.finish(t.history.editQRCode, 'qr')
  }
}
