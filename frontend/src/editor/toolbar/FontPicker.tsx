import { Search, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FontCategory, FontFamily } from '@/types/api'
import { useEditor, useEditorStateShallow } from '../context'
import { SYSTEM_FONTS } from '../engine/fonts'
import { fontStack, primaryFamily } from '../engine/text/fontStack'
import { getLocale } from '@/i18n/locale'
import { SCRIPTS, preferredChinese, scriptById, scriptOf } from '../engine/text/scripts'
import { useUserFonts, useUserFontsStore } from '../fonts/userFonts'
import { useFontUploadEntry } from '../fonts/useFontUploadEntry'
import { useAsyncList } from '../hooks/useAsyncList'
import { useDebounced } from '../hooks/useDebounced'
import { t } from '../strings'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import styles from './FontPicker.module.css'

const ROW = 40
const HEADING = 26
const VIEW = 300

interface Entry {
  family: string
  category: FontCategory
  group: 'mine' | 'shared' | 'recent' | 'catalog' | 'system'
}

const HEADINGS: Record<Entry['group'], string> = {
  mine: t.userFonts.group,
  shared: t.userFonts.groupShared,
  recent: t.fonts.recent,
  catalog: t.fonts.catalog,
  system: t.fonts.system,
}

const CATEGORIES: { id: FontCategory | 'all'; label: string }[] = [
  { id: 'all', label: t.fonts.all },
  { id: 'sans-serif', label: t.fonts.sans },
  { id: 'serif', label: t.fonts.serif },
  { id: 'display', label: t.fonts.display },
  { id: 'handwriting', label: t.fonts.script },
  { id: 'monospace', label: t.fonts.mono },
]

type Row = { type: 'heading'; label: string; top: number; height: number } | { type: 'font'; entry: Entry; index: number; top: number; height: number }

interface FontPickerProps {
  current: string
  /** Hovering or arrowing onto a font previews it without a history step. */
  onPreview: (stack: string, family: string) => void
  /** Click or Enter on a font. */
  onPick: (stack: string, family: string) => void
  /** The picker was left without a choice (the "Upload a font" row opens a dialog): restore and close the popover. */
  onClose: () => void
  /** The selected text: when it is written in a non-Latin script, the list opens on fonts that have its letters. */
  sample?: string
}

/**
 * Searchable, categorised, virtualised font list. Hovering a row (or moving
 * with ↑/↓) previews that font on the selected text without adding history steps, Enter or a click
 * commits, and leaving without choosing (Esc, outside click) is the caller's cue to restore the original.
 * The user's own fonts are the first group ("Your fonts"); an "Upload a font" row above the list opens the upload
 * dialog (guests are asked to sign up instead).
 */
