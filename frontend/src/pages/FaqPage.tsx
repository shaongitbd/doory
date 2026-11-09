import { msg } from '@/i18n/catalog'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Accent, PageIntro } from '@/features/marketing/PageIntro'
import { usePageMeta } from '@/lib/usePageMeta'
import styles from './FaqPage.module.css'

export interface FaqItem {
  question: string
  answer: string
}

const FAQ_ITEMS: FaqItem[] = [
  { question: 'Do I need an account to design?', answer: 'No. Press “Start designing” and you’re in the editor straight away. Your design is saved in this browser as you work. An account is only needed to keep designs in the cloud, share them, or use brand kits.' },
  { question: 'Is Doory really free?', answer: 'Yes. There are no plans, no paywalls and no ads. Every feature you see is available to everyone.' },
  { question: 'Where are my designs stored?', answer: 'Guest designs and the images you upload live in your browser’s own storage on this device. Signed-in designs are stored in your Doory account, so you can open them anywhere.' },
  { question: 'What happens to my guest design when I sign up?', answer: 'We upload the images it uses, create the design in your account, and only then remove the local copy. If anything goes wrong along the way, your original stays untouched and you can try again.' },
  { question: 'Can I download my designs?', answer: 'Yes. Export as PNG, JPG, SVG or PDF. Exporting happens in your browser, so it works for guests too.' },
  { question: 'Can I run Doory myself?', answer: 'Yes. Doory is open source and self-hostable. The code and setup notes are on GitHub.' },
]

export default function FaqPage() {
  usePageMeta({
    title: 'FAQ',
    description: msg("Answers to common questions about Doory: accounts, pricing, where designs are stored, exporting and self-hosting."),
    canonical: '/faq',
  })
  return (
    <div className={styles.page}>
      <PageIntro
        eyebrow="questions?"
        title={
          <>
            {msg("Frequently asked ")}<Accent>{msg("questions")}</Accent>
          </>
        }
        lead="The short answers to what people ask us most. If yours isn’t here, just ask."
        bubble="ask away!"
      />
      <FaqList items={FAQ_ITEMS} />
      <p className={styles.more}>
        <span className={styles.hand}>{msg("still curious?")}</span>{' '}
        <Link to="/contact" className={styles.moreLink}>
          {msg("Get in touch")}</Link>
      </p>
    </div>
  )
}

/** One answer open at a time; the first starts open. */
function FaqList({ items }: { items: FaqItem[] }) {
  const baseId = useId()
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className={styles.list}>
      {items.map((item, index) => {
        const expanded = open === index
        const panelId = `${baseId}-panel-${index}`
        const buttonId = `${baseId}-button-${index}`
        return (
          <div key={item.question} className={styles.item} data-open={expanded || undefined}>
            <h2 className={styles.question}>
              <button id={buttonId} type="button" className={styles.trigger} aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen(expanded ? null : index)}>
                <span>{item.question}</span>
                <svg className={styles.sign} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4.5 C 11.6 9, 12.3 15, 12 19.5 M4.5 12.2 C 9 11.8, 15 12.4, 19.5 11.9" />
                </svg>
              </button>
            </h2>
            <div id={panelId} role="region" aria-labelledby={buttonId} className={styles.answer} hidden={!expanded}>
              <p>{item.answer}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
