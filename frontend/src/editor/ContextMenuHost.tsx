import { useMemo } from 'react'
import { contextMenuItems } from './contextMenuItems'
import { useEditor, useEditorState } from './context'
import { t } from './strings'
import { Menu } from './ui/Menu'

/** Right-click menu built from the command registry. */
export function ContextMenuHost() {
  const editor = useEditor()
  const menu = useEditorState((s) => s.ui.contextMenu)
  const selection = useEditorState((s) => s.selection)
  const items = useMemo(() => (menu ? contextMenuItems(editor, selection) : []), [menu, selection, editor])

  if (!menu) return null
  return <Menu label={t.context.copy} items={items} at={{ x: menu.x, y: menu.y }} onClose={() => editor.patchUi({ contextMenu: null })} />
}
