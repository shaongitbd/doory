import { type ComponentType, useSyncExternalStore } from 'react'
import { useEditor, useEditorState } from '../context'
import { loadable } from '../ui/loadable'
import { DialogLoadFailed, DialogLoading } from './DialogLoading'
import { PresenterDialog } from './PresenterLoader'
import { RenameDialog } from './RenameDialog'
import { dialogs, registerDialog, type DialogDefinition } from './registry'

// Every dialog but the small rename one is a chunk of its own, downloaded when it first opens (or when the button that
// opens it is hovered, see `preloadDialog`). The registry only holds cheap descriptors.
const dialogChunk = <P extends object>(load: () => Promise<ComponentType<P>>) => loadable(load, { fallback: <DialogLoading />, failed: (retry) => <DialogLoadFailed onRetry={retry} /> })
const ShortcutsDialog = dialogChunk(() => import('./ShortcutsDialog').then((m) => m.ShortcutsDialog))
const ResizeDialog = dialogChunk(() => import('./ResizeDialog').then((m) => m.ResizeDialog))
const DownloadDialog = dialogChunk(() => import('./DownloadDialog').then((m) => m.DownloadDialog))
const BackgroundRemovalDialog = dialogChunk(() => import('./BackgroundRemovalDialog').then((m) => m.BackgroundRemovalDialog))
const UpscaleDialog = dialogChunk(() => import('./UpscaleDialog').then((m) => m.UpscaleDialog))
const ShareDialog = dialogChunk(() => import('./ShareDialog').then((m) => m.ShareDialog))
const VersionsDialog = dialogChunk(() => import('./VersionsDialog').then((m) => m.VersionsDialog))
const BulkCreateDialog = dialogChunk(() => import('./BulkCreateDialog').then((m) => m.BulkCreateDialog))
const UploadFontDialog = dialogChunk(() => import('../fonts/UploadFontDialog').then((m) => m.UploadFontDialog))

const lazyDialog = (id: string, component: DialogDefinition['component'] & { preload(): void }): DialogDefinition => ({ id, component, preload: component.preload })

registerDialog(lazyDialog('shortcuts', ShortcutsDialog))
registerDialog(lazyDialog('resize', ResizeDialog))
registerDialog(lazyDialog('download', DownloadDialog))
registerDialog(lazyDialog('background-removal', BackgroundRemovalDialog))
registerDialog(lazyDialog('upscale', UpscaleDialog))
registerDialog(lazyDialog('share', ShareDialog))
registerDialog(lazyDialog('versions', VersionsDialog))
registerDialog(lazyDialog('bulk-create', BulkCreateDialog))
registerDialog(lazyDialog('upload-font', UploadFontDialog))
registerDialog({ id: 'presenter', component: PresenterDialog })

/** Renders the dialog opened with `editor.openDialog(id, props)`. */
export function DialogHost({ onTitle }: { onTitle: (title: string) => void }) {
  const editor = useEditor()
  const current = useEditorState((s) => s.ui.dialog)
  useSyncExternalStore(dialogs.subscribe, dialogs.getSnapshot)
  if (!current) return null
  if (current.id === 'rename') return <RenameDialog key="rename" onTitle={onTitle} />
  const def = dialogs.get(current.id)
  if (!def) {
    editor.closeDialog()
    return null
  }
  const Component = def.component
  return <Component key={current.id + JSON.stringify(current.props ?? {})} props={current.props} />
}
