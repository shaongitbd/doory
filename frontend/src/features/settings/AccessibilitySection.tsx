import { msg, activateLocale } from '@/i18n/catalog'
import { type ContrastPreference, setContrastPreference, useContrast } from '@/lib/contrast'
import { getLocale, subscribeLocale, type Locale } from '@/i18n/locale'
import { useSyncExternalStore } from 'react'
import { RadioGroup, Select, type RadioOption } from '@/ui'
import { SettingsCard } from './SettingsCard'

/** In English: `msg` translates them where they are shown, in the language chosen at the time. */
const CONTRAST_OPTIONS: Array<{ value: ContrastPreference; label: string; description?: string }> = [
  { value: 'system', label: "Match my device", description: "Uses high contrast when your device asks for more contrast." },
  { value: 'standard', label: "Standard" },
  { value: 'more', label: "High contrast", description: "Darker text, borders and focus rings across Doory. Your designs are not changed." },
]

/** Kept in this browser (src/lib/contrast.ts), so it applies at once with no request, and also for signed-out pages. */
export function AccessibilitySection() {
  const { preference } = useContrast()
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => 'en')
  return (
    <SettingsCard id="accessibility" title={msg("Accessibility")} description={msg("Saved in this browser, so each device keeps its own choice.")}>
      <Select
        label={msg("Language / 语言 / 語言")}
        value={locale}
        onChange={(event) => void activateLocale(event.target.value as Locale)}
        options={[
          { value: 'en', label: msg("English") },
          { value: 'zh-CN', label: '简体中文' },
          { value: 'zh-TW', label: '繁體中文' },
        ]}
      />
      <RadioGroup legend={msg("Contrast")} options={CONTRAST_OPTIONS.map((option): RadioOption<ContrastPreference> => ({ ...option, label: msg(option.label), description: option.description && msg(option.description) }))} value={preference} onChange={setContrastPreference} />
    </SettingsCard>
  )
}
