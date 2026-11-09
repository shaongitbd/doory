import { msg } from '@/i18n/catalog'
import { Download, GitBranch, LayoutTemplate, Palette, PenLine, PenTool, Server, Share2, ShieldCheck } from 'lucide-react'
import { Accent, PageIntro } from '@/features/marketing/PageIntro'
import { usePageMeta } from '@/lib/usePageMeta'
import { LinkButton } from '@/ui'
import styles from './FeaturesPage.module.css'

const FEATURES = [
  { icon: PenTool, title: "The editor", text: 'Layers, text effects, shapes, masks, filters, snapping and several pages per design. Undo goes back at least 100 steps.' },
  { icon: LayoutTemplate, title: "Templates", text: 'Ready-made layouts for social posts, slides, posters, cards and more.' },
  { icon: Palette, title: "Brand kits", text: 'Save your colours, fonts and logos once and use them in every design.' },
  { icon: Share2, title: "Sharing and comments", text: 'Share a view, comment or edit link, with a password if you want one.' },
  { icon: Download, title: "Export", text: 'PNG, JPG, SVG and PDF, made in your browser. No watermark.' },
  { icon: ShieldCheck, title: "No account needed", text: 'Designs you make without an account stay in your browser until you sign up.' },
  { icon: GitBranch, title: "Open source", text: 'The code is on GitHub. Report bugs or send fixes there.' },
  { icon: Server, title: "Self-hosting", text: 'Run Doory on your own server, with Docker or without it.' },
]

const STEPS = [
  { title: "Start without an account", text: 'Pick a size or a template. Your design saves in this browser as you go.' },
  { title: "Design", text: 'Add text, photos, shapes and your brand colours. Images you upload stay on your device until you sign up.' },
  { title: "Save it to an account", text: 'Create a free account and Doory moves the design and its images to it in one step.' },
]

export default function FeaturesPage() {
  usePageMeta({
    title: msg("Features"),
    description: msg("Everything Doory can do: a full design editor, templates, brand kits, sharing and comments, and exports without watermarks. Free and open source."),
    canonical: '/features',
  })
  return (
    <div className={styles.page}>
      <PageIntro
        eyebrow="everything’s included"
        title={
          <>
            {msg("All the tools. ")}<Accent>{msg("None")}</Accent> {msg("of the paywalls.")}</>
        }
        lead="Every feature is free. There is no paid plan."
        bubble="it’s all free!"
      />

      <section className={styles.section} aria-labelledby="features-list">
        <h2 id="features-list" className={styles.visuallyHidden}>
          {msg("Features")}</h2>
        <ul className={styles.notes}>
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className={styles.note}>
              <span className={styles.icon} aria-hidden="true">
                <Icon size={20} />
              </span>
              <h3 className={styles.noteTitle}>{msg(title)}</h3>
              <p className={styles.noteText}>{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="how-it-works">
        <p className={styles.hand}>{msg("how it works")}</p>
        <h2 id="how-it-works" className={styles.heading}>
          {msg("Start now, sign up later")}</h2>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.number} aria-hidden="true">
                {index + 1}
              </span>
              <h3 className={styles.stepTitle}>
                <span className={styles.visuallyHidden}>{msg("Step ")}{index + 1}: </span>
                {msg(step.title)}
              </h3>
              <p className={styles.stepText}>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className={styles.end}>
        <p className={styles.hand}>{msg("ready when you are")}</p>
        <LinkButton to="/create" size="lg" rightIcon={<PenLine size={18} aria-hidden="true" />}>
          {msg("Create a design")}</LinkButton>
      </div>
    </div>
  )
}
