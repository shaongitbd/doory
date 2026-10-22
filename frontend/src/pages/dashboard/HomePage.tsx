import { ArrowRight, LayoutGrid } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LazyCreateDesignDialog } from '@/features/create/LazyCreateDesignDialog'
import { DesignTile } from '@/features/dashboard/DesignTile'
import bunny from '@/assets/bunny-sticker.webp'
import { createUrl, presetParts } from '@/features/presets'
import { useSizePresets } from '@/lib/sizePresets'
import { noteUsedSize, useSizeChoices, yourSizes } from '@/lib/sizePresets/choices'
import { TemplateCard } from '@/features/templates/TemplateCard'
import { useDesignsList, useTemplatesList } from '@/lib/api/hooks'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button, EmptyState, Skeleton } from '@/ui'
import styles from './pageStyles.module.css'
import homeStyles from './HomePage.module.css'

function TileSkeletons({ count }: { count: number }) {
  return (
    <ul className={styles.grid} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={styles.skeletonCard}>
          <Skeleton height="10rem" radius="var(--radius-lg)" />
          <Skeleton width="60%" height={16} />
        </li>
      ))}
    </ul>
  )
}

export default function HomePage() {
  const catalogue = useSizePresets()
  const choices = useSizeChoices()
  const [allSizes, setAllSizes] = useState(false)
  usePageTitle('Home')
  const recent = useDesignsList({ ordering: '-updated_at', page_size: 8 })
  const starred = useDesignsList({ starred: true, ordering: '-updated_at', page_size: 4 })
  const templates = useTemplatesList({ page_size: 8 })
  const recentItems = recent.data?.pages[0]?.results ?? []
  const starredItems = starred.data?.pages[0]?.results ?? []
  const templateItems = templates.data?.pages[0]?.results ?? []

  return (
    <div className={styles.page}>
      <section aria-labelledby="quick-create" className={homeStyles.hero}>
        <div className={homeStyles.heroHead}>
          <h1 id="quick-create" className={homeStyles.heroTitle}>
            Create a design
          </h1>
          <div className={homeStyles.heroLinks}>
            <Link to="/create">Custom size</Link>
            <Link to="/dashboard/templates">Start from a template</Link>
          </div>
        </div>
        <ul className={homeStyles.chips}>
          {yourSizes(catalogue, choices).map((preset) => {
            const { name, detail } = presetParts(preset)
            const wide = preset.width >= preset.height
            return (
              <li key={preset.id}>
                <Link to={createUrl({ presetId: preset.id })} className={homeStyles.chip} onClick={() => noteUsedSize(preset.id)}>
                  <span className={homeStyles.shapeBox} aria-hidden="true">
                    <span className={homeStyles.shape} style={{ aspectRatio: `${preset.width} / ${preset.height}`, ...(wide ? { width: '100%' } : { height: '100%' }) }} />
                  </span>
                  <span className={homeStyles.chipName}>{name}</span>
                  <span className={homeStyles.chipSize}>{detail}</span>
                </Link>
              </li>
            )
          })}
          <li>
            <button type="button" className={`${homeStyles.chip} ${homeStyles.allSizes}`} onClick={() => setAllSizes(true)}>
              <span className={homeStyles.shapeBox} aria-hidden="true">
                <LayoutGrid size={24} />
              </span>
              <span className={homeStyles.chipName}>All sizes</span>
              <span className={homeStyles.chipSize}>{catalogue.presets.length} sizes</span>
            </button>
          </li>
        </ul>
        <LazyCreateDesignDialog open={allSizes} onClose={() => setAllSizes(false)} />
        <img className={homeStyles.bunny} src={bunny} alt="" width={523} height={713} draggable={false} />
      </section>

      <section aria-labelledby="recent" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 id="recent" className={styles.sectionTitle}>
            Recent designs
          </h2>
          <Link to="/dashboard/designs">View all</Link>
        </div>
        {recent.isPending ? (
          <TileSkeletons count={4} />
        ) : recent.isError ? (
          <EmptyState compact title="Your designs didn’t load" role="alert" action={<Button onClick={() => void recent.refetch()}>Try again</Button>} />
        ) : recentItems.length === 0 ? (
          <p className={homeStyles.none}>Designs you make show up here.</p>
        ) : (
          <ul className={`${styles.grid} ${styles.row}`}>
            {recentItems.map((design) => (
              <li key={design.id}>
                <DesignTile design={design} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {starredItems.length > 0 ? (
        <section aria-labelledby="starred" className={styles.section}>
          <h2 id="starred" className={styles.sectionTitle}>
            Starred
          </h2>
          <ul className={styles.grid}>
            {starredItems.map((design) => (
              <li key={design.id}>
                <DesignTile design={design} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {templateItems.length > 0 ? (
        <section aria-labelledby="start-template" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 id="start-template" className={styles.sectionTitle}>
              Start from a template
            </h2>
            <Link to="/dashboard/templates" className={homeStyles.more}>
              Browse templates <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <ul className={`${styles.grid} ${styles.row}`}>
            {templateItems.map((template) => (
              <li key={template.id}>
                <TemplateCard template={template} frame={4 / 3} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