export function FontPicker({ current, onPreview, onPick, onClose, sample = '' }: FontPickerProps) {
  const editor = useEditor()
  const userStore = useUserFontsStore()
  const mine = useUserFonts()
  const uploadEntry = useFontUploadEntry()
  const recent = useEditorStateShallow((s) => s.recentFonts)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<FontCategory | 'all'>('all')
  const [script, setScript] = useState<string>(() => scriptOf(sample, preferredChinese(getLocale(), navigator.languages ?? [navigator.language]))?.id ?? 'all')
  const scriptInfo = scriptById(script)
  const [scroll, setScroll] = useState(0)
  const [highlight, setHighlight] = useState(-1)
  const scroller = useRef<HTMLDivElement>(null)
  const q = useDebounced(query.trim(), 200)
  const list = useAsyncList<FontFamily>(
    (page) => editor.adapter.services.fonts.list({ q: q || undefined, category: category === 'all' ? undefined : category, script: scriptInfo?.id, page, page_size: 40 }),
    `${q}|${category}|${script}`,
  )

  useEffect(() => {
    editor.fonts.remember(list.items)
  }, [editor, list.items])

  const entries = useMemo<Entry[]>(() => {
    const needle = q.toLowerCase()
    const matches = (family: string, cat: FontCategory): boolean => (!needle || family.toLowerCase().includes(needle)) && (category === 'all' || cat === category)
    const out: Entry[] = []
    const seen = new Set<string>()
    const push = (e: Entry): void => {
      const key = e.family.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      out.push(e)
    }
    const own = mine.source === 'shared' ? 'shared' : 'mine'
    for (const f of mine.families) if (matches(f.family, f.category)) push({ family: f.family, category: f.category, group: own })
    // With a script chosen, only the catalogue says which fonts have its letters: recent and system fonts are left out.
    for (const family of scriptInfo ? [] : recent) {
      const cat = mine.families.find((f) => f.family === family)?.category ?? list.items.find((f) => f.family === family)?.category ?? SYSTEM_FONTS.find((f) => f.family === family)?.category ?? 'sans-serif'
      if (matches(family, cat)) push({ family, category: cat, group: 'recent' })
    }
    for (const f of list.items) push({ family: f.family, category: f.category, group: 'catalog' })
    if (!scriptInfo) for (const f of SYSTEM_FONTS) if (matches(f.family, f.category)) push({ family: f.family, category: f.category, group: 'system' })
    return out
  }, [q, category, recent, list.items, mine.families, mine.source, scriptInfo])

  // Headings are rows of their own, so every row has a known height and the list can be windowed.
  const rows = useMemo(() => {
    const out: Row[] = []
    let top = 0
    entries.forEach((entry, i) => {
      const prev = i > 0 ? entries[i - 1] : undefined
      if (!prev || prev.group !== entry.group) {
        out.push({ type: 'heading', label: HEADINGS[entry.group], top, height: HEADING })
        top += HEADING
      }
      out.push({ type: 'font', entry, index: i, top, height: ROW })
      top += ROW
    })
    return { rows: out, height: top + (list.hasMore && !list.error ? ROW : 0) }
  }, [entries, list.hasMore, list.error])

  const visible = useMemo(() => rows.rows.filter((r) => r.top + r.height >= scroll - ROW * 3 && r.top <= scroll + VIEW + ROW * 3), [rows, scroll])

  // Load only the fonts that are actually on screen, so previews render in their own face.
  useEffect(() => {
    for (const r of visible) if (r.type === 'font' && r.entry.group !== 'system') void editor.fonts.load(r.entry.family, 400, 'normal', `${r.entry.family}${scriptInfo ? ` ${scriptInfo.sample}` : ''}`)
  }, [editor, visible, scriptInfo])

  useEffect(() => {
    if (scroll + VIEW >= rows.height - ROW * 2 && list.hasMore && !list.loading && !list.error) list.loadMore()
  })

  const currentName = primaryFamily(current)

  // Bring the current font into view once, when the list first has it.
  const revealed = useRef(false)
  useEffect(() => {
    if (revealed.current) return
    const row = rows.rows.find((r) => r.type === 'font' && r.entry.family === currentName)
    if (!row || !scroller.current) return
    revealed.current = true
    scroller.current.scrollTop = Math.max(0, row.top - VIEW / 2 + ROW / 2)
  }, [rows, currentName])

  const preview = (index: number): void => {
    const e = entries[index]
    if (e && e.family !== currentName) onPreview(fontStack(e.family, e.category), e.family)
  }
  const moveTo = (index: number): void => {
    setHighlight(index)
    preview(index)
    const row = rows.rows.find((r) => r.type === 'font' && r.index === index)
    const el = scroller.current
    if (row && el) {
      if (row.top < el.scrollTop) el.scrollTop = row.top
      else if (row.top + row.height > el.scrollTop + VIEW) el.scrollTop = row.top + row.height - VIEW
    }
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (entries.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      // Circular: Up from the first row wraps to the last.
      const step = e.key === 'ArrowDown' ? 1 : -1
      const base = highlight < 0 ? entries.findIndex((x) => x.family === currentName) : highlight
      moveTo((((base < 0 && step < 0 ? 0 : base) + step) % entries.length + entries.length) % entries.length)
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault()
      const f = entries[highlight]
      onPick(fontStack(f.family, f.category), f.family)
    }
  }

  return (
    <div className={styles.picker} onKeyDown={onKeyDown} data-testid="font-picker">
      <div className={styles.search}>
        <Search size={16} />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlight(-1)
          }}
          placeholder={t.panels.searchFonts}
          aria-label={t.panels.searchFonts}
          data-autofocus
          data-testid="font-search"
        />
      </div>
      <label className={styles.script}>
        <span>{t.fonts.language}</span>
        <select value={script} data-testid="font-script" onChange={(e) => setScript(e.target.value)}>
          <option value="all">{t.fonts.anyLanguage}</option>
          {SCRIPTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.chips} role="group" aria-label={t.fonts.categories}>
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={`${styles.chip} ${category === c.id ? styles.chipOn : ''}`} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      {uploadEntry.available ? (
        <button
          type="button"
          className={styles.upload}
          data-testid="font-upload-row"
          onClick={() => {
            onClose()
            uploadEntry.start()
          }}
        >
          <Upload size={15} aria-hidden="true" />
          {t.userFonts.uploadRow}
        </button>
      ) : null}
      {mine.status === 'loading' ? (
        <div className={styles.status} role="status" data-testid="font-mine-loading">
          <Skeleton height={12} width="45%" />
          <span className={styles.srOnly}>{t.userFonts.loading}</span>
        </div>
      ) : null}
      {mine.status === 'error' ? (
        <div className={styles.notice} role="alert" data-testid="font-mine-error">
          <span>{mine.error ?? t.userFonts.loadFailed}</span>
          <Button size="sm" variant="ghost" onClick={() => void userStore.reload()}>
            {t.userFonts.retry}
          </Button>
        </div>
      ) : null}
      <div ref={scroller} className={styles.list} style={{ height: VIEW }} onScroll={(e) => setScroll(e.currentTarget.scrollTop)} role="listbox" aria-label={t.fonts.list}>
        <div style={{ height: rows.height, position: 'relative' }}>
          {visible.map((r) =>
            r.type === 'heading' ? (
              <div key={`h-${r.label}`} className={styles.heading} style={{ top: r.top, height: r.height }}>
                {r.label}
              </div>
            ) : (
              <button
                key={`${r.entry.group}-${r.entry.family}`}
                type="button"
                role="option"
                tabIndex={-1}
                data-font={r.entry.family}
                data-group={r.entry.group}
                aria-selected={r.entry.family === currentName}
                className={`${styles.row} ${r.entry.family === currentName ? styles.rowOn : ''} ${r.index === highlight ? styles.rowHi : ''}`}
                style={{ top: r.top, height: r.height - 2, fontFamily: fontStack(r.entry.family, r.entry.category) }}
                onMouseEnter={() => {
                  setHighlight(r.index)
                  preview(r.index)
                }}
                onClick={() => onPick(fontStack(r.entry.family, r.entry.category), r.entry.family)}
              >
                {r.entry.family}
                {scriptInfo ? <span className={styles.sample}>{scriptInfo.sample}</span> : null}
              </button>
            ),
          )}
          {list.loading && list.items.length === 0 ? <Skeleton className={styles.loading} height={18} width="60%" /> : null}
        </div>
      </div>
      {list.error ? (
        <div className={styles.notice} role="status">
          <span>{t.fonts.unreachable}</span>
          <Button size="sm" variant="ghost" onClick={list.reload}>
            {t.panels.retry}
          </Button>
        </div>
      ) : null}
      {!list.loading && entries.length === 0 ? <p className={styles.empty}>{q ? t.fonts.noMatch(q) : t.panels.noResults}</p> : null}
    </div>
  )
}
