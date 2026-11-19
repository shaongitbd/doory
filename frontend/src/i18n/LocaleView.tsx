import type { ReactNode } from 'react'
import { useLocale } from './useLocale'

/** Re-render cached route elements when the language changes, preserving their mounted component state. */
export function LocaleView({ render }: { render: () => ReactNode }) {
  useLocale()
  return render()
}
