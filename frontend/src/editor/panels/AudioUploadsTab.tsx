/**
 * The Uploads tab: bring an audio file (the picker or drag and drop), see the files you have uploaded or recorded, play
 * them, add them to the design or delete them. A guest's files stay in the browser (IndexedDB) until the design is saved
 * to an account; a signed-in person's go to the server like pictures.
 */
import { Pause, Play, Plus, Trash2, Upload } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import type { AssetRef } from '@/types/adapter'
import type { Asset } from '@/types/api'
import { useEditor, useEditorState } from '../context'
import { useAsyncList } from '../hooks/useAsyncList'
import { formatSeconds } from '../animation/timelineMath'
import { AUDIO_ACCEPT, audioFilesFrom } from '../audio/files'
import { audioRuntime, usePreview } from '../audio/runtime'
import { uploadsOf, useUploads } from '../audio/uploads'
import { t } from '../strings'
import { audioErrorMessage } from '../audio/messages'
import { Button, IconButton } from '../ui/Button'
import styles from './Audio.module.css'

const formatBytes = (n: number): string => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

interface Item {
  ref: AssetRef
  durationMs: number | null
  size: number
}

function fromAsset(a: Asset): Item {
  return { ref: { id: a.id, url: a.url, thumbUrl: '', width: 0, height: 0, name: a.name, kind: 'audio' }, durationMs: a.duration_ms ?? null, size: a.size }
}

function UploadRow({ item, used, canWrite, onAdd, onRemove }: { item: Item; used: boolean; canWrite: boolean; onAdd(scope: 'design' | 'page'): void; onRemove(): void }) {
  const editor = useEditor()
  const { previewer } = audioRuntime(editor)
  const preview = usePreview()
  const key = `up:${item.ref.id}`
  const playing = preview.key === key && preview.status === 'playing'
  return (
    <li className={styles.row} data-kind="upload" data-testid={`audio-upload-${item.ref.id}`}>
      <IconButton
        label={playing ? t.audio.library.pause(item.ref.name) : t.audio.library.preview(item.ref.name)}
        variant="soft"
        className={styles.rowPlay}
        tooltip={false}
        pressed={playing}
        data-testid="audio-upload-play"
        onClick={() => void previewer.toggle(key, () => editor.assets.resolve(item.ref.url), { durationMs: item.durationMs ?? 0 })}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </IconButton>
      <div className={styles.rowBody}>
        <div className={styles.rowTitle}>
          <span className={styles.rowName}>{item.ref.name}</span>
          <span className={styles.rowMeta}>
            {[item.durationMs ? formatSeconds(item.durationMs) : '', formatBytes(item.size), used ? t.audio.uploads.inUse : ''].filter(Boolean).join(' · ')}
          </span>
        </div>
        {preview.key === key && preview.error ? (
          <p className={styles.warn} role="alert">
            {t.audio.library.previewFailed}
          </p>
        ) : null}
      </div>
      {canWrite ? (
        <div className={styles.rowActions}>
          <Button size="sm" variant="soft" icon={<Plus size={13} aria-hidden="true" />} aria-label={t.audio.uploads.addLabel(item.ref.name)} data-testid="audio-upload-add-design" onClick={() => onAdd('design')}>
            {t.audio.library.addToDesign}
          </Button>
          <Button size="sm" data-testid="audio-upload-add-page" onClick={() => onAdd('page')}>
            {t.audio.library.addToPage}
          </Button>
          <IconButton label={t.audio.uploads.remove(item.ref.name)} size="sm" disabled={used} className={styles.rowDelete} data-testid="audio-upload-delete" onClick={onRemove}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      ) : null}
    </li>
  )
}

