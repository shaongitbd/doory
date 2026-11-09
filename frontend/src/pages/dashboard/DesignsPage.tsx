import { msg } from '@/i18n/catalog'
import { FolderPlus, LayoutGrid, List, Plus, Search, Star, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BulkBar } from '@/features/dashboard/BulkBar'
import { DesignCard } from '@/features/dashboard/DesignCard'
import { FolderCard } from '@/features/dashboard/FolderCard'
import { MoveToFolderDialog } from '@/features/dashboard/MoveToFolderDialog'
import { errorMessage } from '@/features/dashboard/errorMessage'
import { useDesignActions } from '@/features/dashboard/useDesignActions'
import { flattenPages, useCreateFolder, useDeleteFolder, useDesignsList, useFolders, useRenameFolder } from '@/lib/api/hooks'
import { usePageTitle } from '@/lib/usePageTitle'
import { useInView } from '@/lib/useInView'
import { usePersistedState } from '@/lib/usePersistedState'
import type { DesignQuery, DesignSummary, FolderT } from '@/types/api'
import { Button, ConfirmDialog, Dialog, EmptyState, Input, LinkButton, SegmentedControl, Select, Skeleton, useToast } from '@/ui'
import styles from './pageStyles.module.css'

const SORTS: Array<{ value: NonNullable<DesignQuery['ordering']>; label: string }> = [
  { value: '-updated_at', label: "Last modified" },
  { value: '-created_at', label: "Newest first" },
  { value: 'title', label: "Title A–Z" },
  { value: '-title', label: "Title Z–A" },
]
const LAYOUTS = ['grid', 'list'] as const
const EMPTY_SELECTION: ReadonlySet<string> = new Set()

function isSort(value: string | null): value is NonNullable<DesignQuery['ordering']> {
  return SORTS.some((sort) => sort.value === value)
}

