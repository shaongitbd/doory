import { ChevronDown, ChevronRight, Clock, Ruler, Search, Star } from 'lucide-react'
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { useMediaQuery } from '@/ui/hooks'
import { type PresetGroup, type SizePreset } from './catalogue'
import { knownPresets, setCollapsed, togglePinned, useSizeChoices, yourSizes } from './choices'
import { GroupIcon } from './GroupIcon'
import {
  entryBlocks,
  entryOf,
  filterBlocks,
  isAd,
  pickerSections,
  presetSizeText,
  searchBlocks,
  type KindFilter,
  type PickerBlock,
  type ShapeFilter,
} from './picker'
import { PresetShape } from './PresetShape'
import { useSizePresets } from './store'
import styles from './SizePicker.module.css'

const SHAPES: [ShapeFilter, string][] = [['all', 'All'], ['tall', 'Tall'], ['square', 'Square'], ['wide', 'Wide']]
const KINDS: [KindFilter, string][] = [['all', 'All'], ['posts', 'Posts'], ['ads', 'Ads']]
const MINE = '@mine'
const RECENT = '@recent'
const CUSTOM = '@custom'

export interface SizePickerProps {
  /** The preset shown as chosen (its slug or an alias). */
  selectedId?: string | null
  onSelect(preset: SizePreset): void
  /** Double click, or Enter on the chosen size. */
  onConfirm?(preset: SizePreset): void
  /** What the "Custom size" entry shows; without it the entry is left out. */
  custom?: ReactNode
  /** Open on the custom size instead of the chosen size's group. */
  startWithCustom?: boolean
  /** Told when the custom size opens or closes, so the dialog can leave its own button to the form. */
  onCustomChange?(open: boolean): void
}

/**
 * The size catalogue as one browsable list: formats and platforms on the left (sections fold, and stay folded in this
 * browser), the sizes of the chosen one on the right under their headings, with shape and posts/ads filters and one
 * search over every size.
 */
