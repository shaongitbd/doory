import '@testing-library/jest-dom/vitest'
import { setSizeChoicesForTests } from '@/lib/sizePresets/choices'
import { setSizePresetsForTests } from '@/lib/sizePresets/store'

// Components read the size preset catalogue and the person's sizes; tests get the built-in catalogue and no
// choices, without a request for either.
beforeEach(() => {
  setSizePresetsForTests()
  setSizeChoicesForTests()
})
