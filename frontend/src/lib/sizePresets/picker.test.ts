import { buildCatalogue, type SizePresetCatalogue } from './catalogue'
import { entryBlocks, entryOf, filterBlocks, pickerSections, presetShape, presetSizeText } from './picker'

const catalogue = buildCatalogue({
  version: 1,
  groups: [
    {
      slug: 'social',
      label: 'Social media',
      children: [
        { slug: 'zeta', label: 'Zeta', presets: [{ slug: 'zeta-post', label: 'Zeta Post', width: 1080, height: 1080 }] },
        {
          slug: 'alpha',
          label: 'Alpha',
          presets: [
            { slug: 'alpha-ad', label: 'Alpha Feed ad', width: 1080, height: 1350, tags: ['ad'] },
            { slug: 'alpha-story', label: 'Alpha Story', width: 1080, height: 1920 },
          ],
        },
      ],
    },
    { slug: 'presentation', label: 'Presentations', children: [{ slug: 'slides', label: 'Screen slides', presets: [{ slug: 'deck', label: 'Deck', width: 1920, height: 1080 }] }] },
    {
      slug: 'print',
      label: 'Print',
      children: [
        { slug: 'paper', label: 'Paper', children: [{ slug: 'iso', label: 'ISO', presets: [{ slug: 'a4', label: 'A4', width: 210, height: 297, unit: 'mm' }] }] },
        { slug: 'empty', label: 'Empty', children: [{ slug: 'nothing', label: 'Nothing' }] },
      ],
    },
  ],
}) as SizePresetCatalogue

describe('size picker list', () => {
  it('puts formats first, opening groups of groups, then platforms from A to Z', () => {
    const sections = pickerSections(catalogue)
    expect(sections.map((s) => [s.label, s.entries.map((e) => `${e.group.label} ${e.count}`)])).toEqual([
      ['Everything else', ['Presentations 1', 'Paper 1']],
      ['Social media', ['Alpha 2', 'Zeta 1']],
    ])
  })

  it('shows an entry under its sub-group headings, with a platform’s ads last', () => {
    const paper = pickerSections(catalogue)[0].entries[1].group
    expect(entryBlocks(paper).map((b) => [b.title, b.presets.map((p) => p.id)])).toEqual([['ISO', ['a4']]])
    const alpha = pickerSections(catalogue)[1].entries[0].group
    expect(entryBlocks(alpha).map((b) => [b.title, b.presets.map((p) => p.id)])).toEqual([
      [null, ['alpha-story']],
      ['Ads', ['alpha-ad']],
    ])
  })

  it('filters by shape and kind, dropping emptied headings', () => {
    const alpha = pickerSections(catalogue)[1].entries[0].group
    expect(filterBlocks(entryBlocks(alpha), 'tall', 'ads').map((b) => b.title)).toEqual(['Ads'])
    expect(filterBlocks(entryBlocks(alpha), 'wide', 'all')).toEqual([])
  })

  it('knows shapes, sizes and where a preset lives', () => {
    const a4 = catalogue.byId.get('a4')!
    expect(presetShape(a4)).toBe('tall')
    expect(presetShape({ width: 1000, height: 1100 })).toBe('square')
    expect(presetSizeText(a4)).toBe('210 × 297 mm')
    expect(entryOf(pickerSections(catalogue), a4)?.slug).toBe('paper')
  })
})
