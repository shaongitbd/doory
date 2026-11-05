import { createUiI18n } from './instance'
import { getLanguagePreferences, LANGUAGE_KEY, readLanguagePreference, resolveLanguage } from './preferences'

describe('language preferences', () => {
  let dispose: (() => void) | undefined
  afterEach(() => {
    dispose?.()
    dispose = undefined
    vi.restoreAllMocks()
    localStorage.removeItem(LANGUAGE_KEY)
  })

  it.each([
    ['system', ['de-AT', 'en-US'], 'de'],
    ['system', ['fr-FR', 'DE-de', 'en'], 'de'],
    ['system', ['en-GB', 'de'], 'en'],
    ['system', ['fr-FR'], 'en'],
    ['system', [], 'en'],
    ['en', ['de-DE'], 'en'],
    ['de', ['en-US'], 'de'],
  ] as const)('resolves %s with %j to %s', (preference, languages, expected) => {
    expect(resolveLanguage(preference, languages)).toBe(expected)
  })

  it.each(['de-DE', 'fr', '<script>', '', 'system'])('treats invalid stored preference %j as following the browser', (value) => {
    localStorage.setItem(LANGUAGE_KEY, value)
    expect(readLanguagePreference()).toBe('system')
  })

  it('initializes before rendering and follows the browser again after removing an explicit choice', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE'])
    const instance = createUiI18n()
    const preferences = getLanguagePreferences(instance)
    dispose = preferences.init()
    expect(instance.resolvedLanguage).toBe('de')
    expect(document.documentElement.lang).toBe('de')
    expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull()
    preferences.setPreference('en')
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en')
    expect(instance.resolvedLanguage).toBe('en')
    preferences.setPreference('system')
    expect(instance.resolvedLanguage).toBe('de')
    expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull()
  })

  it('uses navigator.language when the language list is empty', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([])
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-CH')
    const instance = createUiI18n()
    dispose = getLanguagePreferences(instance).init()
    expect(instance.resolvedLanguage).toBe('de')
  })

  it('reads a persisted override and ignores browser changes until following the browser', () => {
    localStorage.setItem(LANGUAGE_KEY, 'en')
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE'])
    const instance = createUiI18n()
    const preferences = getLanguagePreferences(instance)
    dispose = preferences.init()
    window.dispatchEvent(new Event('languagechange'))
    expect(instance.resolvedLanguage).toBe('en')
    preferences.setPreference('system')
    expect(instance.resolvedLanguage).toBe('de')
    languages.mockReturnValue(['en-US'])
    window.dispatchEvent(new Event('languagechange'))
    expect(instance.resolvedLanguage).toBe('en')
  })

  it('follows other tabs, including clearing storage, without caching detected languages', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de'])
    const instance = createUiI18n()
    const preferences = getLanguagePreferences(instance)
    dispose = preferences.init()
    const listener = vi.fn()
    const unsubscribe = preferences.subscribe(listener)
    localStorage.setItem(LANGUAGE_KEY, 'en')
    window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_KEY, storageArea: localStorage }))
    expect(preferences.getSnapshot()).toBe('en')
    expect(instance.resolvedLanguage).toBe('en')
    localStorage.removeItem(LANGUAGE_KEY)
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(preferences.getSnapshot()).toBe('system')
    expect(instance.resolvedLanguage).toBe('de')
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('ignores unrelated and session-storage events', () => {
    const instance = createUiI18n()
    const preferences = getLanguagePreferences(instance)
    dispose = preferences.init()
    preferences.setPreference('en')
    localStorage.setItem(LANGUAGE_KEY, 'de')
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }))
    window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_KEY, storageArea: sessionStorage }))
    expect(instance.resolvedLanguage).toBe('en')
  })

  it('keeps a session preference when storage is blocked, including returning to the browser', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en'])
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    }
    const instance = createUiI18n()
    const preferences = getLanguagePreferences(instance)
    expect(() => { dispose = preferences.init() }).not.toThrow()
    preferences.setPreference('de')
    expect(preferences.getSnapshot()).toBe('de')
    expect(instance.resolvedLanguage).toBe('de')
    preferences.setPreference('system')
    expect(instance.resolvedLanguage).toBe('en')
  })

  it('initializes idempotently and removes listeners on disposal', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en'])
    const instance = createUiI18n()
    const preferences = getLanguagePreferences(instance)
    const first = preferences.init()
    expect(preferences.init()).toBe(first)
    first()
    first()
    localStorage.setItem(LANGUAGE_KEY, 'de')
    window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_KEY }))
    expect(instance.resolvedLanguage).toBe('en')
    dispose = preferences.init()
    expect(dispose).not.toBe(first)
    window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_KEY }))
    expect(instance.resolvedLanguage).toBe('de')
  })
})
