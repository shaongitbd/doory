/**
 * Image crop mode. A dimmed "ghost" copy shows the whole image under a draggable, resizable frame; the real
 * image always displays exactly the framed region, so what you see is what you get. All maths happens in the
 * image's own axes (rotation and flips are honoured), then maps to Fabric's `cropX/cropY/width/height`.
 *
 * Pure helpers (`frameToCrop`, `cropToFrame`, `clampCrop`, `trimCrop`, `fitAspect`) carry the geometry and are unit tested.
 */
import { type FabricImage, type FabricObject, Point, Rect } from 'fabric'
import type { PageCanvas } from './pageCanvas'
import { asDory } from './objects/dory'
import { applyMask } from './objects/masks'

export interface CropParams {
  cropX: number
  cropY: number
  width: number
  height: number
}

export interface CropGeometry {
  natW: number
  natH: number
  /** px per image px (always positive). */
  sx: number
  sy: number
  angle: number
  flipX: boolean
  flipY: boolean
  /** Scene position of the centre of the *full* image (the ghost). */
  ghostCenter: { x: number; y: number }
}

export interface Frame {
  cx: number
  cy: number
  /** Scene size along the image axes. */
  w: number
  h: number
}

const rad = (deg: number): number => (deg * Math.PI) / 180
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

function toLocal(g: CropGeometry, x: number, y: number): { x: number; y: number } {
  const dx = x - g.ghostCenter.x
  const dy = y - g.ghostCenter.y
  const a = -rad(g.angle)
  const rx = dx * Math.cos(a) - dy * Math.sin(a)
  const ry = dx * Math.sin(a) + dy * Math.cos(a)
  return { x: g.flipX ? -rx : rx, y: g.flipY ? -ry : ry }
}

function toScene(g: CropGeometry, lx: number, ly: number): { x: number; y: number } {
  const fx = g.flipX ? -lx : lx
  const fy = g.flipY ? -ly : ly
  const a = rad(g.angle)
  return { x: g.ghostCenter.x + fx * Math.cos(a) - fy * Math.sin(a), y: g.ghostCenter.y + fx * Math.sin(a) + fy * Math.cos(a) }
}

/** Crop parameters (image px) for a frame placed in the scene. */
export function frameToCrop(g: CropGeometry, f: Frame): CropParams {
  const local = toLocal(g, f.cx, f.cy)
  const width = f.w / g.sx
  const height = f.h / g.sy
  return { cropX: g.natW / 2 + local.x / g.sx - width / 2, cropY: g.natH / 2 + local.y / g.sy - height / 2, width, height }
}

/** Scene frame for crop parameters (inverse of `frameToCrop`). */
export function cropToFrame(g: CropGeometry, c: CropParams): Frame {
  const lx = (c.cropX + c.width / 2 - g.natW / 2) * g.sx
  const ly = (c.cropY + c.height / 2 - g.natH / 2) * g.sy
  const p = toScene(g, lx, ly)
  return { cx: p.x, cy: p.y, w: c.width * g.sx, h: c.height * g.sy }
}

/** Keeps the region inside the image (and no larger than it). */
export function clampCrop(g: CropGeometry, c: CropParams, minSize = 8): CropParams {
  const width = clamp(c.width, Math.min(minSize, g.natW), g.natW)
  const height = clamp(c.height, Math.min(minSize, g.natH), g.natH)
  return { width, height, cropX: clamp(c.cropX, 0, g.natW - width), cropY: clamp(c.cropY, 0, g.natH - height) }
}

/** The part of the region that lies inside the image, so a resize past an edge stops at that edge. */
export function trimCrop(g: CropGeometry, c: CropParams): CropParams {
  const cropX = Math.max(0, c.cropX)
  const cropY = Math.max(0, c.cropY)
  return { cropX, cropY, width: Math.min(g.natW, c.cropX + c.width) - cropX, height: Math.min(g.natH, c.cropY + c.height) - cropY }
}

/** Largest region with aspect `ratio` (w/h) that fits in the image, centred on `around`. */
export function fitAspect(g: CropGeometry, around: CropParams, ratio: number): CropParams {
  const cx = around.cropX + around.width / 2
  const cy = around.cropY + around.height / 2
  // Visual aspect = (width*sx) / (height*sy); solve in image px.
  const imgRatio = ratio * (g.sy / g.sx)
  let width = Math.min(around.width, g.natW)
  let height = width / imgRatio
  if (height > Math.min(around.height, g.natH)) {
    height = Math.min(around.height, g.natH)
    width = height * imgRatio
  }
  if (width > g.natW) {
    width = g.natW
    height = width / imgRatio
  }
  return clampCrop(g, { width, height, cropX: cx - width / 2, cropY: cy - height / 2 })
}

