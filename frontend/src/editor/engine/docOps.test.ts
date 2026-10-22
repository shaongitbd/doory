import { createBlankDocument } from '@/lib/document'
import type { DocObject, DoryDocument } from '@/types/document'
import {
  addPage,
  applyBackgroundToAll,
  cloneObjects,
  countObjects,
  documentColors,
  duplicatePage,
  findObjectById,
  movePage,
  pageLabel,
  pageSize,
  removePage,
  renamePage,
  replacePage,
  setPageBackground,
  usedFonts,
  walkObjects,
} from './docOps'

const text = (id: string, extra: Record<string, unknown> = {}): DocObject => ({ id, type: 'textbox', fontFamily: '"Inter", sans-serif', fontWeight: 400, ...extra })

function doc3(): DoryDocument {
  let d = createBlankDocument(800, 600)
  d = addPage(d, 1)
  d = addPage(d, 2)
  return d
}

describe('page operations', () => {
  it('adds pages at an index and clamps', () => {
    const d = createBlankDocument(100, 100)
    expect(addPage(d, 0).pages).toHaveLength(2)
    expect(addPage(d, 99).pages).toHaveLength(2)
    expect(addPage(d, -5).pages[1].id).toBe(d.pages[0].id)
  })

  it('refuses to exceed 100 pages', () => {
    let d = createBlankDocument(100, 100)
    for (let i = 0; i < 120; i++) d = addPage(d, d.pages.length)
    expect(d.pages).toHaveLength(100)
  })

  it('removes pages but never the last one', () => {
    const d = doc3()
    expect(removePage(d, d.pages[1].id).pages).toHaveLength(2)
    const single = createBlankDocument(10, 10)
    expect(removePage(single, single.pages[0].id)).toBe(single)
    expect(removePage(d, 'nope')).toBe(d)
  })

  it('moves pages', () => {
    const d = doc3()
    const [a, b, c] = d.pages.map((p) => p.id)
    expect(movePage(d, a, 2).pages.map((p) => p.id)).toEqual([b, c, a])
    expect(movePage(d, c, 0).pages.map((p) => p.id)).toEqual([c, a, b])
    expect(movePage(d, a, 0)).toBe(d)
    expect(movePage(d, 'x', 1)).toBe(d)
  })

  it('renames pages and clears an empty name', () => {
    const d = doc3()
    const id = d.pages[0].id
    const named = renamePage(d, id, '  Cover ')
    expect(named.pages[0].name).toBe('Cover')
    expect(pageLabel(named.pages[0], 0)).toBe('Cover')
    expect(renamePage(named, id, '').pages[0].name).toBeUndefined()
    expect(pageLabel(d.pages[1], 1)).toBe('Page 2')
  })

  it('duplicates a page with fresh ids for the page and every object', () => {
    let d = createBlankDocument(100, 100)
    const group: DocObject = { id: 'g', type: 'group', objects: [text('child')] }
    d = replacePage(d, { ...d.pages[0], name: 'One', objects: [text('t1'), group] })
    const dup = duplicatePage(d, d.pages[0].id)
    expect(dup.pages).toHaveLength(2)
    const copy = dup.pages[1]
    expect(copy.id).not.toBe(d.pages[0].id)
    expect(copy.name).toBe('One copy')
    const ids = new Set<string>()
    walkObjects(copy.objects, (o) => ids.add(o.id))
    expect(ids.size).toBe(3)
    expect(ids.has('t1')).toBe(false)
    expect(ids.has('child')).toBe(false)
  })

  it('duplicates a clip with its blurred background, the copy following the copied clip', () => {
    const clip: DocObject = { id: 'clip', type: 'image', src: '/p.webp', videoSrc: '/c.mp4' }
    const backdrop: DocObject = { ...clip, id: 'bg', videoBackdropOf: 'clip' }
    const d = { ...createBlankDocument(800, 600), pages: [{ ...createBlankDocument(800, 600).pages[0], objects: [backdrop, clip] }] }
    const copy = duplicatePage(d, d.pages[0].id).pages[1]
    const [bg, c] = copy.objects
    expect(c.id).not.toBe('clip')
    expect(bg.videoBackdropOf).toBe(c.id)
    expect(d.pages[0].objects[0].videoBackdropOf).toBe('clip')
  })

  it('structural sharing: replacing a page keeps the others identical', () => {
    const d = doc3()
    const next = replacePage(d, { ...d.pages[1], name: 'x' })
    expect(next.pages[0]).toBe(d.pages[0])
    expect(next.pages[2]).toBe(d.pages[2])
    expect(replacePage(d, d.pages[1])).toBe(d)
  })

  it('backgrounds: single page and apply to all', () => {
    const d = doc3()
    const bg = { type: 'solid', color: '#112233' } as const
    expect(setPageBackground(d, d.pages[0].id, bg).pages[0].background).toEqual(bg)
    expect(setPageBackground(d, d.pages[0].id, bg).pages[1].background).toEqual({ type: 'solid', color: '#ffffff' })
    expect(applyBackgroundToAll(d, bg).pages.every((p) => p.background === bg)).toBe(true)
  })

  it('pageSize honours per-page overrides', () => {
    const d = createBlankDocument(800, 600)
    expect(pageSize(d, d.pages[0])).toEqual({ width: 800, height: 600 })
    expect(pageSize(d, { ...d.pages[0], width: 50 })).toEqual({ width: 50, height: 600 })
  })
})

