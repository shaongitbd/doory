import { msg } from '@/i18n/catalog'
import { Search, Upload } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/features/dashboard/errorMessage'
import { AssetCard } from '@/features/uploads/AssetCard'
import { EditAssetDialog } from '@/features/uploads/EditAssetDialog'
import { UploadDropzone } from '@/features/uploads/UploadDropzone'
import { UsageMeter } from '@/features/uploads/UsageMeter'
import { useUploadQueue } from '@/features/uploads/useUploadQueue'
import { flattenPages, useAssetsList, useDeleteAsset, useUpdateAsset } from '@/lib/api/hooks'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { usePageTitle } from '@/lib/usePageTitle'
import type { Asset, AssetKind } from '@/types/api'
import { Button, ConfirmDialog, EmptyState, Input, SegmentedControl, Skeleton, useToast } from '@/ui'
import styles from './pageStyles.module.css'
import uploadStyles from './UploadsPage.module.css'

type Filter = 'all' | AssetKind

export default function UploadsPage() {
  usePageTitle(msg("Uploads"))
  const { config } = useAuth()
  const { toast } = useToast()
  const { queue, items } = useUploadQueue(config.limits.max_upload_bytes)
  const [text, setText] = useState('')
  const q = useDebouncedValue(text.trim(), 300)
  const [filter, setFilter] = useState<Filter>('all')
  const list = useAssetsList({ q: q || undefined, kind: filter === 'all' ? undefined : filter, ordering: '-created_at' })
  const assets = flattenPages(list.data)
  const update = useUpdateAsset()
  const remove = useDeleteAsset()
  const [editing, setEditing] = useState<Asset | null>(null)
  const [deleting, setDeleting] = useState<Asset | null>(null)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{msg("Uploads")}</h1>
          <p className={styles.lead}>{msg("Your images and logos, ready to drop into any design.")}</p>
        </div>
        <UsageMeter />
      </header>

      <UploadDropzone queue={queue} items={items} maxBytes={config.limits.max_upload_bytes} />

      <section aria-labelledby="library" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 id="library" className={styles.sectionTitle}>
            {msg("Library")}</h2>
          <div className={styles.tools}>
            <Input label={msg("Search uploads")} hideLabel type="search" placeholder={msg("Search uploads")} leftIcon={<Search size={16} />} value={text} onChange={(event) => setText(event.target.value)} />
            <SegmentedControl
              label={msg("Type")}
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: msg("All") },
                { value: 'image', label: msg("Images") },
                { value: 'svg', label: 'SVG' },
              ]}
            />
          </div>
        </div>

        <div aria-live="polite" aria-busy={list.isPending}>
          {list.isPending ? (
            <ul className={uploadStyles.grid} aria-label={msg("Loading uploads")}>
              {Array.from({ length: 8 }, (_, index) => (
                <li key={index}>
                  <Skeleton height="12rem" radius="var(--radius-lg)" />
                </li>
              ))}
            </ul>
          ) : list.isError ? (
            <EmptyState title={msg("Your uploads didn’t load")} description={errorMessage(list.error, 'Check your connection and try again.')} role="alert" action={<Button onClick={() => void list.refetch()}>{msg("Try again")}</Button>} />
          ) : assets.length === 0 ? (
            q || filter !== 'all' ? (
              <EmptyState icon={<Search size={28} />} title={msg("No uploads match")} description={msg("Try another search or filter.")} />
            ) : (
              <EmptyState icon={<Upload size={28} />} title={msg("No uploads yet")} description={msg("Drop images above to build your library. They’ll show up in the editor’s Images panel too.")} />
            )
          ) : (
            <ul className={uploadStyles.grid}>
              {assets.map((asset) => (
                <li key={asset.id}>
                  <AssetCard asset={asset} onEdit={setEditing} onDelete={setDeleting} />
                </li>
              ))}
            </ul>
          )}
          {list.hasNextPage ? (
            <div className={styles.more}>
              <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                {msg("Load more")}</Button>
            </div>
          ) : null}
        </div>
      </section>

      <EditAssetDialog
        asset={editing}
        busy={update.isPending}
        onClose={() => setEditing(null)}
        onSave={(input) =>
          editing &&
          update.mutate(
            { id: editing.id, ...input },
            {
              onSuccess: () => {
                setEditing(null)
                toast({ title: msg("Upload updated"), variant: 'success' })
              },
              onError: (error) => toast({ title: msg("Couldn’t save changes"), description: errorMessage(error), variant: 'error' }),
            },
          )
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ''}”?`}
        description={msg("The file is removed from your account. Designs that still use this image will no longer show it.")}
        confirmLabel="Delete image"
        tone="danger"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null)
              toast({ title: msg("Image deleted") })
            },
            onError: (error) => toast({ title: msg("Couldn’t delete the image"), description: errorMessage(error), variant: 'error' }),
          })
        }}
      />
    </div>
  )
}
