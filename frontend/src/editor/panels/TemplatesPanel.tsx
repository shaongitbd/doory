import { FilePlus2, Files, Maximize2, Replace } from 'lucide-react'
import { useLocale } from '@/i18n/useLocale'
import { useMemo, useRef, useState } from 'react'
import type { TemplateSummary } from '@/types/api'
import { useEditor, useEditorState } from '../context'
import { migrateDocument } from '../engine/migrations'
import { formatSize, getPageSize, sameSize } from '../engine/pageSizes'
import { useAsyncList } from '../hooks/useAsyncList'
import { useDebounced } from '../hooks/useDebounced'
import { useSentinel } from '../hooks/useSentinel'
import { t } from '../strings'
import { Menu, type MenuItem } from '../ui/Menu'
import { Skeleton } from '../ui/Skeleton'
import ed from '../chrome/ed.module.css'
import { type CategoryEntry, CategoryMenu, LibrarySearch } from './library'
import { splitColumns } from './masonry'
import { type TemplateMode, applyTemplate } from './templateOps'
import stickers from './Sticker.module.css'
import styles from './Templates.module.css'

type Orientation = TemplateSummary['orientation']
type Filter = { type: 'all' } | { type: 'category'; slug: string; name: string } | { type: 'orientation'; value: Orientation }

const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape', 'square']
const PAGE_SIZE = 24

const filterKey = (f: Filter): string => (f.type === 'all' ? 'all' : f.type === 'category' ? `c:${f.slug}` : `o:${f.value}`)

/** Width / height of a card, kept within what a two-column grid can show. */
const cardRatio = (tpl: Pick<TemplateSummary, 'width' | 'height'>): number => Math.min(2, Math.max(0.5, tpl.width / Math.max(1, tpl.height)))

