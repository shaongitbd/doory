import { msg } from '@/i18n/catalog'
import { Palette, Plus, Star, Trash2, Pencil } from 'lucide-react'
import { useState } from 'react'
import { normalizeHex } from '@/features/brand/colors'
import { BrandKitEditor, MAX_BRAND_COLORS } from '@/features/brand/BrandKitEditor'
import { errorMessage } from '@/features/dashboard/errorMessage'
import { useBrandKits, useDeleteBrandKit, useSaveBrandKit } from '@/lib/api/hooks'
import { usePageTitle } from '@/lib/usePageTitle'
import type { BrandKit, BrandKitInput } from '@/types/api'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Skeleton, useToast } from '@/ui'
import styles from './pageStyles.module.css'
import brandStyles from './BrandPage.module.css'
import { BrandFonts } from './BrandPageFonts'

const MAX_BRAND_KITS = 20

export default function BrandPage() {
  usePageTitle(msg("Brand"))
  const { toast } = useToast()
  const kits = useBrandKits()
  const save = useSaveBrandKit()
  const remove = useDeleteBrandKit()
  const [editing, setEditing] = useState<BrandKit | null | undefined>(undefined)
  const [saveError, setSaveError] = useState('')
  const [deleting, setDeleting] = useState<BrandKit | null>(null)
  const items = kits.data ?? []
  const atLimit = items.length >= MAX_BRAND_KITS

  function toInput(kit: BrandKit, overrides: Partial<BrandKitInput> = {}): BrandKitInput {
    return { name: kit.name, is_default: kit.is_default, colors: kit.colors, fonts: kit.fonts, logo_ids: kit.logos.map((logo) => logo.id), ...overrides }
  }

  function submit(input: BrandKitInput) {
    setSaveError('')
    save.mutate(
      { id: editing?.id, input },
      {
        onSuccess: () => {
          setEditing(undefined)
          toast({ title: editing ? 'Brand kit saved' : 'Brand kit created', variant: 'success' })
        },
        onError: (error) => setSaveError(errorMessage(error)),
      },
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{msg("Brand kits")}</h1>
          <p className={styles.lead}>{msg("Keep your colours, fonts and logos in one place and use them in every design.")}</p>
        </div>
        <Button
          leftIcon={<Plus size={16} />}
          disabled={atLimit}
          onClick={() => {
            setSaveError('')
            setEditing(null)
          }}
        >
          {msg("New brand kit")}</Button>
      </header>
      {atLimit ? <p className={brandStyles.limit}>{msg("You’ve reached the limit of ")}{MAX_BRAND_KITS} {msg("brand kits. Delete one to add another.")}</p> : null}

      <div aria-live="polite" aria-busy={kits.isPending}>
        {kits.isPending ? (
          <ul className={brandStyles.grid} aria-label={msg("Loading brand kits")}>
            {[0, 1, 2].map((index) => (
              <li key={index}>
                <Skeleton height="11rem" radius="var(--radius-lg)" />
              </li>
            ))}
          </ul>
        ) : kits.isError ? (
          <EmptyState title={msg("Your brand kits didn’t load")} description={errorMessage(kits.error, 'Check your connection and try again.')} role="alert" action={<Button onClick={() => void kits.refetch()}>{msg("Try again")}</Button>} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Palette size={28} />}
            title={msg("Create your first brand kit")}
            description={`Add up to ${MAX_BRAND_COLORS} colours, pick your fonts and attach your logos. Then apply them in the editor with one click.`}
            action={<Button leftIcon={<Plus size={16} />} onClick={() => { setSaveError(''); setEditing(null) }}>{msg("New brand kit")}</Button>}
          />
        ) : (
          <ul className={brandStyles.grid}>
            {items.map((kit) => (
              <li key={kit.id}>
                <Card className={brandStyles.card}>
                  <div className={brandStyles.cardHeader}>
                    <h2 className={brandStyles.name}>{kit.name}</h2>
                    {kit.is_default ? <Badge tone="brand">{msg("Default")}</Badge> : null}
                  </div>
                  <ul className={brandStyles.swatches} aria-label={`${kit.name} colours`}>
                    {kit.colors.length === 0 ? <li className={brandStyles.none}>{msg("No colours yet")}</li> : null}
                    {kit.colors.slice(0, 10).map((color) => (
                      <li key={color.id}>
                        <span className={brandStyles.swatch} style={{ background: normalizeHex(color.hex) ?? 'transparent' }} role="img" aria-label={`${color.name || color.hex} ${color.hex}`} title={color.name ? `${color.name} ${color.hex}` : color.hex} />
                      </li>
                    ))}
                  </ul>
                  <p className={brandStyles.meta}>
                    {kit.fonts.length > 0 ? kit.fonts.map((font) => font.family).filter((family, index, all) => all.indexOf(family) === index).join(' · ') : 'Default fonts'}
                    {' · '}
                    {kit.logos.length} {kit.logos.length === 1 ? 'logo' : 'logos'}
                  </p>
                  <div className={brandStyles.actions}>
                    <Button size="sm" variant="secondary" leftIcon={<Pencil size={14} />} onClick={() => { setSaveError(''); setEditing(kit) }}>
                      {msg("Edit")}</Button>
                    {!kit.is_default ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<Star size={14} />}
                        loading={save.isPending && save.variables?.id === kit.id}
                        onClick={() =>
                          save.mutate(
                            { id: kit.id, input: toInput(kit, { is_default: true }) },
                            { onSuccess: () => toast({ title: `“${kit.name}” is now your default kit`, variant: 'success' }), onError: (error) => toast({ title: msg("Couldn’t change the default"), description: errorMessage(error), variant: 'error' }) },
                          )
                        }
                      >
                        {msg("Make default")}</Button>
                    ) : null}
                    <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} />} onClick={() => setDeleting(kit)}>
                      {msg("Delete")}</Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BrandFonts />

      <BrandKitEditor kit={editing} busy={save.isPending} error={saveError} onClose={() => setEditing(undefined)} onSave={submit} />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ''}”?`}
        description={msg("Designs keep the colours and fonts they already use. Only the saved kit is removed.")}
        confirmLabel="Delete kit"
        tone="danger"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null)
              toast({ title: msg("Brand kit deleted") })
            },
            onError: (error) => toast({ title: msg("Couldn’t delete the kit"), description: errorMessage(error), variant: 'error' }),
          })
        }}
      />
    </div>
  )
}
