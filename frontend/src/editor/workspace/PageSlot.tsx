import { useLocale } from '@/i18n/useLocale'
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react'
import { type CSSProperties, memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DocPage } from '@/types/document'
import { useEditor, useEditorState } from '../context'
import { gradientCss } from '../engine/objects/fills'
import { backgroundToFill } from '../engine/objects/background'
import { DurationChip } from '../presenter/DurationChip'
import { t } from '../strings'
import { IconButton } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import { PageSizeChip } from './PageSizeChip'
import { PresenceLayer } from './PresenceLayer'
import { usePageSnapshot } from './useSnapshot'
import styles from './PageSlot.module.css'

interface PageSlotProps {
  page: DocPage
  index: number
  total: number
  width: number
  height: number
  zoom: number
  headerHeight: number
  gap: number
  live: boolean
  /** The page is within a few screens of the viewport: only then is its picture prepared while it has no live canvas. */
  near: boolean
  active: boolean
  registerArtboard: (id: string, el: HTMLDivElement | null) => void
}

/** A header never gets narrower than its name, size and actions need, however small the page is. */
const HEADER_MIN_WIDTH = 372

/** The header spans the artboard; on a page narrower than the minimum it overhangs both sides equally, so the slot stays as wide as the page. */
const headerStyle = (width: number, height: number): CSSProperties => {
  const headerWidth = Math.max(width, HEADER_MIN_WIDTH)
  return { height, width: headerWidth, marginInline: (width - headerWidth) / 2 }
}

function backgroundCss(page: DocPage): string | undefined {
  const bg = page.background
  if (bg.type === 'image') return undefined
  const fill = backgroundToFill(bg)
  return fill.type === 'gradient' ? gradientCss(fill) : fill.color
}

/** One page in the stack: header chrome, artboard, and either a live Fabric canvas or a cached bitmap. */
export const PageSlot = memo(function PageSlot({ page, index, total, width, height, zoom, headerHeight, gap, live, near, active, registerArtboard }: PageSlotProps) {
  useLocale()
  const editor = useEditor()
  const readOnly = useEditorState((s) => s.readOnly)
  const loading = useEditorState((s) => s.loadingPages.includes(page.id))
  const hostRef = useRef<HTMLDivElement>(null)
  const artRef = useRef<HTMLDivElement>(null)
  const [renaming, setRenaming] = useState(false)
  const pageSize = editor.pageSizeOf(page.id)
  const snapshot = usePageSnapshot(page, pageSize, near && (!live || loading))

  useLayoutEffect(() => {
    registerArtboard(page.id, artRef.current)
    return () => registerArtboard(page.id, null)
  }, [page.id, registerArtboard])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!live || !host) return
    editor.mountPage(page.id, host)
    editor.view.relayout()
    return () => editor.unmountPage(page.id)
  }, [live, editor, page.id])

  useEffect(() => {
    if (live) editor.view.relayout()
  }, [live, zoom, width, height, editor])

  const label = page.name?.trim() || t.workspace.page(index + 1)

  return (
    <section className={styles.slot} data-page-id={page.id} data-active={active || undefined} data-multi={total > 1 || undefined} style={{ height: headerHeight + height, marginBottom: gap }} aria-label={label}>
      <header className={styles.header} style={headerStyle(width, headerHeight)} hidden={headerHeight === 0}>
        <div className={styles.lead}>
          {renaming ? (
            <input
              className={styles.nameInput}
              defaultValue={page.name ?? ''}
              placeholder={t.workspace.page(index + 1)}
              aria-label={t.panels.pageName}
              autoFocus
              maxLength={60}
              onBlur={(e) => {
                editor.pages.rename(page.id, e.currentTarget.value)
                setRenaming(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setRenaming(false)
              }}
            />
          ) : (
            <button type="button" className={styles.name} disabled={readOnly} onClick={() => (readOnly ? undefined : setRenaming(true))} onDoubleClick={() => undefined} title={readOnly ? undefined : t.workspace.renamePage}>
              <span className={styles.count}>{index + 1}</span>
              <span className={styles.label}>{label}</span>
            </button>
          )}
          <PageSizeChip pageId={page.id} number={index + 1} />
          <DurationChip pageId={page.id} className={styles.time} />
        </div>
        {readOnly ? null : (
          <div className={styles.actions}>
            <IconButton label={t.workspace.moveUp} size="sm" disabled={index === 0} onClick={() => editor.pages.moveBy(page.id, -1)}>
              <ArrowUp size={16} />
            </IconButton>
            <IconButton label={t.workspace.moveDown} size="sm" disabled={index === total - 1} onClick={() => editor.pages.moveBy(page.id, 1)}>
              <ArrowDown size={16} />
            </IconButton>
            <IconButton label={t.workspace.duplicatePage} size="sm" onClick={() => editor.pages.duplicate(page.id)}>
              <Copy size={16} />
            </IconButton>
            <IconButton label={t.workspace.deletePage} size="sm" disabled={total <= 1} onClick={() => editor.pages.remove(page.id)}>
              <Trash2 size={16} />
            </IconButton>
            <IconButton label={t.workspace.addPageHere} size="sm" onClick={() => editor.pages.add(index + 1)}>
              <Plus size={16} />
            </IconButton>
          </div>
        )}
      </header>
      <div ref={artRef} className={styles.artboard} style={{ width, height, background: backgroundCss(page) }} data-artboard data-page-id={page.id}>
        {snapshot && (!live || loading) ? <img className={styles.snapshot} src={snapshot} alt={t.workspace.snapshotAlt(index + 1)} draggable={false} /> : null}
        {live ? <div ref={hostRef} className={styles.host} role="img" aria-label={t.workspace.canvasLabel(index + 1)} /> : null}
        {(loading || (!live && !snapshot)) && page.objects.length > 0 ? <Skeleton className={styles.skeleton} height="100%" width="100%" radius={0} /> : null}
        {page.objects.length === 0 && !loading ? <p className={styles.empty}>{t.workspace.emptyHint}</p> : null}
        <PresenceLayer pageId={page.id} zoom={zoom} />
      </div>
    </section>
  )
})
