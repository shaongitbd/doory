/**
 * Registry commands of presenting and of speaker notes: they give the shortcuts, the More menu and the shortcuts
 * dialog one place to learn about them. Their ids start with `file.` / `view.` so they stay available in view-only
 * and comment-only links (anyone who can open the design can present it and read its notes).
 */
import { writableMetadata } from '@/i18n/metadata'
import { Download, Presentation, StickyNote } from 'lucide-react'
import { registerCommand } from '../commands'
import type { EditorEngine } from '../engine/editor'
import { downloadFiles } from '../engine/export/exporter'
import { toggleNotes } from '../panels/notesVisibility'
import { t } from '../strings'
import { newSessionId } from './channel'
import { hasNotes, type NotesFormat, notesFile } from './notesExport'
import { openViewWindow, stashViewWindow } from './viewWindow'

function downloadNotes(editor: EditorEngine, format: NotesFormat): void {
  const doc = editor.state.doc
  if (!hasNotes(doc)) {
    editor.toast(t.notes.downloadEmpty, 'info')
    return
  }
  const file = notesFile(doc, editor.state.title, format)
  downloadFiles([file])
  editor.toast(t.notes.downloaded(file.filename), 'success')
}

/**
 * Starts "Present with notes". The second window is opened right here, inside the click or key press that asked for
 * it (pop-up blockers only allow that), and handed to the slideshow by session id.
 */
function presentWithNotes(editor: EditorEngine): void {
  const session = newSessionId()
  stashViewWindow(session, openViewWindow(session))
  editor.openDialog('presenter', { session, withNotes: true })
}

registerCommand(writableMetadata({ id: 'file.present', get label() { return t.cmd.filePresent }, shortcut: 'Shift+P', get group() { return t.cmdGroup.file }, icon: <Presentation size={18} />, run: (e) => e.openDialog('presenter') }))
registerCommand(writableMetadata({ id: 'file.presentNotes', get label() { return t.cmd.filePresentNotes }, get group() { return t.cmdGroup.file }, icon: <Presentation size={18} />, run: presentWithNotes }))
registerCommand(writableMetadata({ id: 'view.notes', get label() { return t.cmd.viewNotes }, shortcut: 'Shift+N', get group() { return t.cmdGroup.view }, icon: <StickyNote size={18} />, run: toggleNotes }))
registerCommand(writableMetadata({ id: 'file.notesMarkdown', get label() { return t.notes.downloadMarkdown }, get group() { return t.cmdGroup.file }, icon: <Download size={18} />, run: (e) => downloadNotes(e, 'markdown') }))
registerCommand(writableMetadata({ id: 'file.notesText', get label() { return t.notes.downloadText }, get group() { return t.cmdGroup.file }, icon: <Download size={18} />, run: (e) => downloadNotes(e, 'text') }))
