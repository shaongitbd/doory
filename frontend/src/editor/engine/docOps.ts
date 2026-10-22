/**
 * Pure operations on `DoryDocument`. Every function returns a new document and keeps untouched pages
 * and objects referentially identical (structural sharing — this is what keeps history cheap).
 */
import { newId } from '@/lib/document'
import {
  type DocObject,
  type DocPage,
  type DoryDocument,
  MAX_DIMENSION_PX,
  MAX_PAGES,
  type PageBackground,
} from '@/types/document'
import { normalizeColor } from './colors'
import { primaryFamily } from './text/fontStack'

export interface PageSize {
  width: number
  height: number
}

export function pageSize(doc: DoryDocument, page: DocPage): PageSize {
  return { width: page.width ?? doc.width, height: page.height ?? doc.height }
}

export function findPageIndex(doc: DoryDocument, pageId: string): number {
  return doc.pages.findIndex((p) => p.id === pageId)
}

export function replacePage(doc: DoryDocument, page: DocPage): DoryDocument {
  const index = findPageIndex(doc, page.id)
  if (index < 0 || doc.pages[index] === page) return doc
  const pages = doc.pages.slice()
  pages[index] = page
  return { ...doc, pages }
}

export function createPage(background?: PageBackground): DocPage {
  return {
    id: newId(),
    background: background ?? { type: 'solid', color: '#ffffff' },
    objects: [],
  }
}

export function addPage(doc: DoryDocument, atIndex: number, page?: DocPage): DoryDocument {
  if (doc.pages.length >= MAX_PAGES) return doc
  const pages = doc.pages.slice()
  const index = Math.max(0, Math.min(pages.length, atIndex))
  pages.splice(index, 0, page ?? createPage())
  return { ...doc, pages }
}

export function removePage(doc: DoryDocument, pageId: string): DoryDocument {
  if (doc.pages.length <= 1) return doc
  const pages = doc.pages.filter((p) => p.id !== pageId)
  return pages.length === doc.pages.length ? doc : { ...doc, pages }
}

export function movePage(doc: DoryDocument, pageId: string, toIndex: number): DoryDocument {
  const from = findPageIndex(doc, pageId)
  if (from < 0) return doc
  const to = Math.max(0, Math.min(doc.pages.length - 1, toIndex))
  if (from === to) return doc
  const pages = doc.pages.slice()
  const [moved] = pages.splice(from, 1)
  pages.splice(to, 0, moved)
  return { ...doc, pages }
}

export function renamePage(doc: DoryDocument, pageId: string, name: string): DoryDocument {
  const index = findPageIndex(doc, pageId)
  if (index < 0) return doc
  const trimmed = name.trim()
  const page = doc.pages[index]
  if ((page.name ?? '') === trimmed) return doc
  const next: DocPage = { ...page }
  if (trimmed) next.name = trimmed
  else delete next.name
  return replacePage(doc, next)
}

export function setPageBackground(doc: DoryDocument, pageId: string, background: PageBackground): DoryDocument {
  const index = findPageIndex(doc, pageId)
  if (index < 0) return doc
  return replacePage(doc, { ...doc.pages[index], background })
}

export function applyBackgroundToAll(doc: DoryDocument, background: PageBackground): DoryDocument {
  return { ...doc, pages: doc.pages.map((p) => ({ ...p, background })) }
}

/**
 * Deep-copies objects assigning fresh ids to every object (including group children). A copied blurred background
 * points at the copy of its clip; one whose clip was not copied along is no longer anyone's background.
 */
export function cloneObjects(objects: readonly DocObject[]): DocObject[] {
  const renamed = new Map<string, string>()
  const reid = (o: DocObject): DocObject => {
    const copy = structuredClone(o)
    const walk = (node: DocObject): void => {
      const id = newId()
      renamed.set(node.id, id)
      node.id = id
      const children = node.objects
      if (Array.isArray(children)) for (const child of children as DocObject[]) walk(child)
    }
    walk(copy)
    return copy
  }
  const copies = objects.map(reid)
  walkObjects(copies, (o) => {
    if (typeof o.videoBackdropOf !== 'string') return
    const clip = renamed.get(o.videoBackdropOf)
    if (clip) o.videoBackdropOf = clip
    else delete o.videoBackdropOf
  })
  return copies
}

export function duplicatePage(doc: DoryDocument, pageId: string): DoryDocument {
  const index = findPageIndex(doc, pageId)
  if (index < 0 || doc.pages.length >= MAX_PAGES) return doc
  const src = doc.pages[index]
  const copy: DocPage = {
    ...structuredClone({ ...src, objects: [] as DocObject[] }),
    id: newId(),
    objects: cloneObjects(src.objects),
  }
  if (src.name) copy.name = `${src.name} copy`
  return addPage(doc, index + 1, copy)
}

