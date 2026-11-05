import { createInstance } from 'i18next'
import { setI18n } from 'react-i18next'
import { resources, supportedLanguages, type UiLanguage } from './resources'

export function createUiI18n(language: UiLanguage = 'en') {
  const instance = createInstance()
  // Local resources initialize synchronously, so switching never suspends or replaces a running editor.
  void instance.init({
    resources: structuredClone(resources),
    lng: language,
    fallbackLng: 'en',
    supportedLngs: [...supportedLanguages],
    load: 'languageOnly',
    defaultNS: 'common',
    ns: ['common', 'editor'],
    initAsync: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })
  return instance
}

export const i18n = createUiI18n()
// Standalone editor mounts use this default; creating an isolated test instance must not replace it.
setI18n(i18n)
