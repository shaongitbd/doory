import { getLocale } from '@/i18n/locale'
import type { CommentT } from '@/types/api'
import type { CommentViewer } from '@/types/adapter'
import type { CommentFilterId } from '../store/editorStore'

export const MAX_COMMENT_LENGTH = 2000

/**
 * Where a thread sits: at a spot of a page of this design (`pinned`, drawn as a pin), on a page without a spot (`page`),
 * on a page that was deleted since (`removed`), or nowhere in particular (`general`).
 */
export type Placement = 'pinned' | 'page' | 'removed' | 'general'

export interface Thread {
  root: CommentT
  /** Oldest first. */
  replies: CommentT[]
  placement: Placement
  /**
   * 1, 2, 3 … in the order the pinned threads were started: the number on the pin and on the card in the list, so the
   * two can be matched by eye. Only pinned threads have one; numbers move up when an earlier thread is deleted.
   */
  number: number | null
}

export interface ThreadCounts {
  all: number
  unresolved: number
  mine: number
}

const byTime = (a: CommentT, b: CommentT): number => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)

export function placementOf(root: CommentT, pageIds: ReadonlySet<string>): Placement {
  if (!root.page_id) return 'general'
  if (!pageIds.has(root.page_id)) return 'removed'
  return root.x === null || root.y === null ? 'page' : 'pinned'
}

/**
 * Groups a flat comment list into threads, oldest first: every comment without a parent starts one and its replies
 * follow it, oldest first. Replies whose parent is missing (deleted) are dropped, not shown as orphans.
 */
export function buildThreads(comments: readonly CommentT[], pageIds: ReadonlySet<string>): Thread[] {
  const replies = new Map<string, CommentT[]>()
  for (const c of comments) {
    if (!c.parent) continue
    const list = replies.get(c.parent)
    if (list) list.push(c)
    else replies.set(c.parent, [c])
  }
  let next = 1
  return comments
    .filter((c) => !c.parent)
    .sort(byTime)
    .map((root): Thread => {
      const placement = placementOf(root, pageIds)
      return { root, replies: (replies.get(root.id) ?? []).sort(byTime), placement, number: placement === 'pinned' ? next++ : null }
    })
}

export const isMine = (thread: Thread, viewer: Pick<CommentViewer, 'id'> | null): boolean => !!viewer && thread.root.author.id === viewer.id

/** The threads a filter keeps. `keep` (the open thread) always stays, so resolving a thread does not pull it from under the reader. */
export function filterThreads(threads: readonly Thread[], filter: CommentFilterId, viewer: Pick<CommentViewer, 'id'> | null, keep: string | null = null): Thread[] {
  if (filter === 'all') return [...threads]
  return threads.filter((th) => th.root.id === keep || (filter === 'unresolved' ? !th.root.resolved : isMine(th, viewer)))
}

export function countThreads(threads: readonly Thread[], viewer: Pick<CommentViewer, 'id'> | null): ThreadCounts {
  let unresolved = 0
  let mine = 0
  for (const th of threads) {
    if (!th.root.resolved) unresolved += 1
    if (isMine(th, viewer)) mine += 1
  }
  return { all: threads.length, unresolved, mine }
}

/** The pinned threads of each page. */
export function pinsByPage(threads: readonly Thread[]): Map<string, Thread[]> {
  const pages = new Map<string, Thread[]>()
  for (const th of threads) {
    if (th.placement !== 'pinned' || !th.root.page_id) continue
    const list = pages.get(th.root.page_id)
    if (list) list.push(th)
    else pages.set(th.root.page_id, [th])
  }
  return pages
}

/** Pinned thread ids in reading order (page by page, top to bottom, left to right): the order the arrow keys walk. */
export function readingOrder(threads: readonly Thread[], pageIds: readonly string[]): string[] {
  const rank = new Map(pageIds.map((id, index) => [id, index]))
  return threads
    .filter((th) => th.placement === 'pinned')
    .sort((a, b) => (rank.get(a.root.page_id ?? '') ?? 0) - (rank.get(b.root.page_id ?? '') ?? 0) || (a.root.y ?? 0) - (b.root.y ?? 0) || (a.root.x ?? 0) - (b.root.x ?? 0) || (a.number ?? 0) - (b.number ?? 0))
    .map((th) => th.root.id)
}

/** The neighbour of `current` in `order` (no wrapping: the ends stay where they are). */
export function stepInOrder(order: readonly string[], current: string | null, step: 1 | -1 | 'first' | 'last'): string | null {
  if (order.length === 0) return null
  if (step === 'first') return order[0]
  if (step === 'last') return order[order.length - 1]
  const at = current === null ? -1 : order.indexOf(current)
  if (at < 0) return step === 1 ? order[0] : order[order.length - 1]
  return order[Math.max(0, Math.min(order.length - 1, at + step))]
}

/** What the viewer may do with one comment, from what the adapter offers and who they are. */
export interface CommentRights {
  resolve: boolean
  remove: boolean
  move: boolean
}

export interface CommentOffers {
  resolve?: unknown
  remove?: unknown
  move?: unknown
}

/**
 * The server enforces these rules; this decides which buttons exist. `viewer` undefined: the adapter does not say who
 * is looking (the in-memory adapters), so every action it offers is shown. An owner may delete and move every comment,
 * anyone else only their own, and only the thread's first comment has a pin to move.
 */
export function rightsFor(actions: CommentOffers, viewer: CommentViewer | null | undefined, comment: CommentT): CommentRights {
  const own = viewer === undefined || viewer?.owner === true || (viewer !== null && viewer.id === comment.author.id)
  return { resolve: !!actions.resolve, remove: !!actions.remove && own, move: !!actions.move && own && !comment.parent }
}

/** True when both lists hold the same comments with the same content, so a refresh that changed nothing renders nothing. */
export function sameComments(a: readonly CommentT[], b: readonly CommentT[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((c, i) => {
    const o = b[i]
    return c.id === o.id && c.body === o.body && c.resolved === o.resolved && c.parent === o.parent && c.page_id === o.page_id && c.x === o.x && c.y === o.y && c.created_at === o.created_at && c.author.id === o.author.id && c.author.name === o.author.name && c.author.avatar_url === o.author.avatar_url
  })
}

/** One or two letters for an avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = [...parts[0]][0] ?? '?'
  const last = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** A point on a page that can be stored: page px, finite, two decimals (a pin does not need more). */
export function roundPoint(x: number, y: number): { x: number; y: number } {
  const round = (n: number): number => Math.round(n * 100) / 100
  return { x: round(x), y: round(y) }
}


/** "Jan 5, 2026, 3:04 PM" in the reader's language; empty for a date that cannot be read. */
export function formatWhen(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(at)
}
