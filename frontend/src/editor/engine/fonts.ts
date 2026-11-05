/**
 * Font loading. Families come from the server catalog (`adapter.services.fonts`) as variant files;
 * each is registered once through the `FontFace` API, loads are de-duplicated and cached, text never
 * measures against a fallback if the caller awaits `ensure()`, and an unreachable catalog degrades to
 * the built-in system fonts.
 */
import { cache } from 'fabric'
import type { FontCategory, FontFamily, FontQuery, FontVariant, Page, PdfFontFile } from '@/types/api'
import type { FontUse } from './docOps'
import { primaryFamily } from './text/fontStack'

export interface SystemFont {
  family: string
  category: FontCategory
}

/** Fonts that exist on (nearly) every device — usable with no server and no download. */
export const SYSTEM_FONTS: readonly SystemFont[] = [
  { family: 'Arial', category: 'sans-serif' },
  { family: 'Helvetica', category: 'sans-serif' },
  { family: 'Verdana', category: 'sans-serif' },
  { family: 'Tahoma', category: 'sans-serif' },
  { family: 'Trebuchet MS', category: 'sans-serif' },
  { family: 'Georgia', category: 'serif' },
  { family: 'Times New Roman', category: 'serif' },
  { family: 'Palatino Linotype', category: 'serif' },
  { family: 'Garamond', category: 'serif' },
  { family: 'Courier New', category: 'monospace' },
  { family: 'Impact', category: 'display' },
  { family: 'Comic Sans MS', category: 'handwriting' },
]

const SYSTEM_SET = new Set(SYSTEM_FONTS.map((f) => f.family.toLowerCase()))

export function isSystemFont(family: string): boolean {
  return SYSTEM_SET.has(primaryFamily(family).toLowerCase())
}

/** Catalog fields beyond the shared `FontFamily` type: one woff2 per unicode subset (Fontsource layout). */
export interface FontSubsetFile {
  subset: string
  url: string
}
export type FontVariantEx = FontVariant & { subsets?: FontSubsetFile[] }
export type FontFamilyEx = FontFamily & { unicode_ranges?: Record<string, string> }

export type CodepointRange = readonly [number, number]

/** Parses a CSS `unicode-range` value (`U+0000-00FF, U+0131, U+4??`) into codepoint ranges. */
export function parseUnicodeRange(css: string): CodepointRange[] {
  const out: CodepointRange[] = []
  for (const part of css.split(',')) {
    const m = /^\s*U\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(part)
    if (!m) continue
    if (m[1].includes('?')) {
      out.push([parseInt(m[1].replace(/\?/g, '0'), 16), parseInt(m[1].replace(/\?/g, 'f'), 16)])
    } else {
      const lo = parseInt(m[1], 16)
      out.push([lo, m[2] ? parseInt(m[2], 16) : lo])
    }
  }
  return out
}

export function rangesCoverText(ranges: readonly CodepointRange[], text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true
  }
  return false
}

export interface SubsetToLoad {
  subset: string
  url: string
  /** CSS unicode-range to register the face with ('' = none, i.e. the face covers everything). */
  range: string
}

/**
 * Files to register for one variant: the Latin file first (always), then every other subset whose unicode
 * range contains a character of `text`. Without catalog ranges only the main file is used.
 */
export function subsetsToLoad(entry: FontFamilyEx, variant: FontVariantEx, text: string): SubsetToLoad[] {
  const ranges = entry.unicode_ranges ?? {}
  const out: SubsetToLoad[] = [{ subset: 'latin', url: variant.url, range: ranges.latin ?? '' }]
  for (const file of variant.subsets ?? []) {
    if (file.subset === 'latin' || file.url === variant.url) continue
    const range = ranges[file.subset]
    if (range && rangesCoverText(parseUnicodeRange(range), text)) out.push({ subset: file.subset, url: file.url, range })
  }
  return out
}

export type FontLister = (q: FontQuery) => Promise<Page<FontFamily>>

const LOAD_TIMEOUT_MS = 8000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Font load timed out')), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e instanceof Error ? e : new Error(String(e)))
      },
    )
  })
}

/** Picks the catalog variant closest to the requested weight/style. */
export function pickVariant(variants: readonly FontVariant[], weight: number, style: 'normal' | 'italic'): FontVariant | null {
  if (variants.length === 0) return null
  const sameStyle = variants.filter((v) => v.style === style)
  const pool = sameStyle.length > 0 ? sameStyle : variants
  return [...pool].sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0] ?? null
}

export function weightToNumber(weight: string | number | undefined): number {
  if (typeof weight === 'number') return weight
  if (weight === 'bold') return 700
  if (weight === undefined || weight === 'normal') return 400
  const n = Number.parseInt(weight, 10)
  return Number.isFinite(n) ? n : 400
}

