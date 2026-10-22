import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { EditorAppProps, EditorHandle } from '@/types/adapter'
import './builtins/commands'
import './builtins/audio'
import './builtins/clips'
import './builtins/panels'
import './builtins/toolbar'
import './animation/commands'
import './presenter/commands'
import './panels/commentsCommands'
import './engine/export/formats'
import { CollabBanner } from './collab/CollabBanner'
import type { CollabSession } from './collab/session'
import { exposeForTests } from './collab/testHook'
import { ConflictBanner } from './ConflictBanner'
import { MissingFontsNotice } from './fonts/MissingFontsNotice'
import { ContextMenuHost } from './ContextMenuHost'
import { DialogHost } from './dialogs/DialogHost'
import { AudioSyncHost } from './panels/AudioSyncHost'
import { BrandSync } from './panels/BrandSync'
import { NotesHost } from './panels/NotesBar'
import { useEditorState } from './context'
import { EditorProvider } from './EditorProvider'
import { EditorEngine } from './engine/editor'
import { useClipboardEvents, useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useLatest } from './hooks/useLatest'
import { ChromeProvider } from './chrome/ChromeContext'
import { DrawerHost, SidebarHost } from './chrome/ToolHost'
import { ToolRail } from './chrome/ToolRail'
import { ContextualToolbar } from './toolbar/ContextualToolbar'
import { TopBar } from './TopBar'
import { t } from './strings'
import { Toaster } from './ui/Toaster'
import { PageStrip } from './workspace/PageStrip'
import { LazyTimelineHost } from './workspace/TimelineLoader'
import { Workspace } from './workspace/Workspace'
import styles from './EditorApp.module.css'

/** How many times the code of the live session is fetched again (after 1, 2, 4, 8 s …) before the person is told to reload. */
const COLLAB_LOAD_ATTEMPTS = 4

function LiveRegion() {
  const message = useEditorState((s) => s.announcement)
  return (
    <div className={styles.live} role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}

/**
 * The Doory editor. Mount it with a document, meta and an `EditorAdapter`; everything else (canvas, tools,
 * panels, history, export, autosave triggering) lives inside.
 */
export const EditorApp = forwardRef<EditorHandle, EditorAppProps>(function EditorApp(props, ref) {
  const { document: doc, meta, adapter, onTitleChange, onSaveStateChange, onConflictResolve, topBarStart, topBarEnd } = props
  const [engine] = useState(() => new EditorEngine({ adapter, document: doc, meta }))
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [stripOpen, setStripOpen] = useState(false)
  const latest = useLatest({ onTitleChange, onSaveStateChange })
  const [session, setSession] = useState<CollabSession | null>(null)
  const [liveEpoch, setLiveEpoch] = useState(0)
  const realtime = adapter.realtime ?? null

  useImperativeHandle(
    ref,
    () => ({
      saveNow: () => engine.persistence.saveNow(),
      getDocument: () => engine.getDocument(),
      isDirty: () => engine.persistence.isDirty(),
    }),
    [engine],
  )

  // Lifecycle: start/stop are re-entrant so StrictMode's mount → unmount → mount is harmless; the final
  // teardown only runs if nobody restarted the engine on the next tick.
  useEffect(() => {
    engine.start()
    engine.persistence.start({ onSaveStateChange: (s) => latest.current.onSaveStateChange?.(s), onUseRealtime: () => setLiveEpoch((n) => n + 1) })
    return () => {
      engine.stop()
      setTimeout(() => {
        if (!engine.isRunning) engine.dispose()
      }, 0)
    }
  }, [engine, latest])

  useEffect(() => {
    engine.setAdapter(adapter)
  }, [engine, adapter])

  useEffect(() => {
    engine.setMode(meta.mode)
  }, [engine, meta.mode])

  useEffect(() => {
    engine.setTitle(meta.title)
  }, [engine, meta.title])

  useEffect(() => {
    engine.setDesignId(meta.id)
  }, [engine, meta.id])

  // A different design under the same mounted editor: replace the document.
  const firstId = useRef(meta.id)
  useEffect(() => {
    if (firstId.current === meta.id) return
    firstId.current = meta.id
    void engine.loadDocument(doc)
  }, [engine, meta.id, doc])

  // Live editing: while the adapter offers a room, the design is edited together (src/editor/collab). The code of the session
  // (Yjs and the binding, about a quarter of the editor) is downloaded only now, so a design edited alone never pays for it.
  // The connection opens on the next tick so React's development double-mount does not open one just to close it.
  useEffect(() => {
    if (!realtime) return
    let live: CollabSession | null = null
    let stopped = false
    let timer: number | undefined
    const open = (attempt: number): void => {
      import('./collab/session').then(
        ({ CollabSession: Session }) => {
          if (stopped) return
          live = new Session(engine, realtime)
          live.start()
          setSession(live)
        },
        () => {
          if (stopped) return
          if (attempt >= COLLAB_LOAD_ATTEMPTS) engine.toast(t.collab.notice.unavailable, 'error')
          else timer = window.setTimeout(() => open(attempt + 1), 1000 * 2 ** attempt)
        },
      )
    }
    timer = window.setTimeout(() => open(0), 0)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      live?.destroy()
      setSession((current) => (current === live ? null : current))
    }
  }, [engine, realtime, meta.id, liveEpoch])

  useEffect(() => exposeForTests({ engine, session }), [engine, session])

  // Responsive breakpoint: drawers and sidebars become bottom sheets below 1024px. Tools always start closed,
  // like the other drawers (a remembered panel id from an earlier session is dropped).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = (): void => engine.patchUi({ compact: mq.matches })
    engine.patchUi({ compact: mq.matches, panelId: null })
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [engine])

  useKeyboardShortcuts(engine, rootRef)
  useClipboardEvents(engine, rootRef)

  const setRootEl = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el
    setRoot(el)
  }, [])

  const onTitle = (title: string): void => latest.current.onTitleChange?.(title)

  return (
    <div ref={setRootEl} className={styles.root} data-editor-root aria-label={t.appLabel} role="application">
      <EditorProvider engine={engine} portalRoot={root} collab={session}>
        <ChromeProvider>
          <TopBar start={topBarStart} end={topBarEnd} onTitle={onTitle} onPresent={() => engine.openDialog('presenter')} />
          <ConflictBanner onResolve={onConflictResolve} />
          <CollabBanner />
          <MissingFontsNotice />
          <div className={styles.body}>
            <ToolRail edge="side" />
            <SidebarHost />
            <div className={styles.main}>
              <ContextualToolbar />
              <Workspace stripOpen={stripOpen} onToggleStrip={() => setStripOpen((o) => !o)} />
              <NotesHost />
              <LazyTimelineHost />
              {stripOpen ? <PageStrip /> : null}
            </div>
          </div>
          <ToolRail edge="bottom" />
          <DrawerHost />
        </ChromeProvider>
        <DialogHost onTitle={onTitle} />
        <BrandSync />
        <AudioSyncHost />
        <ContextMenuHost />
        <Toaster />
        <LiveRegion />
      </EditorProvider>
    </div>
  )
})