export function SizePicker({ selectedId, onSelect, onConfirm, custom, startWithCustom = false, onCustomChange }: SizePickerProps) {
  const catalogue = useSizePresets()
  const sections = useMemo(() => pickerSections(catalogue), [catalogue])
  const selected = selectedId ? catalogue.byId.get(selectedId) : undefined
  const choices = useSizeChoices()
  const mine = useMemo(() => yourSizes(catalogue, choices), [catalogue, choices])
  const recent = useMemo(() => knownPresets(catalogue, choices.recent), [catalogue, choices.recent])
  const [entry, setEntry] = useState<string>(() => (startWithCustom && custom ? CUSTOM : (entryOf(sections, selected)?.slug ?? MINE)))
  const [query, setQuery] = useState('')
  const [shape, setShape] = useState<ShapeFilter>('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const collapsed = choices.collapsed
  // On a phone the list is one row without section titles, so nothing could unfold a folded section there.
  const narrow = useMediaQuery('(max-width: 639px)')
  const headingId = useId()

  const group = useMemo(() => {
    for (const section of sections) for (const item of section.entries) if (item.group.slug === entry) return item.group
    return undefined
  }, [sections, entry])
  const searching = query.trim() !== ''
  const customShown = entry === CUSTOM && !searching
  useEffect(() => onCustomChange?.(customShown), [customShown, onCustomChange])
  const blocks: PickerBlock[] = useMemo(() => {
    if (searching) return searchBlocks(catalogue, query)
    if (entry === MINE) return [{ key: MINE, title: null, presets: mine }]
    if (entry === RECENT) return [{ key: RECENT, title: null, presets: recent }]
    return group ? entryBlocks(group) : []
  }, [catalogue, entry, group, query, searching, mine, recent])
  const all = blocks.flatMap((block) => block.presets)
  const mixed = all.some(isAd) && all.some((preset) => !isAd(preset))
  const shown = filterBlocks(blocks, shape, mixed ? kind : 'all')

  const open = (slug: string): void => {
    setEntry(slug)
    setQuery('')
    setShape('all')
    setKind('all')
  }
  const fold = (key: string): void => {
    setCollapsed(collapsed.includes(key) ? collapsed.filter((item) => item !== key) : [...collapsed, key])
  }

  const title = searching ? `Sizes matching “${query.trim()}”` : entry === MINE ? 'Your sizes' : entry === RECENT ? 'Recent' : entry === CUSTOM ? 'Custom size' : (group?.label ?? '')
  const showPlatform = searching || entry === MINE || entry === RECENT
  const pinnedIds = mine.map((preset) => preset.id)
  const pin = (preset: SizePreset): void => togglePinned(preset.id, pinnedIds)

  return (
    <div className={styles.picker}>
      <label className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <span className={styles.hidden}>Search sizes</span>
        <input type="search" value={query} placeholder={`Search ${catalogue.presets.length} sizes: story, A4, 1080…`} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className={styles.body}>
        <nav className={styles.rail} aria-label="Size groups">
          <button type="button" className={styles.entry} aria-current={!searching && entry === MINE ? 'true' : undefined} onClick={() => open(MINE)}>
            <Star className={styles.groupIcon} size={18} aria-hidden="true" />
            <span className={styles.entryName}>Your sizes</span>
            <span className={styles.count}>{mine.length}</span>
          </button>
          {recent.length > 0 ? (
            <button type="button" className={styles.entry} aria-current={!searching && entry === RECENT ? 'true' : undefined} onClick={() => open(RECENT)}>
              <Clock className={styles.groupIcon} size={18} aria-hidden="true" />
              <span className={styles.entryName}>Recent</span>
              <span className={styles.count}>{recent.length}</span>
            </button>
          ) : null}
          {custom ? (
            <button type="button" className={styles.entry} aria-current={!searching && entry === CUSTOM ? 'true' : undefined} onClick={() => open(CUSTOM)}>
              <Ruler className={styles.groupIcon} size={18} aria-hidden="true" />
              <span className={styles.entryName}>Custom size</span>
            </button>
          ) : null}
          {sections.map((section) => {
            const closed = !narrow && collapsed.includes(section.key)
            // A folded section still shows the entry that is open, so the list never hides where you are.
            const entries = closed ? section.entries.filter((item) => item.group.slug === entry) : section.entries
            return (
              <div key={section.key} className={styles.section}>
                <button type="button" className={styles.sectionTitle} aria-expanded={!closed} onClick={() => fold(section.key)}>
                  {closed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                  <span>{section.label}</span>
                  {closed ? <span className={styles.count}>{section.entries.length}</span> : null}
                </button>
                {entries.map(({ group: item, count }) => (
                  <EntryButton key={item.slug} group={item} count={count} current={!searching && entry === item.slug} onOpen={() => open(item.slug)} />
                ))}
              </div>
            )
          })}
        </nav>
        <section className={styles.pane} aria-labelledby={headingId}>
          <div className={styles.toolbar}>
            <h3 id={headingId} className={styles.title}>
              {!searching && group ? <GroupIcon group={group} /> : null}
              {title}
            </h3>
            {entry === CUSTOM && !searching ? null : (
              <>
                <Segmented<ShapeFilter> label="Shape" value={shape} onChange={setShape} options={SHAPES} />
                {mixed ? <Segmented<KindFilter> label="Posts or ads" value={kind} onChange={setKind} options={KINDS} /> : null}
              </>
            )}
          </div>
          <div className={styles.scroll} onKeyDown={moveBetweenCards}>
            {entry === CUSTOM && !searching ? (
              custom
            ) : shown.length === 0 ? (
              <p className={styles.empty}>{searching ? 'No size matches. Try another word, or enter a custom size.' : 'No size of this shape here.'}</p>
            ) : (
              shown.map((block) => (
                <div key={block.key} className={styles.block}>
                  {block.title ? (
                    <h4 className={styles.blockTitle}>
                      {block.title} <span className={styles.count}>{block.presets.length}</span>
                    </h4>
                  ) : null}
                  <ul className={styles.grid}>
                    {block.presets.map((preset) => (
                      <li key={preset.id}>
                        <PresetCard preset={preset} chosen={selected?.id === preset.id} pinned={pinnedIds.includes(preset.id)} showPlatform={showPlatform} onSelect={onSelect} onConfirm={onConfirm} onPin={pin} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }

/** Arrow keys move between the size cards: left and right one card, up and down one row of the grid. */
function moveBetweenCards(event: React.KeyboardEvent<HTMLElement>): void {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card]')
  if (!card || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  const cards = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-card]')]
  const index = cards.indexOf(card)
  let next = index + (STEPS[event.key] ?? 0)
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    // The card straight above or below: the nearest one in the next row up or down.
    const rect = card.getBoundingClientRect()
    const down = event.key === 'ArrowDown'
    const rows = cards.filter((other) => (down ? other.getBoundingClientRect().top > rect.top + 1 : other.getBoundingClientRect().top < rect.top - 1))
    const rowTop = rows.length === 0 ? null : rows.reduce((top, other) => (down ? Math.min(top, other.getBoundingClientRect().top) : Math.max(top, other.getBoundingClientRect().top)), down ? Infinity : -Infinity)
    const row = rows.filter((other) => Math.abs(other.getBoundingClientRect().top - (rowTop ?? 0)) < 1)
    const target = row.sort((a, b) => Math.abs(a.getBoundingClientRect().left - rect.left) - Math.abs(b.getBoundingClientRect().left - rect.left))[0]
    next = target ? cards.indexOf(target) : index
  }
  if (next < 0 || next >= cards.length || next === index) return
  event.preventDefault()
  cards[next].focus()
}

function EntryButton({ group, count, current, onOpen }: { group: PresetGroup; count: number; current: boolean; onOpen(): void }) {
  return (
    <button type="button" className={styles.entry} aria-current={current ? 'true' : undefined} onClick={onOpen}>
      <GroupIcon group={group} />
      <span className={styles.entryName}>{group.label}</span>
      <span className={styles.count}>{count}</span>
    </button>
  )
}

interface PresetCardProps {
  preset: SizePreset
  chosen: boolean
  pinned: boolean
  showPlatform: boolean
  onSelect(preset: SizePreset): void
  onConfirm?(preset: SizePreset): void
  onPin(preset: SizePreset): void
}

function PresetCard({ preset, chosen, pinned, showPlatform, onSelect, onConfirm, onPin }: PresetCardProps) {
  const ratio = preset.tags.find((tag) => /^~?[\d.]+:[\d.]+$/.test(tag))
  const where = preset.path.at(-1)
  // Inside a platform its name opens every label ("Instagram Feed"); the list already says where you are.
  const owner = preset.path.find((group) => preset.label.startsWith(`${group.label} `))
  const name = !showPlatform && owner ? preset.label.slice(owner.label.length + 1) : preset.label
  return (
    <div className={styles.cardWrap}>
      <button
        type="button"
        className={styles.card}
        data-card=""
        aria-pressed={chosen}
        onClick={() => onSelect(preset)}
        onDoubleClick={() => onConfirm?.(preset)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && chosen && onConfirm) {
            event.preventDefault()
            onConfirm(preset)
          }
        }}
      >
        <span className={styles.thumb}>
          <PresetShape preset={preset} />
        </span>
        <span className={styles.cardName}>{name}</span>
        <span className={styles.cardMeta}>
          {presetSizeText(preset)}
          {ratio ? <span className={styles.pill}>{ratio}</span> : null}
          {isAd(preset) ? <span className={`${styles.pill} ${styles.ad}`}>Ad</span> : null}
        </span>
        {showPlatform && where ? <span className={styles.where}>{where.label}</span> : null}
      </button>
      <button type="button" className={styles.star} aria-pressed={pinned} aria-label={pinned ? 'Remove from your sizes' : 'Add to your sizes'} title={pinned ? 'Remove from your sizes' : 'Add to your sizes'} onClick={() => onPin(preset)}>
        <Star size={15} aria-hidden="true" fill={pinned ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange(value: T): void; options: [T, string][] }) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </div>
  )
}
