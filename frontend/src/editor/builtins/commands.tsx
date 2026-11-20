/**
 * Built-in commands, registered through the same public registry extensions use.
 */
import { writableMetadata } from '@/i18n/metadata'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Archive,
  Bold,
  BringToFront,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  History,
  Italic,
  Keyboard,
  Lock,
  Maximize,
  Redo2,
  Replace,
  Save,
  Scissors,
  SendToBack,
  Share2,
  Trash2,
  Underline,
  Undo2,
  Ungroup,
  ArrowUpToLine,
  ArrowDownToLine,
} from 'lucide-react'
import { toggleContrast } from '@/lib/contrast'
import { downloadBlob } from '@/lib/download'
import { t } from '../strings'
import { openAccountDialog } from '../chrome/accountGate'
import { registerCommand } from '../commands'
import type { EditorEngine } from '../engine/editor'
import { playbackOf } from '../animation/playback'
import { isBold, textValue } from './textState'

const hasSelection = (e: EditorEngine): boolean => e.state.selection.ids.length > 0

function toggleBold(e: EditorEngine): void {
  const bold = isBold(textValue(e.state.selection, 'fontWeight'))
  e.style.text({ fontWeight: bold ? 400 : 700 }, t.history.bold)
}

function toggleItalic(e: EditorEngine): void {
  const italic = textValue(e.state.selection, 'fontStyle') === 'italic'
  e.style.text({ fontStyle: italic ? 'normal' : 'italic' }, t.history.italic)
}

function toggleUnderline(e: EditorEngine): void {
  e.style.text({ underline: !textValue(e.state.selection, 'underline') }, t.history.underline)
}

