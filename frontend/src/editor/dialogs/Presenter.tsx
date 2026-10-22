/**
 * The slideshow window ("Present"): the pages full screen on a black stage, letterboxed by their own size, with
 * keyboard, click, tap and swipe navigation, auto-advance by page time, a laser pointer, a black screen, speaker notes
 * and an optional second window (the presenter view, `presenter/view/`). It works on a snapshot of the design taken
 * when it starts: what a collaborator edits meanwhile does not change the show.
 *
 * Opened as a dialog (`editor.openDialog('presenter', { session? })`), so the editor's own shortcuts are off while it
 * is up. The state machine is `presenter/machine.ts`; this file wires it to the DOM.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from '../animation/useReducedMotion'
import { useEditor, usePortalRoot } from '../context'
import { useLatest } from '../hooks/useLatest'
import { canLink, isSessionId, newSessionId } from '../presenter/channel'
import { createFrameCache } from '../presenter/frames'
import { actionForKey, isActivationKey, type PresenterKey } from '../presenter/keymap'
import { remainingMs } from '../presenter/machine'
import { createMotionCache, motionDurations, planMotion } from '../presenter/motion'
import { pageNotes } from '../presenter/pageProps'
import { formatClock, hasTimings, resolveDurations } from '../presenter/timing'
import { useShowAudio } from '../presenter/useShowAudio'
import { useSlideshow } from '../presenter/useSlideshow'
import { useViewHost } from '../presenter/useViewHost'
import { hasStashedView, isWindowOpen, openViewWindow, takeViewWindow } from '../presenter/viewWindow'
import { t } from '../strings'
import { PresenterControls } from './PresenterControls'
import { PresenterMotionStage } from './PresenterMotionStage'
import { PresenterStage } from './PresenterStage'
import { PresenterTimeline } from './PresenterTimeline'
import styles from './Presenter.module.css'

/** Holding L this long makes the laser pointer a momentary tool (a shorter press switches it on until the next press). */
const LASER_HOLD_MS = 350
/** The cursor and the controls fade after this long without movement. */
const IDLE_MS = 2500
const SWIPE_MIN_PX = 48
const TAP_MAX_PX = 12
/** A tap on the left part of the stage goes back, anywhere else forward. */
const BACK_ZONE = 0.3
const MESSAGE_MS = 7000

interface Message {
  text: string
  title?: string
}

function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let timer = 0
    const wake = (): void => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), ms)
    }
    wake()
    const events = ['pointermove', 'pointerdown', 'keydown'] as const
    for (const name of events) document.addEventListener(name, wake, true)
    return () => {
      window.clearTimeout(timer)
      for (const name of events) document.removeEventListener(name, wake, true)
    }
  }, [ms])
  return idle
}

