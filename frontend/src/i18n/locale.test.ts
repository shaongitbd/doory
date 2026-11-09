import { describe, expect, it } from 'vitest'
import { detectLocale, resolveLocale, setLocale, getLocale, LOCALE_KEY } from './locale'
import { loadLocale, localized } from './catalog'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'
import english from './en.json'
import functionInventory from './functions.json'
import { functions as zhCNFunctions } from './functions-zh-CN'
import { functions as zhTWFunctions } from './functions-zh-TW'

const englishKeys = Object.keys(english).sort()

describe('locale choice', () => {
  it.each([
    [['zh-Hans-CN', 'en-US'], 'zh-CN'],
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
  it.each(['zh-CN', 'zh-TW'] as const)('%s has exactly the English editor key set', locale => {
    expect(Object.keys(locale === 'zh-CN' ? zhCN : zhTW).sort()).toEqual(englishKeys)
    expect(englishKeys.length).toBeGreaterThan(1000)
    const localizedFunctions = locale === 'zh-CN' ? zhCNFunctions : zhTWFunctions
    expect(Object.keys(localizedFunctions).sort()).toEqual(Object.keys(functionInventory).sort())
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
