import { msg } from '@/i18n/catalog'
import { Copy, ExternalLink, FolderInput, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { designKind, getPreset } from '@/features/presets'
import { useSizePresets } from '@/lib/sizePresets'
import { formatRelative } from '@/lib/time'
import type { DesignSummary } from '@/types/api'
import { Checkbox, IconButton, Menu, MenuItem, MenuSeparator, Thumbnail } from '@/ui'
import type { DesignActions } from './useDesignActions'
import { setDraggedDesigns } from './dragDrop'
import { InlineRename } from './InlineRename'
import styles from './DesignCard.module.css'

export interface DesignCardProps {
  design: DesignSummary
  layout: 'grid' | 'list'
  selected: boolean
  selectionActive: boolean
  /** Ids that move together when this card is dragged (the selection when it contains this card). */
  dragIds(): string[]
  onSelectChange(selected: boolean): void
  actions: DesignActions
  onMoveRequest(design: DesignSummary): void
}

export function DesignCard({ design, layout, selected, selectionActive, dragIds, onSelectChange, actions, onMoveRequest }: DesignCardProps) {
  const [renaming, setRenaming] = useState(false)
  const catalogue = useSizePresets()
  const title = design.title || 'Untitled design'

  return (
    <article className={styles.card} data-layout={layout} data-selected={selected || undefined} data-selecting={selectionActive || undefined} draggable={!renaming} onDragStart={(event) => setDraggedDesigns(event, dragIds())}>
      <div className={styles.thumbWrap}>
        <Link to={`/design/${design.id}`} className={styles.thumbLink} aria-hidden="true" tabIndex={-1}>
          <Thumbnail src={design.thumbnail_url} alt="" aspect={layout === 'list' ? 1.4 : 4 / 3} fit="contain" page={design} className={styles.thumb} />
        </Link>
        <div className={styles.select}>
          <Checkbox aria-label={`Select ${title}`} checked={selected} onChange={(event) => onSelectChange(event.target.checked)} />
        </div>
        <div className={styles.quick}>
          <IconButton
            size="sm"
            variant="secondary"
            label={design.starred ? `Remove ${title} from starred` : `Star ${title}`}
            pressed={design.starred}
            icon={<Star size={16} fill={design.starred ? 'currentColor' : 'none'} />}
            className={styles.star}
            onClick={() => actions.toggleStar(design)}
          />
        </div>
      </div>
      <div className={styles.info}>
        {renaming ? (
          <InlineRename
            value={design.title}
            label={`Rename ${title}`}
            onCommit={(next) => {
              setRenaming(false)
              actions.rename(design, next)
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <Link to={`/design/${design.id}`} className={styles.title} title={title}>
            {title}
          </Link>
        )}
        <p className={styles.meta}>
          {designKind(design, catalogue)} · {formatRelative(design.updated_at)}
          <span className={styles.extra}>
            {getPreset(design.preset, catalogue) ? ` · ${design.width} × ${design.height}` : ''}
            {design.page_count > 1 ? ` · ${design.page_count} pages` : ''}
          </span>
        </p>
      </div>
      <div className={styles.menu}>
        <Menu label={`Actions for ${title}`} placement="bottom-end" trigger={<IconButton size="sm" label={`More actions for ${title}`} icon={<MoreHorizontal size={18} />} />}>
          <MenuItem icon={<ExternalLink size={16} />} onSelect={() => actions.open(design)}>
            {msg("Open")}</MenuItem>
          <MenuItem icon={<Pencil size={16} />} onSelect={() => setRenaming(true)}>
            {msg("Rename")}</MenuItem>
          <MenuItem icon={<Copy size={16} />} onSelect={() => actions.duplicate(design)}>
            {msg("Duplicate")}</MenuItem>
          <MenuItem icon={<Star size={16} />} onSelect={() => actions.toggleStar(design)}>
            {design.starred ? 'Remove star' : 'Star'}
          </MenuItem>
          <MenuItem icon={<FolderInput size={16} />} onSelect={() => onMoveRequest(design)}>
            {msg("Move to folder…")}</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 size={16} />} danger onSelect={() => actions.trash(design)}>
            {msg("Move to trash")}</MenuItem>
        </Menu>
      </div>
    </article>
  )
}