export function AudioUploadsTab() {
  const editor = useEditor()
  const readOnly = useEditorState((s) => s.readOnly)
  const mode = useEditorState((s) => s.mode)
  const tracks = useEditorState((s) => s.doc.audioTracks)
  const store = uploadsOf(editor)
  const session = useUploads()
  const input = useRef<HTMLInputElement>(null)
  const zoneId = useId()
  const [over, setOver] = useState(false)
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [problem, setProblem] = useState<string | null>(null)
  const list = useAsyncList<Asset>((page) => editor.adapter.services.assets.list({ kind: 'audio', page, page_size: 20 }), 'audio-uploads')

  const items = useMemo<Item[]>(() => {
    const ids = new Set(session.items.map((i) => i.ref.id))
    const mine: Item[] = session.items.map((i) => ({ ref: i.ref, durationMs: i.durationMs, size: i.size }))
    return [...mine, ...list.items.filter((a) => !ids.has(a.id)).map(fromAsset)].filter((i) => !removed.has(i.ref.id))
  }, [session.items, list.items, removed])
  const usedIds = useMemo(() => new Set((tracks ?? []).flatMap((track) => [track.assetId, track.src].filter((v): v is string => !!v))), [tracks])

  const upload = async (files: readonly File[]): Promise<void> => {
    setProblem(null)
    for (const file of files) {
      store.begin(file.name)
      try {
        const { ref, durationMs } = await editor.audio.upload(file)
        store.add({ ref, durationMs, size: file.size })
      } catch (error) {
        setProblem(audioErrorMessage(error, t.audio.errors.upload))
      } finally {
        store.end()
      }
    }
  }

  const add = (item: Item, scope: 'design' | 'page'): void => {
    const target = scope === 'design' ? ({ type: 'design' } as const) : ({ type: 'page', pageId: editor.state.activePageId } as const)
    void (async () => {
      try {
        const durationMs = item.durationMs ?? (await editor.audio.measure(item.ref))
        editor.audio.addFromAsset(item.ref, 'upload', durationMs, target)
      } catch (error) {
        editor.toast(audioErrorMessage(error, t.audio.errors.unreadable), 'error')
      }
    })()
  }

  const remove = async (item: Item): Promise<void> => {
    setProblem(null)
    try {
      await editor.adapter.services.assets.remove(item.ref.id)
      store.remove(item.ref.id)
      setRemoved((cur) => new Set(cur).add(item.ref.id))
      editor.toast(t.audio.uploads.removed, 'info')
    } catch {
      setProblem(t.audio.uploads.removeFailed)
    }
  }

  return (
    <div className={styles.tab} data-testid="audio-uploads">
      {readOnly ? null : (
        <>
          <button
            type="button"
            id={zoneId}
            className={styles.dropZone}
            data-over={over || undefined}
            data-testid="audio-upload-zone"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('Files')) return
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              setOver(false)
              const files = audioFilesFrom(e.dataTransfer)
              if (files.length === 0) return
              e.preventDefault()
              void upload(files)
            }}
          >
            <Upload size={20} aria-hidden="true" />
            <span>{t.audio.uploads.drop}</span>
            <small>{t.audio.uploads.hint}</small>
          </button>
          <input
            ref={input}
            type="file"
            hidden
            multiple
            accept={AUDIO_ACCEPT}
            aria-label={t.audio.uploads.choose}
            data-testid="audio-upload-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (files.length > 0) void upload(files)
            }}
          />
          {mode === 'guest' ? <p className={styles.fine}>{t.audio.uploads.guestHint}</p> : null}
        </>
      )}
      {session.busy > 0 ? (
        <p className={styles.note} role="status" data-testid="audio-uploading">
          {session.reading ? t.audio.uploads.decoding(session.reading) : t.audio.uploads.uploading(session.busy)}
        </p>
      ) : null}
      {problem ? (
        <p className={styles.warn} role="alert" data-testid="audio-upload-error">
          {problem}
        </p>
      ) : null}
      {items.length > 0 ? (
        <>
          <h3 className={styles.sectionTitle}>{t.audio.uploads.yours}</h3>
          <ul className={styles.rows} data-testid="audio-upload-list">
            {items.map((item) => (
              <UploadRow key={item.ref.id} item={item} used={usedIds.has(item.ref.id) || usedIds.has(item.ref.url)} canWrite={!readOnly} onAdd={(scope) => add(item, scope)} onRemove={() => void remove(item)} />
            ))}
          </ul>
        </>
      ) : null}
      {list.error && items.length === 0 ? (
        <p className={styles.warn} role="alert">
          {t.audio.uploads.loadFailed}
        </p>
      ) : null}
      {list.hasMore && list.items.length > 0 ? (
        <Button size="sm" variant="ghost" onClick={list.loadMore} disabled={list.loading}>
          {t.audio.uploads.loadMore}
        </Button>
      ) : null}
      {!list.loading && !list.error && items.length === 0 ? (
        <p className={styles.empty} data-testid="audio-upload-empty">
          {t.audio.uploads.none}
        </p>
      ) : null}
    </div>
  )
}
