import { useEffect, useMemo, useState } from 'react'
import { useLocale } from '@/i18n/useLocale'
import { safeGetItem, safeSetItem } from '@/lib/storage'
import type { ElementItem, ElementKind, ElementPack } from '@/types/api'
import { useEditor } from '../context'
import { useAsyncList } from '../hooks/useAsyncList'
import { useDebounced } from '../hooks/useDebounced'
import { t } from '../strings'
import { Skeleton } from '../ui/Skeleton'
import ed from '../chrome/ed.module.css'
import { useSentinel } from '../hooks/useSentinel'
import { type CategoryEntry, CategoryMenu, LibrarySearch } from './library'
import styles from './Sticker.module.css'

type Kind = ElementKind | 'all'

const KINDS: ElementKind[] = ['icon', 'sticker', 'illustration', 'graphic', 'frame', 'shape', 'line']
const STORAGE_KEY = 'doory.stickers.filter'

function storedFilter(): { kind: Kind; pack: string } {
  try {
    const raw = JSON.parse(safeGetItem(STORAGE_KEY) ?? 'null') as { kind?: unknown; pack?: unknown } | null
    const kind = KINDS.includes(raw?.kind as ElementKind) ? (raw!.kind as ElementKind) : 'all'
    return { kind, pack: typeof raw?.pack === 'string' ? raw.pack : 'all' }
  } catch {
    return { kind: 'all', pack: 'all' }
  }
}

/** Sticker library (docked sidebar): search, category menu, pack chips and an endless grid. */
export function StickerPanel() {
  useLocale()
  const editor = useEditor()
  const [query, setQuery] = useState('')
  const [stored] = useState(storedFilter)
  const [kind, setKind] = useState<Kind>(stored.kind)
  const [chosenPack, setPack] = useState<string>(stored.pack)
  const q = useDebounced(query.trim(), 250)

  const packs = useAsyncList<ElementPack>(() => editor.adapter.services.elements.packs().then((p) => ({ count: p.length, next: null, previous: null, results: p })), 'packs')
  const visiblePacks = useMemo(() => packs.items.filter((p) => kind === 'all' || p.kind === kind), [packs.items, kind])
  // A remembered pack that is gone (or not of this kind) falls back to All once the packs are known.
  const packsKnown = !packs.loading
  const current = chosenPack === 'all' ? null : visiblePacks.find((p) => p.slug === chosenPack)
  const pack = chosenPack !== 'all' && (current || !packsKnown) ? chosenPack : 'all'

  useEffect(() => {
    safeSetItem(STORAGE_KEY, JSON.stringify({ kind, pack }))
  }, [kind, pack])

  const list = useAsyncList<ElementItem>(
    (page) =>
      editor.adapter.services.elements.list({
        q: q || undefined,
        kind: kind === 'all' ? undefined : kind,
        pack: pack === 'all' ? undefined : pack,
        page,
        page_size: 36,
      }),
    `${q}|${kind}|${pack}`,
  )

  const { loadMore } = list
  const sentinel = useSentinel(list.hasMore && !list.loading && !list.error && list.items.length > 0, loadMore)

  const label = kind === 'all' ? t.stickers.all : t.stickers.kinds[kind]
  const entries: CategoryEntry[] = [{ kind: 'option', id: 'all', label: t.stickers.all }, ...KINDS.map((k): CategoryEntry => ({ kind: 'option', id: k, label: t.stickers.kinds[k] }))]
  const selectKind = (id: string) => {
    const next: Kind = KINDS.includes(id as ElementKind) ? (id as ElementKind) : 'all'
    setKind(next)
    if (next !== 'all' && current && current.kind !== next) setPack('all')
  }

  const loading = list.loading && list.items.length === 0
  return (
    <>
      <LibrarySearch value={query} onChange={setQuery} placeholder={t.stickers.search} clearLabel={t.stickers.clearSearch} testId="sticker-search" />
      <CategoryMenu name={t.stickers.category} label={label} entries={entries} activeId={kind} onSelect={selectKind} testId="sticker-category" />
      {visiblePacks.length >= 2 ? (
        <div className={styles.packs} role="group" aria-label={t.stickers.packs} data-testid="sticker-packs">
          {[{ slug: 'all', name: t.stickers.allPacks }, ...visiblePacks].map((p) => (
            <button key={p.slug} type="button" aria-pressed={pack === p.slug} className={styles.pack} data-testid={`sticker-pack-${p.slug}`} onClick={() => setPack(p.slug)}>
              {p.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.gridWrap} data-testid="sticker-grid-wrap">
        {list.error && list.items.length === 0 ? (
          <div className={styles.state} role="alert">
            <span>{t.stickers.failed}</span>
            <button type="button" className={`${ed.btn} ${ed.ghost}`} onClick={list.reload}>
              {t.stickers.retry}
            </button>
          </div>
        ) : null}
        {loading ? (
          <div className={styles.grid} aria-busy="true" aria-label={t.stickers.loading}>
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className={styles.skel} height="auto" />
            ))}
          </div>
        ) : null}
        {!list.error && !list.loading && list.items.length === 0 ? <div className={styles.state}>{q ? (current ? t.stickers.noMatchIn(q, current.name) : t.stickers.noMatch(q)) : t.stickers.empty}</div> : null}
        {list.items.length > 0 ? (
          <div className={styles.grid} data-testid="sticker-grid">
            {list.items.map((item) => (
              <button key={item.id} type="button" className={styles.cell} title={t.stickers.itemOf(item.name, item.pack.name)} aria-label={t.stickers.addOfPack(item.name, item.pack.name)} data-testid="sticker-cell" onClick={() => void editor.insert.element(item)}>
                <img src={item.svg_url} alt="" loading="lazy" draggable={false} />
                {pack === 'all' ? (
                  <span className={styles.badge} aria-hidden="true">
                    {item.pack.name}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        {list.loading && list.items.length > 0 ? <div className={styles.state}>{t.stickers.loadingMore}</div> : null}
        {list.error && list.items.length > 0 ? (
          <div className={styles.state} role="alert">
            <span>{t.stickers.failed}</span>
            <button type="button" className={`${ed.btn} ${ed.ghost}`} onClick={loadMore}>
              {t.stickers.retry}
            </button>
          </div>
        ) : null}
        <div ref={sentinel} className={styles.sentinel} />
      </div>
    </>
  )
}