export function pageLabel(page: DocPage, index: number): string {
  return page.name?.trim() || `Page ${index + 1}`
}

/* ---------------------------------- object helpers ---------------------------------- */

export function numberProp(o: DocObject, key: string, fallback: number): number {
  const v = o[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function stringProp(o: DocObject, key: string, fallback: string): string {
  const v = o[key]
  return typeof v === 'string' ? v : fallback
}

export function childrenOf(o: DocObject): DocObject[] {
  return Array.isArray(o.objects) ? (o.objects as DocObject[]) : []
}

/** Visits every object depth-first (groups before their children). Depth-limited for safety. */
export function walkObjects(objects: readonly DocObject[], visit: (o: DocObject, depth: number) => void, depth = 0): void {
  if (depth > 32) return
  for (const o of objects) {
    visit(o, depth)
    walkObjects(childrenOf(o), visit, depth + 1)
  }
}

export function findObjectById(objects: readonly DocObject[], id: string): DocObject | null {
  let found: DocObject | null = null
  walkObjects(objects, (o) => {
    if (!found && o.id === id) found = o
  })
  return found
}

export interface FontUse {
  family: string
  weight: string
  style: string
  /** Distinct characters rendered with this font (lets the loader fetch only the unicode subsets it needs). */
  chars?: string
}

/** Every distinct font (family + weight + style) used by the given objects (groups included). */
export function fontsInObjects(objects: readonly DocObject[]): FontUse[] {
  const seen = new Map<string, FontUse & { charSet: Set<string> }>()
  const add = (family: unknown, weight: unknown, style: unknown, text: string): void => {
    if (typeof family !== 'string' || family.length === 0) return
    const name = primaryFamily(family)
    if (!name) return
    const w = weight === undefined || weight === null ? 'normal' : String(weight)
    const s = typeof style === 'string' && style ? style : 'normal'
    const key = `${name}|${w}|${s}`
    let entry = seen.get(key)
    if (!entry) {
      entry = { family: name, weight: w, style: s, charSet: new Set() }
      seen.set(key, entry)
    }
    for (const ch of text.slice(0, 20_000)) entry.charSet.add(ch)
  }
  walkObjects(objects, (o) => {
    if (typeof o.type !== 'string' || !/text/i.test(o.type)) return
    const text = typeof o.text === 'string' ? o.text : ''
    add(o.fontFamily, o.fontWeight, o.fontStyle, text)
    const styles = o.styles
    if (Array.isArray(styles)) {
      for (const entry of styles as { style?: Record<string, unknown> }[]) {
        const st = entry.style
        if (st && (st.fontFamily || st.fontWeight || st.fontStyle)) {
          add(st.fontFamily ?? o.fontFamily, st.fontWeight ?? o.fontWeight, st.fontStyle ?? o.fontStyle, text)
        }
      }
    }
  })
  return [...seen.values()].map(({ charSet, ...use }) => ({ ...use, chars: [...charSet].join('') }))
}

/** Every distinct font the whole document renders text with. */
export function usedFonts(doc: DoryDocument): FontUse[] {
  return fontsInObjects(doc.pages.flatMap((p) => p.objects))
}

/** Distinct colours used by fills/strokes and page backgrounds, most frequent first. */
export function documentColors(doc: DoryDocument, limit = 18): string[] {
  const counts = new Map<string, number>()
  const add = (c: unknown): void => {
    if (typeof c !== 'string') return
    const n = normalizeColor(c)
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(n) || (n.length === 9 && n.endsWith('00'))) return
    counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  for (const page of doc.pages) {
    if (page.background.type === 'solid') add(page.background.color)
    if (page.background.type === 'gradient') for (const s of page.background.stops) add(s.color)
    walkObjects(page.objects, (o) => {
      add(o.fill)
      add(o.stroke)
      const fill = o.fill
      if (fill && typeof fill === 'object' && Array.isArray((fill as { colorStops?: unknown }).colorStops)) {
        for (const s of (fill as { colorStops: { color?: string }[] }).colorStops) add(s.color)
      }
    })
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([c]) => c)
}

export function clampSize(n: number): number {
  return Math.min(MAX_DIMENSION_PX, Math.max(1, Math.round(n)))
}

/** Total object count on a page (groups count their children), used for perf heuristics. */
export function countObjects(page: DocPage): number {
  let n = 0
  walkObjects(page.objects, () => {
    n += 1
  })
  return n
}
