/**
 * Object factories: every "Add …" action builds its Fabric object here. All objects are centred on
 * `at` (page px), get a fresh id, and use `strokeUniform` so borders keep their width when resized.
 */
import {
  Ellipse,
  FabricImage,
  type FabricObject,
  IText,
  Path,
  Polygon,
  Rect,
  Textbox,
  Triangle,
} from 'fabric'
import { newId } from '@/lib/document'
import type { ArrowHead, MaskShape } from '@/types/document'
import { fontStack } from '../text/fontStack'
import { DoryLine } from './DoryLine'
import type { DoryProps, QrSpec } from './dory'
import { PATH_SHAPES, regularPolygonPoints, starPoints } from './shapeGeometry'
import { applyMask } from './masks'
import { applyColorMap, parseSvgElement, type ElementColorMap } from './elements'
import { DEFAULT_QR, qrDataUrl } from './qr'
import { t } from '../../strings'

export interface Placement {
  x: number
  y: number
}

export const SHAPE_FILL = '#7a64e0'
/** The brand colour at 25 % opacity: the light tint every basic shape starts with (a translucent fill). */
export const SHAPE_TINT = '#7a64e040'
export const TEXT_COLOR = '#1c1517'
export const HEADING_FONT = fontStack('Plus Jakarta Sans', 'sans-serif')
export const BODY_FONT = fontStack('Inter', 'sans-serif')

export type TextPreset = 'heading' | 'subheading' | 'body'

interface PresetSpec {
  /** Text a freshly inserted preset starts with (selected, so typing replaces it). */
  label: string
  /** Font size on a 559 px wide page (A5 at 96 dpi); scaled to other page sizes by `textScale`. */
  size: number
  color: string
  weight: number
  font: string
  width: number
  lineHeight: number
}

export const TEXT_PRESETS: Record<TextPreset, PresetSpec> = {
  heading: { label: t.textPanel.headingText, size: 36, color: '#1a1a2e', weight: 700, font: HEADING_FONT, width: 0.72, lineHeight: 1.16 },
  subheading: { label: t.textPanel.subheadingText, size: 22, color: '#334155', weight: 600, font: BODY_FONT, width: 0.62, lineHeight: 1.16 },
  body: { label: t.textPanel.bodyText, size: 16, color: '#475569', weight: 400, font: BODY_FONT, width: 0.5, lineHeight: 1.16 },
}

/** Page side the preset sizes are specified for (A5 at 96 dpi). */
const PRESET_PAGE_SIDE = 559

/** Scales preset sizes to the page so a 1080 px design and an A4 page both start with readable text. */
export function textScale(pageWidth: number, pageHeight: number): number {
  return Math.min(5, Math.max(0.5, Math.min(pageWidth, pageHeight) / PRESET_PAGE_SIDE))
}

function finish<T extends FabricObject>(obj: T, props: DoryProps = {}): T {
  Object.assign(obj, { id: newId(), ...props })
  return obj
}

export interface TextOptions {
  text?: string
  preset?: TextPreset
  width?: number
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  fill?: string
  textAlign?: 'left' | 'center' | 'right' | 'justify'
}

export function createTextbox(page: { width: number; height: number }, at: Placement, opts: TextOptions = {}): Textbox {
  const spec = TEXT_PRESETS[opts.preset ?? 'body']
  const k = textScale(page.width, page.height)
  const width = opts.width ?? Math.round(page.width * spec.width)
  const t = new Textbox(opts.text ?? spec.label, {
    left: at.x,
    top: at.y,
    originX: 'center',
    originY: 'center',
    width,
    fontFamily: opts.fontFamily ?? spec.font,
    fontSize: opts.fontSize ?? Math.round(spec.size * k),
    fontWeight: opts.fontWeight ?? spec.weight,
    fill: opts.fill ?? spec.color,
    textAlign: opts.textAlign ?? 'center',
    lineHeight: spec.lineHeight,
    splitByGrapheme: false,
    editable: true,
    strokeUniform: true,
  })
  return finish(t)
}

/** An `IText` (used for curved text, where Fabric's Textbox wrapping does not apply). */
export function createIText(text: string, at: Placement, props: Partial<IText> = {}): IText {
  return finish(new IText(text, { left: at.x, top: at.y, originX: 'center', originY: 'center', ...props }))
}

const baseShape = (at: Placement, w: number, h: number): Record<string, unknown> => ({
  left: at.x,
  top: at.y,
  originX: 'center',
  originY: 'center',
  width: w,
  height: h,
  fill: SHAPE_FILL,
  stroke: null,
  strokeWidth: 0,
  strokeUniform: true,
})

export function defaultShapeSize(page: { width: number; height: number }): number {
  return Math.round(Math.min(page.width, page.height) * 0.28)
}

/** Edge of a basic shape (an 80 px circle on a 559 px page), scaled to the page like the text presets. */
export function shapeUnit(page: { width: number; height: number }): number {
  return Math.round(80 * textScale(page.width, page.height))
}

/** Size of an inserted sticker or catalog element: a quarter of the page's shorter side. */
export function stickerSize(page: { width: number; height: number }): number {
  return Math.round(Math.min(page.width, page.height) * 0.25)
}

