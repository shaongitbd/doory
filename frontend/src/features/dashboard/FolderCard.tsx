import { msg } from '@/i18n/catalog'
import { Folder, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { FolderT } from '@/types/api'
import { IconButton, Menu, MenuItem } from '@/ui'
import { hasDraggedDesigns, readDraggedDesigns } from './dragDrop'
import { InlineRename } from './InlineRename'
import styles from './FolderCard.module.css'

export interface FolderCardProps {
  folder: FolderT
  onRename(folder: FolderT, name: string): void
  onDelete(folder: FolderT): void
  onDropDesigns(folder: FolderT, ids: string[]): void
}

/** A folder tile: opens the folder and accepts designs dragged onto it. */
export function FolderCard({ folder, onRename, onDelete, onDropDesigns }: FolderCardProps) {
  const [renaming, setRenaming] = useState(false)
  const [over, setOver] = useState(false)

  return (
    <div
      className={styles.card}
      data-over={over || undefined}
      onDragOver={(event) => {
        if (!hasDraggedDesigns(event.dataTransfer)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false)
        const ids = readDraggedDesigns(event.dataTransfer)
        if (ids.length === 0) return
        event.preventDefault()
        onDropDesigns(folder, ids)
      }}
    >
      <Folder size={22} className={styles.icon} aria-hidden="true" />
      <div className={styles.text}>
        {renaming ? (
          <InlineRename
            value={folder.name}
            label={`Rename folder ${folder.name}`}
            maxLength={80}
            onCommit={(next) => {
              setRenaming(false)
              if (next.trim() && next.trim() !== folder.name) onRename(folder, next.trim())
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <Link to={`/dashboard/designs/folder/${folder.id}`} className={styles.name}>
            {folder.name}
          </Link>
        )}
        <span className={styles.count}>
          {folder.design_count} {folder.design_count === 1 ? 'design' : 'designs'}
        </span>
      </div>
      <Menu label={`Actions for folder ${folder.name}`} placement="bottom-end" trigger={<IconButton size="sm" label={`More actions for folder ${folder.name}`} icon={<MoreHorizontal size={18} />} />}>
        <MenuItem icon={<Pencil size={16} />} onSelect={() => setRenaming(true)}>
          {msg("Rename")}</MenuItem>
        <MenuItem icon={<Trash2 size={16} />} danger onSelect={() => onDelete(folder)}>
          {msg("Delete folder")}</MenuItem>
      </Menu>
    </div>
  )
}