describe('object helpers', () => {
  it('cloneObjects reassigns ids deeply without mutating the source', () => {
    const src: DocObject[] = [{ id: 'g', type: 'group', objects: [text('c')] }]
    const clone = cloneObjects(src)
    expect(src[0].id).toBe('g')
    expect(clone[0].id).not.toBe('g')
    expect((clone[0].objects as DocObject[])[0].id).not.toBe('c')
  })

  it('cloneObjects unlinks a blurred background copied without its clip', () => {
    const [copy] = cloneObjects([{ id: 'bg', type: 'image', videoSrc: '/c.mp4', videoBackdropOf: 'clip' }])
    expect(copy).not.toHaveProperty('videoBackdropOf')
  })

  it('finds nested objects and counts them', () => {
    const page = { id: 'p', background: { type: 'solid', color: '#fff' } as const, objects: [text('a'), { id: 'g', type: 'group', objects: [text('b')] } as DocObject] }
    expect(findObjectById(page.objects, 'b')?.id).toBe('b')
    expect(findObjectById(page.objects, 'zzz')).toBeNull()
    expect(countObjects(page)).toBe(3)
  })

  it('collects used fonts including per-character styles, de-duplicated', () => {
    const d = createBlankDocument(100, 100)
    const withText = replacePage(d, {
      ...d.pages[0],
      objects: [
        text('a'),
        text('b', { fontWeight: 700 }),
        text('c', { fontWeight: 700 }),
        text('d', { fontFamily: 'Lora', styles: [{ start: 0, end: 1, style: { fontFamily: '"Pacifico", cursive' } }] }),
        { id: 'r', type: 'rect' },
      ],
    })
    const fonts = usedFonts(withText).map((f) => `${f.family}:${f.weight}:${f.style}`).sort()
    expect(fonts).toEqual(['Inter:400:normal', 'Inter:700:normal', 'Lora:400:normal', 'Pacifico:400:normal'])
  })

  it('documentColors ranks by frequency and skips transparent/none', () => {
    const blank = createBlankDocument(10, 10)
    const d = replacePage(blank, {
      id: blank.pages[0].id,
      background: { type: 'solid', color: '#ffffff' },
      objects: [
        { id: '1', type: 'rect', fill: '#ff0000', stroke: 'rgb(0,0,0)' },
        { id: '2', type: 'rect', fill: '#FF0000' },
        { id: '3', type: 'rect', fill: 'transparent' },
        { id: '4', type: 'rect', fill: { colorStops: [{ color: '#00ff00' }] } },
      ],
    })
    const colors = documentColors(d)
    expect(colors[0]).toBe('#ff0000')
    expect(colors).toContain('#00ff00')
    expect(colors).not.toContain('transparent')
  })
})
