/**
 * The Videos tool's Stock tab: search free clips from the server's video providers (Pexels, Pixabay), by orientation
 * and length. A clip previews while the pointer rests on it (or it has focus, without reduced motion); picking one has
 * the server download and convert it into the person's uploads, then it is added to the page with its credit.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { isApiError } from '@/lib/api'
import { safeGetItem, safeSetItem } from '@/lib/storage'
import type { VideoService } from '@/types/adapter'
import type { StockSkipped, StockVideo, VideoInfo, VideoLength, VideoOrientation } from '@/types/api'
import { useReducedMotion } from '../animation/useReducedMotion'
import { I } from '../chrome/icons'
import { whenProcessed } from '../clips/assets'
import { formatClipTime } from '../clips/strings'
import { useEditor } from '../context'
import { useAsyncList } from '../hooks/useAsyncList'
import { useDebounced } from '../hooks/useDebounced'
import type { PanelProps } from './registry'
import { t } from '../strings'
import { Segmented } from '../ui/Segmented'
import { Select } from '../ui/Select'
import { Skeleton } from '../ui/Skeleton'
import drawer from '../drawers/Drawers.module.css'
import styles from './Videos.module.css'

const s = t.clips.stock
const SOURCE_KEY = 'doory.stock-video.tab'
const ALL = 'all'

function initialSource(info: VideoInfo): string {
  const offered = [...(info.all.length > 1 ? [ALL] : []), ...info.providers.map((p) => p.name)]
  const stored = safeGetItem(SOURCE_KEY)
  if (stored && offered.includes(stored)) return stored
  return offered.includes(info.default) ? info.default : (offered[0] ?? '')
}

/**
 * One result: its still, and the clip itself playing (muted) while the pointer rests on it. Focus plays it too, unless
 * the system asks for reduced motion: moving through the results with the keyboard then leaves them still.
 */
function StockClip({ video, provider, badge, busy, onPick }: { video: StockVideo; provider: string; badge: boolean; busy: boolean; onPick: () => void }) {
  const [hover, setHover] = useState(false)
  const reduced = useReducedMotion()
  const credit = s.byOn(video.author, provider)
  return (
    <div className={styles.tile}>
      <button
        type="button"
        className={styles.clip}
        data-testid="stock-video"
        aria-label={s.add(video.author)}
        title={credit}
        disabled={busy}
        onClick={onPick}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setHover(!reduced)}
        onBlur={() => setHover(false)}
      >
        <img src={video.thumb_url} alt="" loading="lazy" draggable={false} />
        {hover && video.preview_url ? <video src={video.preview_url} muted autoPlay loop playsInline preload="none" aria-hidden="true" data-testid="stock-video-preview" /> : null}
        {badge ? <span className={drawer.badge}>{provider}</span> : null}
        <span className={styles.length}>{formatClipTime(video.duration_ms)}</span>
      </button>
      <span className={styles.name}>{credit}</span>
    </div>
  )
}

