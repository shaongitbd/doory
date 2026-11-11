import { commands, isCommandEnabled } from './commands'
import type { EditorEngine } from './engine/editor'
import { canFitKind } from './engine/api/arrange'
import type { SelectionState } from './store/editorStore'
import { t } from './strings'
import type { MenuItem } from './ui/Menu'

function itemFor(editor: EditorEngine, id: string, label?: string): MenuItem | null {
  const cmd = commands.get(id)
  if (!cmd) return null
  return {
    id,
    label: label ?? cmd.label,
    icon: cmd.icon,
    shortcut: cmd.shortcut,
    disabled: !isCommandEnabled(cmd, { editor, state: editor.state }),
    onSelect: () => void cmd.run(editor),
  }
}

/** Build the actions shared by the canvas context menu and the top bar Edit menu. */
export function contextMenuItems(editor: EditorEngine, selection: SelectionState, includePageActions = true): MenuItem[] {
  const sep = (id: string): MenuItem => ({ id, separator: true })
  const pick = (...ids: string[]): MenuItem[] => ids.map((id) => itemFor(editor, id)).filter((i): i is MenuItem => !!i)
  if (selection.ids.length === 0) {
    return [...pick('edit.paste', 'edit.selectAll'), ...(includePageActions ? [sep('s1'), ...pick('page.add', 'file.resize')] : [])]
  }
  const lockLabel = selection.locked ? t.menuMisc.unlock : t.menuMisc.lock
  const list: MenuItem[] = [...pick('edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.delete'), sep('s1'), ...pick('arrange.front', 'arrange.forward', 'arrange.backward', 'arrange.back'), sep('s2')]
  if (selection.ids.length > 1) list.push(...pick('edit.group'))
  if (selection.kinds.includes('group') && selection.ids.length === 1) list.push(...pick('edit.ungroup'))
  const lock = itemFor(editor, 'edit.lock', lockLabel)
  if (lock) list.push(lock)
  if (selection.ids.length === 1 && canFitKind(selection.kinds[0])) list.push(...pick('arrange.fitToPage'))
  if (selection.ids.length === 1 && selection.kinds[0] === 'image') list.push(sep('s3'), ...pick('image.replace', 'image.crop'))
  else if (selection.ids.length === 1 && selection.kinds[0] === 'placeholder') list.push(sep('s3'), ...pick('image.replace'))
  else if (selection.ids.length === 1 && selection.kinds[0] === 'video') list.push(sep('s3'), ...pick('image.crop', 'video.split', 'video.replace', 'video.blurredBackground', 'video.detachAudio', 'video.background'))
  return list
}
