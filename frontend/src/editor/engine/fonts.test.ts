import type { FontFamily } from '@/types/api'
import {
  FontManager,
  type FontFamilyEx,
  type FontVariantEx,
  isSystemFont,
  parseUnicodeRange,
  pickVariant,
  rangesCoverText,
  subsetsToLoad,
  weightToNumber,
} from './fonts'

const variant = (weight: number, style: 'normal' | 'italic', url = `/f/${weight}${style}.woff2`, subsets?: { subset: string; url: string }[]): FontVariantEx => ({ weight, style, url, subsets })

const entry = (variants: FontVariantEx[], ranges?: Record<string, string>): FontFamilyEx => ({
  id: '1',
  family: 'Test Sans',
  category: 'sans-serif',
  scripts: ['latin'],
  is_variable: false,
  is_user_font: false,
  variants,
  popularity: 1,
  unicode_ranges: ranges,
})

describe('variant picking', () => {
  const vs = [variant(300, 'normal'), variant(400, 'normal'), variant(700, 'normal'), variant(400, 'italic')]
  it('prefers the nearest weight with the same style', () => {
    expect(pickVariant(vs, 600, 'normal')?.weight).toBe(700)
    expect(pickVariant(vs, 350, 'normal')?.weight).toBe(300)
    expect(pickVariant(vs, 700, 'italic')?.style).toBe('italic')
  })
  it('falls back to any variant when the style is missing and handles empty lists', () => {
    expect(pickVariant([variant(400, 'normal')], 400, 'italic')?.style).toBe('normal')
    expect(pickVariant([], 400, 'normal')).toBeNull()
  })
  it('normalises weights', () => {
    expect(weightToNumber('bold')).toBe(700)
    expect(weightToNumber('normal')).toBe(400)
    expect(weightToNumber('600')).toBe(600)
    expect(weightToNumber(undefined)).toBe(400)
    expect(weightToNumber(500)).toBe(500)
  })
  it('knows system fonts, also inside stacks', () => {
    expect(isSystemFont('Arial')).toBe(true)
    expect(isSystemFont('"Georgia", serif')).toBe(true)
    expect(isSystemFont('Playfair Display')).toBe(false)
  })
})

describe('unicode subsets', () => {
  const LATIN = 'U+0000-00FF, U+0131, U+0152-0153'
  const CYRILLIC = 'U+0301, U+0400-045F, U+0490-0491'
  const GREEK = 'U+0370-03FF'

  it('parses unicode-range values including wildcards', () => {
    expect(parseUnicodeRange(LATIN)).toEqual([[0, 255], [0x131, 0x131], [0x152, 0x153]])
    expect(parseUnicodeRange('U+4??')).toEqual([[0x400, 0x4ff]])
    expect(parseUnicodeRange('nonsense')).toEqual([])
  })

  it('detects whether text falls into ranges', () => {
    const cyr = parseUnicodeRange(CYRILLIC)
    expect(rangesCoverText(cyr, 'Hello')).toBe(false)
    expect(rangesCoverText(cyr, 'Привет')).toBe(true)
    expect(rangesCoverText(cyr, 'mixed ж text')).toBe(true)
  })

  it('always loads the Latin file, other subsets only when the text needs them', () => {
    const v = variant(400, 'normal', '/f/latin.woff2', [
      { subset: 'cyrillic', url: '/f/cyr.woff2' },
      { subset: 'greek', url: '/f/greek.woff2' },
    ])
    const e = entry([v], { latin: LATIN, cyrillic: CYRILLIC, greek: GREEK })
    expect(subsetsToLoad(e, v, 'Hello').map((s) => s.subset)).toEqual(['latin'])
    expect(subsetsToLoad(e, v, 'Привет').map((s) => s.subset)).toEqual(['latin', 'cyrillic'])
    expect(subsetsToLoad(e, v, 'Привет Ω').map((s) => s.subset)).toEqual(['latin', 'cyrillic', 'greek'])
    expect(subsetsToLoad(e, v, 'Hello')[0].range).toBe(LATIN)
  })

  it('loads an unranged CJK slice for non-Latin text', () => {
    const v = variant(400, 'normal', '/f/latin.woff2', [{ subset: 'chinese-simplified', url: '/f/zh.woff2' }])
    const e = entry([v], { latin: LATIN })
    expect(subsetsToLoad(e, v, '中文').map((s) => s.subset)).toEqual(['latin', 'chinese-simplified'])
    expect(subsetsToLoad(e, v, 'Hello').map((s) => s.subset)).toEqual(['latin'])
  })

  it('works with the legacy catalog shape (no subsets, no ranges)', () => {
    const v = variant(400, 'normal', '/f/a.woff2')
    expect(subsetsToLoad(entry([v]), v, 'Привет')).toEqual([{ subset: 'latin', url: '/f/a.woff2', range: '' }])
  })

  it('does not load a subset twice when its url equals the main file', () => {
    const v = variant(400, 'normal', '/f/a.woff2', [{ subset: 'latin-ext', url: '/f/a.woff2' }])
    expect(subsetsToLoad(entry([v], { 'latin-ext': 'U+0100-024F' }), v, 'Ā')).toHaveLength(1)
  })
})

