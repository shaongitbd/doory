import enCommon from './locales/en/common.json'
import enEditor from './locales/en/editor.json'
import deCommon from './locales/de/common.json'
import deEditor from './locales/de/editor.json'

export const resources = {
  en: { common: enCommon, editor: enEditor },
  de: { common: deCommon, editor: deEditor },
} as const

export const supportedLanguages = ['en', 'de'] as const
export type UiLanguage = (typeof supportedLanguages)[number]
