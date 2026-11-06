import { msg } from '@/i18n/catalog'
import { Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { designKind } from '@/features/presets'
import { useSizePresets } from '@/lib/sizePresets'
import { formatRelative } from '@/lib/time'
import type { DesignSummary } from '@/types/api'
import { Thumbnail } from '@/ui'
import styles from './DesignTile.module.css'

/** Compact, read-only design link used on the dashboard home. */
export function DesignTile({ design }: { design: DesignSummary }) {
  const title = design.title || 'Untitled design'
  const catalogue = useSizePresets()
  return (
    <Link to={`/design/${design.id}`} className={styles.tile}>
      <Thumbnail src={design.thumbnail_url} alt="" aspect={4 / 3} fit="contain" page={design} className={styles.thumb} />
      <span className={styles.title}>
        {title}
        {design.starred ? <Star size={14} fill="currentColor" className={styles.star} aria-label={msg("Starred")} /> : null}
      </span>
      <span className={styles.meta}>
        {designKind(design, catalogue)} · {formatRelative(design.updated_at)}
      </span>
    </Link>
  )
}
