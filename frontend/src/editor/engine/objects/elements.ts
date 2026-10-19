/**
 * Catalog / built-in vector elements. An SVG is parsed into a Fabric group (or single path) tagged
 * with `elementId`; every leaf remembers its original colours so a `colorMap` can recolour it
 * repeatedly without drift.
 */
import { type FabricObject, Group, loadSVGFromString, util } from 'fabric'
import { normalizeColor } from '../colors'
import { asDory } from './dory'

function leaves(obj: FabricObject): FabricObject[] {
  if (obj instanceof Group) return obj.getObjects().flatMap(leaves)
  return [obj]
}

function solid(value: unknown): string | null {
  if (typeof value !== 'string' || value === 'none' || value === 'transparent') return null
  return normalizeColor(value)
}

/** Records the pristine colours on every leaf (call once, right after parsing). */
export function captureOriginalColors(root: FabricObject): void {
  for (const leaf of leaves(root)) {
    const d = asDory(leaf)
    const fill = solid(leaf.fill)
    const stroke = solid(leaf.stroke)
    if (fill && d.origFill === undefined) d.origFill = fill
    if (stroke && d.origStroke === undefined) d.origStroke = stroke
  }
}

/** Distinct original colours present in the element. */
export function elementColors(root: FabricObject): string[] {
  const set = new Set<string>()
  for (const leaf of leaves(root)) {
    const d = asDory(leaf)
    if (d.origFill) set.add(d.origFill)
    if (d.origStroke) set.add(d.origStroke)
  }
  return [...set]
}

/** Applies `colorMap` (original → replacement). Unmapped colours revert to their originals. */
export function applyColorMap(root: FabricObject, map: Record<string, string> | undefined): void {
  const colorMap = map ?? {}
  for (const leaf of leaves(root)) {
    const d = asDory(leaf)
    if (d.origFill) leaf.set('fill', colorMap[d.origFill] ?? d.origFill)
    if (d.origStroke) leaf.set('stroke', colorMap[d.origStroke] ?? d.origStroke)
    leaf.set('dirty', true)
  }
  const top = asDory(root)
  const cleaned = Object.fromEntries(Object.entries(colorMap).filter(([from, to]) => from !== to))
  top.colorMap = Object.keys(cleaned).length > 0 ? cleaned : undefined
  root.set('dirty', true)
}

/** Limits for turning an uploaded SVG into editable shapes: they are stored in the design itself. */
export const SVG_EDIT_LIMITS = { bytes: 1_000_000, shapes: 2000 } as const

/** Parts the shape parser can't reproduce faithfully: a drawing with them stays a picture. */
const UNSUPPORTED_SVG = /<(?:[a-z]+:)?(?:image|text|filter|mask|foreignObject|pattern)\b/i

export type SvgEditProblem = 'too_large' | 'unsupported' | 'empty'

/** Why `svgText` can't become editable shapes, or null when it can (checked before parsing). */
export function svgEditProblem(svgText: string): SvgEditProblem | null {
  if (svgText.length > SVG_EDIT_LIMITS.bytes) return 'too_large'
  if (UNSUPPORTED_SVG.test(svgText)) return 'unsupported'
  return null
}

/** The number of drawn shapes in a parsed element. */
export function shapeCount(root: FabricObject): number {
  return leaves(root).length
}

/** Whether a picture's source is an SVG file (an upload keeps its `.svg` name). */
export function isSvgSource(src: unknown): boolean {
  if (typeof src !== 'string') return false
  return /\.svg$/i.test(src.split(/[?#]/, 1)[0])
}

export interface ParsedElement {
  object: FabricObject
  /** The drawn shapes' size. */
  width: number
  height: number
  /** The SVG's own canvas (its viewport), which the shapes' coordinates are in; may be larger than the shapes. */
  svgWidth: number
  svgHeight: number
}

export async function parseSvgElement(svgText: string): Promise<ParsedElement> {
  const { objects, options } = await loadSVGFromString(svgText)
  const parsed = objects.filter((o): o is FabricObject => o !== null)
  if (parsed.length === 0) throw new Error('The SVG contains no drawable shapes.')
  const object = util.groupSVGElements(parsed, options)
  captureOriginalColors(object)
  const svgWidth = typeof options.width === 'number' && options.width > 0 ? options.width : object.width
  const svgHeight = typeof options.height === 'number' && options.height > 0 ? options.height : object.height
  return { object, width: object.width, height: object.height, svgWidth, svgHeight }
}
