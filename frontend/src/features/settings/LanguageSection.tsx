import { useTranslation } from 'react-i18next'
import { LanguageSelect } from '@/features/language/LanguageSelect'
import { SettingsCard } from './SettingsCard'

export function LanguageSection() {
  const { t } = useTranslation('common')
  return (
    <SettingsCard id="language" title={t('language.title')} description={t('language.description')}>
      <LanguageSelect />
    </SettingsCard>
  )
}
