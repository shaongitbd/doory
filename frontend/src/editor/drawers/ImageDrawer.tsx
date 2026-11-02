import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { AssetRef } from '@/types/adapter'
import type { Asset } from '@/types/api'
import { I } from '../chrome/icons'
import { useEditor, useEditorState, useEditorStateShallow } from '../context'
import { imageFilesFrom } from '../engine/files'
import { useAsyncList } from '../hooks/useAsyncList'
import { useResolvedSrc } from '../hooks/useResolvedSrc'
import type { PanelProps } from '../panels/registry'
import { t } from '../strings'
import { loadable } from '../ui/loadable'
import { Skeleton } from '../ui/Skeleton'
import ed from '../chrome/ed.module.css'
import styles from './Drawers.module.css'
import { beginImageAssetDrag, endImageAssetDrag } from './imageAssetDrag'
import { uploadToLibrary } from './uploads'

function toRef(a: Asset): AssetRef {
  return { id: a.id, url: a.url, thumbUrl: a.thumb_url, width: a.width, height: a.height, name: a.name, kind: a.kind }
}

function Thumb({ asset, onPlace, onDelete }: { asset: AssetRef; onPlace: () => void; onDelete?: () => void }) {
  const url = useResolvedSrc(asset.thumbUrl || asset.url)
  const draggable = asset.kind === 'image' || asset.kind === 'svg'
  return (
    <div className={styles.thumbRow}>
      <button
        type="button"
        className={ed.uploadedThumb}
        data-testid="uploaded-thumb"
        draggable={draggable}
        onClick={onPlace}
        onDragStart={(event) => {
          if (!beginImageAssetDrag(event.dataTransfer, asset)) event.preventDefault()
        }}
        onDragEnd={endImageAssetDrag}
      >
        {url ? <img src={url} alt="" draggable={false} /> : <Skeleton width={40} height={40} radius={5} />}
        <span className={ed.uploadedName}>{asset.name}</span>
      </button>
      {onDelete ? (
        <button type="button" className={styles.thumbDelete} aria-label={t.imageDrawer.remove(asset.name)} title={t.imageDrawer.remove(asset.name)} onClick={onDelete}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

/** Uploads tab: the "Upload photo" zone and the list of images, plus drag and drop and delete. */
function UploadsTab({ close }: PanelProps) {
  const editor = useEditor()
  const session = useEditorStateShallow((s) => s.uploads)
  const uploading = useEditorState((s) => s.uploading)
  const library = useAsyncList<Asset>((page) => editor.adapter.services.assets.list({ page, page_size: 20 }), 'library')
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [over, setOver] = useState(false)
  const [failed, setFailed] = useState(false)

  const sessionIds = new Set(session.map((u) => u.id))
  const images: AssetRef[] = [...session, ...library.items.filter((a) => !sessionIds.has(a.id)).map(toRef)].filter((a) => !removed.has(a.id))

  const place = (asset: AssetRef): void => {
    void editor.insert.imageFromAsset(asset)
    close()
  }
  const remove = async (asset: AssetRef): Promise<void> => {
    setFailed(false)
    try {
      await editor.adapter.services.assets.remove(asset.id)
      setRemoved((cur) => new Set(cur).add(asset.id))
      editor.toast(t.imageDrawer.removed, 'info')
    } catch {
      setFailed(true)
    }
  }
  const onDrop = (e: React.DragEvent): void => {
    setOver(false)
    const files = imageFilesFrom(e.dataTransfer)
    if (files.length === 0) return
    e.preventDefault()
    void uploadToLibrary(editor, files)
  }

  return (
    <>
      <p className={ed.sectionTitle}>{t.drawers.uploadPhoto}</p>
      <button
        type="button"
        className={ed.uploadZone}
        data-testid="upload-zone"
        data-over={over || undefined}
        onClick={() => void editor.insert.pickAndUpload()}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {I.upload}
        <div>{t.drawers.clickToUpload}</div>
        <small>{t.imageDrawer.dropHere}</small>
      </button>
      {uploading > 0 ? (
        <div className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          {t.imageDrawer.uploading(uploading)}
        </div>
      ) : null}
      {failed ? (
        <p className={styles.error} role="alert">
          {t.imageDrawer.removeFailed}
        </p>
      ) : null}
      {images.length > 0 ? (
        <>
          <p className={ed.sectionTitle} style={{ marginTop: 16 }}>
            {t.drawers.yourImages}
          </p>
          {images.map((img) => (
            <Thumb key={img.id} asset={img} onPlace={() => place(img)} onDelete={library.items.some((a) => a.id === img.id) || sessionIds.has(img.id) ? () => void remove(img) : undefined} />
          ))}
        </>
      ) : null}
      {library.error && images.length === 0 ? (
        <p className={styles.error} role="alert">
          {t.imageDrawer.libraryFailed}
        </p>
      ) : null}
      {library.hasMore && library.items.length > 0 ? (
        <button type="button" className={`${ed.btn} ${ed.ghost}`} style={{ width: '100%', marginTop: 8 }} onClick={library.loadMore} disabled={library.loading}>
          {t.imageDrawer.loadMore}
        </button>
      ) : null}
      {!library.loading && !library.error && images.length === 0 ? <p className={styles.note}>{t.imageDrawer.noImages}</p> : null}
    </>
  )
}

const StockTab = loadable(() => import('./StockTab').then((m) => m.StockTab))
const GridTab = loadable(() => import('./GridTab').then((m) => m.GridTab))

/** Image drawer: uploaded photos, image-grid layouts, and stock photos when the server offers them. */
export function ImageDrawer(props: PanelProps) {
  const editor = useEditor()
  const hasStock = editor.adapter.services.stock !== null
  const [tab, setTab] = useState<'uploads' | 'grids' | 'stock'>('uploads')
  const moveBetweenTabs = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const tabs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (current < 0) return
    e.preventDefault()
    const offset = e.key === 'ArrowRight' ? 1 : -1
    const next = tabs[(current + offset + tabs.length) % tabs.length]
    next?.focus()
    next?.click()
  }
  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label={t.imageDrawer.tabs} onKeyDown={moveBetweenTabs}>
        <button
          type="button"
          id="image-tab-uploads"
          role="tab"
          className={styles.tab}
          aria-controls="image-panel-uploads"
          aria-selected={tab === 'uploads'}
          tabIndex={tab === 'uploads' ? 0 : -1}
          data-testid="image-tab-uploads"
          onClick={() => setTab('uploads')}
        >
          {t.imageDrawer.uploads}
        </button>
        <button
          type="button"
          id="image-tab-grids"
          role="tab"
          className={styles.tab}
          aria-controls="image-panel-grids"
          aria-selected={tab === 'grids'}
          tabIndex={tab === 'grids' ? 0 : -1}
          data-testid="image-tab-grids"
          onClick={() => setTab('grids')}
        >
          {t.imageDrawer.grids}
        </button>
        {hasStock ? (
          <button
            type="button"
            id="image-tab-stock"
            role="tab"
            className={styles.tab}
            aria-controls="image-panel-stock"
            aria-selected={tab === 'stock'}
            tabIndex={tab === 'stock' ? 0 : -1}
            data-testid="image-tab-stock"
            onClick={() => setTab('stock')}
          >
            {t.imageDrawer.stock}
          </button>
        ) : null}
      </div>
      {tab === 'uploads' ? (
        <div id="image-panel-uploads" role="tabpanel" aria-labelledby="image-tab-uploads">
          <UploadsTab {...props} />
        </div>
      ) : null}
      {tab === 'grids' ? (
        <div id="image-panel-grids" role="tabpanel" aria-labelledby="image-tab-grids">
          <GridTab {...props} />
        </div>
      ) : null}
      {tab === 'stock' && hasStock ? (
        <div id="image-panel-stock" role="tabpanel" aria-labelledby="image-tab-stock">
          <StockTab {...props} />
        </div>
      ) : null}
    </>
  )
}