type Listener = (family: string) => void

export class FontManager {
  private readonly catalog = new Map<string, FontFamily>()
  private readonly lookups = new Map<string, Promise<FontFamily | null>>()
  private readonly registered = new Set<string>()
  private readonly loading = new Map<string, Promise<boolean>>()
  private readonly knownChars = new Map<string, Set<string>>()
  private readonly failed = new Set<string>()
  private readonly listeners = new Set<Listener>()
  /** Lower-cased names of the families that come from the user's own library (uploaded fonts). */
  private readonly userFamilies = new Set<string>()
  /** The faces registered for uploaded families, so deleting a font takes it off the page at once. */
  private readonly userFaces = new Map<string, { face: FontFace; key: string }[]>()
  private userFontsReady: (() => Promise<void>) | null = null

  constructor(private lister: FontLister | null) {}

  setLister(lister: FontLister | null): void {
    this.lister = lister
  }

  /**
   * Replaces the families that come from the user's library. They are looked up before the public catalog's
   * system-font shortcut (an uploaded "Arial" is the uploaded file, not the installed font) and never asked of the
   * public list, which does not have them.
   */
  setUserFonts(fonts: readonly FontFamily[]): void {
    const kept = new Set(fonts.map((f) => f.family.toLowerCase()))
    for (const key of this.userFamilies) {
      this.catalog.delete(key)
      if (!kept.has(key)) this.dropFaces(key)
    }
    this.userFamilies.clear()
    // Families that were unknown a moment ago may be the user's: ask again.
    this.lookups.clear()
    for (const f of fonts) {
      const key = f.family.toLowerCase()
      this.userFamilies.add(key)
      this.catalog.set(key, f)
      this.failed.delete(key)
    }
  }

  /** Takes the faces of a deleted family off the page: its text is drawn in the fallback font from now on. */
  private dropFaces(key: string): void {
    const faces = this.userFaces.get(key)
    if (!faces) return
    this.userFaces.delete(key)
    for (const { face, key: registeredKey } of faces) {
      document.fonts.delete(face)
      this.registered.delete(registeredKey)
    }
    for (const prefix of [...this.loading.keys()]) if (prefix.startsWith(`${key}|`)) this.loading.delete(prefix)
    cache.clearFontCache(key)
    for (const l of [...this.listeners]) l(key)
  }

  /**
   * Tells the manager how to wait for the user's library to be fetched: a family that is not in the catalog may still
   * be one of the user's, so lookups wait for that fetch (once) before they give up on it.
   */
  setUserFontsReady(ready: (() => Promise<void>) | null): void {
    this.userFontsReady = ready
  }

  isUserFont(family: string): boolean {
    return this.userFamilies.has(primaryFamily(family).toLowerCase())
  }

  /** Installed on (nearly) every device and not shadowed by an uploaded font of the same name. */
  private isInstalled(name: string): boolean {
    return isSystemFont(name) && !this.userFamilies.has(name.toLowerCase())
  }

  /** Teaches the manager about catalog entries seen elsewhere (e.g. the font picker list). */
  remember(fonts: readonly FontFamily[]): void {
    for (const f of fonts) this.catalog.set(f.family.toLowerCase(), f)
  }

  /** Returns a face already seen in the picker without waiting for another catalogue request. */
  known(family: string): FontFamily | null {
    return this.catalog.get(primaryFamily(family).toLowerCase()) ?? null
  }