/** Templates sidebar: search, categories, a grid of previews; a click puts the template on the page, replaces it or adds pages. */
export function TemplatesPanel({ close }: { close: () => void }) {
  useLocale()
  const editor = useEditor()
  const compact = useEditorState((s) => s.ui.compact)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>({ type: 'all' })
  const [busy, setBusy] = useState<string | null>(null)
  const [choose, setChoose] = useState<TemplateSummary | null>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const q = useDebounced(query.trim(), 250)
  const templates = editor.adapter.services.templates

  const categories = useAsyncList<{ slug: string; name: string; count: number }>(
    () =>
      templates.categories().then((cats) => {
        const results = cats.map((c) => ({ slug: c.slug, name: c.name, count: c.template_count }))
        return { count: results.length, next: null, previous: null, results }
      }),
    'categories',
  )
  const list = useAsyncList<TemplateSummary>(
    (page) =>
      templates.list({
        page,
        page_size: PAGE_SIZE,
        q: q || undefined,
        category: filter.type === 'category' ? filter.slug : undefined,
        orientation: filter.type === 'orientation' ? filter.value : undefined,
      }),
    `${q}|${filterKey(filter)}`,
  )
  const { loadMore } = list
  const sentinel = useSentinel(list.hasMore && !list.loading && !list.error && list.items.length > 0, loadMore)

  const menu = (() => {
    const byId = new Map<string, Filter>([['all', { type: 'all' }]])
    const entries: CategoryEntry[] = [{ kind: 'option', id: 'all', label: t.templates.all }]
    if (categories.items.length > 0) entries.push({ kind: 'group', id: 'g-cat', label: t.templates.categories })
    for (const c of categories.items) {
      const f: Filter = { type: 'category', slug: c.slug, name: c.name }
      byId.set(filterKey(f), f)
      entries.push({ kind: 'option', id: filterKey(f), label: c.name, count: c.count })
    }
    entries.push({ kind: 'group', id: 'g-shape', label: t.templates.shape })
    for (const value of ORIENTATIONS) {
      const f: Filter = { type: 'orientation', value }
      byId.set(filterKey(f), f)
      entries.push({ kind: 'option', id: filterKey(f), label: t.templates.orientation[value] })
    }
    return { byId, entries }
  })()

  const label = filter.type === 'all' ? t.templates.all : filter.type === 'category' ? filter.name : t.templates.orientation[filter.value]

  const apply = async (tpl: TemplateSummary, mode: TemplateMode): Promise<void> => {
    setBusy(tpl.id)
    try {
      const detail = await templates.get(tpl.slug)
      const applied = applyTemplate(editor.getDocument(), editor.state.activePageId, migrateDocument(detail.document), mode)
      if (!applied) {
        editor.toast(t.templates.noRoom, 'error')
        return
      }
      editor.applyDocument(applied.doc, { label: t.history.applyTemplate, activePageId: applied.activePageId })
      editor.view.scrollToPage(applied.activePageId)
      editor.announce(t.templates.applied(tpl.title))
      editor.toast(t.templates.applied(tpl.title), 'success', { label: t.templates.undo, run: () => void editor.undo() })
      if (compact) close()
    } catch {
      editor.toast(t.templates.applyFailed, 'error')
    } finally {
      setBusy(null)
    }
  }

  const pick = (tpl: TemplateSummary, el: HTMLElement): void => {
    const empty = editor.getDocument().pages.every((p) => p.objects.length === 0)
    if (empty) {
      void apply(tpl, 'replace')
      return
    }
    anchor.current = el
    setChoose(tpl)
  }

  // A template page keeps its own size when it becomes a page of its own, so the menu names the size it brings.
  const chosenSize = choose ? { width: choose.width, height: choose.height } : null
  const sizeHint = chosenSize ? formatSize(chosenSize, editor.state.doc.unit) : ''
  const sameAsPage = !chosenSize || sameSize(chosenSize, getPageSize(editor.state.doc, editor.state.activePageId))
  const items: MenuItem[] = choose
    ? [
        { id: 'replace', label: t.templates.replacePage, icon: <Replace size={16} aria-hidden="true" />, onSelect: () => void apply(choose, 'replace') },
        ...(sameAsPage ? [] : [{ id: 'replace-resize', label: t.templates.replaceResize, hint: sizeHint, icon: <Maximize2 size={16} aria-hidden="true" />, onSelect: () => void apply(choose, 'replace-resize') }]),
        { id: 'add', label: t.templates.addPage, hint: sizeHint, icon: <FilePlus2 size={16} aria-hidden="true" />, onSelect: () => void apply(choose, 'add') },
        ...(choose.page_count > 1 ? [{ id: 'all', label: t.templates.addAll(choose.page_count), icon: <Files size={16} aria-hidden="true" />, onSelect: () => void apply(choose, 'add-all') }] : []),
      ]
    : []

  const columns = useMemo(() => splitColumns(list.items.map((tpl) => 1 / cardRatio(tpl) + 0.2), 2), [list.items])
  const loading = list.loading && list.items.length === 0
  return (
    <>
      <LibrarySearch value={query} onChange={setQuery} placeholder={t.templates.search} clearLabel={t.templates.clearSearch} testId="template-search" />
      <CategoryMenu name={t.templates.category} label={label} entries={menu.entries} activeId={filterKey(filter)} onSelect={(id) => setFilter(menu.byId.get(id) ?? { type: 'all' })} testId="template-category" />

      <div className={stickers.gridWrap} data-testid="template-grid-wrap">
        {list.error && list.items.length === 0 ? (
          <div className={stickers.state} role="alert">
            <span>{t.templates.failed}</span>
            <button type="button" className={`${ed.btn} ${ed.ghost}`} onClick={list.reload}>
              {t.templates.retry}
            </button>
          </div>
        ) : null}
        {loading ? (
          <div className={styles.grid} aria-busy="true" aria-label={t.templates.loading}>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className={styles.skel} height="auto" style={{ aspectRatio: i % 3 === 1 ? '4 / 3' : '3 / 4' }} />
            ))}
          </div>
        ) : null}
        {!list.error && !list.loading && list.items.length === 0 ? <div className={stickers.state}>{q ? t.templates.noMatch(q) : t.templates.empty}</div> : null}
        {list.items.length > 0 ? (
          <div className={styles.columns} data-testid="template-grid">
            {columns.map((indices, c) => (
              <div key={c} className={styles.column}>
                {indices.map((i) => {
                  const tpl = list.items[i]
                  return (
                    <div key={tpl.id} className={styles.item}>
                      <button type="button" className={styles.card} style={{ aspectRatio: cardRatio(tpl) }} aria-label={t.templates.use(tpl.title)} aria-busy={busy === tpl.id || undefined} aria-haspopup="menu" disabled={busy !== null} data-testid="template-card" onClick={(e) => pick(tpl, e.currentTarget)}>
                        {tpl.thumbnail_url ? <img className={styles.thumb} src={tpl.thumbnail_url} alt="" loading="lazy" draggable={false} /> : <span className={styles.blank}>{tpl.title}</span>}
                        {tpl.page_count > 1 ? <span className={styles.pages}>{t.templates.pageCount(tpl.page_count)}</span> : null}
                      </button>
                      <span className={styles.title}>{tpl.title}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : null}
        {list.loading && list.items.length > 0 ? <div className={stickers.state}>{t.templates.loadingMore}</div> : null}
        {list.error && list.items.length > 0 ? (
          <div className={stickers.state} role="alert">
            <span>{t.templates.failed}</span>
            <button type="button" className={`${ed.btn} ${ed.ghost}`} onClick={loadMore}>
              {t.templates.retry}
            </button>
          </div>
        ) : null}
        <div ref={sentinel} className={stickers.sentinel} />
      </div>
      {choose ? <Menu label={t.templates.use(choose.title)} items={items} anchorRef={anchor} onClose={() => setChoose(null)} /> : null}
    </>
  )
}
