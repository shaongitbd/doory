/** Entry point of /editor-harness.html (dev and e2e only; it is not part of the production build). */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n/instance'
import { getLanguagePreferences } from '@/i18n/preferences'
import { Harness } from './HarnessApp'

getLanguagePreferences().init()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <Harness />
    </I18nextProvider>
  </StrictMode>,
)
