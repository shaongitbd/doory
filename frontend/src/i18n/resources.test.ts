import { t as legacy } from '@/editor/strings'
import { resources, supportedLanguages } from './resources'

function leaves(value: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof child === 'string') return [[path, child]]
    return child && typeof child === 'object' ? Object.entries(leaves(child, path)) : []
  }))
}

const pluralSuffix = /_(zero|one|two|few|many|other)$/
const placeholders = (message: string): string[] => [...new Set([...message.matchAll(/{{\s*([^,}\s]+)[^}]*}}/g)].map((match) => match[1]))].sort()

describe('translation catalogs', () => {
  for (const language of supportedLanguages) {
    for (const namespace of ['common', 'editor'] as const) {
      it(`${language}/${namespace} has complete keys, plural categories and consistent named parameters`, () => {
        const source = leaves(resources.en[namespace])
        const translated = leaves(resources[language][namespace])
        const bases = (messages: Record<string, string>) => [...new Set(Object.keys(messages).map((key) => key.replace(pluralSuffix, '')))].sort()
        expect(bases(translated)).toEqual(bases(source))
        for (const [key, message] of Object.entries(translated)) {
          expect(message.trim(), key).not.toBe('')
          const base = key.replace(pluralSuffix, '')
          const original = source[key] ?? source[`${base}_other`]
          expect(original, key).toBeDefined()
          expect(placeholders(message), key).toEqual(placeholders(original))
        }
        const pluralBases = new Set(Object.keys(source).filter((key) => pluralSuffix.test(key)).map((key) => key.replace(pluralSuffix, '')))
        for (const base of pluralBases) {
          for (const category of new Intl.PluralRules(language).resolvedOptions().pluralCategories) {
            expect(translated[`${base}_${category}`], `${language}: ${base}_${category}`).toBeDefined()
          }
        }
      })
    }
  }

  it('preserves existing English UI wording without importing content defaults into the catalogs', () => {
    const original = leaves(legacy)
    for (const [key, message] of Object.entries(leaves(resources.en.editor))) {
      if (!pluralSuffix.test(key)) expect(message, key).toBe(original[key])
    }
    expect(resources.en.editor).not.toHaveProperty('untitled')
    expect(resources.en.editor).not.toHaveProperty('textPanel')
    expect(resources.en.editor).not.toHaveProperty('drawers')
  })
})