/** Largest side of an inserted photo: half the page's shorter side. */
export function photoBox(page: { width: number; height: number }): number {
  return Math.min(page.width, page.height) * 0.5
}

/**
 * The look of the basic shapes: a light brand tint with a solid brand border that keeps its width when the shape
 * is resized. Width follows the page scale so a border stays visible on large designs.
 */
export function softShape<T extends FabricObject>(obj: T, page: { width: number; height: number }): T {
  obj.set({ fill: SHAPE_TINT, stroke: SHAPE_FILL, strokeWidth: Math.max(1, Math.round(2 * textScale(page.width, page.height))), strokeUniform: true })
  return obj
}

export function createRect(at: Placement, size: number, radius = 0, height = size): Rect {
  const r = new Rect({ ...baseShape(at, size, height), rx: radius, ry: radius })
  return finish(r, { shapeKind: 'rect' })
}

export function createEllipse(at: Placement, size: number): Ellipse {
  const e = new Ellipse({ ...baseShape(at, size, size), rx: size / 2, ry: size / 2 })
  return finish(e, { shapeKind: 'ellipse' })
}

export function createTriangle(at: Placement, size: number, height = size * 0.9): Triangle {
  return finish(new Triangle(baseShape(at, size, height)), { shapeKind: 'triangle' })
}

export function polygonFrom(points: { x: number; y: number }[], at: Placement, size: number, props: DoryProps): Polygon {
  const p = new Polygon(points, { ...baseShape(at, size, size) })
  p.set({ width: 100, height: 100 })
  p.set({ scaleX: size / 100, scaleY: size / 100, left: at.x, top: at.y })
  return finish(p, props)
}

export function createPolygon(at: Placement, size: number, sides = 6): Polygon {
  return polygonFrom(regularPolygonPoints(sides), at, size, { shapeKind: 'polygon', sides })
}

export function createStar(at: Placement, size: number, points = 5, innerRatio = 0.45): Polygon {
  return polygonFrom(starPoints(points, innerRatio), at, size, { shapeKind: 'star', starPoints: points, innerRatio })
}

export function createPathShape(shapeId: string, at: Placement, size: number): Path | null {
  const def = PATH_SHAPES.find((s) => s.id === shapeId)
  if (!def) return null
  const path = new Path(def.path, { ...baseShape(at, 0, 0), fillRule: def.evenOdd ? 'evenodd' : 'nonzero' })
  const longest = Math.max(path.width, path.height) || 100
  path.set({ scaleX: size / longest, scaleY: size / longest, left: at.x, top: at.y })
  return finish(path, { shapeKind: 'path', shapeId })
}

export interface LineOptions {
  length: number
  color?: string
  width?: number
  arrowEnd?: ArrowHead
  arrowStart?: ArrowHead
  dash?: number[] | null
}

export function createLine(at: Placement, opts: LineOptions): DoryLine {
  const line = new DoryLine({
    left: at.x,
    top: at.y,
    originX: 'center',
    originY: 'center',
    width: opts.length,
    stroke: opts.color ?? TEXT_COLOR,
    strokeWidth: opts.width ?? 6,
    strokeDashArray: opts.dash ?? null,
    arrowStart: opts.arrowStart ?? 'none',
    arrowEnd: opts.arrowEnd ?? 'none',
  })
  return finish(line)
}

export interface ImageSource {
  /** Logical src stored in the document. */
  src: string
  /** URL Fabric can load (resolved by the adapter). */
  url: string
  assetId?: string
}

export async function createImage(source: ImageSource, at: Placement, fit: { width: number; height: number }): Promise<FabricImage> {
  const img = await FabricImage.fromURL(source.url, { crossOrigin: 'anonymous' })
  const natural = { w: img.width || 1, h: img.height || 1 }
  const scale = Math.min(fit.width / natural.w, fit.height / natural.h)
  img.set({ left: at.x, top: at.y, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale, strokeUniform: true })
  return finish(img, { docSrc: source.src, assetId: source.assetId })
}

/** An empty image slot ("drop an image here") the user fills later; the unfilled rect is never exported. */
export function createPlaceholder(at: Placement, width: number, height: number, mask?: MaskShape): Rect {
  const r = new Rect({ ...baseShape(at, width, height), fill: 'rgba(140, 128, 132, 0.18)' })
  finish(r, { isPlaceholder: true, name: t.history.imagePlaceholder, maskShape: mask })
  applyMask(r)
  return r
}

export async function createQrCode(spec: QrSpec | undefined, at: Placement, size: number): Promise<FabricImage> {
  const qr = spec ?? DEFAULT_QR
  const url = await qrDataUrl(qr)
  const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
  const scale = size / (img.width || 512)
  img.set({ left: at.x, top: at.y, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale })
  return finish(img, { qr, name: t.history.qrCode })
}

export async function createElementFromSvg(
  svgText: string,
  at: Placement,
  size: number,
  meta: { elementId: string; name?: string; colorMap?: ElementColorMap },
): Promise<FabricObject> {
  const { object, width, height } = await parseSvgElement(svgText)
  const scale = size / Math.max(width, height, 1)
  object.set({ left: at.x, top: at.y, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale })
  finish(object, { elementId: meta.elementId, name: meta.name })
  if (meta.colorMap) applyColorMap(object, meta.colorMap)
  return object
}