  onLoaded(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  hasFailed(family: string): boolean {
    return this.failed.has(primaryFamily(family).toLowerCase())
  }

  async lookup(family: string): Promise<FontFamily | null> {
    const key = primaryFamily(family).toLowerCase()
    const known = this.catalog.get(key)
    if (known) return known
    const pending = this.lookups.get(key)
    if (pending) return pending
    const p = this.findUnknown(key, primaryFamily(family))
    this.lookups.set(key, p)
    return p
  }

  private async findUnknown(key: string, name: string): Promise<FontFamily | null> {
    if (this.userFontsReady) {
      await this.userFontsReady().catch(() => undefined)
      const mine = this.catalog.get(key)
      if (mine) return mine
    }
    const lister = this.lister
    if (!lister) return null
    try {
      const page = await lister({ q: name, page_size: 10 })
      this.remember(page.results)
      return this.catalog.get(key) ?? null
    } catch {
      return null
    }
  }

  isReady(family: string, weight: string | number = 400, style = 'normal'): boolean {
    const name = primaryFamily(family)
    if (this.isInstalled(name) || typeof document === 'undefined' || !document.fonts) return true
    return document.fonts.check(`${style} ${weightToNumber(weight)} 16px "${name}"`)
  }

  /** Loads one family/weight/style. Resolves false (never rejects) when the font is unavailable. */
  load(family: string, weight: string | number = 400, style: string = 'normal', text = ''): Promise<boolean> {
    const name = primaryFamily(family)
    const w = weightToNumber(weight)
    const s = style === 'italic' ? 'italic' : 'normal'
    const key = `${name.toLowerCase()}|${w}|${s}`
    const wanted = this.knownChars.get(key) ?? new Set<string>()
    for (const ch of text) wanted.add(ch)
    this.knownChars.set(key, wanted)
    const prev = this.loading.get(key) ?? Promise.resolve(true)
    // Loads for the same face are serialised so a later call with new characters tops up the subsets.
    const p = prev.then(() => this.doLoad(name, w, s, [...wanted].join(''))).then((ok) => {
      if (ok) this.failed.delete(name.toLowerCase())
      else this.failed.add(name.toLowerCase())
      return ok
    })
    this.loading.set(key, p)
    return p
  }

  /** Makes sure the unicode subsets needed to render `text` are available (call as the user types). */
  ensureText(family: string, weight: string | number, style: string, text: string): Promise<boolean> {
    const name = primaryFamily(family)
    if (this.isInstalled(name)) return Promise.resolve(true)
    return this.load(family, weight, style, text)
  }

  private async doLoad(name: string, weight: number, style: 'normal' | 'italic', text: string): Promise<boolean> {
    if (this.isInstalled(name) || typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return true
    const found = await this.lookup(name)
    if (!found) return false
    const entry = found as FontFamilyEx
    // A catalog entry without files is a family installed on the device itself.
    if (entry.variants.length === 0) return true
    const variant = pickVariant(entry.variants, weight, style) as FontVariantEx | null
    if (!variant) return false
    let added = false
    try {
      for (const file of subsetsToLoad(entry, variant, text)) {
        const key = `${name.toLowerCase()}|${variant.weight}|${variant.style}|${file.url}`
        if (this.registered.has(key)) continue
        const descriptors: FontFaceDescriptors = { weight: String(variant.weight), style: variant.style }
        if (file.range) descriptors.unicodeRange = file.range
        const face = new FontFace(name, `url("${file.url}")`, descriptors)
        await withTimeout(face.load(), LOAD_TIMEOUT_MS)
        document.fonts.add(face)
        this.registered.add(key)
        if (this.userFamilies.has(name.toLowerCase())) this.userFaces.set(name.toLowerCase(), [...(this.userFaces.get(name.toLowerCase()) ?? []), { face, key }])
        added = true
      }
      await withTimeout(document.fonts.load(`${style} ${weight} 16px "${name}"`, text || undefined), LOAD_TIMEOUT_MS)
      if (added) {
        cache.clearFontCache(name)
        for (const l of [...this.listeners]) l(name)
      }
      return true
    } catch {
      return false
    }
  }

  /** The catalog files (best variant each) of the given fonts, for servers that embed fonts themselves. */
  async filesFor(fonts: readonly FontUse[]): Promise<PdfFontFile[]> {
    const files = new Map<string, PdfFontFile>()
    await Promise.all(
      fonts.map(async (f) => {
        if (this.isInstalled(f.family)) return
        const entry = await this.lookup(f.family)
        const variant = entry ? pickVariant(entry.variants, weightToNumber(f.weight), f.style === 'italic' ? 'italic' : 'normal') : null
        if (entry && variant) files.set(variant.url, { family: entry.family, url: variant.url, weight: variant.weight, style: variant.style })
      }),
    )
    return [...files.values()]
  }

  /**
   * The families of `fonts` that cannot be drawn: unknown to the catalog and the user's library, or their files
   * would not load. Text in them is shown in a fallback font. Waits for the fonts to settle first.
   */
  async unavailable(fonts: readonly FontUse[]): Promise<string[]> {
    await this.ensure(fonts)
    const names = new Map<string, string>()
    for (const f of fonts) {
      const name = primaryFamily(f.family)
      if (name && !this.isInstalled(name)) names.set(name.toLowerCase(), name)
    }
    const missing: string[] = []
    for (const [key, name] of names) {
      if (this.failed.has(key) || !(await this.lookup(name))) missing.push(name)
    }
    return missing.sort((a, b) => a.localeCompare(b))
  }

  /** Loads every font in the list in parallel and resolves when all settled. */
  async ensure(fonts: readonly FontUse[]): Promise<void> {
    await Promise.all(fonts.map((f) => this.load(f.family, f.weight, f.style, f.chars ?? '')))
  }
}
