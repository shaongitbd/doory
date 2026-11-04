export type Locale = 'en' | 'zh-CN' | 'zh-TW'
export const LOCALE_KEY = 'doory.locale'

export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const tag = language.toLowerCase().replace(/_/g, '-')
    if (tag === 'zh' || tag.startsWith('zh-hans') || tag.startsWith('zh-cn') || tag.startsWith('zh-sg')) return 'zh-CN'
    if (tag.startsWith('zh-hant') || tag.startsWith('zh-tw') || tag.startsWith('zh-hk') || tag.startsWith('zh-mo')) return 'zh-TW'
    if (tag === 'en' || tag.startsWith('en-')) return 'en'
  }
  return 'en'
}

export function resolveLocale(saved: string | null, languages: readonly string[]): Locale {
  if (saved === 'en' || saved === 'zh-CN' || saved === 'zh-TW') return saved
  return detectLocale(languages)
}

function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  let saved: string | null = null
  try { saved = window.localStorage.getItem(LOCALE_KEY) } catch { /* Storage may be disabled. */ }
  return resolveLocale(saved, navigator.languages ?? [navigator.language])
}

let activeLocale: Locale = initialLocale()
const listeners = new Set<() => void>()
if (typeof document !== 'undefined') document.documentElement.lang = activeLocale

export function getLocale(): Locale { return activeLocale }
export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function setLocale(locale: Locale): void {
  if (activeLocale === locale) return
  activeLocale = locale
  if (typeof document !== 'undefined') document.documentElement.lang = locale
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(LOCALE_KEY, locale) } catch { /* Storage may be disabled. */ }
  }
  listeners.forEach(listener => listener())
}
