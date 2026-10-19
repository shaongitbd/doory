import { type ContrastPreference, setContrastPreference, useContrast } from '@/lib/contrast'
import { RadioGroup, type RadioOption } from '@/ui'
import { SettingsCard } from './SettingsCard'

const CONTRAST_OPTIONS: RadioOption<ContrastPreference>[] = [
  { value: 'system', label: 'Match my device', description: 'Uses high contrast when your device asks for more contrast.' },
  { value: 'standard', label: 'Standard' },
  { value: 'more', label: 'High contrast', description: 'Darker text, borders and focus rings across Doory. Your designs are not changed.' },
]

/** Kept in this browser (src/lib/contrast.ts), so it applies at once with no request, and also for signed-out pages. */
export function AccessibilitySection() {
  const { preference } = useContrast()
  return (
    <SettingsCard id="accessibility" title="Accessibility" description="Saved in this browser, so each device keeps its own choice.">
      <RadioGroup legend="Contrast" options={CONTRAST_OPTIONS} value={preference} onChange={setContrastPreference} />
    </SettingsCard>
  )
}
