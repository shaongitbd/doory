/**
 * The Videos tool (a drawer like Images): the person's clips and the upload zone, plus stock videos when the server
 * has a video provider. Guests are asked to sign up (clips are converted on the server, into an account's uploads);
 * a server without ffmpeg says it takes no videos.
 */
import { useSyncExternalStore, useState } from 'react'
import { useEditor } from '../context'
import { useVideoInfo } from '../clips/assets'
import type { PanelProps } from './registry'
import { t } from '../strings'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import ed from '../chrome/ed.module.css'
import drawer from '../drawers/Drawers.module.css'
import { VideoStockTab } from './VideoStockTab'
import { VideoUploadsTab } from './VideoUploadsTab'
import styles from './Videos.module.css'

function VideoGate() {
  const editor = useEditor()
  const [busy, setBusy] = useState(false)
  const signUp = async (): Promise<void> => {
    setBusy(true)
    try {
      await editor.adapter.requireAccount('video', async () => ({ document: editor.getDocument(), title: editor.state.title }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={styles.gate} data-testid="videos-gate">
      <strong>{t.clips.off.title}</strong>
      <span>{t.clips.off.body}</span>
      <Button variant="primary" disabled={busy} onClick={() => void signUp()}>
        {t.clips.off.action}
      </Button>
    </div>
  )
}

/** While "Replace video" waits for a pick: what the next pick does, and the way out. */
function ReplacingNote() {
  const editor = useEditor()
  const replacing = useSyncExternalStore(editor.videos.subscribeReplacing, () => editor.videos.replacing)
  if (!replacing) return null
  return (
    <p className={styles.replacing} role="status" data-testid="videos-replacing">
      <span>{t.clips.replacing.title}</span>
      <button type="button" className={`${ed.btn} ${ed.ghost}`} onClick={() => editor.videos.cancelReplace()}>
        {t.clips.replacing.cancel}
      </button>
    </p>
  )
}

/** The tab last used, kept while the editor stays open. */
const memory: { tab: 'uploads' | 'stock' } = { tab: 'uploads' }

export function VideosPanel(props: PanelProps) {
  const editor = useEditor()
  const service = editor.adapter.services.video
  const info = useVideoInfo(service)
  const [tab, setTabState] = useState(memory.tab)
  const setTab = (next: 'uploads' | 'stock'): void => {
    memory.tab = next
    setTabState(next)
  }
  if (!service) return <VideoGate />
  if (info === undefined) return <Skeleton height={120} radius={8} />
  if (info === null || !info.enabled) {
    return (
      <p className={drawer.note} data-testid="videos-off">
        {t.clips.off.server}
      </p>
    )
  }
  const hasStock = info.providers.length > 0
  const shown = hasStock ? tab : 'uploads'
  return (
    <div data-testid="videos-panel">
      <ReplacingNote />
      {hasStock ? (
        <div className={drawer.tabs} role="tablist" aria-label={t.clips.tabs.label}>
          <button type="button" role="tab" className={drawer.tab} aria-selected={shown === 'uploads'} data-testid="video-tab-uploads" onClick={() => setTab('uploads')}>
            {t.clips.tabs.uploads}
          </button>
          <button type="button" role="tab" className={drawer.tab} aria-selected={shown === 'stock'} data-testid="video-tab-stock" onClick={() => setTab('stock')}>
            {t.clips.tabs.stock}
          </button>
        </div>
      ) : null}
      {shown === 'uploads' ? <VideoUploadsTab {...props} service={service} info={info} /> : <VideoStockTab {...props} service={service} info={info} />}
    </div>
  )
}
