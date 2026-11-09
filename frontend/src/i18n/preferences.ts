import type { i18n as I18n } from 'i18next'
import { useContext, useSyncExternalStore } from 'react'
import { I18nContext } from 'react-i18next'
import { safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/storage'
import { i18n } from './instance'
import { supportedLanguages, type UiLanguage } from './resources'

export type LanguagePreference = 'system' | UiLanguage
export const LANGUAGE_KEY = 'doory.ui.language.v1'

export function readLanguagePreference(): LanguagePreference {
  const value = safeGetItem(LANGUAGE_KEY)
  return supportedLanguages.find((language) => language === value) ?? 'system'
}

export function resolveLanguage(preference: LanguagePreference, languages: readonly string[]): UiLanguage {
  if (preference !== 'system') return preference
  // Respect browser order before falling back to English; de-AT and de-DE both use our German catalog.
  for (const candidate of languages) {
    const base = candidate.toLowerCase().split('-')[0]
    const supported = supportedLanguages.find((language) => language === base)
    if (supported) return supported
  }
  return 'en'
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? navigator.languages : [navigator.language]
}

function createLanguagePreferences(instance: I18n) {
  let preference = readLanguagePreference()
  const listeners = new Set<() => void>()
  let dispose: (() => void) | null = null

  const syncDocumentLanguage = (): void => {
    if (typeof document !== 'undefined') document.documentElement.lang = instance.resolvedLanguage ?? 'en'
  }
  const apply = (): void => {
    const language = resolveLanguage(preference, browserLanguages())
    if (instance.resolvedLanguage !== language) void instance.changeLanguage(language)
    syncDocumentLanguage()
  }
  const update = (next: LanguagePreference): void => {
    const changed = preference !== next
    preference = next
    apply()
    if (changed) for (const listener of listeners) listener()
  }

  return {
    getSnapshot: (): LanguagePreference => preference,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setPreference(next: LanguagePreference): void {
      if (next === 'system') safeRemoveItem(LANGUAGE_KEY)
      else safeSetItem(LANGUAGE_KEY, next)
      // Keep the choice in memory even if storage refuses it. No editor or account state is involved.
      update(next)
    },
    init(): () => void {
      if (dispose) return dispose
      const onStorage = (event: StorageEvent): void => {
        try {
          if (event.storageArea && event.storageArea !== window.localStorage) return
        } catch {
          return
        }
        if (event.key === LANGUAGE_KEY || event.key === null) update(readLanguagePreference())
      }
      const onLanguage = (): void => {
        if (preference === 'system') apply()
      }
      window.addEventListener('storage', onStorage)
      window.addEventListener('languagechange', onLanguage)
      instance.on('languageChanged', syncDocumentLanguage)
      apply()
      const off = (): void => {
        if (dispose !== off) return
        window.removeEventListener('storage', onStorage)
        window.removeEventListener('languagechange', onLanguage)
        instance.off('languageChanged', syncDocumentLanguage)
        dispose = null
      }
      dispose = off
      return off
    },
  }
}

const preferences = new WeakMap<I18n, ReturnType<typeof createLanguagePreferences>>()

export function getLanguagePreferences(instance: I18n = i18n) {
  let store = preferences.get(instance)
  if (!store) {
    store = createLanguagePreferences(instance)
    preferences.set(instance, store)
  }
  return store
}

export function useLanguagePreference() {
  // The provider instance is stable; useTranslation may return a new language-specific wrapper.
  const instance = useContext(I18nContext)?.i18n ?? i18n
  const store = getLanguagePreferences(instance)
  const preference = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { preference, setPreference: store.setPreference }
}