/** Full-screen slideshow of the pages. See the file comment. */
export function Presenter({ props }: { props?: Record<string, unknown> }) {
  const editor = useEditor()
  const root = usePortalRoot()
  const [doc] = useState(() => editor.state.doc)
  const [title] = useState(() => editor.state.title)
  const [start] = useState(() => Math.max(0, doc.pages.findIndex((p) => p.id === editor.state.activePageId)))
  const [session] = useState(() => (isSessionId(props?.session) ? props.session : newSessionId()))
  const wantsNotes = props?.withNotes === true
  const reduced = useReducedMotion()
  const plan = useMemo(() => planMotion(doc, reduced), [doc, reduced])
  const durations = useMemo(() => motionDurations(resolveDurations(doc.pages), plan), [doc, plan])
  const config = useMemo(() => ({ count: doc.pages.length, durations }), [doc, durations])
  const [state, dispatch] = useSlideshow(config, { index: start, autoAdvance: hasTimings(doc.pages) })
  const frames = useMemo(() => createFrameCache(editor, doc), [editor, doc])
  const previews = useMemo(() => createFrameCache(editor, doc), [editor, doc])
  // A show with motion in it draws its pages through frame renderers; a show of still pages keeps the plain stage.
  const motionFrames = useMemo(() => (plan.moves ? createMotionCache(editor, doc) : null), [editor, doc, plan])
  useEffect(() => () => motionFrames?.dispose(), [motionFrames])

  const overlayRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const viewWindow = useRef<Window | null>(null)
  // "Present with notes" asked for a second window; if the browser did not give one, say so and show the notes here.
  const [noWindow] = useState(() => wantsNotes && !hasStashedView(session))
  const [notesOpen, setNotesOpen] = useState(noWindow)
  const [laser, setLaser] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [message, setMessage] = useState<Message | null>(() => (noWindow ? (canLink() ? { title: t.presenter.blockedTitle, text: t.presenter.blockedBody } : { text: t.presenter.viewUnsupported }) : null))
  const [windowOpen, setWindowOpen] = useState(true)
  const say = useCallback((text: string, heading?: string) => setMessage({ text, title: heading }), [])
  // Sound the browser held back, or a file that did not load, is reported in the same place as the other notices.
  const sound = useShowAudio(doc, plan, state, say)
  const idle = useIdle(IDLE_MS)

  const close = useCallback(() => editor.closeDialog(), [editor])
  const host = useViewHost({ session, title, doc, durations, state, dispatch, onExit: close, previews })
  const viewOpen = host.connected && windowOpen

  // Everything the key handler reads: it is registered once and must never see stale values.
  const live = useLatest({ state, laser, helpOpen, close, sound })

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), MESSAGE_MS)
    return () => window.clearTimeout(timer)
  }, [message])

  /* ------------------------------------------------------------ presenter view window */

  useEffect(() => {
    const stashed = takeViewWindow(session)
    if (stashed) viewWindow.current = stashed
  }, [session])
  useEffect(() => {
    const timer = window.setInterval(() => setWindowOpen(viewWindow.current === null || isWindowOpen(viewWindow.current)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const openView = useCallback(() => {
    if (!host.supported) {
      say(t.presenter.viewUnsupported)
      setNotesOpen(true)
      return
    }
    if (viewOpen && isWindowOpen(viewWindow.current)) {
      viewWindow.current?.focus()
      return
    }
    const win = openViewWindow(session)
    if (!win) {
      say(t.presenter.blockedBody, t.presenter.blockedTitle)
      setNotesOpen(true)
      return
    }
    viewWindow.current = win
    setWindowOpen(true)
    say(t.presenter.viewOpened)
  }, [host.supported, say, session, viewOpen])

  /* ------------------------------------------------------------ full screen */

  const wasFullscreen = useRef(false)
  const leavingOnPurpose = useRef(false)
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    if (canFullscreen) el.requestFullscreen().catch(() => undefined)
    const onChange = (): void => {
      const on = document.fullscreenElement === el
      setFullscreen(on)
      // The browser's own Esc (or a gesture) left full screen: that ends the presentation, like pressing Esc here.
      if (!on && wasFullscreen.current && !leavingOnPurpose.current) live.current.close()
      wasFullscreen.current = on
      leavingOnPurpose.current = false
    }
    document.addEventListener('fullscreenchange', onChange)
    const previous = document.activeElement
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => undefined)
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true })
    }
  }, [canFullscreen, live])

  const toggleFullscreen = useCallback(() => {
    const el = overlayRef.current
    if (!el || !canFullscreen) return
    if (document.fullscreenElement) {
      leavingOnPurpose.current = true
      void document.exitFullscreen().catch(() => undefined)
    } else {
      el.requestFullscreen().catch(() => undefined)
    }
  }, [canFullscreen])

  /* ------------------------------------------------------------ keyboard */

  const laserHeldAt = useRef<number | null>(null)
  const run = useCallback(
    (action: PresenterKey, repeat: boolean): void => {
      const s = live.current
      if (repeat && action !== 'next' && action !== 'prev') return
      if (s.state.blackout && action !== 'toggleBlackout' && action !== 'exit' && action !== 'toggleFullscreen') dispatch({ type: 'setBlackout', on: false })
      switch (action) {
        case 'next':
        case 'prev':
        case 'first':
        case 'last':
        case 'restart':
          dispatch({ type: action })
          break
        case 'togglePause':
          dispatch({ type: 'togglePause' })
          break
        case 'toggleBlackout':
          dispatch({ type: 'toggleBlackout' })
          break
        case 'toggleFullscreen':
          toggleFullscreen()
          break
        case 'toggleNotes':
          setNotesOpen((open) => !open)
          break
        case 'toggleSound':
          if (s.sound.available) s.sound.setMuted(!s.sound.muted)
          break
        case 'toggleHelp':
          setHelpOpen((open) => !open)
          break
        case 'toggleLaser':
          if (s.laser) {
            setLaser(false)
            laserHeldAt.current = null
          } else {
            setLaser(true)
            laserHeldAt.current = performance.now()
          }
          break
        case 'exit':
          if (s.helpOpen) setHelpOpen(false)
          else s.close()
          break
      }
    },
    [dispatch, live, toggleFullscreen],
  )

  useEffect(() => {
    const overlay = overlayRef.current
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target
      if (e.key === 'Tab' && overlay && !(target instanceof Node && overlay.contains(target))) {
        e.preventDefault()
        overlay.focus({ preventScroll: true })
        return
      }
      const action = actionForKey(e)
      if (!action) return
      // Space and Enter belong to the control that has focus (a button of the pill), not to the slideshow.
      if (isActivationKey(e.key) && target instanceof Element && overlay?.contains(target) && target.closest('button, a, input, textarea, select')) return
      e.preventDefault()
      e.stopPropagation()
      run(action, e.repeat)
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== 'l' || laserHeldAt.current === null) return
      if (performance.now() - laserHeldAt.current >= LASER_HOLD_MS) setLaser(false)
      laserHeldAt.current = null
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keyup', onKeyUp, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keyup', onKeyUp, true)
    }
  }, [run])

  /* ------------------------------------------------------------ pointer */

  const press = useRef<{ x: number; y: number; at: number } | null>(null)
  const onStageDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    press.current = { x: e.clientX, y: e.clientY, at: e.timeStamp }
  }
  const onStageUp = (e: React.PointerEvent): void => {
    const from = press.current
    press.current = null
    if (!from || laser) return
    if (state.blackout) {
      dispatch({ type: 'setBlackout', on: false })
      return
    }
    const dx = e.clientX - from.x
    const dy = e.clientY - from.y
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > 1.5 * Math.abs(dy) && e.timeStamp - from.at < 900) {
      dispatch({ type: dx < 0 ? 'next' : 'prev' })
    } else if (Math.hypot(dx, dy) < TAP_MAX_PX) {
      const box = e.currentTarget.getBoundingClientRect()
      dispatch({ type: (e.clientX - box.left) / box.width < BACK_ZONE ? 'prev' : 'next' })
    }
  }
  const onOverlayMove = (e: React.PointerEvent): void => {
    const dot = dotRef.current
    if (!dot) return
    dot.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`
    dot.dataset.seen = ''
  }
  const onOverlayLeave = (): void => {
    if (dotRef.current) delete dotRef.current.dataset.seen
  }

  /* ------------------------------------------------------------ view */

  const page = doc.pages[Math.min(state.index, doc.pages.length - 1)]
  const left = remainingMs(config, state)
  const countdown = !state.autoAdvance || state.ended ? null : left === null ? t.presenter.waits : t.presenter.timeLeft(formatClock(Math.ceil(left / 1000) * 1000))
  const notes = pageNotes(page)

  // What lies over the page on the stage: the black screen and the end screen.
  const stageOverlays = (
    <>
      {state.blackout ? <div className={styles.black} data-testid="present-black" /> : null}
      {state.ended ? (
        <div className={styles.end} data-testid="present-end">
          <h2>{t.presenter.endTitle}</h2>
          <p>{t.presenter.endBody}</p>
          <div className={styles.endActions}>
            <button type="button" className={styles.textButton} data-testid="present-end-restart" onClick={() => dispatch({ type: 'restart' })}>
              {t.presenter.startAgain}
            </button>
            <button type="button" className={styles.textButton} data-testid="present-end-back" onClick={() => dispatch({ type: 'prev' })}>
              {t.presenter.back}
            </button>
            <button type="button" className={styles.textButton} data-testid="present-end-exit" onClick={close}>
              {t.presenter.exit}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )

  if (!root) return null
  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t.presenter.label}
      tabIndex={-1}
      data-idle={idle || undefined}
      data-laser={laser || undefined}
      data-testid="present-overlay"
      onPointerMove={onOverlayMove}
      onPointerLeave={onOverlayLeave}
    >
      <div className={styles.main}>
        {motionFrames ? (
          <PresenterMotionStage doc={doc} index={state.index} plan={plan} cache={motionFrames} loop={state.loop} onPointerDown={onStageDown} onPointerUp={onStageUp}>
            {stageOverlays}
          </PresenterMotionStage>
        ) : (
          <PresenterStage doc={doc} index={state.index} cache={frames} onPointerDown={onStageDown} onPointerUp={onStageUp}>
            {stageOverlays}
          </PresenterStage>
        )}
        {notesOpen ? (
          <aside className={styles.notes} aria-label={t.presenter.notes} data-testid="present-notes">
            {notes.trim() === '' ? <p className={styles.noNotes}>{t.presenter.noNotes}</p> : <p className={styles.notesText}>{notes}</p>}
          </aside>
        ) : null}
      </div>

      <PresenterTimeline config={config} state={state} dispatch={dispatch} />
      <PresenterControls
        state={state}
        count={doc.pages.length}
        countdown={countdown}
        notesOpen={notesOpen}
        laser={laser}
        fullscreen={fullscreen}
        canFullscreen={canFullscreen}
        viewOpen={viewOpen}
        sound={sound.available ? sound : null}
        dispatch={dispatch}
        onNotes={() => setNotesOpen((open) => !open)}
        onLaser={() => setLaser((on) => !on)}
        onFullscreen={toggleFullscreen}
        onView={openView}
        onHelp={() => setHelpOpen((open) => !open)}
        onExit={close}
      />

      {message ? (
        <div className={styles.message} role="status" data-testid="present-message">
          {message.title ? <strong>{message.title}</strong> : null}
          <span>{message.text}</span>
        </div>
      ) : null}
      {helpOpen ? (
        <div className={styles.help} role="dialog" aria-label={t.presenter.helpTitle} data-testid="present-help-panel">
          <h2>{t.presenter.helpTitle}</h2>
          <dl>
            {t.presenter.keys.map((row) => (
              <div key={row.keys}>
                <dt>{row.keys}</dt>
                <dd>{row.does}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className={styles.textButton} onClick={() => setHelpOpen(false)}>
            {t.presenter.helpClose}
          </button>
        </div>
      ) : null}
      <div ref={dotRef} className={styles.laser} data-on={laser || undefined} aria-hidden="true" data-testid="present-laser-dot" />
      <div className={styles.announce} role="status" aria-live="polite">
        {t.presenter.announce(Math.min(doc.pages.length, state.index + 1), doc.pages.length)}
      </div>
    </div>,
    root,
  )
}

