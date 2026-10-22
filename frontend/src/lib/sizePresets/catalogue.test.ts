import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BUILTIN_PRESET_TREE } from './builtin'
import { buildCatalogue, filterPresets, findPresetBySize, presetPx, presetTags, quickPresets, type PresetTree } from './catalogue'

const tree: PresetTree = {
  version: 1,
  groups: [
    {
      slug: 'social',
      label: 'Social media',
      icon: 'share-2',
      children: [
        {
          slug: 'platform-a',
          label: 'Platform A',
          children: [
            {
              slug: 'platform-a-feed',
              label: 'Feed',
              presets: [
                { slug: 'example-portrait', label: 'Portrait post', width: 1000, height: 1250, unit: 'px', tags: ['4:5', 'paid'], aliases: ['old-portrait'], meta: { safe_zone: { top: 0.1, bottom: 0.2 } } },
                { slug: 'example-square', label: 'Square post', width: 1000, height: 1000, tags: ['1:1'], is_quick: true },
              ],
            },
          ],
        },
      ],
    },
    { slug: 'print', label: 'Print', presets: [{ slug: 'card', label: 'Card (85 × 55 mm)', width: 85, height: 55, unit: 'mm' }] },
    { slug: 'empty', label: 'Nothing here', children: [{ slug: 'empty-too', label: 'Still nothing' }] },
  ],
}

describe('building a catalogue', () => {
  it('nests groups, flattens presets in order and remembers where each sits', () => {
    const catalogue = buildCatalogue(tree)!
    expect(catalogue.presets.map((p) => p.id)).toEqual(['example-portrait', 'example-square', 'card'])
    expect(catalogue.byId.get('example-portrait')?.path.map((g) => g.slug)).toEqual(['social', 'platform-a', 'platform-a-feed'])
    expect(catalogue.groups.map((g) => g.slug)).toEqual(['social', 'print'])
  })

  it('converts units to pixels like the server and keeps the size as defined', () => {
    const card = buildCatalogue(tree)!.byId.get('card')!
    expect(card).toMatchObject({ width: presetPx(85, 'mm'), height: presetPx(55, 'mm'), unit: 'mm', sourceWidth: 85, sourceHeight: 55, sourceUnit: 'mm' })
    expect(presetPx(210, 'mm')).toBe(794)
    expect(presetPx(8.5, 'in')).toBe(816)
    expect(buildCatalogue({ version: 1, groups: [{ slug: 'g', label: 'G', presets: [{ slug: 'c', label: 'C', width: 10, height: 10, unit: 'cm' }] }] })!.presets[0].unit).toBe('mm')
  })

  it('prefers the pixel size the server sends', () => {
    const catalogue = buildCatalogue({ version: 1, groups: [{ slug: 'g', label: 'G', presets: [{ slug: 'a', label: 'A', width: 210, height: 297, unit: 'mm', width_px: 800, height_px: 1100 }] }] })!
    expect(catalogue.presets[0]).toMatchObject({ width: 800, height: 1100 })
  })

  it('resolves aliases, but never over a slug', () => {
    const catalogue = buildCatalogue({
      version: 1,
      groups: [{ slug: 'g', label: 'G', presets: [{ slug: 'a', label: 'A', width: 1, height: 1, aliases: ['b', 'old'] }, { slug: 'b', label: 'B', width: 2, height: 2 }] }],
    })!
    expect(catalogue.byId.get('old')?.id).toBe('a')
    expect(catalogue.byId.get('b')?.id).toBe('b')
  })

  it('reads safe zones and ignores values outside 0 … 0.5', () => {
    const catalogue = buildCatalogue(tree)!
    expect(catalogue.byId.get('example-portrait')?.safeZone).toEqual({ top: 0.1, bottom: 0.2 })
    const odd = buildCatalogue({ version: 1, groups: [{ slug: 'g', label: 'G', presets: [{ slug: 'a', label: 'A', width: 1, height: 1, meta: { safe_zone: { top: 0.9 } } }] }] })!
    expect(odd.presets[0].safeZone).toBeNull()
  })

  it('skips malformed entries and gives up on a tree with nothing usable', () => {
    const messy = { version: 1, groups: [{ slug: 'g', label: 'G', presets: [{ slug: 'ok', label: 'OK', width: 5, height: 5 }, { slug: 'zero', label: 'Z', width: 0, height: 5 }, { label: 'no slug', width: 1, height: 1 }, { slug: 'huge', label: 'H', width: 50000, height: 1 }, 'nonsense'] }, 42] }
    expect(buildCatalogue(messy)!.presets.map((p) => p.id)).toEqual(['ok'])
    expect(buildCatalogue({ version: 1, groups: [] })).toBeNull()
    expect(buildCatalogue(null)).toBeNull()
    expect(buildCatalogue({ error: { code: 'x' } })).toBeNull()
  })

  it('reads the upload limits a platform states, and nothing it cannot use', () => {
    const tree = {
      version: 1,
      groups: [
        {
          slug: 'social',
          label: 'Social',
          presets: [
            { slug: 'post', label: 'Post', width: 1080, height: 1350, meta: { formats: ['JPG', 'png', 3], max_bytes: 30_000_000 } },
            { slug: 'plain', label: 'Plain', width: 100, height: 100, meta: { formats: 'jpg', max_bytes: -1 } },
          ],
        },
      ],
    }
    const catalogue = buildCatalogue(tree)
    expect(catalogue?.byId.get('post')).toMatchObject({ formats: ['jpg', 'png'], maxBytes: 30_000_000 })
    expect(catalogue?.byId.get('plain')?.formats).toBeUndefined()
    expect(catalogue?.byId.get('plain')?.maxBytes).toBeUndefined()
  })
})

