import { useContext, type ReactNode } from 'react'
import { I18nContext, I18nextProvider } from 'react-i18next'
import { i18n } from './instance'
import { getLanguagePreferences } from './preferences'

// Imported by translated route boundaries before mounting their UI, keeping the runtime out of public pages.
getLanguagePreferences().init()

export function UiLanguageProvider({ children }: { children: ReactNode }) {
  const parent = useContext(I18nContext)
  return <I18nextProvider i18n={parent?.i18n ?? i18n}>{children}</I18nextProvider>
}
