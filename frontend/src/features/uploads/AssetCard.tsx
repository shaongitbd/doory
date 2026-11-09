import { msg } from '@/i18n/catalog'
import { MoreHorizontal, Pencil, Tag, Trash2 } from 'lucide-react'
import { formatBytes } from '@/lib/time'
import type { Asset } from '@/types/api'
import { Badge, IconButton, Menu, MenuItem, Thumbnail } from '@/ui'
import styles from './AssetCard.module.css'

export interface AssetCardProps {
  asset: Asset
  onEdit(asset: Asset): void
  onDelete(asset: Asset): void
}

export function AssetCard({ asset, onEdit, onDelete }: AssetCardProps) {
  return (
    <article className={styles.card}>
      <Thumbnail src={asset.thumb_url || asset.url} alt={`${asset.name} preview`} aspect={1} fit="contain" className={styles.thumb} />
      <div className={styles.info}>
        <p className={styles.name} title={asset.name}>
          {asset.name}
        </p>
        <p className={styles.meta}>
          {asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : ''}
          {formatBytes(asset.size)}
          {asset.kind === 'svg' ? ' · SVG' : ''}
        </p>
        {asset.tags.length > 0 ? (
          <ul className={styles.tags} aria-label={msg("Tags")}>
            {asset.tags.slice(0, 3).map((tag) => (
              <li key={tag}>
                <Badge>{tag}</Badge>
              </li>
            ))}
            {asset.tags.length > 3 ? <li><Badge>+{asset.tags.length - 3}</Badge></li> : null}
          </ul>
        ) : null}
      </div>
      <div className={styles.menu}>
        <Menu label={`Actions for ${asset.name}`} placement="bottom-end" trigger={<IconButton size="sm" variant="secondary" label={`More actions for ${asset.name}`} icon={<MoreHorizontal size={18} />} />}>
          <MenuItem icon={<Pencil size={16} />} onSelect={() => onEdit(asset)}>
            {msg("Rename")}</MenuItem>
          <MenuItem icon={<Tag size={16} />} onSelect={() => onEdit(asset)}>
            {msg("Edit tags")}</MenuItem>
          <MenuItem icon={<Trash2 size={16} />} danger onSelect={() => onDelete(asset)}>
            {msg("Delete")}</MenuItem>
        </Menu>
      </div>
    </article>
  )
}
