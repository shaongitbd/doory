import { msg } from '@/i18n/catalog'
import { useNavigate } from 'react-router-dom'
import { useBulkDesigns, useDeleteDesignForever, useDuplicateDesign, useRestoreDesign, useTrashDesign, useUpdateDesign } from '@/lib/api/hooks'
import type { DesignSummary } from '@/types/api'
import { useToast } from '@/ui'
import { errorMessage } from './errorMessage'

type Movable = Pick<DesignSummary, 'id' | 'folder'>

/** Every design mutation the dashboard offers, with consistent toasts and undo. */
export function useDesignActions() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const update = useUpdateDesign()
  const trash = useTrashDesign()
  const restore = useRestoreDesign()
  const duplicate = useDuplicateDesign()
  const forever = useDeleteDesignForever()
  const bulk = useBulkDesigns()

  const fail = (title: string) => (error: unknown) => toast({ title, description: errorMessage(error), variant: 'error' })

  return {
    open: (design: Pick<DesignSummary, 'id'>) => navigate(`/design/${design.id}`),

    rename(design: Pick<DesignSummary, 'id' | 'title'>, title: string) {
      const next = title.trim()
      if (!next || next === design.title) return
      update.mutate({ id: design.id, patch: { title: next } }, { onError: fail(msg('Couldn’t rename the design')) })
    },

    toggleStar(design: Pick<DesignSummary, 'id' | 'starred'>) {
      update.mutate({ id: design.id, patch: { starred: !design.starred } }, { onError: fail(msg('Couldn’t update the star')) })
    },

    duplicate(design: Pick<DesignSummary, 'id' | 'title'>) {
      duplicate.mutate(design.id, {
        onSuccess: (copy) => toast({ title: msg('Design duplicated'), description: copy.title, variant: 'success', action: { label: msg('Open copy'), onClick: () => navigate(`/design/${copy.id}`) } }),
        onError: fail(msg('Couldn’t duplicate the design')),
      })
    },

    trash(design: Pick<DesignSummary, 'id' | 'title'>) {
      trash.mutate(design.id, {
        onSuccess: () => toast({ title: msg('Moved to trash'), description: design.title, action: { label: msg('Undo'), onClick: () => restore.mutate(design.id, { onError: fail(msg('Couldn’t restore the design')) }) } }),
        onError: fail(msg('Couldn’t move the design to the trash')),
      })
    },

    trashMany(designs: Array<Pick<DesignSummary, 'id'>>, done?: () => void) {
      const ids = designs.map((design) => design.id)
      bulk.mutate(
        { ids, action: 'trash' },
        {
          onSuccess: () => {
            done?.()
            toast({ title: ids.length === 1 ? msg('Moved to trash') : msg('{count} designs moved to trash', { count: ids.length }), action: { label: msg('Undo'), onClick: () => bulk.mutate({ ids, action: 'restore' }, { onError: fail(msg('Couldn’t restore the designs')) }) } })
          },
          onError: fail(msg('Couldn’t move the designs to the trash')),
        },
      )
    },

    starMany(designs: Array<Pick<DesignSummary, 'id'>>, starred: boolean) {
      bulk.mutate({ ids: designs.map((design) => design.id), action: starred ? 'star' : 'unstar' }, { onError: fail(msg('Couldn’t update the stars')) })
    },

    /** Moves designs into a folder (null = top level) and offers an undo that restores each one's previous folder. */
    moveMany(designs: Movable[], folder: string | null, folderName: string, done?: () => void) {
      const ids = designs.map((design) => design.id)
      const previous = new Map<string | null, string[]>()
      for (const design of designs) previous.set(design.folder, [...(previous.get(design.folder) ?? []), design.id])
      bulk.mutate(
        { ids, action: 'move', folder },
        {
          onSuccess: () => {
            done?.()
            toast({
              title: ids.length === 1 ? msg('Moved to {folder}', { folder: folderName }) : msg('{count} designs moved to {folder}', { count: ids.length, folder: folderName }),
              variant: 'success',
              action: {
                label: msg('Undo'),
                onClick: () => {
                  for (const [from, group] of previous) bulk.mutate({ ids: group, action: 'move', folder: from }, { onError: fail(msg('Couldn’t undo the move')) })
                },
              },
            })
          },
          onError: fail(msg('Couldn’t move the designs')),
        },
      )
    },

    restore(design: Pick<DesignSummary, 'id' | 'title'>) {
      restore.mutate(design.id, {
        onSuccess: () => toast({ title: msg('Design restored'), description: design.title, variant: 'success', action: { label: msg('Open'), onClick: () => navigate(`/design/${design.id}`) } }),
        onError: fail(msg('Couldn’t restore the design')),
      })
    },

    deleteForever(design: Pick<DesignSummary, 'id'>, done?: () => void) {
      forever.mutate(design.id, { onSuccess: () => { done?.(); toast({ title: msg('Design deleted permanently') }) }, onError: fail(msg('Couldn’t delete the design')) })
    },

    busy: update.isPending || trash.isPending || bulk.isPending || duplicate.isPending || restore.isPending || forever.isPending,
  }
}

export type DesignActions = ReturnType<typeof useDesignActions>
