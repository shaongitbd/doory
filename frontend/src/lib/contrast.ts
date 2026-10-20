/**
 * High contrast: the same light theme with darker text, lines and focus rings (the `data-contrast='more'` block in
 * styles/tokens.css). The choice is per browser, like the other view preferences: 'system' (the default) follows the
 * device's `prefers-contrast: more`, and 'more' or 'standard' override it. Storage that is missing or refuses to write
 * only means the choice lasts for this session. The stored text never reaches the DOM: <html> only ever gets the
 * literal `data-contrast="more"`, or no attribute.
 */
import { useSyncExternalStore } from 'react'
import { safeGetItem, safeRemoveItem, safeSetItem } from './storage'

export type ContrastPreference = 'system' | 'more' | 'standard'
export type EffectiveContrast = 'more' | 'standard'

export interface ContrastSnapshot {
  preference: ContrastPreference
  effective: EffectiveContrast
}

export const CONTRAST_KEY = 'doory.ui.contrast.v1'
export const CONTRAST_QUERY = '(prefers-contrast: more)'
const PREFS = ['system', 'more', 'standard'] as const

function isPreference(value: string | null): value is ContrastPreference {
  return PREFS.some((pref) => pref === value)
}

/** The stored choice; anything missing, unreadable or unknown counts as 'system'. */
export function readContrastPreference(): ContrastPreference {
  const stored = safeGetItem(CONTRAST_KEY)
  return isPreference(stored) ? stored : 'system'
}

export function systemPrefersMore(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(CONTRAST_QUERY).matches
}

export function resolveContrast(preference: ContrastPreference, systemMore: boolean): EffectiveContrast {
  if (preference === 'system') return systemMore ? 'more' : 'standard'
  return preference
}

const listeners = new Set<() => void>()
let snapshot: ContrastSnapshot | null = null
/** A choice storage refused to keep: it holds for this session instead, until another tab makes a choice. */
let unsaved: ContrastPreference | null = null

function current(): ContrastSnapshot {
  const preference = unsaved ?? readContrastPreference()
  return { preference, effective: resolveContrast(preference, systemPrefersMore()) }
}

/** Puts the current choice on <html> (only when it changes, so theme observers don't fire for nothing). */
export function applyContrast(root: HTMLElement = document.documentElement): void {
  const next = current()
  if (next.effective === 'more') {
    if (root.dataset.contrast !== 'more') root.dataset.contrast = 'more'
  } else if (root.dataset.contrast !== undefined) {
    delete root.dataset.contrast
  }
  if (snapshot && snapshot.preference === next.preference && snapshot.effective === next.effective) return
  snapshot = next
  for (const listener of listeners) listener()
}

export function setContrastPreference(preference: ContrastPreference): void {
  if (preference === 'system') safeRemoveItem(CONTRAST_KEY)
  unsaved = (preference === 'system' || safeSetItem(CONTRAST_KEY, preference)) ? null : preference
  applyContrast()
}

/** Shows a choice for this session only, leaving the stored one alone (the dev harness's `?contrast=`). */
export function setSessionContrast(preference: ContrastPreference): void {
  unsaved = preference
  applyContrast()
}

/**
 * Flips what is shown. Landing on what the device asks for stores 'system' again, so someone on a shared link (who
 * can't reach Settings) can still get back to following their device.
 */
export function toggleContrast(): void {
  const systemMore = systemPrefersMore()
  const more = current().effective !== 'more'
  setContrastPreference(more === systemMore ? 'system' : more ? 'more' : 'standard')
}

export function subscribeContrast(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getContrastSnapshot(): ContrastSnapshot {
  snapshot ??= current()
  return snapshot
}

let dispose: (() => void) | null = null

/**
 * Applies the choice once, then follows the device setting and other tabs (the presenter window included). Safe to
 * call again: later calls return the first call's disposer.
 */
export function initContrast(): () => void {
  if (dispose) return dispose
  applyContrast()
  const update = (): void => applyContrast()
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== CONTRAST_KEY && event.key !== null) return
    unsaved = null // the other tab's choice wins, so this tab keeps following the others
    update()
  }
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(CONTRAST_QUERY) : null
  if (mq?.addEventListener) mq.addEventListener('change', update)
  else mq?.addListener?.(update) // Safari before 14
  window.addEventListener('storage', onStorage)
  const off = (): void => {
    if (mq?.removeEventListener) mq.removeEventListener('change', update)
    else mq?.removeListener?.(update)
    window.removeEventListener('storage', onStorage)
    dispose = null
  }
  dispose = off
  return off
}

export function useContrast(): ContrastSnapshot {
  return useSyncExternalStore(subscribeContrast, getContrastSnapshot)
}
