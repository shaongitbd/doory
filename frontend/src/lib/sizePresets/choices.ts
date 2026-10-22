import { useEffect, useSyncExternalStore } from 'react'
import { http, isApiError } from '@/lib/api/client'
import { safeGetItem, safeSetItem } from '@/lib/storage'
import { quickPresets, type SizePreset, type SizePresetCatalogue } from './catalogue'

/**
 * The sizes a person keeps at hand: the ones they pinned (null until they choose, so the catalogue's popular sizes
 * stand in), the ones they used lately, and the picker sections they folded. Signed in, they live on the server
 * (`/size-presets/mine/`, recent sizes from the person's latest designs) and follow them to other devices; signed
 * out, in this browser. They belong to whoever is signed in: `setSizeChoicesUser` starts over when that changes.
 */
export interface SizeChoices {
  pinned: string[] | null
  recent: string[]
  collapsed: string[]
}

const KEY = 'doory.sizeChoices'
const MAX_PINNED = 24
const MAX_RECENT = 8
const EMPTY: SizeChoices = { pinned: null, recent: [], collapsed: [] }

let current: SizeChoices = EMPTY
let onServer = false
let request: Promise<void> | null = null
/** Whose choices these are: a user id, null signed out, undefined until the session is known. */
let owner: string | null | undefined
/** Bumped on every load and every change of person, so an answer that comes back late is dropped. */
let generation = 0
const listeners = new Set<() => void>()

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

function readLocal(): SizeChoices {
  try {
    const value = JSON.parse(safeGetItem(KEY) ?? 'null') as Partial<Record<keyof SizeChoices, unknown>> | null
    if (!value || typeof value !== 'object') return EMPTY
    return { pinned: value.pinned === null || value.pinned === undefined ? null : strings(value.pinned), recent: strings(value.recent), collapsed: strings(value.collapsed) }
  } catch {
    return EMPTY
  }
}

function publish(next: SizeChoices): void {
  current = next
  if (!onServer) safeSetItem(KEY, JSON.stringify(next))
  for (const listener of listeners) listener()
}

/** Loads the person's choices once per person (again with `refresh`); signed out, the browser's. */
export function loadSizeChoices(refresh = false): Promise<void> {
  if (request && !refresh) return request
  const mine = ++generation
  request = http
    .get<SizeChoices>('/size-presets/mine/')
    .then((answer) => {
      if (mine !== generation) return
      onServer = true
      publish({ pinned: answer.pinned === null ? null : strings(answer.pinned), recent: strings(answer.recent), collapsed: strings(answer.collapsed) })
    })
    .catch((error: unknown) => {
      if (mine !== generation) return
      // Signed out (or the server cannot be reached): keep them in this browser.
      if (!isApiError(error) || error.status === 401 || error.status === 403 || error.isNetwork) {
        onServer = false
        publish(readLocal())
      }
    })
  return request
}

/**
 * Says who is signed in (null: nobody). When that changes, the previous person's choices are dropped (never shown
 * to, or saved for, the next one) and loaded again for the new one if anything shows them.
 */
export function setSizeChoicesUser(userId: string | null): void {
  const previous = owner
  owner = userId
  // The first answer only says whose choices were already being loaded.
  if (previous === undefined || previous === userId) return
  generation += 1
  request = null
  onServer = false
  current = EMPTY
  for (const listener of listeners) listener()
  if (listeners.size > 0) void loadSizeChoices()
}

function save(patch: Partial<Pick<SizeChoices, 'pinned' | 'collapsed'>>): void {
  publish({ ...current, ...patch })
  if (onServer) void http.patch<SizeChoices>('/size-presets/mine/', { json: patch }).catch(() => undefined)
}

export function getSizeChoices(): SizeChoices {
  return current
}

export function subscribeSizeChoices(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The person's choices; starts loading them on first use and re-renders when they change. */
export function useSizeChoices(): SizeChoices {
  useEffect(() => {
    void loadSizeChoices()
  }, [])
  return useSyncExternalStore(subscribeSizeChoices, getSizeChoices, getSizeChoices)
}

/** Pins a size, or unpins it. `shown` is what the person sees now (the popular sizes until they choose). */
export function togglePinned(id: string, shown: readonly string[]): void {
  const list = current.pinned ?? [...shown]
  const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id].slice(-MAX_PINNED)
  save({ pinned: next })
}

export function setCollapsed(collapsed: string[]): void {
  save({ collapsed })
}

/** Notes that a size was just used. Signed in, the person's designs say it too, the next time they load. */
export function noteUsedSize(id: string): void {
  publish({ ...current, recent: [id, ...current.recent.filter((item) => item !== id)].slice(0, MAX_RECENT) })
}

/** Tests: start from these choices (default: none), kept in the browser, without fetching. */
export function setSizeChoicesForTests(choices: Partial<SizeChoices> = {}): void {
  onServer = false
  owner = undefined
  generation += 1
  request = Promise.resolve()
  current = { ...EMPTY, ...choices }
  for (const listener of listeners) listener()
}

/** The presets these slugs name, each once, skipping any the catalogue no longer has. */
export function knownPresets(catalogue: SizePresetCatalogue, ids: readonly string[]): SizePreset[] {
  const out: SizePreset[] = []
  for (const id of ids) {
    const preset = catalogue.byId.get(id)
    if (preset && !out.includes(preset)) out.push(preset)
  }
  return out
}

/** The sizes a person keeps at hand: the ones they pinned, else the catalogue's popular sizes. */
export function yourSizes(catalogue: SizePresetCatalogue, choices: SizeChoices): SizePreset[] {
  return choices.pinned === null ? quickPresets(catalogue) : knownPresets(catalogue, choices.pinned)
}