export function registerBuiltinCommands(): void {
  const nudge = (id: string, key: string, dx: number, dy: number): void => {
    registerCommand(writableMetadata({ id, get label() { return t.cmd.nudge(Math.abs(dx || dy)) }, shortcut: key, get group() { return t.cmdGroup.move }, run: (e) => e.arrange.nudge(dx, dy), enabled: ({ state }) => state.selection.ids.length > 0 && !state.selection.editing }))
  }
  nudge('move.left', 'ArrowLeft', -1, 0)
  nudge('move.right', 'ArrowRight', 1, 0)
  nudge('move.up', 'ArrowUp', 0, -1)
  nudge('move.down', 'ArrowDown', 0, 1)
  nudge('move.leftBig', 'Shift+ArrowLeft', -10, 0)
  nudge('move.rightBig', 'Shift+ArrowRight', 10, 0)
  nudge('move.upBig', 'Shift+ArrowUp', 0, -10)
  nudge('move.downBig', 'Shift+ArrowDown', 0, 10)

  registerCommand(writableMetadata({ id: 'file.save', get label() { return t.cmd.fileSave }, shortcut: 'Mod+S', get group() { return t.cmdGroup.file }, icon: <Save size={18} />, whileEditing: true, run: (e) => e.persistence.saveNow() }))
  registerCommand(writableMetadata({ id: 'file.download', get label() { return t.cmd.fileDownload }, shortcut: 'Mod+Shift+D', get group() { return t.cmdGroup.file }, icon: <Download size={18} />, run: (e) => e.openDialog('download') }))
  registerCommand(writableMetadata({
    id: 'file.exportProject',
    get label() { return t.cmd.fileExportProject },
    get group() { return t.cmdGroup.file },
    icon: <Archive size={18} />,
    enabled: ({ editor, state }) => state.mode === 'guest' && !!editor.adapter.exportProject,
    run: async (e) => {
      try {
        await e.persistence.saveNow()
        const project = await e.adapter.exportProject?.()
        if (!project) return
        downloadBlob(project.blob, project.filename)
        e.toast(t.projectBackup.exported, 'success')
      } catch (error) {
        e.toast(error instanceof Error ? error.message : t.projectBackup.exportFailed, 'error')
      }
    },
  }))
  registerCommand(writableMetadata({ id: 'file.shortcuts', get label() { return t.cmd.fileShortcuts }, shortcut: '?', get group() { return t.cmdGroup.file }, icon: <Keyboard size={18} />, run: (e) => e.openDialog('shortcuts') }))
  registerCommand(writableMetadata({ id: 'file.share', get label() { return t.cmd.fileShare }, get group() { return t.cmdGroup.file }, icon: <Share2 size={18} />, enabled: ({ state }) => !state.readOnly, run: (e) => openAccountDialog(e, 'share', 'share', (x) => !!x.adapter.services.sharing, t.share.unavailable) }))
  registerCommand(writableMetadata({ id: 'file.history', get label() { return t.cmd.fileHistory }, get group() { return t.cmdGroup.file }, icon: <History size={18} />, enabled: ({ state }) => !state.readOnly, run: (e) => openAccountDialog(e, 'version-history', 'versions', (x) => !!x.adapter.services.versions, t.versions.unavailable) }))
  registerCommand(writableMetadata({ id: 'file.bulkCreate', get label() { return t.cmd.fileBulkCreate }, get group() { return t.cmdGroup.file }, enabled: ({ state }) => !state.readOnly, run: (e) => openAccountDialog(e, 'save', 'bulk-create', (x) => !!x.adapter.services.bulkFill, t.bulk.unavailable) }))
  registerCommand(writableMetadata({ id: 'file.resize', get label() { return t.cmd.fileResize }, get group() { return t.cmdGroup.file }, run: (e) => e.openDialog('resize') }))
  registerCommand(writableMetadata({ id: 'file.reset', get label() { return t.cmd.fileReset }, get group() { return t.cmdGroup.file }, run: (e) => e.resetDesign(), enabled: ({ editor }) => editor.canResetDesign }))
  registerCommand(writableMetadata({ id: 'file.rename', get label() { return t.cmd.fileRename }, get group() { return t.cmdGroup.file }, run: (e) => e.openDialog('rename') }))

  registerCommand(writableMetadata({ id: 'edit.undo', get label() { return t.cmd.editUndo }, shortcut: 'Mod+Z', get group() { return t.cmdGroup.edit }, icon: <Undo2 size={18} />, whileEditing: true, run: (e) => e.undo(), enabled: ({ state }) => state.history.canUndo }))
  registerCommand(writableMetadata({ id: 'edit.redo', get label() { return t.cmd.editRedo }, shortcut: 'Mod+Shift+Z|Mod+Y', get group() { return t.cmdGroup.edit }, icon: <Redo2 size={18} />, whileEditing: true, run: (e) => e.redo(), enabled: ({ state }) => state.history.canRedo }))
  registerCommand(writableMetadata({ id: 'edit.cut', get label() { return t.cmd.editCut }, shortcut: 'Mod+X', get group() { return t.cmdGroup.edit }, icon: <Scissors size={18} />, displayOnly: true, run: (e) => e.clipboard.cut(), enabled: ({ editor }) => hasSelection(editor) }))
  registerCommand(writableMetadata({ id: 'edit.copy', get label() { return t.cmd.editCopy }, shortcut: 'Mod+C', get group() { return t.cmdGroup.edit }, icon: <Copy size={18} />, displayOnly: true, run: (e) => e.clipboard.copy(), enabled: ({ editor }) => hasSelection(editor) }))
  registerCommand(writableMetadata({ id: 'edit.paste', get label() { return t.cmd.editPaste }, shortcut: 'Mod+V', get group() { return t.cmdGroup.edit }, icon: <ClipboardPaste size={18} />, displayOnly: true, run: (e) => e.clipboard.paste() }))
  registerCommand(writableMetadata({ id: 'edit.duplicate', get label() { return t.cmd.editDuplicate }, shortcut: 'Mod+D', get group() { return t.cmdGroup.edit }, icon: <CopyPlus size={18} />, run: (e) => e.arrange.duplicate(), enabled: ({ editor }) => hasSelection(editor) }))
  registerCommand(writableMetadata({ id: 'edit.delete', get label() { return t.cmd.editDelete }, shortcut: 'Delete|Backspace', get group() { return t.cmdGroup.edit }, icon: <Trash2 size={18} />, run: (e) => e.arrange.delete(), enabled: ({ state }) => state.selection.ids.length > 0 && !state.selection.editing }))
  registerCommand(writableMetadata({ id: 'edit.selectAll', get label() { return t.cmd.editSelectAll }, shortcut: 'Mod+A', get group() { return t.cmdGroup.edit }, run: (e) => e.selectAll(), enabled: ({ state }) => !state.selection.editing }))
  registerCommand(writableMetadata({ id: 'edit.deselect', get label() { return t.cmd.editDeselect }, shortcut: 'Escape', get group() { return t.cmdGroup.edit }, run: (e) => { e.patchUi({ contextMenu: null }); if (e.state.ui.cropping) e.crop.cancel(); else e.clearSelection() }, enabled: ({ state }) => !state.selection.editing }))
  registerCommand(writableMetadata({
    id: 'edit.group',
    get label() { return t.cmd.editGroup },
    shortcut: 'Mod+G',
    get group() { return t.cmdGroup.edit },
    icon: <Group size={18} />,
    run: (e) => e.arrange.group(),
    // A grid owns its cell children. Nesting it in another group would hide those children from grid editing.
    enabled: ({ state }) => state.selection.ids.length > 1 && !state.selection.kinds.includes('image-grid'),
  }))
  registerCommand(writableMetadata({ id: 'edit.ungroup', get label() { return t.cmd.editUngroup }, shortcut: 'Mod+Shift+G', get group() { return t.cmdGroup.edit }, icon: <Ungroup size={18} />, run: (e) => e.arrange.ungroup(), enabled: ({ state }) => state.selection.ids.length === 1 && state.selection.kinds.includes('group') }))
  registerCommand(writableMetadata({ id: 'edit.lock', get label() { return t.cmd.editLock }, shortcut: 'Mod+L|Alt+Shift+L', get group() { return t.cmdGroup.edit }, icon: <Lock size={18} />, run: (e) => e.arrange.toggleLock(), enabled: ({ state }) => state.selection.ids.length > 0 }))
  registerCommand(writableMetadata({ id: 'arrange.fitToPage', get label() { return t.toolbar.fitToPage }, get group() { return t.cmdGroup.edit }, icon: <Maximize size={18} />, run: (e) => e.arrange.fitToPage(), enabled: ({ editor }) => editor.arrange.canFitToPage() }))
  registerCommand(writableMetadata({ id: 'edit.flipH', get label() { return t.cmd.editFlipH }, get group() { return t.cmdGroup.edit }, icon: <FlipHorizontal2 size={18} />, run: (e) => e.arrange.flip('horizontal'), enabled: ({ state }) => state.selection.ids.length > 0 }))
  registerCommand(writableMetadata({ id: 'edit.flipV', get label() { return t.cmd.editFlipV }, get group() { return t.cmdGroup.edit }, icon: <FlipVertical2 size={18} />, run: (e) => e.arrange.flip('vertical'), enabled: ({ state }) => state.selection.ids.length > 0 }))

  registerCommand(writableMetadata({ id: 'arrange.front', get label() { return t.cmd.arrangeFront }, shortcut: 'Mod+Shift+]|Mod+Alt+]', get group() { return t.cmdGroup.arrange }, icon: <ArrowUpToLine size={18} />, run: (e) => e.arrange.zOrder('front'), enabled: ({ editor }) => hasSelection(editor) }))
  registerCommand(writableMetadata({ id: 'arrange.forward', get label() { return t.cmd.arrangeForward }, shortcut: 'Mod+]', get group() { return t.cmdGroup.arrange }, icon: <BringToFront size={18} />, run: (e) => e.arrange.zOrder('forward'), enabled: ({ editor }) => hasSelection(editor) }))
  registerCommand(writableMetadata({ id: 'arrange.backward', get label() { return t.cmd.arrangeBackward }, shortcut: 'Mod+[', get group() { return t.cmdGroup.arrange }, icon: <SendToBack size={18} />, run: (e) => e.arrange.zOrder('backward'), enabled: ({ editor }) => hasSelection(editor) }))
  registerCommand(writableMetadata({ id: 'arrange.back', get label() { return t.cmd.arrangeBack }, shortcut: 'Mod+Shift+[|Mod+Alt+[', get group() { return t.cmdGroup.arrange }, icon: <ArrowDownToLine size={18} />, run: (e) => e.arrange.zOrder('back'), enabled: ({ editor }) => hasSelection(editor) }))

  const textOnly = ({ state }: { state: { selection: { kinds: string[] } } }): boolean => state.selection.kinds.includes('text')
  registerCommand(writableMetadata({ id: 'text.bold', get label() { return t.cmd.textBold }, shortcut: 'Mod+B', get group() { return t.cmdGroup.text }, icon: <Bold size={18} />, whileEditing: true, run: toggleBold, enabled: textOnly }))
  registerCommand(writableMetadata({ id: 'text.italic', get label() { return t.cmd.textItalic }, shortcut: 'Mod+I', get group() { return t.cmdGroup.text }, icon: <Italic size={18} />, whileEditing: true, run: toggleItalic, enabled: textOnly }))
  registerCommand(writableMetadata({ id: 'text.underline', get label() { return t.cmd.textUnderline }, shortcut: 'Mod+U', get group() { return t.cmdGroup.text }, icon: <Underline size={18} />, whileEditing: true, run: toggleUnderline, enabled: textOnly }))
  registerCommand(writableMetadata({ id: 'text.alignLeft', get label() { return t.cmd.textAlignLeft }, shortcut: 'Mod+Shift+L', get group() { return t.cmdGroup.text }, icon: <AlignLeft size={18} />, whileEditing: true, run: (e) => e.style.text({ textAlign: 'left' }, t.history.alignText), enabled: textOnly }))
  registerCommand(writableMetadata({ id: 'text.alignCenter', get label() { return t.cmd.textAlignCenter }, shortcut: 'Mod+Shift+E', get group() { return t.cmdGroup.text }, icon: <AlignCenter size={18} />, whileEditing: true, run: (e) => e.style.text({ textAlign: 'center' }, t.history.alignText), enabled: textOnly }))
  registerCommand(writableMetadata({ id: 'text.alignRight', get label() { return t.cmd.textAlignRight }, shortcut: 'Mod+Shift+R', get group() { return t.cmdGroup.text }, icon: <AlignRight size={18} />, whileEditing: true, run: (e) => e.style.text({ textAlign: 'right' }, t.history.alignText), enabled: textOnly }))
  registerCommand(writableMetadata({ id: 'text.justify', get label() { return t.cmd.textJustify }, shortcut: 'Mod+Shift+J', get group() { return t.cmdGroup.text }, icon: <AlignJustify size={18} />, whileEditing: true, run: (e) => e.style.text({ textAlign: 'justify' }, t.history.alignText), enabled: textOnly }))

  registerCommand(writableMetadata({ id: 'insert.text', get label() { return t.cmd.insertText }, shortcut: 'T', get group() { return t.cmdGroup.add }, run: (e) => e.setTool('text') }))
  registerCommand(writableMetadata({ id: 'insert.rect', get label() { return t.cmd.insertRect }, shortcut: 'R', get group() { return t.cmdGroup.add }, run: (e) => e.insert.shape('rect') }))
  registerCommand(writableMetadata({ id: 'insert.ellipse', get label() { return t.cmd.insertEllipse }, shortcut: 'C', get group() { return t.cmdGroup.add }, run: (e) => e.insert.shape('ellipse') }))
  registerCommand(writableMetadata({ id: 'insert.line', get label() { return t.cmd.insertLine }, shortcut: 'L', get group() { return t.cmdGroup.add }, run: (e) => e.insert.shape('line') }))
  registerCommand(writableMetadata({ id: 'tool.select', get label() { return t.cmd.toolSelect }, shortcut: 'V', get group() { return t.cmdGroup.tools }, run: (e) => e.setTool('select') }))
  registerCommand(writableMetadata({ id: 'tool.hand', get label() { return t.cmd.toolHand }, shortcut: 'H', get group() { return t.cmdGroup.tools }, run: (e) => e.setTool('hand') }))

  registerCommand(writableMetadata({ id: 'view.zoomIn', get label() { return t.cmd.viewZoomIn }, shortcut: 'Mod+=|Mod++|=|+', get group() { return t.cmdGroup.view }, run: (e) => e.view.zoomIn() }))
  registerCommand(writableMetadata({ id: 'view.zoomOut', get label() { return t.cmd.viewZoomOut }, shortcut: 'Mod+-|-', get group() { return t.cmdGroup.view }, run: (e) => e.view.zoomOut() }))
  registerCommand(writableMetadata({ id: 'view.fit', get label() { return t.cmd.viewFit }, shortcut: 'Shift+1|1', get group() { return t.cmdGroup.view }, run: (e) => e.view.fit('fit-page') }))
  registerCommand(writableMetadata({ id: 'view.fitWidth', get label() { return t.cmd.viewFitWidth }, get group() { return t.cmdGroup.view }, run: (e) => e.view.fit('fit-width') }))
  registerCommand(writableMetadata({ id: 'view.actual', get label() { return t.cmd.viewActual }, shortcut: 'Shift+0|0', get group() { return t.cmdGroup.view }, run: (e) => e.view.actualSize() }))
  registerCommand(writableMetadata({ id: 'view.rulers', get label() { return t.cmd.viewRulers }, shortcut: 'Shift+R', get group() { return t.cmdGroup.view }, run: (e) => e.patchUi({ rulers: !e.state.ui.rulers }) }))
  registerCommand(writableMetadata({ id: 'view.grid', get label() { return t.cmd.viewGrid }, shortcut: "Mod+'", get group() { return t.cmdGroup.view }, run: (e) => e.patchUi({ grid: !e.state.ui.grid }) }))
  registerCommand(writableMetadata({ id: 'view.guides', get label() { return t.cmd.viewGuides }, get group() { return t.cmdGroup.view }, run: (e) => e.patchUi({ guides: !e.state.ui.guides }) }))
  registerCommand(writableMetadata({ id: 'view.snapping', get label() { return t.cmd.viewSnapping }, get group() { return t.cmdGroup.view }, run: (e) => e.patchUi({ snapping: !e.state.ui.snapping }) }))
  // The viewer's own chrome, not the design: a view. command, so it also works on view-only and comment links.
  registerCommand(writableMetadata({ id: 'view.highContrast', get label() { return t.cmd.viewHighContrast }, get group() { return t.cmdGroup.view }, run: () => toggleContrast() }))

  registerCommand(writableMetadata({ id: 'page.add', get label() { return t.cmd.pageAdd }, get group() { return t.cmdGroup.pages }, run: (e) => void e.pages.add() }))
  registerCommand(writableMetadata({ id: 'page.duplicate', get label() { return t.cmd.pageDuplicate }, get group() { return t.cmdGroup.pages }, run: (e) => e.pages.duplicate(e.state.activePageId) }))
  registerCommand(writableMetadata({ id: 'page.delete', get label() { return t.cmd.pageDelete }, get group() { return t.cmdGroup.pages }, run: (e) => e.pages.remove(e.state.activePageId), enabled: ({ state }) => state.doc.pages.length > 1 }))
  registerCommand(writableMetadata({ id: 'page.prev', get label() { return t.cmd.pagePrev }, shortcut: 'PageUp', get group() { return t.cmdGroup.pages }, run: (e) => stepPage(e, -1) }))
  registerCommand(writableMetadata({ id: 'page.next', get label() { return t.cmd.pageNext }, shortcut: 'PageDown', get group() { return t.cmdGroup.pages }, run: (e) => stepPage(e, 1) }))

  registerCommand(writableMetadata({ id: 'image.replace', get label() { return t.cmd.imageReplace }, get group() { return t.cmdGroup.image }, icon: <Replace size={18} />, run: (e) => void e.insert.pickAndReplaceImage(), enabled: ({ state }) => !state.readOnly && state.selection.ids.length === 1 && (state.selection.kinds.includes('image') || state.selection.kinds.includes('placeholder')) && !state.selection.editing }))
  const oneClip = ({ state }: { state: EditorEngine['state'] }): boolean => state.selection.ids.length === 1 && state.selection.kinds[0] === 'video'
  registerCommand(writableMetadata({
    id: 'video.split',
    get label() { return t.clips.menu.split },
    shortcut: 'S',
    get group() { return t.cmdGroup.image },
    run: (e) => {
      if (!e.videos.split(undefined, playbackOf(e).state.timeMs)) e.toast(t.clips.toolbar.splitHint, 'info')
    },
    enabled: oneClip,
  }))
  registerCommand(writableMetadata({ id: 'video.replace', get label() { return t.clips.menu.replace }, get group() { return t.cmdGroup.image }, run: (e) => void e.videos.startReplace(), enabled: oneClip }))
  registerCommand(writableMetadata({
    id: 'video.blurredBackground',
    get label() { return t.clips.menu.blurredBackground },
    get group() { return t.cmdGroup.image },
    run: (e) => void e.videos.blurredBackground(),
    enabled: ({ editor, state }) => oneClip({ state }) && !editor.videos.get()?.backdropOf,
  }))
  registerCommand(writableMetadata({
    id: 'video.detachAudio',
    get label() { return t.clips.menu.detachAudio },
    get group() { return t.cmdGroup.image },
    run: (e) => void e.videos.detachAudio(),
    // A track has no playback speed: the sound of a faster or slower clip would drift from its picture.
    enabled: ({ editor, state }) => {
      const clip = editor.videos.get()
      return oneClip({ state }) && !!clip?.audioSrc && !clip.muted && clip.speed === 1
    },
  }))
  registerCommand(writableMetadata({
    id: 'video.background',
    get label() { return t.clips.menu.setAsBackground },
    get group() { return t.cmdGroup.image },
    run: (e) => void e.videos.setAsBackground(),
    enabled: ({ state }) => state.selection.ids.length === 1 && state.selection.kinds[0] === 'video' && !state.selection.locked,
  }))
  registerCommand(writableMetadata({ id: 'image.crop', get label() { return t.cmd.imageCrop }, shortcut: 'Enter', get group() { return t.cmdGroup.image }, run: (e) => (e.state.ui.cropping ? e.crop.apply() : e.crop.start()), enabled: ({ state }) => state.ui.cropping !== null || (state.selection.ids.length === 1 && (state.selection.kinds.includes('image') || state.selection.kinds.includes('video')) && !state.selection.editing) }))
}

function stepPage(e: EditorEngine, delta: number): void {
  const pages = e.state.doc.pages
  const i = e.pageIndex(e.state.activePageId)
  const next = pages[Math.min(pages.length - 1, Math.max(0, i + delta))]
  if (next) e.pages.activate(next.id)
}

registerBuiltinCommands()