function geometryOf(img: FabricImage): CropGeometry {
  const nat = img.getOriginalSize()
  const center = img.getCenterPoint()
  const sx = Math.abs(img.scaleX) || 1
  const sy = Math.abs(img.scaleY) || 1
  const g: CropGeometry = {
    natW: nat.width || img.width,
    natH: nat.height || img.height,
    sx,
    sy,
    angle: img.angle,
    flipX: img.flipX,
    flipY: img.flipY,
    ghostCenter: { x: center.x, y: center.y },
  }
  const frame = cropToFrame({ ...g, ghostCenter: { x: 0, y: 0 } }, { cropX: img.cropX, cropY: img.cropY, width: img.width, height: img.height })
  // ghostCenter = visibleCentre - offset(visibleCentre from ghostCenter)
  g.ghostCenter = { x: center.x - frame.cx, y: center.y - frame.cy }
  return g
}

export class CropSession {
  private readonly geometry: CropGeometry
  private readonly original: CropParams
  private readonly originalFlags: { selectable: boolean; evented: boolean }
  private ratio: number | null = null
  private cleanups: (() => void)[] = []
  private done = false

  private constructor(
    private readonly view: PageCanvas,
    private readonly img: FabricImage,
    private readonly ghost: FabricImage,
    private readonly frame: Rect,
    private readonly onEnd: () => void,
  ) {
    this.geometry = geometryOf(img)
    this.original = { cropX: img.cropX, cropY: img.cropY, width: img.width, height: img.height }
    this.originalFlags = { selectable: img.selectable, evented: img.evented }
  }

  /** Builds the ghost + frame and enters crop mode. */
  static async start(view: PageCanvas, img: FabricImage, theme: { selection: string }, onEnd: () => void): Promise<CropSession> {
    const geometry = geometryOf(img)
    const ghost = (await img.clone()) as FabricImage
    const d = asDory(ghost)
    d.id = undefined
    d.maskShape = undefined
    d.effects = undefined
    ghost.set({
      cropX: 0,
      cropY: 0,
      width: geometry.natW,
      height: geometry.natH,
      scaleX: img.scaleX,
      scaleY: img.scaleY,
      angle: img.angle,
      flipX: img.flipX,
      flipY: img.flipY,
      originX: 'center',
      originY: 'center',
      left: geometry.ghostCenter.x,
      top: geometry.ghostCenter.y,
      opacity: 0.38,
      shadow: null,
      stroke: null,
      clipPath: undefined,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    })
    asDory(ghost).isUi = true
    const start = cropToFrame(geometry, { cropX: img.cropX, cropY: img.cropY, width: img.width, height: img.height })
    const frame = new Rect({
      originX: 'center',
      originY: 'center',
      left: start.cx,
      top: start.cy,
      width: start.w,
      height: start.h,
      angle: img.angle,
      fill: 'rgba(0,0,0,0)',
      stroke: theme.selection,
      strokeWidth: 2,
      strokeUniform: true,
      lockRotation: true,
      excludeFromExport: true,
      objectCaching: false,
      hoverCursor: 'move',
    })
    asDory(frame).isUi = true
    frame.setControlsVisibility({ mtr: false })
    const session = new CropSession(view, img, ghost, frame, onEnd)
    session.install()
    return session
  }

  private install(): void {
    const canvas = this.view.canvas
    const index = canvas.getObjects().indexOf(this.img)
    canvas.insertAt(Math.max(0, index), this.ghost)
    this.img.set({ selectable: false, evented: false })
    canvas.add(this.frame)
    this.view.quietly(() => {
      canvas.discardActiveObject()
      canvas.setActiveObject(this.frame)
    })
    const on = (name: 'object:moving' | 'object:scaling' | 'object:modified', fn: () => void): void => {
      const handler = (e: { target: FabricObject }): void => {
        if (e.target === this.frame) fn()
      }
      canvas.on(name, handler)
      this.cleanups.push(() => canvas.off(name, handler))
    }
    on('object:moving', () => this.sync(false))
    on('object:scaling', () => this.sync(true))
    on('object:modified', () => {
      this.sync(false)
      this.bakeFrame()
    })
    const cleared = (): void => {
      if (!this.done) this.apply()
    }
    canvas.on('selection:cleared', cleared)
    this.cleanups.push(() => canvas.off('selection:cleared', cleared))
    canvas.requestRenderAll()
  }

