import { msg } from '@/i18n/catalog'
import { Folder, FolderPlus, Home } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useCreateFolder, useFolders } from '@/lib/api/hooks'
import type { FolderT } from '@/types/api'
import { Button, Dialog, Input, Skeleton, useToast } from '@/ui'
import { errorMessage } from './errorMessage'
import styles from './MoveToFolderDialog.module.css'

export interface MoveToFolderDialogProps {
  open: boolean
  count: number
  /** Folder the designs currently live in (disabled as a target when all share it). */
  currentFolder?: string | null
  onClose(): void
  onMove(folder: string | null, folderName: string): void
}

interface Row {
  folder: FolderT
  depth: number
}

function flatten(folders: FolderT[]): Row[] {
  const byParent = new Map<string | null, FolderT[]>()
  for (const folder of folders) byParent.set(folder.parent, [...(byParent.get(folder.parent) ?? []), folder])
  const rows: Row[] = []
  const walk = (parent: string | null, depth: number, guard: Set<string>) => {
    for (const folder of (byParent.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      if (guard.has(folder.id)) continue
      rows.push({ folder, depth })
      walk(folder.id, depth + 1, new Set([...guard, folder.id]))
    }
  }
  walk(null, 0, new Set())
  return rows
}

export function MoveToFolderDialog({ open, count, currentFolder, onClose, onMove }: MoveToFolderDialogProps) {
  const folders = useFolders(open)
  const create = useCreateFolder()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const rows = useMemo(() => flatten(folders.data ?? []), [folders.data])

  function createFolder(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (folder) => {
          setName('')
          onMove(folder.id, folder.name)
        },
        onError: (error) => toast({ title: msg("Couldn’t create the folder"), description: errorMessage(error), variant: 'error' }),
      },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title={count === 1 ? 'Move design' : `Move ${count} designs`} description={msg("Choose a folder.")} size="sm">
      <div className={styles.list}>
        <button type="button" className={styles.row} disabled={currentFolder === null} onClick={() => onMove(null, 'All designs')}>
          <Home size={18} aria-hidden="true" />
          <span>{msg("All designs (top level)")}</span>
        </button>
        {folders.isPending ? <Skeleton height={40} /> : null}
        {rows.map(({ folder, depth }) => (
          <button key={folder.id} type="button" className={styles.row} style={{ paddingLeft: `calc(var(--space-3) + ${depth} * var(--space-5))` }} disabled={currentFolder === folder.id} onClick={() => onMove(folder.id, folder.name)}>
            <Folder size={18} aria-hidden="true" />
            <span>{folder.name}</span>
            <span className={styles.count}>{folder.design_count}</span>
          </button>
        ))}
        {folders.isError ? <p className={styles.error}>{msg("Folders couldn’t be loaded.")}</p> : null}
      </div>
      <form className={styles.create} onSubmit={createFolder}>
        <Input label={msg("New folder")} hideLabel placeholder={msg("New folder name")} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} leftIcon={<FolderPlus size={16} />} />
        <Button type="submit" variant="secondary" loading={create.isPending} disabled={!name.trim()}>
          {msg("Create and move")}</Button>
      </form>
    </Dialog>
  )
}
