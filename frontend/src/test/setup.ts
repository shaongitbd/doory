import '@testing-library/jest-dom/vitest'
import { setSizeChoicesForTests } from '@/lib/sizePresets/choices'
import { setSizePresetsForTests } from '@/lib/sizePresets/store'
import { getLanguagePreferences, LANGUAGE_KEY } from '@/i18n/preferences'

// Components read the size preset catalogue and the person's sizes; tests get the built-in catalogue and no
// choices, without a request for either.
beforeEach(() => {
  getLanguagePreferences().setPreference('en')
  window.localStorage.removeItem(LANGUAGE_KEY)
  setSizePresetsForTests()
  setSizeChoicesForTests()
})
