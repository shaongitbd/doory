/**
 * Fabric ⇄ document conversion.
 *
 * `toObject(EXTRA_PROPS)` is the only supported serialiser (Fabric 7's `toJSON()` drops custom props).
 * The pipeline is kind-aware: every registered `ObjectKind` can adjust the JSON before Fabric rebuilds
 * an object (`prepare`), derive state on the live object (`hydrate`) and strip derived data again
 * when writing (`dehydrate`).
 *
 * Document object types (lower-case Fabric class names plus Doory's own):
 *
 *   textbox · itext · rect · ellipse · circle · triangle · polygon · polyline · path · image · group
 *   doryline (line / arrow with optional arrow heads)
 *
 * Doory-specific props (all optional) are listed in EXTRA_PROPS below and typed in
 * types/document.ts.
 */
import { classRegistry, type FabricObject, Group, Rect, type StaticCanvas } from 'fabric'
import { type DocObject, type DocPage } from '@/types/document'
import './objects/builtinKinds'
import './objects/complexText'
import { type KindLoadContext, kindOfDoc, kindOfLive, objectKinds } from './objects/kinds'
import { applyLock, asDory, ensureId } from './objects/dory'
import { type FontUse, fontsInObjects } from './docOps'
import { readField } from './fields'
import { t } from '../strings'

export const EXTRA_PROPS: readonly string[] = [
  /** Stable identity (layers panel, comments, undo diffing). */
  'id',
  /** User-editable layer name. */
  'name',
  /** Position lock. */
  'locked',
  /** Signed arc amount for curved text. */
  'curveAmount',
  /** Declarative effects (shadow / outline / glow / background). */
  'effects',
  /** Mask frame of an image or placeholder. */
  'maskShape',
  'maskRadius',
  /** Server asset UUID (tracing / cleanup). */
  'assetId',
  /** Catalog element this was created from, and its colour overrides. */
  'elementId',
  'colorMap',
  'origFill',
  'origStroke',
  /** Template slot: "click to add photo". */
  'isPlaceholder',
  /** The frame a placeholder photo fills. */
  'slot',
  /** Hyperlink for PDF / shared view. */
  'link',
  /** Template field tag: a stable name for data to fill. */
  'field',
  /** Shrink-to-fit rule and derived size for text boxes. */
  'fit',
  'fitFontSize',
  /** Regenerate-able QR code source. */
  'qr',
  /** Logical image src (the live element uses a resolved URL). */
  'docSrc',
  /** Text transforms and list style. */
  'textCase',
  'caseSource',
  'listStyle',
  /** Text direction picked by hand (absent: the content decides). */
  'textDir',
  /** Parametric shape descriptors. */
  'shapeKind',
  'shapeId',
  'sides',
  'starPoints',
  'innerRatio',
  /** Line / arrow heads. */
  'arrowStart',
  'arrowEnd',
  /** Doory-level image filter list. */
  'filterSpecs',
  /** Enter / exit / emphasis animation (editor/animation). */
  'animation',
]

export function getExtraProps(): string[] {
  const set = new Set<string>(EXTRA_PROPS)
  for (const kind of objectKinds.list()) for (const p of kind.extraProps ?? []) set.add(p)
  return [...set]
}

export interface LoadContext extends KindLoadContext {
  ensureFonts(fonts: FontUse[]): Promise<void>
  /** Told about every object that could not be rebuilt and is drawn as a grey stand-in (e.g. its picture failed to load). */
  onFallback?(json: DocObject): void
}

/* ------------------------------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------------------------------- */

function stripUndefined(json: Record<string, unknown>): void {
  for (const key of Object.keys(json)) if (json[key] === undefined) delete json[key]
}

const PATH_PROPS = ['path', 'pathStartOffset', 'pathSide', 'pathAlign']

function dehydrateTree(json: DocObject, obj: FabricObject): DocObject {
  const d = asDory(obj)
  if (d.rawDoc) return d.rawDoc as DocObject
  const out: DocObject = json
  if (typeof out.type === 'string') out.type = out.type.toLowerCase()
  delete out.version
  delete out.crossOrigin
  if (!out.id) out.id = ensureId(obj)

  const kindId = kindOfLive(obj)
  if (kindId === 'image' || kindId === 'video' || kindId === 'qr' || kindId === 'placeholder') {
    if (d.docSrc !== undefined && 'src' in out) {
      out.src = d.docSrc
      delete out.docSrc
    }
    delete out.filters
    if (d.filterSpecs && d.filterSpecs.length > 0) out.filters = d.filterSpecs
    delete out.filterSpecs
    if (d.maskShape || d.slot) delete out.clipPath
  }
  if (typeof d.curveAmount === 'number' && d.curveAmount !== 0) for (const p of PATH_PROPS) delete out[p]
  if (!d.curveAmount) delete out.curveAmount

  if (obj instanceof Group && Array.isArray(out.objects)) {
    const children = obj.getObjects()
    const jsonChildren = out.objects as DocObject[]
    out.objects = jsonChildren.map((child, i) => (children[i] ? dehydrateTree(child, children[i]) : child))
  }

  const kind = objectKinds.list().find((k) => k.id === kindId)
  kind?.dehydrate?.(out, obj)
  stripUndefined(out)
  return out
}

