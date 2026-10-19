/**
 * Built-in commands, registered through the same public registry extensions use.
 */
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
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
import { t } from '../strings'
import { openAccountDialog } from '../chrome/accountGate'
import { registerCommand } from '../commands'
import type { EditorEngine } from '../engine/editor'
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
    registerCommand({ id, label: t.cmd.nudge(Math.abs(dx || dy)), shortcut: key, group: t.cmdGroup.move, run: (e) => e.arrange.nudge(dx, dy), enabled: ({ state }) => state.selection.ids.length > 0 && !state.selection.editing })
  }
  nudge('move.left', 'ArrowLeft', -1, 0)
  nudge('move.right', 'ArrowRight', 1, 0)
  nudge('move.up', 'ArrowUp', 0, -1)
  nudge('move.down', 'ArrowDown', 0, 1)
  nudge('move.leftBig', 'Shift+ArrowLeft', -10, 0)
  nudge('move.rightBig', 'Shift+ArrowRight', 10, 0)
  nudge('move.upBig', 'Shift+ArrowUp', 0, -10)
  nudge('move.downBig', 'Shift+ArrowDown', 0, 10)

  registerCommand({ id: 'file.save', label: t.cmd.fileSave, shortcut: 'Mod+S', group: t.cmdGroup.file, icon: <Save size={18} />, whileEditing: true, run: (e) => e.persistence.saveNow() })
  registerCommand({ id: 'file.download', label: t.cmd.fileDownload, shortcut: 'Mod+Shift+D', group: t.cmdGroup.file, icon: <Download size={18} />, run: (e) => e.openDialog('download') })
  registerCommand({ id: 'file.shortcuts', label: t.cmd.fileShortcuts, shortcut: '?', group: t.cmdGroup.file, icon: <Keyboard size={18} />, run: (e) => e.openDialog('shortcuts') })
  registerCommand({ id: 'file.share', label: t.cmd.fileShare, group: t.cmdGroup.file, icon: <Share2 size={18} />, enabled: ({ state }) => !state.readOnly, run: (e) => openAccountDialog(e, 'share', 'share', (x) => !!x.adapter.services.sharing, t.share.unavailable) })
  registerCommand({ id: 'file.history', label: t.cmd.fileHistory, group: t.cmdGroup.file, icon: <History size={18} />, enabled: ({ state }) => !state.readOnly, run: (e) => openAccountDialog(e, 'version-history', 'versions', (x) => !!x.adapter.services.versions, t.versions.unavailable) })
  registerCommand({ id: 'file.bulkCreate', label: t.cmd.fileBulkCreate, group: t.cmdGroup.file, enabled: ({ state }) => !state.readOnly, run: (e) => openAccountDialog(e, 'save', 'bulk-create', (x) => !!x.adapter.services.bulkFill, t.bulk.unavailable) })
  registerCommand({ id: 'file.resize', label: t.cmd.fileResize, group: t.cmdGroup.file, run: (e) => e.openDialog('resize') })
  registerCommand({ id: 'file.reset', label: t.cmd.fileReset, group: t.cmdGroup.file, run: (e) => e.resetDesign(), enabled: ({ editor }) => editor.canResetDesign })
  registerCommand({ id: 'file.rename', label: t.cmd.fileRename, group: t.cmdGroup.file, run: (e) => e.openDialog('rename') })

  registerCommand({ id: 'edit.undo', label: t.cmd.editUndo, shortcut: 'Mod+Z', group: t.cmdGroup.edit, icon: <Undo2 size={18} />, whileEditing: true, run: (e) => e.undo(), enabled: ({ state }) => state.history.canUndo })
  registerCommand({ id: 'edit.redo', label: t.cmd.editRedo, shortcut: 'Mod+Shift+Z|Mod+Y', group: t.cmdGroup.edit, icon: <Redo2 size={18} />, whileEditing: true, run: (e) => e.redo(), enabled: ({ state }) => state.history.canRedo })
  registerCommand({ id: 'edit.cut', label: t.cmd.editCut, shortcut: 'Mod+X', group: t.cmdGroup.edit, icon: <Scissors size={18} />, displayOnly: true, run: (e) => e.clipboard.cut(), enabled: ({ editor }) => hasSelection(editor) })
  registerCommand({ id: 'edit.copy', label: t.cmd.editCopy, shortcut: 'Mod+C', group: t.cmdGroup.edit, icon: <Copy size={18} />, displayOnly: true, run: (e) => e.clipboard.copy(), enabled: ({ editor }) => hasSelection(editor) })
  registerCommand({ id: 'edit.paste', label: t.cmd.editPaste, shortcut: 'Mod+V', group: t.cmdGroup.edit, icon: <ClipboardPaste size={18} />, displayOnly: true, run: (e) => e.clipboard.paste() })
  registerCommand({ id: 'edit.duplicate', label: t.cmd.editDuplicate, shortcut: 'Mod+D', group: t.cmdGroup.edit, icon: <CopyPlus size={18} />, run: (e) => e.arrange.duplicate(), enabled: ({ editor }) => hasSelection(editor) })
  registerCommand({ id: 'edit.delete', label: t.cmd.editDelete, shortcut: 'Delete|Backspace', group: t.cmdGroup.edit, icon: <Trash2 size={18} />, run: (e) => e.arrange.delete(), enabled: ({ state }) => state.selection.ids.length > 0 && !state.selection.editing })
  registerCommand({ id: 'edit.selectAll', label: t.cmd.editSelectAll, shortcut: 'Mod+A', group: t.cmdGroup.edit, run: (e) => e.selectAll(), enabled: ({ state }) => !state.selection.editing })
  registerCommand({ id: 'edit.deselect', label: t.cmd.editDeselect, shortcut: 'Escape', group: t.cmdGroup.edit, run: (e) => { e.patchUi({ contextMenu: null }); if (e.state.ui.cropping) e.crop.cancel(); else e.clearSelection() }, enabled: ({ state }) => !state.selection.editing })
  registerCommand({ id: 'edit.group', label: t.cmd.editGroup, shortcut: 'Mod+G', group: t.cmdGroup.edit, icon: <Group size={18} />, run: (e) => e.arrange.group(), enabled: ({ state }) => state.selection.ids.length > 1 })
  registerCommand({ id: 'edit.ungroup', label: t.cmd.editUngroup, shortcut: 'Mod+Shift+G', group: t.cmdGroup.edit, icon: <Ungroup size={18} />, run: (e) => e.arrange.ungroup(), enabled: ({ state }) => state.selection.ids.length === 1 && state.selection.kinds.includes('group') })
  registerCommand({ id: 'edit.lock', label: t.cmd.editLock, shortcut: 'Mod+L|Alt+Shift+L', group: t.cmdGroup.edit, icon: <Lock size={18} />, run: (e) => e.arrange.toggleLock(), enabled: ({ state }) => state.selection.ids.length > 0 })
  registerCommand({ id: 'edit.flipH', label: t.cmd.editFlipH, group: t.cmdGroup.edit, icon: <FlipHorizontal2 size={18} />, run: (e) => e.arrange.flip('horizontal'), enabled: ({ state }) => state.selection.ids.length > 0 })
  registerCommand({ id: 'edit.flipV', label: t.cmd.editFlipV, group: t.cmdGroup.edit, icon: <FlipVertical2 size={18} />, run: (e) => e.arrange.flip('vertical'), enabled: ({ state }) => state.selection.ids.length > 0 })

  registerCommand({ id: 'arrange.front', label: t.cmd.arrangeFront, shortcut: 'Mod+Shift+]|Mod+Alt+]', group: t.cmdGroup.arrange, icon: <ArrowUpToLine size={18} />, run: (e) => e.arrange.zOrder('front'), enabled: ({ editor }) => hasSelection(editor) })
  registerCommand({ id: 'arrange.forward', label: t.cmd.arrangeForward, shortcut: 'Mod+]', group: t.cmdGroup.arrange, icon: <BringToFront size={18} />, run: (e) => e.arrange.zOrder('forward'), enabled: ({ editor }) => hasSelection(editor) })
  registerCommand({ id: 'arrange.backward', label: t.cmd.arrangeBackward, shortcut: 'Mod+[', group: t.cmdGroup.arrange, icon: <SendToBack size={18} />, run: (e) => e.arrange.zOrder('backward'), enabled: ({ editor }) => hasSelection(editor) })
  registerCommand({ id: 'arrange.back', label: t.cmd.arrangeBack, shortcut: 'Mod+Shift+[|Mod+Alt+[', group: t.cmdGroup.arrange, icon: <ArrowDownToLine size={18} />, run: (e) => e.arrange.zOrder('back'), enabled: ({ editor }) => hasSelection(editor) })

  const textOnly = ({ state }: { state: { selection: { kinds: string[] } } }): boolean => state.selection.kinds.includes('text')
  registerCommand({ id: 'text.bold', label: t.cmd.textBold, shortcut: 'Mod+B', group: t.cmdGroup.text, icon: <Bold size={18} />, whileEditing: true, run: toggleBold, enabled: textOnly })
  registerCommand({ id: 'text.italic', label: t.cmd.textItalic, shortcut: 'Mod+I', group: t.cmdGroup.text, icon: <Italic size={18} />, whileEditing: true, run: toggleItalic, enabled: textOnly })
  registerCommand({ id: 'text.underline', label: t.cmd.textUnderline, shortcut: 'Mod+U', group: t.cmdGroup.text, icon: <Underline size={18} />, whileEditing: true, run: toggleUnderline, enabled: textOnly })
  registerCommand({ id: 'text.alignLeft', label: t.cmd.textAlignLeft, shortcut: 'Mod+Shift+L', group: t.cmdGroup.text, icon: <AlignLeft size={18} />, whileEditing: true, run: (e) => e.style.text({ textAlign: 'left' }, t.history.alignText), enabled: textOnly })
  registerCommand({ id: 'text.alignCenter', label: t.cmd.textAlignCenter, shortcut: 'Mod+Shift+E', group: t.cmdGroup.text, icon: <AlignCenter size={18} />, whileEditing: true, run: (e) => e.style.text({ textAlign: 'center' }, t.history.alignText), enabled: textOnly })
  registerCommand({ id: 'text.alignRight', label: t.cmd.textAlignRight, shortcut: 'Mod+Shift+R', group: t.cmdGroup.text, icon: <AlignRight size={18} />, whileEditing: true, run: (e) => e.style.text({ textAlign: 'right' }, t.history.alignText), enabled: textOnly })
  registerCommand({ id: 'text.justify', label: t.cmd.textJustify, shortcut: 'Mod+Shift+J', group: t.cmdGroup.text, icon: <AlignJustify size={18} />, whileEditing: true, run: (e) => e.style.text({ textAlign: 'justify' }, t.history.alignText), enabled: textOnly })

  registerCommand({ id: 'insert.text', label: t.cmd.insertText, shortcut: 'T', group: t.cmdGroup.add, run: (e) => e.setTool('text') })
  registerCommand({ id: 'insert.rect', label: t.cmd.insertRect, shortcut: 'R', group: t.cmdGroup.add, run: (e) => e.insert.shape('rect') })
  registerCommand({ id: 'insert.ellipse', label: t.cmd.insertEllipse, shortcut: 'C', group: t.cmdGroup.add, run: (e) => e.insert.shape('ellipse') })
  registerCommand({ id: 'insert.line', label: t.cmd.insertLine, shortcut: 'L', group: t.cmdGroup.add, run: (e) => e.insert.shape('line') })
  registerCommand({ id: 'tool.select', label: t.cmd.toolSelect, shortcut: 'V', group: t.cmdGroup.tools, run: (e) => e.setTool('select') })
  registerCommand({ id: 'tool.hand', label: t.cmd.toolHand, shortcut: 'H', group: t.cmdGroup.tools, run: (e) => e.setTool('hand') })

  registerCommand({ id: 'view.zoomIn', label: t.cmd.viewZoomIn, shortcut: 'Mod+=|Mod++|=|+', group: t.cmdGroup.view, run: (e) => e.view.zoomIn() })
  registerCommand({ id: 'view.zoomOut', label: t.cmd.viewZoomOut, shortcut: 'Mod+-|-', group: t.cmdGroup.view, run: (e) => e.view.zoomOut() })
  registerCommand({ id: 'view.fit', label: t.cmd.viewFit, shortcut: 'Shift+1|1', group: t.cmdGroup.view, run: (e) => e.view.fit('fit-page') })
  registerCommand({ id: 'view.fitWidth', label: t.cmd.viewFitWidth, group: t.cmdGroup.view, run: (e) => e.view.fit('fit-width') })
  registerCommand({ id: 'view.actual', label: t.cmd.viewActual, shortcut: 'Shift+0|0', group: t.cmdGroup.view, run: (e) => e.view.actualSize() })
  registerCommand({ id: 'view.rulers', label: t.cmd.viewRulers, shortcut: 'Shift+R', group: t.cmdGroup.view, run: (e) => e.patchUi({ rulers: !e.state.ui.rulers }) })
  registerCommand({ id: 'view.grid', label: t.cmd.viewGrid, shortcut: "Mod+'", group: t.cmdGroup.view, run: (e) => e.patchUi({ grid: !e.state.ui.grid }) })
  registerCommand({ id: 'view.guides', label: t.cmd.viewGuides, group: t.cmdGroup.view, run: (e) => e.patchUi({ guides: !e.state.ui.guides }) })
  registerCommand({ id: 'view.snapping', label: t.cmd.viewSnapping, group: t.cmdGroup.view, run: (e) => e.patchUi({ snapping: !e.state.ui.snapping }) })
  // The viewer's own chrome, not the design: a view. command, so it also works on view-only and comment links.
  registerCommand({ id: 'view.highContrast', label: t.cmd.viewHighContrast, group: t.cmdGroup.view, run: () => toggleContrast() })

  registerCommand({ id: 'page.add', label: t.cmd.pageAdd, group: t.cmdGroup.pages, run: (e) => void e.pages.add() })
  registerCommand({ id: 'page.duplicate', label: t.cmd.pageDuplicate, group: t.cmdGroup.pages, run: (e) => e.pages.duplicate(e.state.activePageId) })
  registerCommand({ id: 'page.delete', label: t.cmd.pageDelete, group: t.cmdGroup.pages, run: (e) => e.pages.remove(e.state.activePageId), enabled: ({ state }) => state.doc.pages.length > 1 })
  registerCommand({ id: 'page.prev', label: t.cmd.pagePrev, shortcut: 'PageUp', group: t.cmdGroup.pages, run: (e) => stepPage(e, -1) })
  registerCommand({ id: 'page.next', label: t.cmd.pageNext, shortcut: 'PageDown', group: t.cmdGroup.pages, run: (e) => stepPage(e, 1) })

  registerCommand({ id: 'image.replace', label: t.cmd.imageReplace, group: t.cmdGroup.image, icon: <Replace size={18} />, run: (e) => void e.insert.pickAndReplaceImage(), enabled: ({ state }) => !state.readOnly && state.selection.ids.length === 1 && (state.selection.kinds.includes('image') || state.selection.kinds.includes('placeholder')) && !state.selection.editing })
  registerCommand({ id: 'image.crop', label: t.cmd.imageCrop, shortcut: 'Enter', group: t.cmdGroup.image, run: (e) => (e.state.ui.cropping ? e.crop.apply() : e.crop.start()), enabled: ({ state }) => state.ui.cropping !== null || (state.selection.ids.length === 1 && state.selection.kinds.includes('image') && !state.selection.editing) })
}

function stepPage(e: EditorEngine, delta: number): void {
  const pages = e.state.doc.pages
  const i = e.pageIndex(e.state.activePageId)
  const next = pages[Math.min(pages.length - 1, Math.max(0, i + delta))]
  if (next) e.pages.activate(next.id)
}

registerBuiltinCommands()
