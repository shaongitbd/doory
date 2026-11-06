import { msg } from '@/i18n/catalog'
import { ArrowUpRight, Bug, Lightbulb, Send, ShieldAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Accent, PageIntro } from '@/features/marketing/PageIntro'
import { newIssueUrl, REPO_URL } from '@/lib/links'
import { usePageMeta } from '@/lib/usePageMeta'
import { AnchorButton, Button, Input, Select, Textarea } from '@/ui'
import styles from './ContactPage.module.css'

const TOPICS = [
  { value: 'question', label: msg("A question"), prefix: 'Question' },
  { value: 'idea', label: msg("An idea"), prefix: 'Idea' },
  { value: 'bug', label: msg("Something is broken"), prefix: 'Bug' },
] as const

type Topic = (typeof TOPICS)[number]['value']

const WAYS = [
  {
    tone: 'pink',
    icon: Bug,
    title: msg("Found a bug?"),
    text: 'Tell us what you did and what went wrong. A screenshot helps a lot.',
    action: 'Report a bug',
    href: newIssueUrl('Bug: ', 'What I did:\n\nWhat I expected:\n\nWhat happened instead:\n'),
  },
  {
    tone: 'butter',
    icon: Lightbulb,
    title: msg("Got an idea?"),
    text: 'A feature you miss, a template you’d love, something that could be easier.',
    action: 'Share an idea',
    href: newIssueUrl('Idea: ', ''),
  },
  {
    tone: 'mint',
    icon: ShieldAlert,
    title: msg("A security problem?"),
    text: 'Please don’t post it in public. Report it privately; only the maintainers can see it.',
    action: 'Report privately',
    href: `${REPO_URL}/security/advisories/new`,
  },
] as const

export default function ContactPage() {
  usePageMeta({
    title: msg("Contact"),
    description: msg("Get in touch with the Doory project: report a bug, suggest an idea or report a security problem privately."),
    canonical: '/contact',
  })
  return (
    <div className={styles.page}>
      <PageIntro
        eyebrow="say hello"
        title={
          <>
            {msg("We’d ")}<Accent>{msg("love")}</Accent> {msg("to hear from you.")}</>
        }
        lead="Doory is made in the open, so we talk in the open too: on GitHub, where everyone can follow along and chime in."
        bubble="hello friend!"
      />

      <ul className={styles.ways}>
        {WAYS.map(({ tone, icon: Icon, title, text, action, href }) => (
          <li key={title} className={styles.way} data-tone={tone}>
            <span className={styles.icon} aria-hidden="true">
              <Icon size={22} strokeWidth={2.2} />
            </span>
            <h2 className={styles.wayTitle}>{title}</h2>
            <p className={styles.wayText}>{text}</p>
            <AnchorButton href={href} target="_blank" rel="noopener noreferrer" rightIcon={<ArrowUpRight size={16} aria-hidden="true" />} className={styles.wayAction}>
              {action}
            </AnchorButton>
          </li>
        ))}
      </ul>

      <NoteForm />
    </div>
  )
}

/** Writes the note into a new GitHub issue (opened in a new tab), so nothing is sent anywhere else. */
function NoteForm() {
  const [topic, setTopic] = useState<Topic>('question')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!subject.trim()) {
      setError('Give your note a short subject.')
      return
    }
    const prefix = TOPICS.find((t) => t.value === topic)?.prefix ?? 'Question'
    window.open(newIssueUrl(`${prefix}: ${subject.trim()}`, message.trim()), '_blank', 'noopener,noreferrer')
  }

  return (
    <section className={styles.note} aria-labelledby="note-title">
      <div className={styles.noteHead}>
        <p className={styles.hand}>{msg("or write us a note")}</p>
        <h2 id="note-title" className={styles.noteTitle}>
          {msg("Leave a note")}</h2>
        <p className={styles.noteLead}>{msg("We’ll open it as a new issue on GitHub for you to check and post. Issues are public, so please leave out anything private.")}</p>
      </div>
      <form className={styles.form} onSubmit={submit} noValidate>
        <Select label={msg("What’s it about?")} value={topic} onChange={(event) => setTopic(event.target.value as Topic)} options={TOPICS.map(({ value, label }) => ({ value, label }))} />
        <Input
          label={msg("Subject")}
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value)
            if (error) setError(null)
          }}
          error={error ?? undefined}
          maxLength={120}
          required
        />
        <Textarea label={msg("Your note")} value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={4000} />
        <Button type="submit" rightIcon={<Send size={17} aria-hidden="true" />} className={styles.send}>
          {msg("Continue on GitHub")}</Button>
      </form>
    </section>
  )
}
