import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/nunito'
import '@fontsource-variable/nunito/wght-italic.css'
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/opsz-italic.css'
import '@fontsource-variable/caveat'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/global.css'
import { initContrast } from './lib/contrast'
import App from './App'
import { loadLocale } from './i18n/catalog'
import { getLocale, setLocale } from './i18n/locale'

// Before the first render, so high contrast is on from the first paint (the CSP allows no inline script for this).
initContrast()
await loadLocale(getLocale()).catch(() => setLocale('en'))

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