/** Serialises a single live object (inspector snapshots, clipboard). Group-member coordinates stay group-relative. */
export function serializeObject(obj: FabricObject): DocObject {
  const json = obj.toObject(getExtraProps()) as unknown as DocObject
  return dehydrateTree(json, obj)
}

/** Serialises every document object on the canvas (UI-only objects are skipped). */
export function serializeObjects(canvas: StaticCanvas): DocObject[] {
  const live = canvas.getObjects().filter((o) => !o.excludeFromExport)
  const json = canvas.toObject(getExtraProps()).objects as DocObject[]
  return json.map((j, i) => dehydrateTree(j, live[i]))
}

const stringCache = new WeakMap<object, string>()
function stringify(o: DocObject): string {
  let s = stringCache.get(o)
  if (s === undefined) {
    s = JSON.stringify(o)
    stringCache.set(o, s)
  }
  return s
}

/**
 * Structural sharing: any object that serialises identically to its predecessor (same id) keeps the
 * old reference. If nothing changed at all, `prev` itself is returned.
 */
export function shareObjects(next: DocObject[], prev: readonly DocObject[]): DocObject[] {
  const byId = new Map<string, DocObject>()
  for (const p of prev) byId.set(p.id, p)
  let same = next.length === prev.length
  const out = next.map((n, i) => {
    const old = byId.get(n.id)
    if (old && stringify(old) === JSON.stringify(n)) {
      if (prev[i] !== old) same = false
      return old
    }
    same = false
    return n
  })
  return same ? (prev as DocObject[]) : out
}

export function serializePage(canvas: StaticCanvas, base: DocPage): DocPage {
  const objects = shareObjects(serializeObjects(canvas), base.objects)
  return objects === base.objects ? base : { ...base, objects }
}

/* ------------------------------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------------------------------- */

async function prepareTree(json: DocObject, ctx: LoadContext): Promise<void> {
  if (typeof json.type === 'string') json.type = json.type.toLowerCase()
  // Fabric revives every nested object that has a `type` as a class instance (`{type: 'image'}` → an image), so
  // the field tag skips Fabric and is put back by `hydrateTree` from the original JSON.
  delete json.field
  const kind = objectKinds.list().find((k) => k.id === kindOfDoc(json))
  await kind?.prepare?.(json, ctx)
  if (Array.isArray(json.objects)) await Promise.all((json.objects as DocObject[]).map((c) => prepareTree(c, ctx)))
}

async function hydrateTree(obj: FabricObject, json: DocObject, ctx: LoadContext): Promise<void> {
  const d = asDory(obj)
  if (!d.id) d.id = typeof json.id === 'string' ? json.id : ensureId(obj)
  const field = readField(json.field)
  if (field) d.field = field
  const kind = objectKinds.list().find((k) => k.id === kindOfLive(obj))
  await kind?.hydrate?.(obj, json, ctx)
  applyLock(obj)
  if (obj instanceof Group && Array.isArray(json.objects)) {
    const children = obj.getObjects()
    const jsonChildren = json.objects as DocObject[]
    await Promise.all(children.map((child, i) => (jsonChildren[i] ? hydrateTree(child, jsonChildren[i], ctx) : undefined)))
  }
}

/** Stand-in for an object that could not be rebuilt; the original JSON is written back untouched. */
function fallbackObject(json: DocObject): FabricObject {
  const num = (k: string, fb: number): number => (typeof json[k] === 'number' ? (json[k] as number) : fb)
  const rect = new Rect({
    left: num('left', 0),
    top: num('top', 0),
    width: Math.max(1, num('width', 100)),
    height: Math.max(1, num('height', 100)),
    scaleX: num('scaleX', 1),
    scaleY: num('scaleY', 1),
    angle: num('angle', 0),
    fill: 'rgba(120, 110, 114, 0.18)',
    stroke: 'rgba(120, 110, 114, 0.6)',
    strokeDashArray: [6, 4],
    strokeUniform: true,
  })
  const d = asDory(rect)
  d.id = typeof json.id === 'string' ? json.id : undefined
  d.name = typeof json.name === 'string' ? json.name : t.kinds.unavailable
  d.rawDoc = json
  return rect
}

export async function deserializeObjects(docs: readonly DocObject[], ctx: LoadContext): Promise<FabricObject[]> {
  if (docs.length === 0) return []
  const prepared = docs.map((d) => structuredClone(d))
  await Promise.all(prepared.map((p) => prepareTree(p, ctx)))
  await ctx.ensureFonts(fontsInObjects(prepared))
  const instances = await Promise.all(
    prepared.map(async (json, i): Promise<FabricObject> => {
      try {
        const cls = classRegistry.getClass<{ fromObject(o: DocObject): Promise<FabricObject> }>(String(json.type))
        return await cls.fromObject(json)
      } catch {
        ctx.onFallback?.(docs[i])
        return fallbackObject(docs[i])
      }
    }),
  )
  await Promise.all(instances.map((obj, i) => hydrateTree(obj, docs[i], ctx)))
  return instances
}
