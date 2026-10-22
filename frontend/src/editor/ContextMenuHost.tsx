import { useMemo } from 'react'
import { commands, isCommandEnabled } from './commands'
import { canFitKind } from './engine/api/arrange'
import { useEditor, useEditorState } from './context'
import { t } from './strings'
import { Menu, type MenuItem } from './ui/Menu'

function itemFor(editor: ReturnType<typeof useEditor>, id: string, label?: string): MenuItem | null {
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

/** Right-click menu built from the command registry. */
export function ContextMenuHost() {
  const editor = useEditor()
  const menu = useEditorState((s) => s.ui.contextMenu)
  const selection = useEditorState((s) => s.selection)
  const items = useMemo<MenuItem[]>(() => {
    if (!menu) return []
    const sep = (id: string): MenuItem => ({ id, separator: true })
    const pick = (...ids: string[]): MenuItem[] => ids.map((id) => itemFor(editor, id)).filter((i): i is MenuItem => !!i)
    if (selection.ids.length === 0) {
      return [...pick('edit.paste'), ...pick('edit.selectAll'), sep('s1'), ...pick('page.add', 'file.resize')]
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
    return list
  }, [menu, selection, editor])

  if (!menu) return null
  return <Menu label={t.context.copy} items={items} at={{ x: menu.x, y: menu.y }} onClose={() => editor.patchUi({ contextMenu: null })} />
}
