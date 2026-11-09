import { msg } from '@/i18n/catalog'
import { TemplatesBrowser } from '@/features/templates/TemplatesBrowser'
import { usePageTitle } from '@/lib/usePageTitle'
import styles from './pageStyles.module.css'

export default function DashboardTemplatesPage() {
  usePageTitle(msg("Start from a template"))
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>{msg("Templates")}</h1>
        <p className={styles.lead}>{msg("Open a template to preview it, then add a copy to your designs.")}</p>
      </header>
      <TemplatesBrowser />
    </div>
  )
}