describe('FontManager', () => {
  it('treats catalog entries without files as installed families and caches lookups', async () => {
    const list = vi.fn(async () => ({ count: 1, next: null, previous: null, results: [entry([])] as FontFamily[] }))
    const fm = new FontManager(list)
    expect(await fm.lookup('Test Sans')).not.toBeNull()
    expect(await fm.lookup('test sans')).not.toBeNull()
    expect(list).toHaveBeenCalledTimes(1)
    // jsdom has no FontFace: loads resolve true without touching the network.
    expect(await fm.load('Test Sans', 400)).toBe(true)
  })

  it('falls back gracefully when the catalog is unreachable', async () => {
    const fm = new FontManager(async () => {
      throw new Error('offline')
    })
    expect(await fm.lookup('Anything')).toBeNull()
    await expect(fm.ensure([{ family: 'Anything', weight: '400', style: 'normal' }])).resolves.toBeUndefined()
  })

  it('collects the catalog files of the fonts in use for server-side font embedding', async () => {
    const v = variant(700, 'italic', '/media/fonts/a.woff2')
    const fm = new FontManager(async () => ({ count: 1, next: null, previous: null, results: [entry([v]) as FontFamily] }))
    expect(await fm.filesFor([{ family: 'Test Sans', weight: '400', style: 'normal' }, { family: 'Arial', weight: '400', style: 'normal' }])).toEqual([
      { family: 'Test Sans', url: '/media/fonts/a.woff2', weight: 700, style: 'italic' },
    ])
  })
})

function userFamily(family: string, variants: FontVariantEx[], id = family): FontFamilyEx {
  return { ...entry(variants), id, family, is_user_font: true }
}

