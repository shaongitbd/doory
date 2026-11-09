import { preferredChinese, scriptOf } from './scripts'

describe('Chinese in the font picker (#213)', () => {
  it('opens on the Chinese the reader writes', () => {
    expect(scriptOf('共學三十天', 'chinese-traditional')?.id).toBe('chinese-traditional')
    expect(scriptOf('Sale 中文', 'chinese-hongkong')?.id).toBe('chinese-hongkong')
    expect(scriptOf('中文')?.id).toBe('chinese-simplified')
    expect(scriptOf('ひらがな 中文', 'chinese-traditional')?.id).toBe('japanese')
  })

  it.each([
    ['zh-CN', ['zh-TW'], 'chinese-simplified'],
    ['zh-TW', ['en-US'], 'chinese-traditional'],
    ['zh-TW', ['zh-HK', 'en'], 'chinese-hongkong'],
    ['en', ['en-GB', 'zh-Hant-TW'], 'chinese-traditional'],
    ['en', ['zh-MO'], 'chinese-hongkong'],
    ['en', ['zh-Hant-HK'], 'chinese-hongkong'],
    ['en', ['zh-SG'], 'chinese-simplified'],
    ['en', ['fr-FR'], 'chinese-simplified'],
  ] as const)('interface %s with browser %j → %s', (locale, languages, expected) => {
    expect(preferredChinese(locale, languages)).toBe(expected)
  })
})
