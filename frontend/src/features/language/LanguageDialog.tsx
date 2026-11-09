import { useTranslation } from 'react-i18next'
import { Dialog } from '@/ui/Dialog'
import { LanguageSelect } from './LanguageSelect'

export function LanguageDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useTranslation('common')
  return (
    <Dialog open={open} onClose={onClose} title={t('language.title')} description={t('language.description')} closeLabel={t('language.close')} size="sm">
      <LanguageSelect />
    </Dialog>
  )
}
