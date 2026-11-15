import { useSyncExternalStore } from 'react'
import { getLocale, subscribeLocale } from './locale'

/** Subscribe where translated UI is rendered; changing language must not reset component state. */
export function useLocale() {
  return useSyncExternalStore(subscribeLocale, getLocale, () => 'en')
}
