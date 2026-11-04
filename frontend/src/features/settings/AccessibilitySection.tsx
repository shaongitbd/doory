import { msg, activateLocale } from '@/i18n/catalog'
import { type ContrastPreference, setContrastPreference, useContrast } from '@/lib/contrast'
import { getLocale, subscribeLocale, type Locale } from '@/i18n/locale'
import { useSyncExternalStore } from 'react'
import { RadioGroup, type RadioOption } from '@/ui'
import { SettingsCard } from './SettingsCard'

const CONTRAST_OPTIONS: RadioOption<ContrastPreference>[] = [
  { value: 'system', label: msg("Match my device"), description: msg("Uses high contrast when your device asks for more contrast.") },
  { value: 'standard', label: msg("Standard") },
  { value: 'more', label: msg("High contrast"), description: msg("Darker text, borders and focus rings across Doory. Your designs are not changed.") },
]

/** Kept in this browser (src/lib/contrast.ts), so it applies at once with no request, and also for signed-out pages. */
export function AccessibilitySection() {
  const { preference } = useContrast()
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => 'en')
  return (
    <SettingsCard id="accessibility" title={msg("Accessibility")} description={msg("Saved in this browser, so each device keeps its own choice.")}>
      <label htmlFor="doory-language">{msg("Language / 语言 / 語言")}</label>
      <select id="doory-language" value={locale} onChange={event => { void activateLocale(event.target.value as Locale) }}>
        <option value="en">{msg("English")}</option>
        <option value="zh-CN">简体中文</option>
        <option value="zh-TW">繁體中文</option>
      </select>
      <RadioGroup legend={msg("Contrast")} options={CONTRAST_OPTIONS} value={preference} onChange={setContrastPreference} />
    </SettingsCard>
  )
}
