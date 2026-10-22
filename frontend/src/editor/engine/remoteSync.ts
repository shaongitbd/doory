/**
 * Pure helpers for bringing a page that changed somewhere else onto a live canvas without disturbing the
 * user: which objects can be updated in place, which have to be rebuilt, which the user is busy with (those
 * wait, and are merged with what the user did when they commit), and the three-way merge itself.
 */
import type { DocObject, DocPage } from '@/types/document'
import { CLIP_TIMING_PROPS } from '../clips/model'
import { jsonEqual } from './json'

/**
 * Properties a Fabric object can take in place. Anything else (text, sources, filters, effects, geometry that
 * Fabric derives from other properties) rebuilds the object.
 */
export const IN_PLACE_PROPS: ReadonlySet<string> = new Set(['left', 'top', 'angle', 'scaleX', 'scaleY', 'flipX', 'flipY', 'skewX', 'skewY', 'opacity', 'animation', ...CLIP_TIMING_PROPS])

/** Properties that are only data on the object (nothing is drawn from them): setting them to nothing removes them. */
const DATA_PROPS: ReadonlySet<string> = new Set(['animation', ...CLIP_TIMING_PROPS])

export function changedKeys(a: DocObject, b: DocObject): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const out: string[] = []
  for (const key of keys) if (!jsonEqual(a[key], b[key])) out.push(key)
  return out
}

/** Keys of `next` that differ from `prev` when all of them can be set in place, otherwise `null`. */
export function inPlaceChange(prev: DocObject, next: DocObject): string[] | null {
  if (prev.type !== next.type) return null
  const keys = changedKeys(prev, next)
  return keys.length > 0 && keys.every((key) => IN_PLACE_PROPS.has(key) && (key in next || DATA_PROPS.has(key))) ? keys : null
}

/**
 * Three-way merge of one object: a property the user changed since `base` keeps the user's value, every other
 * property takes the value that came from elsewhere. Returns `remote` itself when the merge equals it.
 */
export function mergeObject(base: DocObject, local: DocObject, remote: DocObject): DocObject {
  const merged: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])
  for (const key of keys) {
    const mine = jsonEqual(local[key], base[key]) ? remote[key] : local[key]
    if (mine !== undefined) merged[key] = mine
  }
  return jsonEqual(merged, remote) ? remote : (merged as DocObject)
}

export interface Deferred {
  /** The object as the canvas has it (what the user started from). */
  base: DocObject
  /** The newest version that came from elsewhere. */
  remote: DocObject
}

export interface PagePlan {
  removed: string[]
  /** Objects to build (new ones, and ones whose change cannot be applied in place). */
  build: DocObject[]
  patched: { id: string; keys: string[]; next: DocObject }[]
  /** Changed objects the user is busy with: kept as they are on the canvas and merged later. */
  deferred: DocObject[]
  orderChanged: boolean
}

/**
 * Sorts what changed between the page the canvas shows (`prev`) and the new page (`next`).
 * `busy` are the objects the user is editing or dragging right now; `live` those that exist on the canvas.
 */
export function planPage(prev: DocPage, next: DocPage, busy: ReadonlySet<string>, live: ReadonlySet<string>): PagePlan {
  const before = new Map<string, DocObject>()
  for (const o of prev.objects) before.set(o.id, o)
  const after = new Set<string>()
  const plan: PagePlan = { removed: [], build: [], patched: [], deferred: [], orderChanged: false }
  for (const object of next.objects) {
    after.add(object.id)
    const old = before.get(object.id)
    if (old === object && live.has(object.id)) continue
    if (!old || !live.has(object.id)) {
      plan.build.push(object)
      continue
    }
    if (busy.has(object.id)) {
      plan.deferred.push(object)
      continue
    }
    const keys = inPlaceChange(old, object)
    if (keys) plan.patched.push({ id: object.id, keys, next: object })
    else plan.build.push(object)
  }
  for (const id of before.keys()) if (!after.has(id)) plan.removed.push(id)
  for (const id of live) if (!after.has(id) && !before.has(id)) plan.removed.push(id)
  const kept = prev.objects.filter((o) => after.has(o.id))
  plan.orderChanged = kept.length !== next.objects.length || kept.some((o, i) => o.id !== next.objects[i].id)
  return plan
}
