import { ChevronDown, Menu as MenuIcon, Presentation, Share2, Users } from 'lucide-react'
import { useContrast } from '@/lib/contrast'
import { useSizePresets } from '@/lib/sizePresets'
import { getPageSize } from './engine/pageSizes'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useCollabState } from './collab/context'
import { PresenceStack } from './chrome/PresenceStack'
import { openAccountDialog } from './chrome/accountGate'
import { I } from './chrome/icons'
import { useChrome, useOpenTool } from './chrome/ChromeContext'
import { useEditor, useEditorState } from './context'
import { commands, isCommandEnabled } from './commands'
import { type ExportFormat, DEFAULT_EXPORT_OPTIONS, exportFormats } from './engine/export/registry'
import { downloadFiles, runExport } from './engine/export/exporter'
import { useNotesOpen } from './panels/notesVisibility'
import { useTimelineView } from './workspace/timelineVisibility'
import { type PanelDefinition } from './panels/registry'
import { preloadDialog } from './dialogs/registry'
import { useVisiblePanels } from './panels/useVisiblePanels'
import { SaveStatus } from './SaveStatus'
import { t } from './strings'
import { Menu, type MenuItem } from './ui/Menu'
import { Tooltip } from './ui/Tooltip'
import ed from './chrome/ed.module.css'
import styles from './TopBar.module.css'

interface TopBarProps {
  start?: ReactNode
  end?: ReactNode
  onTitle: (title: string) => void
  onPresent: () => void
}

/** Below this bar width File and View become one menu and the title moves into the left-hand group. */
const NARROW_BAR = 760