describe('FontManager with uploaded fonts', () => {
  const added: { family: string; source: string; descriptors: FontFaceDescriptors }[] = []
  const removed: string[] = []

  beforeEach(() => {
    added.length = 0
    removed.length = 0
    class FakeFace {
      constructor(
        readonly family: string,
        readonly source: string,
        readonly descriptors: FontFaceDescriptors,
      ) {}
      load(): Promise<FakeFace> {
        return Promise.resolve(this)
      }
    }
    vi.stubGlobal('FontFace', FakeFace)
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        add: (f: FakeFace) => added.push({ family: f.family, source: f.source, descriptors: f.descriptors }),
        delete: (f: FakeFace) => removed.push(f.source),
        load: async () => [],
        check: () => true,
      },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'fonts')
  })

  const never = async (): Promise<never> => {
    throw new Error('the public list must not be asked for an uploaded family')
  }

  it('registers an uploaded family from its own same-origin files, nearest weight and style', async () => {
    const fm = new FontManager(never)
    fm.setUserFonts([userFamily('Brand Sans', [variant(400, 'normal', '/media/fonts/user/1/a.ttf'), variant(700, 'normal', '/media/fonts/user/1/b.ttf')])])
    expect(await fm.load('"Brand Sans", sans-serif', 'bold')).toBe(true)
    expect(added).toEqual([{ family: 'Brand Sans', source: 'url("/media/fonts/user/1/b.ttf")', descriptors: { weight: '700', style: 'normal' } }])
    expect(fm.isUserFont('Brand Sans')).toBe(true)
    expect(fm.hasFailed('Brand Sans')).toBe(false)
  })

  it('an uploaded font wins over an installed system font of the same name', async () => {
    const fm = new FontManager(never)
    fm.setUserFonts([userFamily('Arial', [variant(400, 'normal', '/media/fonts/user/1/arial.ttf')])])
    expect(fm.isReady('Arial')).toBe(true)
    await fm.load('Arial', 400)
    expect(added.map((a) => a.source)).toEqual(['url("/media/fonts/user/1/arial.ttf")'])
    expect(await fm.filesFor([{ family: 'Arial', weight: '400', style: 'normal' }])).toEqual([{ family: 'Arial', url: '/media/fonts/user/1/arial.ttf', weight: 400, style: 'normal' }])
  })

  it('waits for the user library before it gives up on an unknown family', async () => {
    const fm = new FontManager(never)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    fm.setUserFontsReady(async () => {
      await gate
      fm.setUserFonts([userFamily('Late Sans', [variant(400, 'normal', '/media/fonts/user/1/late.woff2')])])
    })
    const found = fm.lookup('Late Sans')
    release()
    expect((await found)?.family).toBe('Late Sans')
  })

  it('asks the public list only when the user library does not have the family', async () => {
    const list = vi.fn(async () => ({ count: 1, next: null, previous: null, results: [entry([variant(400, 'normal')]) as FontFamily] }))
    const fm = new FontManager(list)
    fm.setUserFontsReady(async () => undefined)
    expect((await fm.lookup('Test Sans'))?.family).toBe('Test Sans')
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('keeps going when the user library cannot be fetched', async () => {
    const fm = new FontManager(async () => ({ count: 0, next: null, previous: null, results: [] }))
    fm.setUserFontsReady(async () => {
      throw new Error('offline')
    })
    expect(await fm.lookup('Anything')).toBeNull()
  })

  it('asks again for families that were unknown before the library arrived', async () => {
    const fm = new FontManager(async () => ({ count: 0, next: null, previous: null, results: [] }))
    expect(await fm.lookup('Brand Sans')).toBeNull()
    fm.setUserFonts([userFamily('Brand Sans', [variant(400, 'normal', '/media/fonts/user/1/a.ttf')])])
    expect((await fm.lookup('Brand Sans'))?.family).toBe('Brand Sans')
  })

  it('forgets a family that was removed from the library', async () => {
    const fm = new FontManager(async () => ({ count: 0, next: null, previous: null, results: [] }))
    fm.setUserFonts([userFamily('Brand Sans', [variant(400, 'normal')])])
    expect(fm.isUserFont('Brand Sans')).toBe(true)
    fm.setUserFonts([])
    expect(fm.isUserFont('Brand Sans')).toBe(false)
    expect(await fm.lookup('Brand Sans')).toBeNull()
  })

  it('takes the faces of a deleted family off the page, tells listeners and lets a re-upload register again', async () => {
    const fm = new FontManager(never)
    const seen: string[] = []
    fm.onLoaded((family) => seen.push(family))
    const first = userFamily('Brand Sans', [variant(400, 'normal', '/media/fonts/user/1/a.ttf')])
    fm.setUserFonts([first])
    await fm.load('Brand Sans', 400)
    expect(seen).toEqual(['Brand Sans'])
    fm.setUserFonts([userFamily('Other', [variant(400, 'normal', '/media/fonts/user/1/o.ttf')])])
    expect(removed).toEqual(['url("/media/fonts/user/1/a.ttf")'])
    expect(seen).toContain('brand sans')
    fm.setUserFonts([userFamily('Brand Sans', [variant(400, 'normal', '/media/fonts/user/1/a.ttf')])])
    await fm.load('Brand Sans', 400)
    expect(added.filter((a) => a.family === 'Brand Sans')).toHaveLength(2)
  })

  it('keeps the faces of families that stay in the library', async () => {
    const fm = new FontManager(never)
    const brand = userFamily('Brand Sans', [variant(400, 'normal', '/media/fonts/user/1/a.ttf')])
    fm.setUserFonts([brand])
    await fm.load('Brand Sans', 400)
    fm.setUserFonts([brand, userFamily('Other', [variant(400, 'normal')])])
    expect(removed).toEqual([])
  })

  it('reports the families that cannot be drawn (unknown to every catalog)', async () => {
    const fm = new FontManager(async () => ({ count: 0, next: null, previous: null, results: [] }))
    fm.setUserFonts([userFamily('Brand Sans', [variant(400, 'normal', '/media/fonts/user/1/a.ttf')])])
    const uses = [
      { family: 'Brand Sans', weight: '400', style: 'normal' },
      { family: 'Ghost Serif', weight: '400', style: 'normal' },
      { family: 'Arial', weight: '400', style: 'normal' },
    ]
    expect(await fm.unavailable(uses)).toEqual(['Ghost Serif'])
  })

  it('reports an uploaded family whose files do not load', async () => {
    class BrokenFace {
      load(): Promise<never> {
        return Promise.reject(new Error('404'))
      }
    }
    vi.stubGlobal('FontFace', BrokenFace)
    const fm = new FontManager(never)
    fm.setUserFonts([userFamily('Gone Sans', [variant(400, 'normal', '/media/fonts/user/1/gone.ttf')])])
    expect(await fm.unavailable([{ family: 'Gone Sans', weight: '400', style: 'normal' }])).toEqual(['Gone Sans'])
    expect(fm.hasFailed('Gone Sans')).toBe(true)
  })
})
