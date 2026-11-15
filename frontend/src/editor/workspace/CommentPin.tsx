/** One pin on the artboard: opens its thread, can be dragged (or nudged with Alt + arrows) by the people who may move it, and walks with the arrow keys. */
import { useLocale } from '@/i18n/useLocale'
import { Check } from 'lucide-react'
import { type KeyboardEvent, type MouseEvent, type PointerEvent, memo, useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, useEditorState } from '../context'
import { type Thread, roundPoint, stepInOrder } from '../panels/commentOps'
import { patchComments } from '../panels/commentsMode'
import { openThread } from '../panels/commentsUi'
import { t } from '../strings'
import { ThreadCardFloat } from './CommentCard'
import { pinSelector } from './commentDom'
import { clampToPage, isComfortablyInside, snapToDevice } from './commentGeometry'
import { usePins } from './commentPinsContext'
import styles from './CommentPins.module.css'

interface PinProps {
  thread: Thread
  /** Where the pin's tip is, in CSS px from the page's top-left corner (fan-out offset included). */
  left: number
  top: number
  /** CSS px per page px. */
  zoom: number
  /** The hover preview opens to the left of the pin (it is near the right edge of the page). */
  previewLeft: boolean
  pageId: string
  movable: boolean
  /** The one pin of the page that is in the tab order; the others are reached with the arrow keys. */
  tabStop: boolean
  devicePixelRatio: number
}

const NUDGE_DELAY_MS = 450
const DRAG_THRESHOLD_PX = 4
const ARROWS: Record<string, { dx: number; dy: number }> = { ArrowLeft: { dx: -1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 }, ArrowUp: { dx: 0, dy: -1 }, ArrowDown: { dx: 0, dy: 1 } }

function preview(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim()
  return text.length > 80 ? `${text.slice(0, 79)}…` : text
}

