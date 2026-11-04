import { getLocale, setLocale, type Locale } from './locale'

const catalogs: Record<'zh-CN' | 'zh-TW', Record<string, string>> = { 'zh-CN': {}, 'zh-TW': {} }
const functions: Record<'zh-CN' | 'zh-TW', Record<string, (...args: never[]) => string>> = { 'zh-CN': {}, 'zh-TW': {} }
const pending = new Map<Locale, Promise<void>>()

/** The default English bundle never downloads both Chinese catalogs. */
export function loadLocale(locale: Locale): Promise<void> {
  if (locale === 'en' || Object.keys(catalogs[locale]).length) return Promise.resolve()
  const existing = pending.get(locale)
  if (existing) return existing
  const load = (locale === 'zh-CN'
    ? Promise.all([import('./zh-CN.json'), import('./functions-zh-CN')])
    : Promise.all([import('./zh-TW.json'), import('./functions-zh-TW')]))
    .then(([messages, dynamic]) => {
      catalogs[locale] = messages.default
      functions[locale] = dynamic.functions
    }).finally(() => pending.delete(locale))
  pending.set(locale, load)
  return load
}

export async function activateLocale(locale: Locale): Promise<void> {
  await loadLocale(locale)
  setLocale(locale)
}

/** Keep existing editor call sites untouched. Read the locale on access, not on import. */
export function localized<T extends object>(english: T, prefix = ''): T {
  return new Proxy(english, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver)
      if (typeof key !== 'string') return value
      const path = prefix ? `${prefix}.${key}` : key
      const locale = getLocale()
      if (typeof value === 'string') return locale === 'en' ? value : (catalogs[locale][path] ?? value)
      if (typeof value === 'function') return locale === 'en' ? value : (functions[locale][path] ?? value)
      if (value && typeof value === 'object') return localized(value, path)
      return value
    },
  })
}

/** Plain-language messages outside the editor use the same catalog. */
export function msg(english: string): string {
  const locale = getLocale()
  return locale === 'en' ? english : (catalogs[locale][`app.${english}`] ?? english)
}
