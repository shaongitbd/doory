import { writableMetadata } from '@/i18n/metadata'
import { registerCommand } from '../commands'
import { t } from '../strings'
import { setCommentMode } from './commentsMode'
import { panels } from './registry'

/**
 * `Shift+C`: opens the Comments sidebar (which turns comment mode on) and toggles comment mode while it is open. The id
 * starts with `view.` so the command also works in comment-only links, where the rest of the editor's commands are off.
 */
registerCommand(writableMetadata({
  id: 'view.comments',
  get label() { return t.cmd.viewComments },
  shortcut: 'Shift+C',
  get group() { return t.cmdGroup.view },
  enabled: ({ editor, state }) => panels.get('comments')?.requires?.({ editor, state }) ?? false,
  run: (editor) => {
    if (editor.state.ui.panelId !== 'comments') editor.patchUi({ panelId: 'comments' })
    else setCommentMode(editor, !editor.state.comments.mode)
  },
}))
