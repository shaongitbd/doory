/**
 * The Videos tool's Uploads tab: the upload zone (click or drop), the files going up with their progress, and the
 * person's clips. A clip the server is still converting shows "Preparing…" and is asked about again until it is
 * ready; a clip that just went up ready is added to the page at once.
 */
import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { isApiError } from '@/lib/api'
import type { AssetRef, VideoService } from '@/types/adapter'
import type { VideoInfo } from '@/types/api'
import { I } from '../chrome/icons'
import { VIDEO_ACCEPT, looksLikeVideo, megabytes, videoFilesFrom, videoUploads, whenProcessed } from '../clips/assets'
import { formatClipTime } from '../clips/strings'
import { useEditor } from '../context'
import { useAsyncList } from '../hooks/useAsyncList'
import { useResolvedSrc } from '../hooks/useResolvedSrc'
import type { PanelProps } from './registry'
import { t } from '../strings'
import { Skeleton } from '../ui/Skeleton'
import ed from '../chrome/ed.module.css'
import drawer from '../drawers/Drawers.module.css'
import styles from './Videos.module.css'

const s = t.clips.uploads

export function ClipTile({ clip, onPick, onRemove, busy }: { clip: AssetRef; onPick: () => void; onRemove?: () => void; busy?: boolean }) {
  const thumb = useResolvedSrc(clip.thumbUrl || clip.video?.posterUrl || '')
  const status = clip.video?.status ?? 'ready'
  return (
    <div className={styles.tile}>
      <button
        type="button"
        className={styles.clip}
        data-status={status}
        data-testid="video-upload"
        aria-label={s.add(clip.name)}
        title={status === 'processing' ? s.processingHint : status === 'failed' ? clip.video?.error || s.failed : clip.name}
        disabled={busy || status !== 'ready'}
        onClick={onPick}
      >
        {thumb ? <img src={thumb} alt="" loading="lazy" draggable={false} /> : null}
        {status === 'ready' && clip.video ? <span className={styles.length}>{formatClipTime(clip.video.durationMs)}</span> : null}
        {status === 'processing' ? (
          <span className={styles.state} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            {s.processing}
          </span>
        ) : null}
        {status === 'failed' ? <span className={styles.state}>{s.failed}</span> : null}
      </button>
      <span className={styles.name}>{clip.name}</span>
      {onRemove ? (
        <button type="button" className={styles.remove} aria-label={s.remove(clip.name)} title={s.remove(clip.name)} onClick={onRemove}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

export function VideoUploadsTab({ close, service, info }: PanelProps & { service: VideoService; info: VideoInfo }) {
  const editor = useEditor()
  const library = useAsyncList<AssetRef>((page) => service.list(page), 'videos')
  const [added, setAdded] = useState<AssetRef[]>([])
  const [fresh, setFresh] = useState<ReadonlyMap<string, AssetRef>>(new Map())
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  // Files going up carry on when the tool closes (they are the editor's), and show here again when it opens.
  const uploads = videoUploads(service)
  const sending = useSyncExternalStore(uploads.subscribe, uploads.getSnapshot)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const following = useRef(new Set<string>())
  const alive = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    alive.current = controller
    return () => controller.abort()
  }, [])

  const addedIds = new Set(added.map((a) => a.id))
  const clips = [...added, ...library.items.filter((a) => !addedIds.has(a.id))].filter((a) => !removed.has(a.id)).map((a) => fresh.get(a.id) ?? a)

  // Follow every clip the server is still converting until it is ready (or failed).
  const processing = clips.filter((c) => c.video?.status === 'processing').map((c) => c.id).join(',')
  useEffect(() => {
    for (const clip of clips) {
      if (clip.video?.status !== 'processing' || following.current.has(clip.id)) continue
      following.current.add(clip.id)
      whenProcessed(service, clip, alive.current.signal)
        .then((done) => setFresh((cur) => new Map(cur).set(done.id, done)))
        .catch(() => undefined)
        .finally(() => following.current.delete(clip.id))
    }
    // `clips` is rebuilt on every render; the ids of the ones processing are what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, service])

  const place = (clip: AssetRef): void => {
    void editor.videos.use(clip)
    close()
  }

  const upload = async (files: readonly File[]): Promise<void> => {
    setError(null)
    for (const file of files) {
      if (!looksLikeVideo(file)) {
        setError(s.notVideo(file.name))
        continue
      }
      if (file.size > info.max_upload_bytes) {
        setError(s.tooLarge(file.name, megabytes(info.max_upload_bytes)))
        continue
      }
      try {
        const ref = await uploads.send(file)
        setAdded((cur) => [ref, ...cur.filter((a) => a.id !== ref.id)])
        if (ref.video?.status === 'ready') await editor.videos.use(ref)
      } catch (err) {
        const message = isApiError(err) && err.message ? err.message : s.uploadFailed(file.name)
        // Closed meanwhile: the tool can't show it, so it is said where the rest of the editor's notices are.
        if (alive.current.signal.aborted) editor.toast(message, 'error')
        else setError(message)
      }
    }
  }

  const remove = async (clip: AssetRef): Promise<void> => {
    setError(null)
    try {
      await editor.adapter.services.assets.remove(clip.id)
      setRemoved((cur) => new Set(cur).add(clip.id))
      editor.toast(s.removed, 'info')
    } catch {
      setError(s.removeFailed)
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={VIDEO_ACCEPT}
        multiple
        hidden
        data-testid="video-file-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          void upload(files)
        }}
      />
      <button
        type="button"
        className={ed.uploadZone}
        data-testid="video-upload-zone"
        data-over={over || undefined}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false)
          const files = videoFilesFrom(e.dataTransfer)
          if (files.length === 0) return
          e.preventDefault()
          void upload(files)
        }}
      >
        {I.upload}
        <div>{s.zone}</div>
        <small>{s.zoneHint(megabytes(info.max_upload_bytes))}</small>
      </button>
      {sending.map((x) => (
        <div key={x.key} className={styles.progress} role="status">
          <span>{s.uploading(x.name, Math.round(x.fraction * 100))}</span>
          <span className={styles.bar} aria-hidden="true">
            <span style={{ width: `${Math.round(x.fraction * 100)}%` }} />
          </span>
        </div>
      ))}
      {error ? (
        <p className={drawer.error} role="alert">
          {error}
        </p>
      ) : null}
      {clips.length > 0 ? (
        <>
          <p className={ed.sectionTitle} style={{ marginTop: 16 }}>
            {s.yours}
          </p>
          <div className={styles.grid}>
            {clips.map((clip) => (
              <ClipTile key={clip.id} clip={clip} onPick={() => place(clip)} onRemove={() => void remove(clip)} />
            ))}
          </div>
        </>
      ) : null}
      {library.loading && clips.length === 0 ? (
        <div className={styles.grid} aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height="auto" radius={8} style={{ aspectRatio: '16 / 9' }} />
          ))}
        </div>
      ) : null}
      {library.error && clips.length === 0 ? (
        <p className={drawer.error} role="alert">
          {s.listFailed}
        </p>
      ) : null}
      {library.hasMore && library.items.length > 0 ? (
        <button type="button" className={`${ed.btn} ${ed.ghost}`} style={{ width: '100%', marginTop: 8 }} onClick={library.loadMore} disabled={library.loading}>
          {s.loadMore}
        </button>
      ) : null}
      {!library.loading && !library.error && clips.length === 0 && sending.length === 0 ? <p className={drawer.note}>{s.none}</p> : null}
    </>
  )
}
