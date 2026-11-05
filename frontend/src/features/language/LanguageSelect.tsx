import { useTranslation } from 'react-i18next'
import { useLanguagePreference } from '@/i18n/preferences'
import { Select } from '@/ui/Select'

export function LanguageSelect() {
  const { t, i18n } = useTranslation('common')
  const { preference, setPreference } = useLanguagePreference()
  const language = i18n.resolvedLanguage === 'de' ? t('language.german') : t('language.english')
  return (
    <Select
      label={t('language.label')}
      hint={t('language.effective', { language })}
      value={preference}
      options={[
        { value: 'system', label: t('language.followBrowser') },
        { value: 'en', label: t('language.english') },
        { value: 'de', label: t('language.german') },
      ]}
      onChange={(event) => {
        const value = event.target.value
        if (value === 'system' || value === 'en' || value === 'de') setPreference(value)
      }}
    />
  )
}
