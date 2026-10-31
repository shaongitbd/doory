/**
 * Small fake catalogs for the in-memory adapter: starter templates (with preview images drawn as SVG) and the
 * account-only services (brand kits, share links, comments, versions). Never shipped in the production bundle.
 */
import { newId } from '@/lib/document'
import type { EditorServices } from '@/types/adapter'
import type { BrandKit, Page, ShareLink, TemplateCategory, TemplateDetail, TemplateSummary, VersionSummary } from '@/types/api'
import type { DocObject, DocPage, DoryDocument } from '@/types/document'

const SANS = '"DejaVu Sans", sans-serif'
const SERIF = '"DejaVu Serif", serif'

const rect = (left: number, top: number, width: number, height: number, fill: string): DocObject => ({ id: newId(), type: 'rect', left, top, width, height, fill, originX: 'left', originY: 'top' })
const text = (left: number, top: number, width: number, value: string, fontSize: number, fill: string, fontFamily = SANS, weight = 700): DocObject => ({ id: newId(), type: 'textbox', left, top, width, fontSize, fontFamily, fontWeight: weight, fill, text: value, textAlign: 'left', originX: 'left', originY: 'top' })

interface FakeTemplate {
  slug: string
  title: string
  category: string
  width: number
  height: number
  tags: string[]
  pages: { background: string; objects: DocObject[]; swatch: string }[]
}

const TEMPLATES: FakeTemplate[] = [
  {
    slug: 'bold-poster',
    title: 'Bold poster',
    category: 'posters',
    width: 1080,
    height: 1350,
    tags: ['poster', 'event'],
    pages: [{ background: '#e11d48', swatch: '#e11d48', objects: [rect(60, 60, 960, 1230, '#ffffff'), text(120, 160, 840, 'SUMMER\nFESTIVAL', 150, '#e11d48'), text(120, 640, 840, 'Music, food and friends\nunder the open sky.', 52, '#1c1517', SANS, 500), rect(120, 1040, 360, 14, '#e11d48')] }],
  },
  {
    slug: 'sale-square',
    title: 'Sale announcement',
    category: 'social',
    width: 1080,
    height: 1080,
    tags: ['instagram', 'sale'],
    pages: [{ background: '#1c1517', swatch: '#1c1517', objects: [rect(0, 760, 1080, 320, '#e11d48'), text(90, 140, 900, 'Big sale', 170, '#ffffff', SERIF), text(90, 820, 900, 'Up to 50% off this weekend', 64, '#ffffff', SANS, 600)] }],
  },
  {
    slug: 'pitch-deck',
    title: 'Pitch deck',
    category: 'presentations',
    width: 1920,
    height: 1080,
    tags: ['slides', 'business'],
    pages: [
      { background: '#fff1f3', swatch: '#fb6485', objects: [rect(0, 0, 40, 1080, '#e11d48'), text(160, 380, 1400, 'Our big idea', 150, '#1c1517', SERIF)] },
      { background: '#ffffff', swatch: '#ffc8d2', objects: [text(160, 160, 1400, 'The problem', 100, '#e11d48'), text(160, 380, 1200, 'Describe what is broken and who feels it.', 56, '#6b6165', SANS, 400)] },
    ],
  },
  {
    slug: 'greeting-card',
    title: 'Thank you card',
    category: 'cards',
    width: 559,
    height: 794,
    tags: ['card', 'thanks'],
    pages: [{ background: '#ffe1e6', swatch: '#ffe1e6', objects: [text(50, 250, 460, 'Thank you', 84, '#be123c', SERIF), text(50, 420, 460, 'For being part of the story.', 28, '#1c1517', SANS, 400)] }],
  },
]

const CATEGORIES: { slug: string; name: string }[] = [
  { slug: 'posters', name: 'Posters' },
  { slug: 'social', name: 'Social media' },
  { slug: 'presentations', name: 'Presentations' },
  { slug: 'cards', name: 'Cards' },
]

function thumbnail(t: FakeTemplate): string {
  const first = t.pages[0]
  const w = 240
  const h = Math.round((240 * t.height) / t.width)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${first.background}"/><rect x="${w * 0.12}" y="${h * 0.2}" width="${w * 0.76}" height="${h * 0.14}" rx="4" fill="${first.swatch === first.background ? '#ffffff' : first.swatch}"/><rect x="${w * 0.12}" y="${h * 0.42}" width="${w * 0.5}" height="${h * 0.05}" rx="3" fill="#ffffff" opacity="0.85"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function documentOf(t: FakeTemplate): DoryDocument {
  const pages: DocPage[] = t.pages.map((p) => ({ id: newId(), background: { type: 'solid', color: p.background }, objects: p.objects.map((o) => ({ ...o, id: newId() })) }))
  return { schemaVersion: 1, width: t.width, height: t.height, unit: 'px', pages }
}

