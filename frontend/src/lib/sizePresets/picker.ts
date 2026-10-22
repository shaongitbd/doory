import { filterPresets, type PresetGroup, type SizePreset, type SizePresetCatalogue } from './catalogue'

/**
 * Built-in groups whose children are platforms (Instagram, Google Ads…): the size picker lists each child on its own
 * under the group's name. Every other group is a format (Paper, Documents…) listed under "Everything else".
 */
export const PLATFORM_GROUPS: readonly string[] = ['social', 'ads', 'stores', 'calls']

export const EVERYTHING_ELSE = 'Everything else'

/** One line of the picker's list: a group whose sizes it shows. */
export interface PickerEntry {
  group: PresetGroup
  count: number
}

/** A titled run of entries in the list ("Everything else", "Social media"…). */
export interface PickerSection {
  key: string
  label: string
  entries: PickerEntry[]
}

/** A heading and the sizes under it, in one entry's view. */
export interface PickerBlock {
  key: string
  title: string | null
  presets: SizePreset[]
}

export type Shape = 'tall' | 'square' | 'wide'
export type ShapeFilter = Shape | 'all'
export type KindFilter = 'all' | 'posts' | 'ads'

const AD_TAG = 'ad'

const countPresets = (group: PresetGroup): number => group.presets.length + group.children.reduce((sum, child) => sum + countPresets(child), 0)

/** A format group is one entry unless its children have groups of their own (Print → Paper, Cards…). */
function formatEntries(group: PresetGroup): PresetGroup[] {
  if (group.children.some((child) => child.children.length > 0)) return group.children.flatMap(formatEntries)
  return [group]
}

/** The picker's list: formats first, then each platform group with its platforms in A to Z order. */
export function pickerSections(catalogue: SizePresetCatalogue): PickerSection[] {
  const entry = (group: PresetGroup): PickerEntry => ({ group, count: countPresets(group) })
  const formats = catalogue.groups.filter((group) => !PLATFORM_GROUPS.includes(group.slug)).flatMap(formatEntries)
  const sections: PickerSection[] = []
  if (formats.length > 0) sections.push({ key: 'formats', label: EVERYTHING_ELSE, entries: formats.map(entry).filter((e) => e.count > 0) })
  for (const group of catalogue.groups) {
    if (!PLATFORM_GROUPS.includes(group.slug)) continue
    const platforms = [...group.children].sort((a, b) => a.label.localeCompare(b.label))
    const entries = platforms.map(entry).filter((e) => e.count > 0)
    if (group.presets.length > 0) entries.unshift({ group: { ...group, children: [] }, count: group.presets.length })
    if (entries.length > 0) sections.push({ key: group.slug, label: group.label, entries })
  }
  return sections
}

/** The sizes of one entry under their headings: its own sizes, then each sub-group; a platform's ads come last. */
export function entryBlocks(group: PresetGroup): PickerBlock[] {
  const blocks: PickerBlock[] = []
  const visit = (node: PresetGroup, title: string | null, key: string): void => {
    if (node.presets.length > 0) blocks.push({ key, title, presets: node.presets })
    for (const child of node.children) visit(child, title ? `${title} › ${child.label}` : child.label, `${key}/${child.slug}`)
  }
  visit(group, null, group.slug)
  const ads: SizePreset[] = []
  const rest = blocks
    .map((block) => {
      const own = block.presets.filter((preset) => !preset.tags.includes(AD_TAG))
      ads.push(...block.presets.filter((preset) => preset.tags.includes(AD_TAG)))
      return { ...block, presets: own }
    })
    .filter((block) => block.presets.length > 0)
  if (ads.length > 0 && rest.length > 0) rest.push({ key: `${group.slug}/ads`, title: 'Ads', presets: ads })
  else if (ads.length > 0) return blocks
  return rest
}

/** Tall, square (within 15 %) or wide. */
export function presetShape(preset: Pick<SizePreset, 'width' | 'height'>): Shape {
  const ratio = preset.width / preset.height
  return ratio > 1.15 ? 'wide' : ratio < 0.87 ? 'tall' : 'square'
}

const trim = (value: number): string => String(Math.round(value * 100) / 100)

/** "1080 × 1350 px", "210 × 297 mm": the size as the catalogue defines it. */
export const presetSizeText = (preset: SizePreset): string => `${trim(preset.sourceWidth)} × ${trim(preset.sourceHeight)} ${preset.sourceUnit}`

export const isAd = (preset: SizePreset): boolean => preset.tags.includes(AD_TAG)

/** Keeps the sizes of `blocks` that pass the shape and kind filters, dropping emptied headings. */
export function filterBlocks(blocks: PickerBlock[], shape: ShapeFilter, kind: KindFilter): PickerBlock[] {
  return blocks
    .map((block) => ({
      ...block,
      presets: block.presets.filter((preset) => (shape === 'all' || presetShape(preset) === shape) && (kind === 'all' || (kind === 'ads') === isAd(preset))),
    }))
    .filter((block) => block.presets.length > 0)
}

/** Every size matching the words, one block per group, titled with the group path. */
export function searchBlocks(catalogue: SizePresetCatalogue, query: string): PickerBlock[] {
  return filterPresets(catalogue, { query }).map((section) => ({
    key: section.path.map((group) => group.slug).join('/'),
    title: section.path.map((group) => group.label).join(' › '),
    presets: section.presets,
  }))
}

/** The entry that holds a preset, so the picker can open where the current size is. */
export function entryOf(sections: PickerSection[], preset: SizePreset | undefined): PresetGroup | undefined {
  if (!preset) return undefined
  const slugs = new Set(preset.path.map((group) => group.slug))
  for (const section of sections) for (const { group } of section.entries) if (slugs.has(group.slug)) return group
  return undefined
}
