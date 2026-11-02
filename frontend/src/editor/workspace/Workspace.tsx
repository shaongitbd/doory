import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEditor, useEditorState, useEditorStateShallow } from '../context'
import { pageSize } from '../engine/docOps'
import { imageFilesFrom } from '../engine/files'
import { endImageAssetDrag, hasImageAssetDrag, readImageAssetDrag } from '../drawers/imageAssetDrag'
import { DEFAULT_METRICS, type CanvasWindow, type StackMetrics, computeCanvasWindow, computeStack, pageAtViewportCenter, slotLeft, visiblePageIds, windowContains } from '../engine/layout'
import { getPageSize, pageSizes, widestPage } from '../engine/pageSizes'
import { wheelZoom } from '../engine/zoom'
import { useLatest } from '../hooks/useLatest'
import { t } from '../strings'
import { LazyCommentPins } from './CommentPinsLoader'
import { PageSlot } from './PageSlot'
import { Rulers } from './Rulers'
import { CanvasSizeButton } from './CanvasSizeButton'
import { FollowBadge } from '../chrome/FollowBadge'
import { PagesPill } from './PagesPill'
import { LazyTimelinePreview } from './TimelineLoader'
import { ZoomControls } from './ZoomControls'
import { usePresenceTracking } from './usePresenceTracking'
import styles from './Workspace.module.css'

/** 32 px around the page; the per-page header only exists once there are several pages. */
const metricsFor = (pages: number): StackMetrics => ({ ...DEFAULT_METRICS, padding: 32, header: pages > 1 ? DEFAULT_METRICS.header : 0 })
const BLEED = 56
const OVERSCAN = 360
/** Pages this many viewport heights from the visible area (above and below) get their picture prepared in the background. */
const NEAR_SCREENS = 2
/** Scrolling faster than this (px per ms) is a fling: pages are mounted once it has slowed down for `SETTLE_MS`. */
const FLING_PX_PER_MS = 2
const SETTLE_MS = 120

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

/**
 * The scrolling page stack: every page is laid out vertically at the current zoom; only pages near the
 * viewport get a live Fabric canvas (others show a cached bitmap), and each live canvas covers just the
 * visible window of its artboard so memory stays bounded at any zoom.
 */
interface WorkspaceProps {
  stripOpen: boolean
  onToggleStrip: () => void
}

