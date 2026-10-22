/**
 * The preview of a page's animation over the artboard: "Play page", and the frame under the timeline's playhead while
 * it is scrubbed. The frame renderer draws the page from the document (the live canvas underneath is not touched, nothing
 * is written to history or autosave); a shield over the workspace holds back pointer and keyboard edits while it is up.
 * Esc stops it, Space pauses.
 */
import { Pause, Play, Square } from 'lucide-react'
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEditor, useEditorState, useEditorStateShallow } from '../context'
import { useLatest } from '../hooks/useLatest'
import { type FrameRenderer, createFrameRenderer } from '../animation/frameRenderer'
import { playbackOf, usePlaybackValue } from '../animation/playback'
import { elementSources } from '../clips/elementSource'
import { previewLengthMs, previewMultiplier } from '../animation/timelineMath'
import { getPageSize } from '../engine/pageSizes'
import { t } from '../strings'
import { IconButton } from '../ui/Button'
import styles from './TimelinePreview.module.css'

const TYPING = 'input, textarea, select, [contenteditable="true"]'

interface PreviewProps {
  scrollRef: RefObject<HTMLDivElement | null>
}

function Preview({ scrollRef }: PreviewProps) {
  const editor = useEditor()
  const playback = playbackOf(editor)
  const pageId = useEditorState((s) => s.activePageId)
  const page = useEditorState((s) => s.doc.pages.find((p) => p.id === s.activePageId))
  const index = useEditorState((s) => s.doc.pages.findIndex((p) => p.id === s.activePageId))
  const size = useEditorStateShallow((s) => getPageSize(s.doc, s.activePageId))
  const zoom = useEditorState((s) => s.zoom)
  const playing = usePlaybackValue((s) => s.playing)
  const shieldRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<FrameRenderer | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  const length = useMemo(() => (page ? previewLengthMs(page) : 500), [page])
  const lengthRef = useLatest(length)

  // The multiplier follows the zoom, but a zoom gesture does not rebuild the bitmaps on every step.
  const [settledZoom, setSettledZoom] = useState(zoom)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledZoom(zoom), 250)
    return () => window.clearTimeout(timer)
  }, [zoom])
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const multiplier = previewMultiplier(settledZoom, dpr, size)

  // Prepare the page for drawing (fonts, images, layers); drawn again when the page itself changes.
  useEffect(() => {
    const frame = frameRef.current
    if (!page || !frame) return
    let alive = true
    setStatus('loading')
    createFrameRenderer(page, size, editor.loadContext, {
      multiplier,
      media: elementSources,
      // A clip's seek landed while the playhead stood still: show its new picture.
      onMediaFrame: () => {
        if (!playback.state.playing) rendererRef.current?.render(playback.state.timeMs)
      },
    })
      .then((renderer) => {
        if (!alive) {
          renderer.dispose()
          return
        }
        rendererRef.current = renderer
        renderer.setMediaClock(playback.state.playing, playback.state.speed)
        frame.replaceChildren(renderer.canvas)
        renderer.canvas.setAttribute('aria-hidden', 'true')
        renderer.render(playback.state.timeMs)
        setStatus('ready')
      })
      .catch(() => {
        if (alive) setStatus('failed')
      })
    return () => {
      alive = false
      rendererRef.current?.dispose()
      rendererRef.current = null
      frame.replaceChildren()
    }
  }, [editor, page, size, multiplier, playback, attempt])

  // The frame follows the playhead.
  useEffect(
    () =>
      playback.subscribe(() => {
        rendererRef.current?.setMediaClock(playback.state.playing, playback.state.speed)
        rendererRef.current?.render(playback.state.timeMs)
      }),
    [playback],
  )

  // The clock.
  useEffect(() => {
    if (!playing || status !== 'ready') return
    let raf = 0
    let last = performance.now()
    const tick = (now: number): void => {
      playback.advance(now - last, lengthRef.current)
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, status, playback, lengthRef])

  // Keep the picture over the artboard as the workspace scrolls, zooms or resizes.
  useLayoutEffect(() => {
    let raf = 0
    const place = (): void => {
      const shield = shieldRef.current
      const view = viewRef.current
      const frame = frameRef.current
      const scroller = scrollRef.current
      if (shield && view && frame && scroller) {
        const origin = shield.getBoundingClientRect()
        const clip = scroller.getBoundingClientRect()
        view.style.left = `${clip.left - origin.left}px`
        view.style.top = `${clip.top - origin.top}px`
        view.style.width = `${clip.width}px`
        view.style.height = `${clip.height}px`
        const rect = editor.view.pageRect(pageId)
        if (rect) {
          frame.style.left = `${rect.left - clip.left}px`
          frame.style.top = `${rect.top - clip.top}px`
          frame.style.width = `${rect.width}px`
          frame.style.height = `${rect.height}px`
          frame.hidden = false
        } else frame.hidden = true
      }
      raf = requestAnimationFrame(place)
    }
    raf = requestAnimationFrame(place)
    place()
    return () => cancelAnimationFrame(raf)
  }, [editor, pageId, scrollRef])

  // Esc stops, Space pauses; the editor's own shortcuts do not act on the page while it plays (its key handler stands down
  // for a key that is already handled), and the controls and text fields keep the keys they use.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        playback.stop()
        return
      }
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest(TYPING)) return
      const inControls = target?.closest('[data-playback-controls]') != null
      if (e.key === 'Tab') return
      if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (inControls && target?.closest('button')) return
        e.preventDefault()
        playback.toggle(lengthRef.current)
        return
      }
      if (e.key === 'Enter' && inControls) return
      // S splits the selected video clip at the playhead: what the preview is for.
      if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) return
      if (e.key.length === 1 || e.key.startsWith('Arrow') || e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Enter' || e.ctrlKey || e.metaKey) e.preventDefault()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [playback, lengthRef])

  useEffect(() => {
    editor.announce(t.animation.preview.started(index + 1))
    return () => editor.announce(t.animation.preview.stopped)
  }, [editor, index])

  const toggle = useCallback(() => playback.toggle(lengthRef.current), [playback, lengthRef])

  return (
    <div ref={shieldRef} className={styles.shield} role="region" aria-label={t.animation.preview.region} data-testid="ed-preview">
      <div ref={viewRef} className={styles.view}>
        <div ref={frameRef} className={styles.frame} role="img" aria-label={t.animation.preview.page(index + 1)} data-status={status} data-testid="ed-preview-frame" onClick={toggle} />
        {status === 'loading' ? (
          <p className={styles.chip} role="status">
            {t.animation.preview.preparing}
          </p>
        ) : null}
        {status === 'failed' ? (
          <p className={styles.chip} role="alert">
            {t.animation.preview.failed}{' '}
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>
              {t.presenter.retry}
            </button>
          </p>
        ) : null}
      </div>
      <div className={styles.bar} data-playback-controls>
        <IconButton label={playing ? t.animation.preview.pause : t.animation.preview.play} size="sm" onClick={toggle} data-testid="ed-preview-toggle">
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </IconButton>
        <IconButton label={t.animation.preview.stop} size="sm" shortcut="Esc" onClick={() => playback.stop()} data-testid="ed-preview-stop">
          <Square size={14} />
        </IconButton>
        <span className={styles.hint}>{t.animation.preview.hint}</span>
      </div>
    </div>
  )
}

/** Hooked into the workspace: shows the preview while the playback is active. */
export function TimelinePreview({ scrollRef }: PreviewProps) {
  const active = usePlaybackValue((s) => s.active)
  return active ? <Preview scrollRef={scrollRef} /> : null
}