describe('finding presets', () => {
  const catalogue = buildCatalogue(tree)!
  const ids = (sections: ReturnType<typeof filterPresets>) => sections.flatMap((s) => s.presets.map((p) => p.id))

  it('gives one section per group that holds presets, with its path', () => {
    const sections = filterPresets(catalogue)
    expect(sections.map((s) => s.path.map((g) => g.label).join(' › '))).toEqual(['Social media › Platform A › Feed', 'Print'])
  })

  it('searches labels, slugs, aliases, tags and group names; every word must match', () => {
    expect(ids(filterPresets(catalogue, { query: 'portrait' }))).toEqual(['example-portrait'])
    expect(ids(filterPresets(catalogue, { query: 'old-portrait' }))).toEqual(['example-portrait'])
    expect(ids(filterPresets(catalogue, { query: '1:1' }))).toEqual(['example-square'])
    expect(ids(filterPresets(catalogue, { query: 'platform a' }))).toEqual(['example-portrait', 'example-square'])
    expect(ids(filterPresets(catalogue, { query: 'platform print' }))).toEqual([])
  })

  it('filters by group at any depth and by tags', () => {
    expect(ids(filterPresets(catalogue, { group: 'platform-a' }))).toEqual(['example-portrait', 'example-square'])
    expect(ids(filterPresets(catalogue, { group: 'print' }))).toEqual(['card'])
    expect(ids(filterPresets(catalogue, { tags: ['paid'] }))).toEqual(['example-portrait'])
    expect(ids(filterPresets(catalogue, { tags: ['paid', '1:1'] }))).toEqual([])
  })

  it('lists tags most used first', () => {
    expect(presetTags(catalogue.presets)).toEqual(['1:1', '4:5', 'paid'])
  })

  it('finds a preset by its pixel size', () => {
    expect(findPresetBySize(catalogue, 1000, 1000)?.id).toBe('example-square')
    expect(findPresetBySize(catalogue, 3, 3)).toBeUndefined()
  })

  it('offers the presets marked quick, or the default ones when none is', () => {
    expect(quickPresets(catalogue).map((p) => p.id)).toEqual(['example-square'])
    const unmarked = buildCatalogue({ version: 1, groups: [{ slug: 'g', label: 'G', presets: [{ slug: 'logo', label: 'Logo', width: 500, height: 500 }, { slug: 'a4', label: 'A4', width: 210, height: 297, unit: 'mm' }] }] })!
    expect(quickPresets(unmarked).map((p) => p.id)).toEqual(['a4', 'logo'])
  })
})

describe('the built-in catalogue', () => {
  it('is part of the one the server seeds (backend/data/size_presets.json), row for row', () => {
    const server = JSON.parse(readFileSync(resolve(__dirname, '../../../../backend/data/size_presets.json'), 'utf-8')) as PresetTree
    // Every group and preset by slug, with the group path it sits in and its own fields (without its contents).
    const rows = (groups: PresetTree['groups'], path: string[] = [], into = new Map<string, unknown>()) => {
      for (const { children, presets, ...group } of groups) {
        into.set(`group:${group.slug}`, { path, ...group })
        for (const preset of presets ?? []) into.set(preset.slug, { path: [...path, group.slug], ...preset })
        rows(children ?? [], [...path, group.slug], into)
      }
      return into
    }
    const ours = rows(BUILTIN_PRESET_TREE.groups)
    const theirs = rows(server.groups)
    for (const [slug, row] of ours) expect(theirs.get(slug), slug).toEqual(row)
    expect(BUILTIN_PRESET_TREE.version).toBe(server.version)
  })

  it('builds without losing a preset', () => {
    const count = (groups: PresetTree['groups']): number => groups.reduce((sum, g) => sum + (g.presets?.length ?? 0) + count(g.children ?? []), 0)
    expect(buildCatalogue(BUILTIN_PRESET_TREE)!.presets).toHaveLength(count(BUILTIN_PRESET_TREE.groups))
  })
})