/** All designs, a folder's designs, or (`starred`) the starred ones from every folder. */
export default function DesignsPage({ starred = false }: { starred?: boolean }) {
  const { folderId } = useParams()
  const [params, setParams] = useSearchParams()
  const { toast } = useToast()
  const q = params.get('q') ?? ''
  const sortParam = params.get('sort')
  const ordering = isSort(sortParam) ? sortParam : '-updated_at'
  const [layout, setLayout] = usePersistedState('doory-designs-layout', 'grid', LAYOUTS)
  const [moveTargets, setMoveTargets] = useState<DesignSummary[] | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [folderToDelete, setFolderToDelete] = useState<FolderT | null>(null)
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)

  const folders = useFolders()
  const currentFolder = folderId ? folders.data?.find((folder) => folder.id === folderId) : undefined
  usePageTitle(starred ? 'Starred' : (currentFolder?.name ?? 'Designs'))

  const query: DesignQuery = useMemo(
    () => (starred ? { q: q || undefined, starred: true, ordering } : { q: q || undefined, folder: q ? undefined : (folderId ?? 'root'), ordering }),
    [q, folderId, ordering, starred],
  )
  const list = useDesignsList(query)
  const designs = flattenPages(list.data)
  const actions = useDesignActions()
  const createFolder = useCreateFolder()
  const renameFolder = useRenameFolder()
  const deleteFolder = useDeleteFolder()

  const subfolders = useMemo(() => (q || starred ? [] : (folders.data ?? []).filter((folder) => folder.parent === (folderId ?? null)).sort((a, b) => a.name.localeCompare(b.name))), [folders.data, folderId, q, starred])
  const crumbs = useMemo(() => {
    const chain: FolderT[] = []
    let cursor = currentFolder
    const guard = new Set<string>()
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id)
      chain.unshift(cursor)
      cursor = folders.data?.find((folder) => folder.id === cursor?.parent)
    }
    return chain
  }, [currentFolder, folders.data])

  // A new view (folder, search, sort) starts with nothing selected.
  const viewKey = `${starred ? 'starred' : (folderId ?? 'root')}|${q}|${ordering}`
  const [selection, setSelection] = useState<{ key: string; ids: ReadonlySet<string> }>({ key: viewKey, ids: EMPTY_SELECTION })
  const selected = selection.key === viewKey ? selection.ids : EMPTY_SELECTION
  const setSelected = (next: ReadonlySet<string> | ((current: ReadonlySet<string>) => ReadonlySet<string>)) =>
    setSelection((current) => ({ key: viewKey, ids: typeof next === 'function' ? next(current.key === viewKey ? current.ids : EMPTY_SELECTION) : next }))

  useEffect(() => {
    if (selected.size === 0) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[data-doory-modal]')) setSelection({ key: viewKey, ids: EMPTY_SELECTION })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected.size, viewKey])

  const inView = useInView(sentinel)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage])

  const selectedDesigns = designs.filter((design) => selected.has(design.id))

  function setParam(key: string, value: string | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function dropOnFolder(folder: FolderT, ids: string[]) {
    const moving = designs.filter((design) => ids.includes(design.id))
    if (moving.length === 0) return
    actions.moveMany(moving, folder.id, folder.name, () => setSelected(EMPTY_SELECTION))
  }

  const empty = !list.isPending && !list.isError && designs.length === 0

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <nav aria-label={msg("Breadcrumb")} className={styles.crumbs} hidden={starred}>
            <Link to="/dashboard/designs">{msg("All designs")}</Link>
            {crumbs.map((crumb, index) => (
              <span key={crumb.id}>
                / {index === crumbs.length - 1 ? <span aria-current="page">{crumb.name}</span> : <Link to={`/dashboard/designs/folder/${crumb.id}`}>{crumb.name}</Link>}
              </span>
            ))}
          </nav>
          <h1 className={styles.title}>{q ? `Results for “${q}”` : starred ? 'Starred' : (currentFolder?.name ?? 'Your designs')}</h1>
        </div>
        <div className={styles.tools}>
          {q ? (
            <Button variant="secondary" rightIcon={<X size={14} />} onClick={() => setParam('q', null)}>
              {msg("Clear search")}</Button>
          ) : null}
          <Select label={msg("Sort by")} hideLabel value={ordering} onChange={(event) => setParam('sort', event.target.value === '-updated_at' ? null : event.target.value)} options={SORTS.map((sort) => ({ ...sort, label: msg(sort.label) }))} />
          <SegmentedControl
            label={msg("Layout")}
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'grid', label: <LayoutGrid size={16} />, ariaLabel: 'Grid view' },
              { value: 'list', label: <List size={16} />, ariaLabel: 'List view' },
            ]}
          />
          {starred ? null : (
            <Button variant="secondary" leftIcon={<FolderPlus size={16} />} onClick={() => setNewFolderOpen(true)}>
              {msg("New folder")}</Button>
          )}
        </div>
      </header>

      {subfolders.length > 0 ? (
        <section aria-label={msg("Folders")} className={styles.section}>
          <ul className={styles.grid}>
            {subfolders.map((folder) => (
              <li key={folder.id}>
                <FolderCard
                  folder={folder}
                  onRename={(target, name) => renameFolder.mutate({ id: target.id, name }, { onError: (error) => toast({ title: msg("Couldn’t rename the folder"), description: errorMessage(error), variant: 'error' }) })}
                  onDelete={setFolderToDelete}
                  onDropDesigns={dropOnFolder}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div aria-live="polite" aria-busy={list.isPending}>
        {list.isPending ? (
          <ul className={layout === 'grid' ? styles.grid : styles.list} aria-label={msg("Loading designs")}>
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index} className={styles.skeletonCard}>
                <Skeleton height={layout === 'grid' ? '11rem' : '4.5rem'} radius="var(--radius-lg)" />
                {layout === 'grid' ? <Skeleton width="65%" height={16} /> : null}
              </li>
            ))}
          </ul>
        ) : list.isError ? (
          <EmptyState title={msg("Your designs didn’t load")} description={errorMessage(list.error, 'Check your connection and try again.')} role="alert" action={<Button onClick={() => void list.refetch()}>{msg("Try again")}</Button>} />
        ) : empty ? (
          q ? (
            <EmptyState icon={<Search size={28} />} title={`No designs match “${q}”`} description={msg("Check the spelling, or try a shorter search.")} action={<Button variant="secondary" onClick={() => setParam('q', null)}>{msg("Clear search")}</Button>} />
          ) : starred ? (
            <EmptyState icon={<Star size={28} />} title={msg("Nothing starred yet")} description={msg("Star a design from its menu or its card to keep it here, whatever folder it is in.")} />
          ) : folderId ? (
            <EmptyState icon={<FolderPlus size={28} />} title={msg("This folder is empty")} description={msg("Drag designs onto a folder, or use “Move to folder” in a design’s menu.")} action={<LinkButton to="/dashboard/designs" variant="secondary">{msg("Back to all designs")}</LinkButton>} />
          ) : subfolders.length > 0 ? null : (
            <EmptyState icon={<Plus size={28} />} title={msg("No designs yet")} description={msg("Your designs will appear here. Start with a blank canvas or a template.")} action={<><LinkButton to="/create">{msg("Create a design")}</LinkButton><LinkButton to="/dashboard/templates" variant="secondary">{msg("Browse templates")}</LinkButton></>} />
          )
        ) : (
          <ul className={layout === 'grid' ? styles.grid : styles.list}>
            {designs.map((design) => (
              <li key={design.id}>
                <DesignCard
                  design={design}
                  layout={layout}
                  selected={selected.has(design.id)}
                  selectionActive={selected.size > 0}
                  dragIds={() => (selected.has(design.id) ? [...selected] : [design.id])}
                  onSelectChange={(on) => toggle(design.id, on)}
                  actions={actions}
                  onMoveRequest={(target) => setMoveTargets([target])}
                />
              </li>
            ))}
          </ul>
        )}
        <div ref={setSentinel} className={styles.sentinel} aria-hidden="true" />
        {hasNextPage ? (
          <div className={styles.more}>
            <Button variant="secondary" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
              {msg("Load more")}</Button>
          </div>
        ) : null}
      </div>

      <BulkBar
        count={selected.size}
        onStar={() => actions.starMany(selectedDesigns, true)}
        onUnstar={() => actions.starMany(selectedDesigns, false)}
        onMove={() => setMoveTargets(selectedDesigns)}
        onTrash={() => actions.trashMany(selectedDesigns, () => setSelected(EMPTY_SELECTION))}
        onClear={() => setSelected(EMPTY_SELECTION)}
      />

      <MoveToFolderDialog
        open={moveTargets !== null}
        count={moveTargets?.length ?? 0}
        currentFolder={moveTargets && moveTargets.every((design) => design.folder === moveTargets[0].folder) ? moveTargets[0].folder : undefined}
        onClose={() => setMoveTargets(null)}
        onMove={(folder, name) => {
          if (moveTargets) actions.moveMany(moveTargets, folder, name, () => setSelected(EMPTY_SELECTION))
          setMoveTargets(null)
        }}
      />

      <NewFolderDialog
        key={newFolderOpen ? 'open' : 'closed'}
        open={newFolderOpen}
        busy={createFolder.isPending}
        onClose={() => setNewFolderOpen(false)}
        onCreate={(name) =>
          createFolder.mutate(
            { name, parent: folderId ?? null },
            {
              onSuccess: () => {
                setNewFolderOpen(false)
                toast({ title: msg("Folder created"), description: name, variant: 'success' })
              },
              onError: (error) => toast({ title: msg("Couldn’t create the folder"), description: errorMessage(error), variant: 'error' }),
            },
          )
        }
      />

      <ConfirmDialog
        open={folderToDelete !== null}
        title={`Delete folder “${folderToDelete?.name ?? ''}”?`}
        description={msg("The designs and folders inside move up to the parent folder. Nothing is deleted.")}
        confirmLabel="Delete folder"
        tone="danger"
        loading={deleteFolder.isPending}
        onCancel={() => setFolderToDelete(null)}
        onConfirm={() => {
          if (!folderToDelete) return
          deleteFolder.mutate(folderToDelete.id, {
            onSuccess: () => {
              setFolderToDelete(null)
              toast({ title: msg("Folder deleted") })
            },
            onError: (error) => toast({ title: msg("Couldn’t delete the folder"), description: errorMessage(error), variant: 'error' }),
          })
        }}
      />
    </div>
  )
}

function NewFolderDialog({ open, busy, onClose, onCreate }: { open: boolean; busy: boolean; onClose(): void; onCreate(name: string): void }) {
  const [name, setName] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    if (name.trim()) onCreate(name.trim())
  }
  return (
    <Dialog open={open} onClose={onClose} title={msg("New folder")} size="sm" footer={<><Button variant="ghost" onClick={onClose}>{msg("Cancel")}</Button><Button type="submit" form="new-folder-form" loading={busy} disabled={!name.trim()}>{msg("Create folder")}</Button></>}>
      <form id="new-folder-form" onSubmit={submit}>
        <Input label={msg("Folder name")} autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      </form>
    </Dialog>
  )
}
