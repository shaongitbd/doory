import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { createUiI18n } from '@/i18n/instance'
import { getLanguagePreferences, LANGUAGE_KEY } from '@/i18n/preferences'
import { LanguageSelect } from './LanguageSelect'

describe('LanguageSelect', () => {
  afterEach(() => {
    localStorage.removeItem(LANGUAGE_KEY)
    vi.restoreAllMocks()
  })

  it('updates visible and accessible text and keeps both controls synchronized without replacing them', async () => {
    const instance = createUiI18n()
    render(<I18nextProvider i18n={instance}><LanguageSelect /><LanguageSelect /></I18nextProvider>)
    const selects = screen.getAllByRole('combobox', { name: 'UI language' })
    expect(selects[0]).toHaveValue('system')
    await userEvent.selectOptions(selects[0], 'de')
    expect(screen.getAllByRole('combobox', { name: 'Sprache der Benutzeroberfläche' })).toEqual(selects)
    for (const select of selects) {
      expect(select).toHaveValue('de')
      expect(select).toHaveAccessibleDescription('Aktuelle Sprache der Benutzeroberfläche: Deutsch')
    }
    expect(document.documentElement.lang).toBe('de')
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('de')
    await userEvent.selectOptions(selects[1], 'en')
    expect(selects[0]).toHaveValue('en')
  })

  it('updates the effective language while keeping Follow browser selected', () => {
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en'])
    const instance = createUiI18n()
    const preferences = getLanguagePreferences(instance)
    const dispose = preferences.init()
    try {
      render(<I18nextProvider i18n={instance}><LanguageSelect /></I18nextProvider>)
      languages.mockReturnValue(['de-DE'])
      act(() => window.dispatchEvent(new Event('languagechange')))
      expect(screen.getByRole('combobox', { name: 'Sprache der Benutzeroberfläche' })).toHaveValue('system')
      expect(screen.getByText('Aktuelle Sprache der Benutzeroberfläche: Deutsch')).toBeInTheDocument()
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull()
    } finally {
      dispose()
    }
  })
})
