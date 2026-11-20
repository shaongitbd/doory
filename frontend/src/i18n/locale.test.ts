import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectLocale, resolveLocale, setLocale, getLocale, LOCALE_KEY, subscribeLocale } from './locale'
import { activateLocale, loadLocale, localized, msg } from './catalog'
import de from './de.json'
import { functions as deFunctions } from './functions-de'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'
import english from './en.json'
import functionInventory from './functions.json'
import { functions as zhCNFunctions } from './functions-zh-CN'
import { functions as zhTWFunctions } from './functions-zh-TW'

afterEach(() => { setLocale('en'); localStorage.removeItem(LOCALE_KEY); vi.restoreAllMocks() })

const englishKeys = Object.keys(english).sort()

describe('locale choice', () => {
  it.each([
    [['zh-Hans-CN', 'en-US'], 'zh-CN'],
    [['de'], 'de'],
    [['de-DE'], 'de'],
    [['de-AT'], 'de'],
    [['de-CH'], 'de'],
    [['DE_ch'], 'de'],
    [['fr-FR', 'de-DE', 'en-US'], 'de'],
    [['en-US', 'de-DE'], 'en'],
    [['zh-TW', 'de-DE'], 'zh-TW'],
    [['zh-SG'], 'zh-CN'],
    [['zh-Hant-HK'], 'zh-TW'],
    [['zh-TW'], 'zh-TW'],
    [['fr-FR', 'en-US', 'zh-CN'], 'en'],
    [['fr-FR'], 'en'],
  ] as const)('detects %j', (languages, expected) => {
    expect(detectLocale(languages)).toBe(expected)
  })
  it('persists an explicit choice and ignores an invalid saved value', () => {
    expect(resolveLocale('zh-TW', ['en-US'])).toBe('zh-TW')
    expect(resolveLocale('de', ['zh-TW', 'en-US'])).toBe('de')
    expect(resolveLocale('en', ['de-DE'])).toBe('en')
    expect(resolveLocale('invalid', ['de-CH'])).toBe('de')
    expect(resolveLocale('invalid', ['zh-CN'])).toBe('zh-CN')
    setLocale('zh-CN')
    expect(getLocale()).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(localStorage.getItem(LOCALE_KEY)).toBe('zh-CN')
    setLocale('en')
  })
  it('keeps English as fallback and reads the locale on access', async () => {
    await loadLocale('zh-CN')
    const strings = localized({ topbar: { file: 'File', untouched: 'Fallback' } })
    expect(strings.topbar.file).toBe('File')
    setLocale('zh-CN')
    expect(strings.topbar.file).toBe(zhCN['topbar.file'])
    expect(strings.topbar.untouched).toBe('Fallback')
    setLocale('en')
  })
})

describe('translation completeness', () => {
  it.each(['de', 'zh-CN', 'zh-TW'] as const)('%s has exactly the English editor key set', locale => {
    expect(Object.keys(locale === 'de' ? de : locale === 'zh-CN' ? zhCN : zhTW).sort()).toEqual(englishKeys)
    expect(englishKeys.length).toBeGreaterThan(1000)
    const localizedFunctions = locale === 'de' ? deFunctions : locale === 'zh-CN' ? zhCNFunctions : zhTWFunctions
    expect(Object.keys(localizedFunctions).sort()).toEqual(Object.keys(functionInventory).sort())
  })
  it.each([['de', de], ['zh-CN', zhCN], ['zh-TW', zhTW]] as const)('%s preserves static placeholders', (_locale, catalog) => {
    const tokens = (text: string) => text.match(/\$?\{[^{}]+\}/g)?.sort() ?? []
    for (const [key, source] of Object.entries(english)) {
      const translated = catalog[key as keyof typeof catalog]
      expect(tokens(translated), key).toEqual(tokens(source))
    }
  })
  it('keeps dynamic arguments and Chinese count without English plural endings', async () => {
    await loadLocale('zh-CN')
    setLocale('zh-CN')
    const messages = localized({ announce: { deleted: (n: number) => `Deleted ${n} layers` } })
    expect(messages.announce.deleted(1)).toContain('1')
    expect(messages.announce.deleted(2)).toContain('2')
    expect(messages.announce.deleted(2)).not.toMatch(/layers/)
    setLocale('en')
  })
})

describe('German switching', () => {
  it('loads messages before notifying, persists the choice and switches back', async () => {
    const strings = localized({ topbar: { file: 'File' }, announce: { deleted: (n: number) => `Deleted ${n} layers` } })
    const listener = vi.fn(() => {
      expect(strings.topbar.file).toBe('Datei')
      expect(msg('Settings')).toBe('Einstellungen')
    })
    const unsubscribe = subscribeLocale(listener)
    try {
      const first = loadLocale('de')
      expect(loadLocale('de')).toBe(first)
      expect(strings.topbar.file).toBe('File')
      await first
      await activateLocale('de')
      expect(listener).toHaveBeenCalledTimes(1)
      expect(strings.announce.deleted(1)).toBe('1 Ebene gelöscht')
      expect(strings.announce.deleted(2)).toBe('2 Ebenen gelöscht')
      expect(document.documentElement.lang).toBe('de')
      expect(resolveLocale(localStorage.getItem(LOCALE_KEY), ['en-US'])).toBe('de')
      expect(msg('A missing translation')).toBe('A missing translation')
      await activateLocale('de')
      expect(listener).toHaveBeenCalledTimes(1)
    } finally { unsubscribe() }
    await activateLocale('en')
    expect(strings.topbar.file).toBe('File')
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en')
  })

  it('can switch when storage is disabled', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled') })
    await activateLocale('de')
    expect(getLocale()).toBe('de')
    expect(document.documentElement.lang).toBe('de')
  })
})