export const CommentPin = memo(function CommentPin({ thread, left, top, zoom, previewLeft, pageId, movable, tabStop, devicePixelRatio }: PinProps) {
  useLocale()
  const editor = useEditor()
  const { actions, order, pageOf, scroller } = usePins()
  const { root } = thread
  const id = root.id
  const active = useEditorState((s) => s.comments.activeThreadId === id)
  const reveal = useEditorState((s) => (s.comments.reveal?.id === id ? s.comments.reveal : null))
  const button = useRef<HTMLButtonElement>(null)
  const [pulse, setPulse] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)
  const [nudge, setNudge] = useState<{ dx: number; dy: number } | null>(null)
  const nudgeTimer = useRef(0)
  const pulseTimer = useRef(0)
  const dragged = useRef(false)
  /** Ends a drag in progress without dropping the pin (the pin goes away, or the drag is cancelled). */
  const endDrag = useRef<(() => void) | null>(null)
  const pending = actions.isPending(id)

  // "Show me this thread" (from the list, after posting, or the arrow keys): scroll the pin into view, pulse it, maybe focus it.
  useEffect(() => {
    if (!reveal) return
    const el = button.current
    const area = scroller.current?.getBoundingClientRect()
    // A pin that is already on the screen stays where it is: the view only moves when the pin is not in it.
    if (el && !(area && isComfortablyInside(el.getBoundingClientRect(), area, 48))) {
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: calm ? 'auto' : 'smooth' })
    }
    if (reveal.focus) el?.focus({ preventScroll: true })
    patchComments(editor, { reveal: null })
    setPulse(true)
    window.clearTimeout(pulseTimer.current)
    pulseTimer.current = window.setTimeout(() => setPulse(false), 1800)
  }, [editor, reveal, scroller])

  useEffect(
    () => () => {
      window.clearTimeout(nudgeTimer.current)
      window.clearTimeout(pulseTimer.current)
      endDrag.current?.()
    },
    [],
  )

  const toggle = (e: MouseEvent<HTMLButtonElement>): void => {
    // The click that ends a drag (or the release after Esc cancelled one) is not a request to open the card; a key press is.
    if (dragged.current && e.detail > 0) {
      dragged.current = false
      return
    }
    if (active) {
      openThread(editor, null)
      return
    }
    openThread(editor, id)
    if (thread.number !== null) editor.announce(t.comments.announce.opened(thread.number))
  }

  const commitMove = useCallback(
    (page: string, x: number, y: number): void => {
      const clamped = clampToPage(editor.pageSizeOf(page), { x, y })
      const at = roundPoint(clamped.x, clamped.y)
      actions.move(id, { page_id: page, x: at.x, y: at.y })
    },
    [actions, editor, id],
  )

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>): void => {
    dragged.current = false
    if (!movable || e.button !== 0 || pending) return
    const el = e.currentTarget
    const grab = { x: e.clientX, y: e.clientY }
    const rect = el.getBoundingClientRect()
    /** The pin's tip is its bottom-left corner: that is the point that lands on the page. */
    const tip = { x: rect.left, y: rect.bottom }
    let started = false

    const stop = (): void => {
      endDrag.current = null
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', stop)
      window.removeEventListener('keydown', onKey, true)
      el.style.removeProperty('--drag-x')
      el.style.removeProperty('--drag-y')
      if (!started) return
      setDragging(false)
      dragged.current = true
    }
    function move(ev: globalThis.PointerEvent): void {
      const dx = ev.clientX - grab.x
      const dy = ev.clientY - grab.y
      if (!started && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      if (!started) {
        started = true
        setDragging(true)
        // The card would stay behind while the pin is carried away.
        openThread(editor, null)
        try {
          el.setPointerCapture(ev.pointerId)
        } catch {
          /* the pointer is already gone: the drag ends with the next event */
        }
      }
      el.style.setProperty('--drag-x', `${dx}px`)
      el.style.setProperty('--drag-y', `${dy}px`)
    }
    function up(ev: globalThis.PointerEvent): void {
      const wasDrag = started
      stop()
      if (!wasDrag) return
      const dropped = { x: tip.x + (ev.clientX - grab.x), y: tip.y + (ev.clientY - grab.y) }
      // The page under the tip, whatever its size: the pin may be dropped on another page.
      const target = editor.view.pageAt(dropped.x, dropped.y)
      const at = target ? editor.view.clientToPage(target, dropped.x, dropped.y) : null
      if (target && at) commitMove(target, at.x, at.y)
    }
    function onKey(ev: globalThis.KeyboardEvent): void {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopPropagation()
      stop()
    }
    endDrag.current = stop
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', stop)
    window.addEventListener('keydown', onKey, true)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const arrow = ARROWS[e.key]
    if (arrow && e.altKey) {
      if (!movable || pending) return
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const size = editor.pageSizeOf(pageId)
      const base = { x: root.x ?? 0, y: root.y ?? 0 }
      const next = clampToPage(size, { x: base.x + (nudge?.dx ?? 0) + arrow.dx * step, y: base.y + (nudge?.dy ?? 0) + arrow.dy * step })
      const delta = { dx: next.x - base.x, dy: next.y - base.y }
      setNudge(delta)
      window.clearTimeout(nudgeTimer.current)
      nudgeTimer.current = window.setTimeout(() => {
        commitMove(pageId, base.x + delta.dx, base.y + delta.dy)
        setNudge(null)
      }, NUDGE_DELAY_MS)
      return
    }
    const target = arrow ? stepInOrder(order, id, arrow.dx + arrow.dy > 0 ? 1 : -1) : e.key === 'Home' ? stepInOrder(order, id, 'first') : e.key === 'End' ? stepInOrder(order, id, 'last') : null
    if (!arrow && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    if (!target || target === id) return
    const next = document.querySelector<HTMLElement>(pinSelector(target))
    if (next) {
      next.focus()
      return
    }
    // The pin is on a page that is not drawn yet: go there, and the pin takes the focus when it appears.
    const page = pageOf.get(target)
    if (page) editor.view.scrollToPage(page, 'auto')
    patchComments(editor, { reveal: { id: target, nonce: (editor.state.comments.reveal?.nonce ?? 0) + 1, focus: true } })
  }

  const x = snapToDevice(left + (nudge ? nudge.dx * zoom : 0), devicePixelRatio)
  const y = snapToDevice(top + (nudge ? nudge.dy * zoom : 0), devicePixelRatio)

  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.pin}
        style={{ left: x, top: y }}
        data-comment-pin={id}
        data-resolved={root.resolved || undefined}
        data-active={active || undefined}
        data-pulse={pulse || undefined}
        data-dragging={dragging || undefined}
        data-movable={movable || undefined}
        data-pending={pending || undefined}
        data-testid="comment-pin"
        aria-label={t.comments.pin.label(thread.number ?? 0, root.author.name, preview(root.body), root.resolved, thread.replies.length)}
        aria-description={movable ? t.comments.pin.move : undefined}
        aria-haspopup="dialog"
        aria-expanded={active}
        tabIndex={tabStop ? 0 : -1}
        onClick={toggle}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onPointerEnter={(e) => setHover(e.pointerType === 'mouse')}
        onPointerLeave={() => setHover(false)}
      >
        {root.resolved ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <span aria-hidden="true">{thread.number}</span>}
      </button>
      {hover && !active && !dragging ? (
        <div className={styles.preview} data-side={previewLeft ? 'left' : 'right'} style={{ left: x, top: y }} aria-hidden="true" data-testid="comment-pin-preview">
          <span className={styles.previewWho}>
            <strong>{root.author.name}</strong>
            {thread.replies.length > 0 ? <small>{t.comments.pin.replies(thread.replies.length)}</small> : null}
          </span>
          <span className={styles.previewBody}>{root.body}</span>
        </div>
      ) : null}
      {active ? <ThreadCardFloat thread={thread} anchorRef={button} /> : null}
    </>
  )
})
