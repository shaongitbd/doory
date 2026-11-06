import { msg } from '@/i18n/catalog'
import { ArchiveRestore, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Accent } from '@/features/marketing/PageIntro'
import { deleteLocalDesign, listLocalDesigns, type LocalDesignSummary } from '@/lib/local'
import { importLocalProject } from '@/lib/local/projectArchive'
import { formatRelative } from '@/lib/time'
import { useBlobUrl } from '@/lib/useBlobUrl'
import { Button, ConfirmDialog, Thumbnail, useToast } from '@/ui'
import styles from './LocalDesignsStrip.module.css'

function LocalCard({ design, onDelete }: { design: LocalDesignSummary; onDelete(design: LocalDesignSummary): void }) {
  const url = useBlobUrl(design.thumbnail)
  const title = design.title || 'Untitled design'
  return (
    <li className={styles.card}>
      <Link to={`/local/${design.id}`} className={styles.link}>
        <Thumbnail src={url} alt={`${title} preview`} aspect={4 / 3} fit="contain" className={styles.thumb} />
        <span className={styles.title}>{title}</span>
        <span className={styles.meta}>{msg("edited ")}{formatRelative(design.updatedAt)}</span>
      </Link>
      <button type="button" className={styles.delete} aria-label={`Delete ${title}`} title={msg("Delete")} onClick={() => onDelete(design)}>
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </li>
  )
}

function RestoreProjectButton({ quiet = false }: { quiet?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { toast } = useToast()
  const [restoring, setRestoring] = useState(false)

  return (
    <>
      <Button variant={quiet ? 'ghost' : 'secondary'} size={quiet ? 'sm' : 'md'} loading={restoring} leftIcon={<ArchiveRestore size={17} aria-hidden="true" />} onClick={() => input.current?.click()}>
        {msg("Restore project")}</Button>
      <input
        ref={input}
        type="file"
        accept=".doory,application/vnd.doory.project+zip,application/zip"
        hidden
        onChange={async (event) => {
          const inputElement = event.currentTarget
          const file = inputElement.files?.[0]
          if (!file) return
          setRestoring(true)
          try {
            const design = await importLocalProject(file)
            toast({ title: msg("Project restored"), description: msg("A new local copy was saved in this browser."), variant: 'success' })
            navigate(`/local/${design.id}`)
          } catch (error) {
            toast({ title: msg("Couldn’t restore this project"), description: error instanceof Error ? error.message : 'Choose a valid Doory project backup and try again.', variant: 'error', duration: 9000 })
          } finally {
            inputElement.value = ''
            setRestoring(false)
          }
        }}
      />
    </>
  )
}

/** Guests can’t reach a dashboard, so designs saved in this browser are listed on the landing page. */
export function LocalDesignsStrip() {
  const { toast } = useToast()
  const [designs, setDesigns] = useState<LocalDesignSummary[]>([])
  const [pending, setPending] = useState<LocalDesignSummary | null>(null)

  const refresh = useCallback(async () => {
    try {
      setDesigns(await listLocalDesigns())
    } catch {
      setDesigns([])
    }
  }, [])

  useEffect(() => {
    let active = true
    listLocalDesigns()
      .then((list) => active && setDesigns(list))
      .catch(() => active && setDesigns([]))
    return () => {
      active = false
    }
  }, [])

  if (designs.length === 0) {
    return (
      <p className={styles.restoreLine}>
        <span>
          {msg("Have a ")}<code>{msg(".doory")}</code> {msg("backup?")}</span>
        <RestoreProjectButton quiet />
      </p>
    )
  }

  return (
    <section id="local-designs" className={styles.section} aria-labelledby="local-designs-title">
      <div className={styles.panel}>
        <div className={styles.headerRow}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>{msg("on this device")}</p>
            <h2 id="local-designs-title" className={styles.heading}>
              {msg("Pick up where you ")}<Accent>{msg("left off")}</Accent>
            </h2>
            <p className={styles.lead}>
              {msg("These designs are saved in this browser.")}{' '}
              <Link to="/signup" className={styles.signup}>
                {msg("Sign up")}</Link>{' '}
              {msg("to keep them in your account and open them anywhere.")}</p>
          </header>
          <RestoreProjectButton />
        </div>
        <ul className={styles.grid}>
          {designs.map((design) => (
            <LocalCard key={design.id} design={design} onDelete={setPending} />
          ))}
        </ul>
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={`Delete “${pending?.title || 'Untitled design'}”?`}
        description={msg("It’s stored only in this browser, so it can’t be recovered once deleted.")}
        confirmLabel="Delete design"
        tone="danger"
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return
          try {
            await deleteLocalDesign(pending.id)
            toast({ title: msg("Design deleted"), variant: 'success' })
          } catch {
            toast({ title: msg("Couldn’t delete the design"), description: msg("Please try again."), variant: 'error' })
          }
          setPending(null)
          await refresh()
        }}
      />
    </section>
  )
}
