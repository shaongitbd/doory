import { useLocale } from '@/i18n/useLocale'
import { memo } from 'react'
import type { DocPage } from '@/types/document'
import { useEditor } from '../context'
import { fitBox } from '../engine/pageSizes'
import { useInView } from '../hooks/useInView'
import { t } from '../strings'
import { Skeleton } from '../ui/Skeleton'
import { usePageSnapshot } from './useSnapshot'
import styles from './PageThumb.module.css'

interface PageThumbProps {
  page: DocPage
  index: number
  active: boolean
  /** Compact (strip) or roomy (panel) sizing. */
  variant: 'strip' | 'panel'
  dragOver: 'before' | 'after' | null
  draggable: boolean
  onSelect: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  onMove: (delta: number) => void
}

/** The strip draws every page inside the same box, at the page's own proportions. */
const STRIP_BOX = { width: 96, height: 120 }
const MIN_SIDE = 6

export const PageThumb = memo(function PageThumb({ page, index, active, variant, dragOver, draggable, onSelect, onDragStart, onDragOver, onDrop, onDragEnd, onMove }: PageThumbProps) {
  useLocale()
  const editor = useEditor()
  const size = editor.pageSizeOf(page.id)
  // Only the thumbnails that can be seen are drawn: a long design has a long strip, and each picture costs a page render.
  const [seenRef, seen] = useInView<HTMLDivElement>()
  const url = usePageSnapshot(page, size, seen)
  const fit = fitBox(size, STRIP_BOX.width, STRIP_BOX.height)
  const box = { width: Math.max(MIN_SIDE, fit.width), height: Math.max(MIN_SIDE, fit.height) }
  const label = page.name?.trim() || t.workspace.page(index + 1)
  return (
    <div
      ref={seenRef}
      className={`${styles.item} ${styles[variant]} ${active ? styles.active : ''} ${dragOver ? styles[dragOver] : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span className={styles.frame}>
        <button
          type="button"
          className={styles.thumb}
          style={variant === 'strip' ? box : { aspectRatio: `${size.width / size.height}` }}
          aria-label={`${label}${active ? ', current page' : ''}`}
          aria-current={active || undefined}
          onClick={onSelect}
          onKeyDown={(e) => {
            if (!draggable || !e.altKey) return
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
              e.preventDefault()
              onMove(-1)
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
              e.preventDefault()
              onMove(1)
            }
          }}
        >
          {url ? <img src={url} alt="" draggable={false} /> : <Skeleton width="100%" height="100%" radius={0} />}
        </button>
      </span>
      <span className={styles.caption}>{index + 1}</span>
    </div>
  )
})
