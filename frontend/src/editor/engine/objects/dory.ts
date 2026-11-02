/**
 * Doory's extra properties on Fabric objects, plus small typed accessors. We deliberately do not
 * augment Fabric's own types: `DoryObject` is an intersection used wherever custom props are read.
 */
import type { FabricObject } from 'fabric'
import { newId } from '@/lib/document'
import type {
  ArrowHead,
  DocField,
  DocTextFit,
  ImageFilterSpec,
  ListStyle,
  MaskShape,
  ObjectAnimation,
  ObjectEffects,
  SlotSpec,
  TextCase,
} from '@/types/document'
import type { ImageGridSpec } from '../../grids/model'

export interface QrSpec {
  text: string
  fg: string
  bg: string
}

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'polygon' | 'star' | 'path'

export interface DoryProps {
  id?: string
  name?: string
  locked?: boolean
  curveAmount?: number
  effects?: ObjectEffects
  maskShape?: MaskShape
  maskRadius?: number
  assetId?: string
  elementId?: string
  colorMap?: Record<string, string>
  origFill?: string
  origStroke?: string
  isPlaceholder?: boolean
  /** Semantic image-grid layout carried by a top-level Fabric group. */
  imageGrid?: ImageGridSpec
  /** Stable cell label scoped to the containing image grid. */
  gridCellId?: string
  /** On a picture that fills a placeholder: the frame it stays inside (see objects/slot.ts). */
  slot?: SlotSpec
  link?: { url: string }
  field?: DocField
  /** Shrink-to-fit rule on a text box, plus the derived size and the user's preferred size/box height. */
  fit?: DocTextFit
  fitFontSize?: number
  userFontSize?: number
  fitBoxHeight?: number
  qr?: QrSpec
  /** The logical `src` stored in the document (may be `idb://…`); the live element uses a resolved URL. */
  docSrc?: string
  textCase?: TextCase
  caseSource?: string
  listStyle?: ListStyle
  /** Text direction picked in the toolbar; absent, the text's first letter decides (see text/direction.ts). */
  textDir?: 'ltr' | 'rtl'
  shapeKind?: ShapeKind
  shapeId?: string
  sides?: number
  starPoints?: number
  innerRatio?: number
  arrowStart?: ArrowHead
  arrowEnd?: ArrowHead
  /** Doory-level filter list (the document format's `filters`); Fabric's own filter objects derive from it. */
  filterSpecs?: ImageFilterSpec[]
  /** How the object comes in, moves and leaves in a presentation or a video (editor/animation). */
  animation?: ObjectAnimation
  /** Set when an object could not be rebuilt (e.g. broken image): the original JSON is written back untouched. */
  rawDoc?: Record<string, unknown>
  /** Marks objects that exist only for editing UI and must never be serialised or exported. */
  isUi?: boolean
}

export type DoryObject = FabricObject & DoryProps

export const asDory = (o: FabricObject): DoryObject => o as DoryObject

export function ensureId(o: FabricObject): string {
  const d = asDory(o)
  if (!d.id) d.id = newId()
  return d.id
}

export function isLocked(o: FabricObject): boolean {
  return asDory(o).locked === true
}

export function isHidden(o: FabricObject): boolean {
  return o.visible === false
}

/** Applies Fabric's interaction lock props from the `locked` flag. */
export function applyLock(o: FabricObject): void {
  const locked = isLocked(o)
  o.set({
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
    hasControls: !locked,
  })
}