function TitleField({ onTitle }: { onTitle: (title: string) => void }) {
  const editor = useEditor()
  const title = useEditorState((s) => s.title)
  const locked = useEditorState((s) => s.readOnly)
  const cannotRename = useCollabState((s) => !s.canRename) === true
  const readOnly = locked || cannotRename
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (value: string): void => {
    setDraft(null)
    editor.setTitle(value)
    onTitle(editor.state.title)
  }
  return (
    <input
      className={styles.title}
      value={draft ?? title}
      readOnly={readOnly}
      aria-label={t.topbar.title}
      data-testid="ed-topbar-title"
      maxLength={120}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** A tool that lives as an icon button at the right end of the bar (Comments). */
function EndTool({ panel, open, onToggle }: { panel: PanelDefinition; open: boolean; onToggle: () => void }) {
  const chrome = useChrome()
  const ref = useCallback((el: HTMLButtonElement | null) => chrome.setAnchor(panel.id, el), [chrome, panel.id])
  return (
    <Tooltip label={panel.label}>
      <button ref={ref} type="button" className={`${ed.btn} ${ed.iconOnly} ${ed.ghost} ${open ? ed.pressed : ''}`} aria-label={panel.label} aria-pressed={open} data-testid={`ed-end-${panel.id}`} onPointerEnter={panel.preload} onFocus={panel.preload} onClick={onToggle}>
        {panel.icon}
      </button>
    </Tooltip>
  )
}

/** A text button in the bar that opens a menu (File, View). */
function MenuButton({ label, items, testId, icon, onOpen }: { label: string; items: MenuItem[]; testId: string; icon?: ReactNode; onOpen?: () => void }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`${styles.menuBtn} ${icon ? styles.menuIcon : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={icon ? label : undefined}
        data-testid={testId}
        onPointerEnter={onOpen}
        onClick={() => setOpen((o) => !o)}
      >
        {icon ?? label}
      </button>
      {open ? <Menu label={label} items={items} anchorRef={anchor} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

/**
 * The one primary action: sharing with people, downloading and presenting live in a single menu, so the bar
 * keeps one call to action instead of three buttons side by side.
 */
function ShareMenu({ onPresent }: { onPresent: () => void }) {
  const editor = useEditor()
  const mode = useEditorState((s) => s.mode)
  const readOnly = useEditorState((s) => s.readOnly)
  const formats = useSyncExternalStore(exportFormats.subscribe, exportFormats.getSnapshot)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  // The account dialog may take a moment to load; a second pick of "Share with people" meanwhile is ignored.
  const sharing = useRef(false)
  const canShare = !readOnly && (mode === 'guest' || !!editor.adapter.services.sharing)

  const quick = useCallback(
    async (format: ExportFormat): Promise<void> => {
      setBusy(true)
      try {
        const files = await runExport(editor, { formatId: format.id, pages: { kind: 'all' }, options: format.id === 'png' ? { ...DEFAULT_EXPORT_OPTIONS, transparent: true } : DEFAULT_EXPORT_OPTIONS })
        downloadFiles(files)
        editor.toast(t.dialog.downloadDone, 'success')
      } catch (err) {
        editor.toast(err instanceof Error && err.message ? err.message : t.dialog.downloadFailed, 'error')
      } finally {
        setBusy(false)
      }
    },
    [editor],
  )

  const share = (): void => {
    if (sharing.current) return
    sharing.current = true
    void openAccountDialog(editor, 'share', 'share', (x) => !!x.adapter.services.sharing, t.share.unavailable).finally(() => {
      sharing.current = false
    })
  }

  const presentNotes = commands.get('file.presentNotes')
  const quickFormats = formats.filter((f) => ['jpg', 'png', 'pdf', 'svg'].includes(f.id) && (!f.available || f.available(editor)))
  const items: MenuItem[] = [
    ...(canShare ? [{ id: 'share-people', label: t.topbar.shareWithPeople, hint: t.topbar.shareWithPeopleHint, icon: <Users size={16} aria-hidden="true" />, onSelect: share }, { id: 's-share', separator: true }] : []),
    { id: 'h-download', label: t.topbar.downloadHeading, heading: true },
    ...quickFormats.map((f) => ({ id: f.id, label: f.label, hint: t.topbar.formatHint[f.id as 'jpg'], onSelect: () => void quick(f) })),
    { id: 'video', label: t.topbar.videoDownload, hint: t.topbar.videoDownloadHint, onSelect: () => editor.openDialog('download', { format: 'mp4' }) },
    { id: 'more', label: t.topbar.moreDownloadOptions, onSelect: () => editor.openDialog('download') },
    { id: 's-present', separator: true },
    { id: 'h-present', label: t.topbar.presentHeading, heading: true },
    { id: 'present', label: t.topbar.presentFull, icon: <Presentation size={16} aria-hidden="true" />, onSelect: onPresent },
    ...(presentNotes ? [{ id: 'present-notes', label: presentNotes.label, icon: presentNotes.icon, onSelect: () => void presentNotes.run(editor) }] : []),
  ]
  const label = busy ? t.dialog.downloadWorking : canShare ? t.topbar.share : t.dialog.downloadButton
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`${ed.btn} ${ed.primary} ${styles.share}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        data-testid="ed-share"
        onPointerEnter={() => {
          preloadDialog('download')
          if (canShare) preloadDialog('share')
        }}
        onFocus={() => preloadDialog('download')}
        onClick={() => setOpen((o) => !o)}
      >
        {canShare ? <Share2 size={15} aria-hidden="true" /> : I.download}
        <span className={styles.btnLabel}>{label}</span>
        <ChevronDown size={14} aria-hidden="true" className={styles.chevron} />
      </button>
      {open ? <Menu label={label} items={items} anchorRef={anchor} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/**
 * The bar: the design's menus, history and save state on the left, its title in the middle, and the people,
 * comments and the one Share menu on the right. The tools that add to the design live in the rail (ToolRail).
 */
export function TopBar({ start, end, onTitle, onPresent }: TopBarProps) {
  const editor = useEditor()
  const history = useEditorState((s) => s.history)
  const readOnly = useEditorState((s) => s.readOnly)
  const ui = useEditorState((s) => s.ui)
  const notesOpen = useNotesOpen()
  const timelineOpen = useTimelineView().open
  const highContrast = useContrast().effective === 'more'
  const guideCount = useEditorState((s) => s.doc.pages.find((p) => p.id === s.activePageId)?.guides?.length ?? 0)
  // Re-read when the server's size presets arrive: they say which sizes have a safe zone.
  useSizePresets()
  const hasSafeZone = useEditorState((s) => {
    const size = getPageSize(s.doc, s.activePageId)
    return editor.safeZoneFor(size.width, size.height) !== null
  })
  const visible = useVisiblePanels()
  const { openId, toggle } = useOpenTool()
  const barRef = useRef<HTMLElement>(null)
  const barWidth = useWidth(barRef)
  const narrow = barWidth > 0 && barWidth < NARROW_BAR

  const endTools = visible.filter((p) => p.slot === 'end' && (!readOnly || p.readOnly))

  const cmd = (id: string, label?: string): MenuItem => {
    const c = commands.get(id)
    return {
      id,
      label: label ?? c?.label ?? id,
      shortcut: c?.shortcut,
      icon: c?.icon,
      disabled: c ? !isCommandEnabled(c, { editor, state: editor.state }) : true,
      onSelect: () => c && void c.run(editor),
    }
  }
  const notesDownloads: MenuItem[] = [cmd('file.notesMarkdown'), cmd('file.notesText')]
  const fileItems: MenuItem[] = readOnly
    ? [cmd('file.download'), ...notesDownloads]
    : [
        cmd('file.rename'),
        cmd('file.resize'),
        cmd('file.bulkCreate'),
        cmd('file.history'),
        cmd('file.save'),
        { id: 'f1', separator: true },
        cmd('page.add', t.menu.newPage),
        { id: 'f2', separator: true },
        cmd('file.download'),
        ...notesDownloads,
        { id: 'f3', separator: true },
        cmd('file.reset'),
      ]
  const viewItems: MenuItem[] = [
    ...(readOnly
      ? []
      : [
          { id: 'rulers', label: t.menu.rulers, checked: ui.rulers, onSelect: () => editor.patchUi({ rulers: !ui.rulers }) },
          { id: 'grid', label: t.menu.grid, checked: ui.grid, onSelect: () => editor.patchUi({ grid: !ui.grid }) },
          { id: 'guides', label: t.menu.guides, checked: ui.guides, onSelect: () => editor.patchUi({ guides: !ui.guides }) },
          { id: 'snap', label: t.menu.snapping, checked: ui.snapping, onSelect: () => editor.patchUi({ snapping: !ui.snapping }) },
          { id: 'bleed', label: t.menu.bleed, checked: ui.bleed, onSelect: () => editor.patchUi({ bleed: !ui.bleed }) },
          ...(hasSafeZone ? [{ id: 'safe-zone', label: t.menu.safeZone, checked: ui.safeZone, onSelect: () => editor.patchUi({ safeZone: !ui.safeZone }) }] : []),
          ...(guideCount > 0 ? [{ id: 'clear-guides', label: t.design.clearGuides(guideCount), onSelect: () => editor.pages.setGuides(editor.state.activePageId, []) }] : []),
          { id: 'v1', separator: true },
        ]),
    { ...cmd('view.notes'), checked: notesOpen },
    { ...cmd('view.timeline'), checked: timelineOpen },
    cmd('view.playPage'),
    { ...cmd('view.highContrast'), checked: highContrast },
    { id: 'v2', separator: true },
    cmd('file.shortcuts'),
  ]
  /** Phone widths: one menu with a heading per group, and Comments joins it so the bar keeps room for the title. */
  const combinedItems: MenuItem[] = [
    ...endTools.map((p) => ({ id: `tool-${p.id}`, label: p.label, icon: p.icon, checked: openId === p.id || undefined, onSelect: () => toggle(p.id) })),
    ...(endTools.length > 0 ? [{ id: 'c0', separator: true }] : []),
    { id: 'h-file', label: t.topbar.file, heading: true },
    ...fileItems,
    { id: 'c1', separator: true },
    { id: 'h-view', label: t.topbar.view, heading: true },
    ...viewItems,
  ]

  useEffect(() => {
    if (readOnly) editor.patchUi({ panelId: null })
  }, [readOnly, editor])

  return (
    <header ref={barRef} className={styles.bar} data-testid="ed-topbar" data-narrow={narrow || undefined}>
      <div className={styles.left}>
        {start}
        {narrow ? (
          <MenuButton label={t.topbar.menu} items={combinedItems} testId="ed-more" icon={<MenuIcon size={18} aria-hidden="true" />} onOpen={() => preloadDialog('download')} />
        ) : (
          <nav className={styles.menus} aria-label={t.topbar.menus}>
            <MenuButton label={t.topbar.file} items={fileItems} testId="ed-menu-file" onOpen={() => preloadDialog('download')} />
            <MenuButton label={t.topbar.view} items={viewItems} testId="ed-menu-view" />
          </nav>
        )}
        {readOnly ? null : (
          <span className={styles.history}>
            <Tooltip label={history.undoLabel ? `${t.topbar.undo} ${history.undoLabel.toLowerCase()}` : t.topbar.undo} shortcut="Mod+Z" disabled={!history.canUndo}>
              <button type="button" className={`${ed.btn} ${ed.iconOnly} ${ed.ghost}`} aria-label={t.topbar.undo} disabled={!history.canUndo} data-testid="ed-undo" onClick={() => void editor.undo()}>
                {I.undo}
              </button>
            </Tooltip>
            <Tooltip label={history.redoLabel ? `${t.topbar.redo} ${history.redoLabel.toLowerCase()}` : t.topbar.redo} shortcut="Mod+Shift+Z" disabled={!history.canRedo}>
              <button type="button" className={`${ed.btn} ${ed.iconOnly} ${ed.ghost}`} aria-label={t.topbar.redo} disabled={!history.canRedo} data-testid="ed-redo" onClick={() => void editor.redo()}>
                {I.redo}
              </button>
            </Tooltip>
          </span>
        )}
        {narrow ? <TitleField onTitle={onTitle} /> : null}
        <SaveStatus />
      </div>

      {narrow ? null : (
        <div className={styles.center}>
          <TitleField onTitle={onTitle} />
        </div>
      )}

      <div className={styles.right}>
        <div className={styles.presence}>
          <PresenceStack />
        </div>
        {!narrow ? endTools.map((p) => <EndTool key={p.id} panel={p} open={openId === p.id} onToggle={() => toggle(p.id)} />) : null}
        {end ? <div className={styles.end}>{end}</div> : null}
        <ShareMenu onPresent={onPresent} />
      </div>
    </header>
  )
}
