import { msg } from '@/i18n/catalog'
import { Trash2, Type, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from '@/editor/strings'
import { variantLabel } from '@/editor/fonts/fontFile'
import { errorMessage } from '@/features/dashboard/errorMessage'
import { useDeleteFont, useMyFonts } from '@/lib/api/hooks'
import type { FontFamily } from '@/types/api'
import { Button, Card, ConfirmDialog, EmptyState, Skeleton, useToast } from '@/ui'
import { UploadFontsDialog } from './BrandPageUpload'
import styles from './BrandPageFonts.module.css'

/** Registers each family's regular face so its card shows the name in the font itself (best effort). */
function useShowInOwnFace(families: readonly FontFamily[]): void {
  useEffect(() => {
    if (typeof FontFace === 'undefined' || !document.fonts) return undefined
    const added: FontFace[] = []
    let cancelled = false
    for (const family of families) {
      const variant = [...family.variants].sort((a, b) => Math.abs(a.weight - 400) - Math.abs(b.weight - 400))[0]
      if (!variant) continue
      const face = new FontFace(family.family, `url("${variant.url}")`, { weight: String(variant.weight), style: variant.style })
      void face.load().then(
        () => {
          if (cancelled) return
          document.fonts.add(face)
          added.push(face)
        },
        () => undefined,
      )
    }
    return () => {
      cancelled = true
      for (const face of added) document.fonts.delete(face)
    }
  }, [families])
}

/** The "Your fonts" part of the Brand page: what was uploaded, upload more, delete. */
export function BrandFonts() {
  const fonts = useMyFonts()
  const remove = useDeleteFont()
  const { toast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<FontFamily | null>(null)
  const items = fonts.data ?? []
  useShowInOwnFace(items)

  const upload = (
    <Button leftIcon={<Upload size={16} />} onClick={() => setUploading(true)}>
      {t.userFonts.upload}
    </Button>
  )

  return (
    <section className={styles.section} aria-labelledby="brand-fonts-title">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id="brand-fonts-title" className={styles.title}>
            {t.userFonts.manage}
          </h2>
          <p className={styles.lead}>{msg("Upload fonts you have the right to use, then pick them in the editor and in your brand kits.")}</p>
        </div>
        {items.length > 0 ? upload : null}
      </header>

      <div aria-live="polite" aria-busy={fonts.isPending}>
        {fonts.isPending ? (
          <ul className={styles.grid} aria-label={t.userFonts.loading}>
            {[0, 1, 2].map((index) => (
              <li key={index}>
                <Skeleton height="7rem" radius="var(--radius-lg)" />
              </li>
            ))}
          </ul>
        ) : fonts.isError ? (
          <EmptyState title={t.userFonts.manageLoadFailed} description={errorMessage(fonts.error, 'Check your connection and try again.')} role="alert" action={<Button onClick={() => void fonts.refetch()}>{t.userFonts.retry}</Button>} />
        ) : items.length === 0 ? (
          <EmptyState icon={<Type size={28} />} title={msg("Bring your own fonts")} description={t.userFonts.manageEmpty} action={upload} />
        ) : (
          <ul className={styles.grid}>
            {items.map((family) => (
              <li key={family.id}>
                <Card className={styles.card} data-testid="your-font" data-family={family.family}>
                  <div className={styles.name} style={{ fontFamily: `"${family.family}", sans-serif` }}>
                    {family.family}
                  </div>
                  <p className={styles.sample} style={{ fontFamily: `"${family.family}", sans-serif` }} aria-hidden="true">
                    {msg("The quick brown fox jumps over the lazy dog")}</p>
                  <p className={styles.meta}>
                    {t.userFonts.styles(family.variants.length)}: {family.variants.map((v) => variantLabel(v.weight, v.style)).join(' · ')}
                  </p>
                  <div className={styles.actions}>
                    <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} />} onClick={() => setDeleting(family)} aria-label={t.userFonts.deleteFont(family.family)}>
                      {msg("Delete")}</Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <UploadFontsDialog open={uploading} onClose={() => setUploading(false)} />
      <ConfirmDialog
        open={deleting !== null}
        title={t.userFonts.deleteTitle(deleting?.family ?? '')}
        description={t.userFonts.deleteBody}
        confirmLabel={t.userFonts.deleteConfirm}
        cancelLabel={t.userFonts.deleteCancel}
        tone="danger"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          const target = deleting
          remove.mutate(target.id, {
            onSuccess: () => {
              setDeleting(null)
              toast({ title: t.userFonts.deleted(target.family) })
            },
            onError: (error) => toast({ title: t.userFonts.deleteFailed(target.family), description: errorMessage(error), variant: 'error' }),
          })
        }}
      />
    </section>
  )
}