  private currentFrame(): Frame {
    const c = this.frame.getCenterPoint()
    // Not getScaledWidth/Height: they include the stroke, which would grow the frame on every sync.
    return { cx: c.x, cy: c.y, w: this.frame.width * this.frame.scaleX, h: this.frame.height * this.frame.scaleY }
  }

  private placeFrame(f: Frame): void {
    this.frame.set({ scaleX: f.w / (this.frame.width || 1), scaleY: f.h / (this.frame.height || 1) })
    this.frame.setPositionByOrigin(new Point(f.cx, f.cy), 'center', 'center')
    this.frame.setCoords()
  }

  /** Clamps the frame to the image, applies the aspect lock and mirrors the result onto the real image. */
  private sync(resizing: boolean): void {
    const wanted = frameToCrop(this.geometry, this.currentFrame())
    // A moved frame slides back inside the image and keeps its size; a resized one is cut at the edge.
    let params = clampCrop(this.geometry, resizing ? trimCrop(this.geometry, wanted) : wanted)
    if (this.ratio) params = fitAspect(this.geometry, params, this.ratio)
    this.placeFrame(cropToFrame(this.geometry, params))
    this.writeImage(params)
  }

  private writeImage(p: CropParams): void {
    const f = cropToFrame(this.geometry, p)
    this.img.set({ cropX: p.cropX, cropY: p.cropY, width: p.width, height: p.height })
    this.img.setPositionByOrigin(new Point(f.cx, f.cy), 'center', 'center')
    if (asDory(this.img).maskShape) applyMask(this.img)
    this.img.setCoords()
    this.view.canvas.requestRenderAll()
  }

  private bakeFrame(): void {
    const f = this.currentFrame()
    this.frame.set({ width: f.w, height: f.h, scaleX: 1, scaleY: 1 })
    this.frame.setPositionByOrigin(new Point(f.cx, f.cy), 'center', 'center')
    this.frame.setCoords()
  }

  /** Locks the frame to `ratio` (visual width / height) or frees it with `null`. */
  setAspect(ratio: number | null): void {
    this.ratio = ratio
    const free = ratio === null
    this.frame.setControlsVisibility({ ml: free, mr: free, mt: free, mb: free, mtr: false })
    if (ratio) {
      const params = fitAspect(this.geometry, frameToCrop(this.geometry, this.currentFrame()), ratio)
      this.bakeFrame()
      this.placeFrame(cropToFrame(this.geometry, params))
      this.bakeFrame()
      this.writeImage(params)
    }
  }

  /** Back to the full image. */
  reset(): void {
    const full = { cropX: 0, cropY: 0, width: this.geometry.natW, height: this.geometry.natH }
    this.placeFrame(cropToFrame(this.geometry, full))
    this.bakeFrame()
    this.writeImage(this.ratio ? fitAspect(this.geometry, full, this.ratio) : full)
    if (this.ratio) this.setAspect(this.ratio)
  }

  private teardown(): void {
    this.done = true
    for (const off of this.cleanups) off()
    this.cleanups = []
    const canvas = this.view.canvas
    this.view.quietly(() => {
      canvas.discardActiveObject()
      canvas.remove(this.frame, this.ghost)
    })
    this.img.set(this.originalFlags)
    this.onEnd()
  }

  /** Keeps the crop and leaves crop mode. Returns true if the image changed. */
  apply(): boolean {
    if (this.done) return false
    const p = { cropX: this.img.cropX, cropY: this.img.cropY, width: this.img.width, height: this.img.height }
    const changed = (Object.keys(p) as (keyof CropParams)[]).some((k) => Math.abs(p[k] - this.original[k]) > 0.01)
    this.teardown()
    applyMask(this.img)
    this.img.setCoords()
    this.view.selectObjects([this.img])
    return changed
  }

  cancel(): void {
    if (this.done) return
    this.writeImage(this.original)
    this.teardown()
    applyMask(this.img)
    this.view.selectObjects([this.img])
  }
}