export function Workspace({ stripOpen, onToggleStrip }: WorkspaceProps) {
  const editor = useEditor()
  const doc = useEditorState((s) => s.doc)
  const zoom = useEditorState((s) => s.zoom)
  const activePageId = useEditorState((s) => s.activePageId)
  const readOnly = useEditorState((s) => s.readOnly)
  const spaceDown = useEditorState((s) => s.ui.spaceDown)
  const tool = useEditorState((s) => s.ui.tool)
  const rulers = useEditorState((s) => s.ui.rulers)
  const pageIds = useEditorStateShallow((s) => s.doc.pages.map((p) => p.id))
  const activeSize = useEditorStateShallow((s) => getPageSize(s.doc, s.activePageId))
  const widest = useEditorState((s) => widestPage(s.doc))
  /** Changes whenever a page changes size, so the live windows are laid out again. */
  const sizesKey = useEditorState((s) => pageSizes(s.doc).map((z) => `${z.width}x${z.height}`).join(','))
  const scrollRef = useRef<HTMLDivElement>(null)
  const artboards = useRef(new Map<string, HTMLDivElement>())
  const windows = useRef(new Map<string, { zoom: number; win: CanvasWindow; w: number; h: number }>())
  const [live, setLive] = useState<ReadonlySet<string>>(() => new Set([doc.pages[0].id]))
  /** Pages within a couple of screens: the ones whose picture is prepared while they have no live canvas (a long design must not render all of them at once). */
  const [near, setNear] = useState<ReadonlySet<string>>(() => new Set([doc.pages[0].id]))
  const [dropping, setDropping] = useState(false)
  const prev = useRef<{ zoom: number; layout: ReturnType<typeof computeStack> } | null>(null)
  /** Where the scroller was before the last change of layout: scrolling does not re-render, so it is tracked here. */
  const lastScroll = useRef({ top: 0, left: 0 })
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const panning = spaceDown || tool === 'hand'
  usePresenceTracking(scrollRef, artboards)

  const metrics = useMemo(() => metricsFor(doc.pages.length), [doc.pages.length])
  const layout = useMemo(
    () => computeStack(doc.pages.map((p) => ({ id: p.id, ...pageSize(doc, p) })), zoom, metrics),
    [doc, zoom, metrics],
  )
  /** Scrolls caused by commands (add page, go to page) must not re-activate other pages on the way. */
  const quietUntil = useRef(0)
  const layoutRef = useLatest(layout)
  const zoomRef = useLatest(zoom)
  const pendingScroll = useRef<{ id: string; behavior: ScrollBehavior } | null>(null)

  /** Performs the pending scroll-to-page once the page's slot exists. */
  const flushScroll = useCallback(() => {
    const pending = pendingScroll.current
    const el = scrollRef.current
    const slot = pending ? layoutRef.current.slots.find((s) => s.id === pending.id) : undefined
    if (!pending || !el || !slot) return
    pendingScroll.current = null
    el.scrollTo({ top: Math.max(0, slot.top - 24), behavior: pending.behavior })
  }, [layoutRef])

  const registerArtboard = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) artboards.current.set(id, el)
    else artboards.current.delete(id)
  }, [])

  /** Positions every live canvas window over the visible part of its artboard. */
  const relayout = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    const z = zoomRef.current
    for (const [id, el] of artboards.current) {
      const view = editor.viewOf(id)
      if (!view) continue
      const a = el.getBoundingClientRect()
      const size = editor.pageSizeOf(id)
      const art = { width: size.width * z, height: size.height * z }
      const visible = { x: rect.left - a.left, y: rect.top - a.top, width: rect.width, height: rect.height }
      const last = windows.current.get(id)
      const inner = { x: visible.x - 40, y: visible.y - 40, width: visible.width + 80, height: visible.height + 80 }
      if (last && last.zoom === z && last.w === size.width && last.h === size.height) {
        const clipped = {
          x: Math.max(inner.x, -BLEED),
          y: Math.max(inner.y, -BLEED),
          width: Math.min(inner.x + inner.width, art.width + BLEED) - Math.max(inner.x, -BLEED),
          height: Math.min(inner.y + inner.height, art.height + BLEED) - Math.max(inner.y, -BLEED),
        }
        if (clipped.width <= 0 || clipped.height <= 0 || windowContains(last.win, clipped)) continue
      }
      const win = computeCanvasWindow(art, visible, OVERSCAN, BLEED)
      windows.current.set(id, { zoom: z, win, w: size.width, h: size.height })
      editor.layoutPage(id, z, win)
    }
  }, [editor, zoomRef])

  const updateLive = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const ids = new Set(visiblePageIds(layoutRef.current, scroller.scrollTop, scroller.clientHeight, scroller.clientHeight * 0.75))
    if (ids.size === 0 && layoutRef.current.slots[0]) ids.add(layoutRef.current.slots[0].id)
    setLive((cur) => (sameSet(cur, ids) ? cur : ids))
    const close = new Set(visiblePageIds(layoutRef.current, scroller.scrollTop, scroller.clientHeight, scroller.clientHeight * NEAR_SCREENS))
    if (close.size === 0 && layoutRef.current.slots[0]) close.add(layoutRef.current.slots[0].id)
    setNear((cur) => (sameSet(cur, close) ? cur : close))
    const centre = pageAtViewportCenter(layoutRef.current, scroller.scrollTop, scroller.clientHeight)
    if (centre && !editor.state.selection.ids.length && performance.now() > quietUntil.current) {
      if (editor.state.activePageId !== centre) editor.setActivePage(centre)
    }
    relayout()
  }, [editor, relayout, layoutRef])

  // Viewport size + scroll → live set and windows. During a fling (a fast drag of the scrollbar, a flick on a touch pad) the
  // pages that fly past are not mounted: the live set follows once the scrolling has slowed down, so a long design stays smooth.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    let raf = 0
    let settle = 0
    let last = { top: scroller.scrollTop, at: performance.now() }
    const schedule = (): void => {
      if (raf) return
      raf = requestAnimationFrame((now) => {
        raf = 0
        const top = scroller.scrollTop
        const speed = Math.abs(top - last.top) / Math.max(1, now - last.at)
        last = { top, at: now }
        window.clearTimeout(settle)
        if (speed > FLING_PX_PER_MS) {
          settle = window.setTimeout(updateLive, SETTLE_MS)
          return
        }
        updateLive()
      })
    }
    const onScroll = (): void => {
      lastScroll.current = { top: scroller.scrollTop, left: scroller.scrollLeft }
      schedule()
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(() => {
      setViewport({ width: scroller.clientWidth, height: scroller.clientHeight })
      schedule()
    })
    ro.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(settle)
    }
  }, [updateLive])

  // Fit modes follow the window and the size of the page in view (and the widest page, for fit width); the first fit
  // also scrolls to the top. A change of the workspace's own height alone (the contextual
  // row or the page strip appearing) does not refit, otherwise selecting an object would make the page jump to
  // another zoom. Scrolling to a page of another size does not refit either: the zoom is the user's until they ask.
  const fitted = useRef(false)
  const lastFit = useRef({ width: 0, windowWidth: 0, windowHeight: 0, pageId: '', pageWidth: 0, pageHeight: 0, widest: 0 })
  useEffect(() => {
    if (viewport.width === 0) return
    const last = lastFit.current
    const windowChanged = last.windowWidth !== window.innerWidth || last.windowHeight !== window.innerHeight
    const widthChanged = last.width !== viewport.width
    const pageChanged = last.pageId === activePageId && (last.pageWidth !== activeSize.width || last.pageHeight !== activeSize.height)
    const widestChanged = last.widest !== widest
    lastFit.current = { width: viewport.width, windowWidth: window.innerWidth, windowHeight: window.innerHeight, pageId: activePageId, pageWidth: activeSize.width, pageHeight: activeSize.height, widest }
    if (windowChanged || widthChanged || pageChanged || widestChanged || !fitted.current) editor.view.refit()
    if (!fitted.current) {
      fitted.current = true
      editor.view.fit('fit-page')
    }
  }, [viewport.width, viewport.height, activePageId, activeSize.width, activeSize.height, widest, editor])

  // Keep the point under the cursor (or the viewport centre) fixed while zooming.
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const before = prev.current
    const scrolled = lastScroll.current
    prev.current = { zoom, layout }
    if (!scroller || !before || before.zoom === zoom) {
      updateLive()
      return
    }
    const anchor = editor.view.consumeAnchor()
    const rect = scroller.getBoundingClientRect()
    const cx = anchor ? anchor.clientX - rect.left : rect.width / 2
    const cy = anchor ? anchor.clientY - rect.top : rect.height / 2
    const yOld = scrolled.top + cy
    const slot = before.layout.slots.find((s) => yOld >= s.artboardTop && yOld <= s.bottom) ?? before.layout.slots.find((s) => s.bottom >= yOld) ?? before.layout.slots[before.layout.slots.length - 1]
    const ratio = zoom / before.zoom
    if (slot) {
      const next = layout.slots.find((s) => s.id === slot.id)
      if (next) {
        const within = Math.min(slot.height, Math.max(0, yOld - slot.artboardTop))
        scroller.scrollTop = Math.max(0, next.artboardTop + within * ratio - cy)
      }
    }
    // Horizontal: keep the artboard-relative x of the anchor.
    const art = slot ? artboards.current.get(slot.id) : undefined
    if (art) {
      const a = art.getBoundingClientRect()
      const artLeftNow = a.left - rect.left + scroller.scrollLeft
      const oldArtLeft = slot ? slotLeft(before.layout, slot, rect.width) : 0
      const xWithin = Math.min(slot?.width ?? 0, Math.max(0, scrolled.left + cx - oldArtLeft))
      scroller.scrollLeft = Math.max(0, artLeftNow + xWithin * ratio - cx)
    }
    lastScroll.current = { top: scroller.scrollTop, left: scroller.scrollLeft }
    windows.current.clear()
    updateLive()
  }, [zoom, layout, editor, updateLive])

  // A scroll asked for by a command (go to page, add page, resize) lands after the layout and the zoom it may have
  // changed have been applied, so it is not undone by keeping the point under the cursor still.
  useLayoutEffect(() => {
    flushScroll()
  }, [layout, flushScroll])

  // Pages added/removed/resized: recompute windows.
  useEffect(() => {
    windows.current.clear()
    updateLive()
  }, [sizesKey, updateLive])

  useEffect(() => {
    const ids = new Set(pageIds)
    for (const id of [...windows.current.keys()]) if (!ids.has(id)) windows.current.delete(id)
  }, [pageIds])

  // Viewport controller for engine commands.
  useEffect(() => {
    editor.setViewportController({
      scrollToPage(id, behavior = 'smooth') {
        // A page that was just added has no slot until the next render: remember the request until it has.
        quietUntil.current = performance.now() + (behavior === 'smooth' ? 900 : 100)
        pendingScroll.current = { id, behavior }
        // The zoom may be about to change (a resize refits it): scroll once the new layout is in place.
        requestAnimationFrame(flushScroll)
      },
      viewportSize: () => ({ width: scrollRef.current?.clientWidth ?? 0, height: scrollRef.current?.clientHeight ?? 0 }),
      relayout: () => {
        windows.current.clear()
        updateLive()
      },
      artboardRect: (id) => {
        const box = artboards.current.get(id)?.getBoundingClientRect()
        return box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null
      },
    })
    return () => editor.setViewportController(null)
  }, [editor, updateLive, flushScroll])

  // Wheel zoom (ctrl/cmd + wheel, trackpad pinch) and plain wheel scrolling.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      editor.view.setZoom(wheelZoom(editor.state.zoom, e.deltaY), { clientX: e.clientX, clientY: e.clientY })
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [editor])

  // Pan (space / hand tool / middle mouse) and two-finger pinch.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const pointers = new Map<number, { x: number; y: number }>()
    let pan: { x: number; y: number; left: number; top: number; id: number } | null = null
    let pinch: { dist: number; zoom: number } | null = null

    const down = (e: PointerEvent): void => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: editor.state.zoom }
        pan = null
        return
      }
      const handTool = editor.state.ui.spaceDown || editor.state.ui.tool === 'hand'
      if (e.button === 1 || (handTool && e.button === 0)) {
        e.preventDefault()
        e.stopPropagation()
        pan = { x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, id: e.pointerId }
        scroller.setPointerCapture(e.pointerId)
        scroller.classList.add(styles.grabbing)
      }
    }
    const move = (e: PointerEvent): void => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch.dist > 0) editor.view.setZoom(pinch.zoom * (dist / pinch.dist), { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
        return
      }
      if (pan && e.pointerId === pan.id) {
        scroller.scrollLeft = pan.left - (e.clientX - pan.x)
        scroller.scrollTop = pan.top - (e.clientY - pan.y)
      }
    }
    const up = (e: PointerEvent): void => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (pan && e.pointerId === pan.id) {
        pan = null
        scroller.classList.remove(styles.grabbing)
      }
    }
    scroller.addEventListener('pointerdown', down, true)
    scroller.addEventListener('pointermove', move)
    scroller.addEventListener('pointerup', up)
    scroller.addEventListener('pointercancel', up)
    return () => {
      scroller.removeEventListener('pointerdown', down, true)
      scroller.removeEventListener('pointermove', move)
      scroller.removeEventListener('pointerup', up)
      scroller.removeEventListener('pointercancel', up)
    }
  }, [editor])

  // Clicking the empty workspace clears the selection.
  const onBackgroundPointerDown = (e: React.PointerEvent): void => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.workspaceBg !== undefined) {
      editor.clearSelection()
      editor.patchUi({ contextMenu: null })
    }
  }

  const clearImageAssetDrop = useCallback(() => {
    for (const view of editor.allViews()) view.setImageAssetDrop(null)
  }, [editor])

  const finishImageAssetDrag = useCallback(() => {
    clearImageAssetDrop()
    endImageAssetDrag()
  }, [clearImageAssetDrop])

  useEffect(() => {
    document.addEventListener('dragend', finishImageAssetDrag)
    return () => {
      document.removeEventListener('dragend', finishImageAssetDrag)
      finishImageAssetDrag()
    }
  }, [finishImageAssetDrag])

  const imageAssetTargetAt = (clientX: number, clientY: number): { pageId: string; gridId: string; gridCellId: string } | null => {
    const pageId = editor.view.pageAt(clientX, clientY)
    const point = pageId ? editor.view.clientToPage(pageId, clientX, clientY) : null
    let target: { pageId: string; gridId: string; gridCellId: string } | null = null
    for (const view of editor.allViews()) {
      const hit = pageId === view.pageId ? view.setImageAssetDrop(point) : view.setImageAssetDrop(null)
      if (hit) target = { pageId: view.pageId, ...hit }
    }
    return target
  }

  const onDragOver = (e: React.DragEvent): void => {
    if (readOnly) return
    if (hasImageAssetDrag(e.dataTransfer)) {
      setDropping(false)
      if (!imageAssetTargetAt(e.clientX, e.clientY)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      return
    }
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropping(true)
  }
  const onDrop = (e: React.DragEvent): void => {
    setDropping(false)
    if (readOnly) {
      if (hasImageAssetDrag(e.dataTransfer)) finishImageAssetDrag()
      else clearImageAssetDrop()
      return
    }
    if (hasImageAssetDrag(e.dataTransfer)) {
      e.preventDefault()
      const asset = readImageAssetDrag(e.dataTransfer)
      const target = asset ? imageAssetTargetAt(e.clientX, e.clientY) : null
      finishImageAssetDrag()
      if (!asset || !target) return
      void editor.imageGrids.fillCellWith(target.pageId, target.gridId, target.gridCellId, asset)
      return
    }
    const files = imageFilesFrom(e.dataTransfer)
    if (files.length === 0) return
    e.preventDefault()
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-page-id]')
    const pageId = el?.dataset.pageId ?? editor.state.activePageId
    const point = editor.view.clientToPage(pageId, e.clientX, e.clientY)
    const size = editor.pageSizeOf(pageId)
    const inside = point && point.x >= 0 && point.y >= 0 && point.x <= size.width && point.y <= size.height ? point : undefined
    void editor.insert.imageFiles(files, inside, pageId)
  }

  return (
    <div className={styles.workspace} data-dropping={dropping || undefined}>
      {rulers ? <Rulers scrollRef={scrollRef} artboards={artboards} /> : null}
      <div
        ref={scrollRef}
        className={`${styles.scroller} ${rulers ? styles.withRulers : ''} ${panning ? styles.hand : ''} ${tool === 'text' ? styles.textTool : ''}`}
        data-workspace-bg
        onPointerDown={onBackgroundPointerDown}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
          setDropping(false)
          clearImageAssetDrop()
        }}
        onDrop={onDrop}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) e.preventDefault()
        }}
      >
        <div className={styles.content} data-workspace-bg style={{ minWidth: `max(100%, ${layout.contentWidth}px)`, paddingTop: metrics.padding, paddingBottom: metrics.padding }}>
          {doc.pages.map((page, index) => {
            const slot = layout.slots[index]
            return (
              <PageSlot
                key={page.id}
                page={page}
                index={index}
                total={doc.pages.length}
                width={slot.width}
                height={slot.height}
                zoom={zoom}
                headerHeight={metrics.header}
                gap={metrics.gap}
                live={live.has(page.id)}
                near={near.has(page.id)}
                active={page.id === activePageId}
                registerArtboard={registerArtboard}
              />
            )
          })}
        </div>
      </div>
      <LazyCommentPins scrollRef={scrollRef} artboards={artboards} />
      {readOnly ? null : <CanvasSizeButton />}
      <FollowBadge />
      <ZoomControls />
      <PagesPill stripOpen={stripOpen} onToggleStrip={onToggleStrip} />
      <LazyTimelinePreview scrollRef={scrollRef} />
      {dropping ? <div className={styles.dropHint}>{t.panels.uploadHint}</div> : null}
    </div>
  )
}