export function VideoStockTab({ close, service, info }: PanelProps & { service: VideoService; info: VideoInfo }) {
  const editor = useEditor()
  const [source, setSourceState] = useState(() => initialSource(info))
  const [query, setQuery] = useState('')
  const [orientation, setOrientation] = useState<VideoOrientation | 'any'>('any')
  const [length, setLength] = useState<VideoLength | 'any'>('any')
  const q = useDebounced(query.trim(), 300)
  const [importing, setImporting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ skipped: StockSkipped[]; stale: boolean }>({ skipped: [], stale: false })
  const cursors = useRef<{ list: string; pages: Map<number, string> }>({ list: '', pages: new Map() })
  const alive = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    alive.current = controller
    return () => controller.abort()
  }, [])

  const labels = new Map(info.providers.map((p) => [p.name, p.label]))
  const label = (name: string): string => labels.get(name) ?? name
  const setSource = (next: string): void => {
    setSourceState(next)
    safeSetItem(SOURCE_KEY, next)
  }

  const list = [source, q, orientation, length].join('\u0000')
  const videos = useAsyncList<StockVideo>(
    async (page) => {
      if (page === 1) cursors.current = { list, pages: new Map() }
      const current = (): boolean => cursors.current.list === list
      const cursor = source === ALL && current() ? cursors.current.pages.get(page) : undefined
      setFailure(null)
      try {
        const res = await service.search(q || 'nature', cursor ?? page, {
          provider: source || undefined,
          orientation: orientation === 'any' ? undefined : orientation,
          length: length === 'any' ? undefined : length,
        })
        if (!current()) return { count: 0, next: null, previous: null, results: [] }
        if (typeof res.next_page === 'string') cursors.current.pages.set(page + 1, res.next_page)
        setNotice((cur) => ({ skipped: page === 1 ? (res.skipped ?? []) : cur.skipped, stale: page === 1 ? Boolean(res.stale) : cur.stale || Boolean(res.stale) }))
        return { count: res.total, next: res.next_page === null ? null : String(res.next_page), previous: null, results: res.results }
      } catch (err) {
        if (current()) setFailure(isApiError(err) && err.isRateLimited ? s.busy(source && source !== ALL ? label(source) : t.clips.tool, err.retryAfter) : s.failed)
        throw err
      }
    },
    list,
  )

  const searchId = useId()
  const observer = useRef<IntersectionObserver | null>(null)
  const { loadMore } = videos
  const canLoadMore = videos.hasMore && !videos.loading && !videos.error && videos.items.length > 0
  const sentinel = useCallback(
    (el: HTMLDivElement | null) => {
      observer.current?.disconnect()
      observer.current = null
      if (!el || !canLoadMore || typeof IntersectionObserver === 'undefined') return
      observer.current = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore()
      }, { rootMargin: '200px' })
      observer.current.observe(el)
    },
    [canLoadMore, loadMore],
  )

  const add = async (video: StockVideo): Promise<void> => {
    setImporting(`${video.provider}:${video.id}`)
    setError(null)
    try {
      const ref = await whenProcessed(service, await service.importVideo(video), alive.current.signal)
      if (ref.video?.status !== 'ready') throw new Error(ref.video?.error || s.addFailed)
      await editor.videos.use(ref)
      close()
    } catch (err) {
      if (alive.current.signal.aborted) return
      setError(isApiError(err) && err.isRateLimited ? s.busy(label(video.provider), err.retryAfter) : s.addFailed)
    } finally {
      setImporting(null)
    }
  }

  const tabs = [...(info.all.length > 1 ? [ALL] : []), ...info.providers.map((p) => p.name)]
  const onScreen = new Set(videos.items.map((v) => v.provider))
  const credited = info.providers.filter((p) => onScreen.has(p.name))

  return (
    <>
      {tabs.length > 1 ? (
        <div className={drawer.sources} role="tablist" aria-label={s.sources}>
          {tabs.map((name) => (
            <button key={name} type="button" role="tab" className={drawer.source} aria-selected={source === name} data-testid={`stock-video-source-${name}`} onClick={() => setSource(name)}>
              {name === ALL ? s.all : label(name)}
            </button>
          ))}
        </div>
      ) : null}
      <label className={drawer.search} htmlFor={searchId}>
        {I.search}
        <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={s.search} aria-label={s.search} data-testid="stock-video-search" />
      </label>
      <div className={styles.filters}>
        <Segmented<VideoOrientation | 'any'>
          label={s.orientationLabel}
          value={orientation}
          onChange={setOrientation}
          options={(['any', 'landscape', 'portrait', 'square'] as const).map((value) => ({ value, label: s.orientations[value] }))}
        />
        <Select aria-label={s.lengthLabel} value={length} onChange={(e) => setLength(e.target.value as VideoLength | 'any')} data-testid="stock-video-length">
          {(['any', 'short', 'medium', 'long'] as const).map((value) => (
            <option key={value} value={value}>
              {s.lengths[value]}
            </option>
          ))}
        </Select>
      </div>
      {notice.stale && videos.items.length > 0 ? <p className={drawer.note}>{s.stale}</p> : null}
      {videos.loading && videos.items.length === 0 ? (
        <div className={styles.grid} aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height="auto" radius={8} style={{ aspectRatio: '16 / 9' }} />
          ))}
        </div>
      ) : null}
      <div className={styles.grid}>
        {videos.items.map((v) => (
          <StockClip key={`${v.provider}:${v.id}`} video={v} provider={label(v.provider)} badge={source === ALL} busy={importing !== null} onPick={() => void add(v)} />
        ))}
      </div>
      {importing ? (
        <div className={drawer.status} role="status">
          <span className={drawer.spinner} aria-hidden="true" />
          {s.adding}
        </div>
      ) : null}
      {error ? (
        <p className={drawer.error} role="alert">
          {error}
        </p>
      ) : null}
      {videos.error ? (
        <p className={drawer.error} role="alert">
          {failure ?? s.failed}
        </p>
      ) : null}
      {!videos.loading && !videos.error && videos.items.length === 0 ? <p className={drawer.note}>{s.empty}</p> : null}
      {credited.length > 0 && videos.items.length > 0 ? (
        <p className={drawer.attribution} data-testid="stock-video-attribution">
          {credited.map((p, index) => (
            <span key={p.name}>
              {index > 0 ? ' · ' : null}
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {p.attribution}
              </a>
            </span>
          ))}
        </p>
      ) : null}
      <div ref={sentinel} style={{ height: 1 }} />
    </>
  )
}