function summary(t: FakeTemplate, index: number): TemplateSummary {
  const cat = CATEGORIES.find((c) => c.slug === t.category)
  return {
    id: `tpl-${index}`,
    slug: t.slug,
    title: t.title,
    category: cat ? { id: `cat-${cat.slug}`, slug: cat.slug, name: cat.name } : null,
    tags: t.tags,
    width: t.width,
    height: t.height,
    orientation: t.width === t.height ? 'square' : t.width > t.height ? 'landscape' : 'portrait',
    preset: '',
    page_count: t.pages.length,
    thumbnail_url: thumbnail(t),
    is_featured: index === 0,
    use_count: 100 - index,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function page<T>(results: T[], q?: { page?: number; page_size?: number }): Page<T> {
  const size = q?.page_size ?? 50
  const start = ((q?.page ?? 1) - 1) * size
  return { count: results.length, next: start + size < results.length ? 'next' : null, previous: null, results: results.slice(start, start + size) }
}

export function createTemplatesService(): EditorServices['templates'] {
  return {
    async categories(): Promise<TemplateCategory[]> {
      return CATEGORIES.map((c, i) => ({ id: `cat-${c.slug}`, slug: c.slug, name: c.name, icon: '', template_count: TEMPLATES.filter((t) => t.category === c.slug).length, sort_order: i }))
    },
    async list(q) {
      const needle = q.q?.toLowerCase().trim()
      const all = TEMPLATES.map(summary).filter((t) => (!q.category || t.category?.slug === q.category) && (!q.orientation || t.orientation === q.orientation) && (!needle || t.title.toLowerCase().includes(needle) || t.tags.some((tag) => tag.includes(needle))))
      return page(all, q)
    },
    async get(slug): Promise<TemplateDetail> {
      const index = TEMPLATES.findIndex((t) => t.slug === slug)
      if (index < 0) throw new Error('Unknown template')
      return { ...summary(TEMPLATES[index], index), description: '', document: documentOf(TEMPLATES[index]) }
    },
  }
}

type AccountServices = Pick<EditorServices, 'brand' | 'sharing' | 'comments' | 'versions'>

/** Brand kits, share links, comments and versions kept in memory (the harness in `mode=account`). */
export function createAccountFakes(getDocument: () => DoryDocument, comments: NonNullable<EditorServices['comments']>): AccountServices {
  let kits: BrandKit[] = []
  let links: ShareLink[] = []
  const versions: (VersionSummary & { document: DoryDocument })[] = []
  const now = (): string => new Date().toISOString()

  return {
    brand: {
      async list() {
        return kits
      },
      async save(kit) {
        const saved: BrandKit = { ...kit, id: kit.id || newId(), created_at: kit.created_at || now(), updated_at: now() }
        kits = kits.some((k) => k.id === saved.id) ? kits.map((k) => (k.id === saved.id ? saved : k)) : [...kits, saved]
        return saved
      },
      async remove(id) {
        kits = kits.filter((k) => k.id !== id)
      },
    },
    sharing: {
      async list() {
        return links
      },
      async create(input) {
        const token = newId().slice(0, 8)
        const link: ShareLink = { id: newId(), token, role: input.role, url: `/s/${token}`, is_active: true, expires_at: input.expires_at ?? null, has_password: !!input.password, created_at: now() }
        links = [link, ...links]
        return link
      },
      async update(id, patch) {
        const current = links.find((l) => l.id === id)
        if (!current) throw new Error('Unknown link')
        const next: ShareLink = {
          ...current,
          role: patch.role ?? current.role,
          is_active: patch.is_active ?? current.is_active,
          expires_at: patch.expires_at === undefined ? current.expires_at : patch.expires_at,
          has_password: patch.password === undefined ? current.has_password : patch.password !== null,
        }
        links = links.map((l) => (l.id === id ? next : l))
        return next
      },
      async revoke(id) {
        links = links.filter((l) => l.id !== id)
      },
    },
    comments,
    versions: {
      async list() {
        return versions.map(({ document: _document, ...rest }) => rest)
      },
      async create(label) {
        const doc = getDocument()
        const made = { id: newId(), label, is_auto: false, page_count: doc.pages.length, thumbnail_url: null, created_at: now(), document: doc }
        versions.unshift(made)
        const { document: _document, ...rest } = made
        return rest
      },
      async restore(id) {
        const found = versions.find((v) => v.id === id)
        if (!found) throw new Error('Unknown version')
        return found.document
      },
    },
  }
}
