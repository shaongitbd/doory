import { useLocale } from '@/i18n/useLocale'
import { contextMenuItems } from './contextMenuItems'
import { useEditor, useEditorState } from './context'
import { t } from './strings'
import { Menu } from './ui/Menu'

/** Right-click menu built from the command registry. */
export function ContextMenuHost() {
  useLocale()
  const editor = useEditor()
  const menu = useEditorState((s) => s.ui.contextMenu)
  const selection = useEditorState((s) => s.selection)
  // Built on every render (not memoized), so the labels follow a language change.
  const items = menu ? contextMenuItems(editor, selection) : []

  if (!menu) return null
  return <Menu label={t.context.copy} items={items} at={{ x: menu.x, y: menu.y }} onClose={() => editor.patchUi({ contextMenu: null })} />
}
