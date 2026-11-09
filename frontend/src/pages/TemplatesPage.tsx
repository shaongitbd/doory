import { msg } from '@/i18n/catalog'
import { TemplatesBrowser } from '@/features/templates/TemplatesBrowser'
import { usePageMeta } from '@/lib/usePageMeta'
import styles from './TemplatesPage.module.css'

export default function TemplatesPage() {
  usePageMeta({ title: msg("Free design templates"), description: msg("Browse free, fully editable templates for social posts, presentations, posters, cards and more. Open one in your browser, no account required."), canonical: '/templates', image: '/og-image.png' })
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{msg("Templates")}</p>
        <h1 className={styles.title}>{msg("Start with something beautiful")}</h1>
        <p className={styles.lead}>{msg("Every template is free and fully editable. Open one and change anything. No account required.")}</p>
      </header>
      <TemplatesBrowser />
    </div>
  )
}
