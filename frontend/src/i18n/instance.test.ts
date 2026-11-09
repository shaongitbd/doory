import { createUiI18n } from './instance'

describe('UI translations', () => {
  it('initializes synchronously in English and switches using bundled resources', async () => {
    const instance = createUiI18n()
    expect(instance.isInitialized).toBe(true)
    expect(instance.t('topbar.view', { ns: 'editor' })).toBe('View')
    await instance.changeLanguage('de')
    expect(instance.t('topbar.view', { ns: 'editor' })).toBe('Ansicht')
  })

  it('falls back to English for unsupported languages and missing German translations', async () => {
    const instance = createUiI18n('de')
    instance.removeResourceBundle('de', 'editor')
    expect(instance.t('save.saved', { ns: 'editor' })).toBe('Saved')
    await instance.changeLanguage('fr')
    expect(instance.resolvedLanguage).toBe('en')
    expect(instance.t('language.title')).toBe('Language')
    expect(createUiI18n('de').t('save.saved', { ns: 'editor' })).toBe('Gespeichert')
  })

  it.each([
    ['en', 0, 'Clear 0 ruler guides'], ['en', 1, 'Clear 1 ruler guide'], ['en', 3, 'Clear 3 ruler guides'],
    ['de', 0, '0 Linealhilfslinien entfernen'], ['de', 1, '1 Linealhilfslinie entfernen'], ['de', 3, '3 Linealhilfslinien entfernen'],
  ] as const)('uses locale-aware plurals in %s for %i', (language, count, expected) => {
    expect(createUiI18n(language).t('design.clearGuides', { ns: 'editor', count })).toBe(expected)
  })

  it('uses named parameters and locale-aware number formatting', () => {
    const instance = createUiI18n('de')
    expect(instance.t('language.effective', { language: 'English' })).toBe('Aktuelle Sprache der Benutzeroberfläche: English')
    expect(instance.t('design.clearGuides', { ns: 'editor', count: 1234 })).toBe('1.234 Linealhilfslinien entfernen')
  })

  it.each([
    ['en', 0, 'Live · 0 people'], ['en', 1, 'Live'], ['en', 3, 'Live · 3 people'],
    ['de', 0, 'Live · 0 Personen'], ['de', 1, 'Live'], ['de', 3, 'Live · 3 Personen'],
  ] as const)('uses locale-aware participant counts in %s for %i', (language, count, expected) => {
    expect(createUiI18n(language).t('collab.status.live', { ns: 'editor', count })).toBe(expected)
  })
})
