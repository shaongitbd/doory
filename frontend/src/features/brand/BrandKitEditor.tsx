import { msg } from '@/i18n/catalog'
import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { newId } from '@/lib/document'
import { flattenPages, useAllFonts, useAssetsList, useMyFonts } from '@/lib/api/hooks'
import type { BrandColor, BrandFont, BrandKit, BrandKitInput } from '@/types/api'
import { Button, Checkbox, Dialog, IconButton, Input, Select, Skeleton, Switch, Thumbnail } from '@/ui'
import { normalizeHex } from './colors'
import styles from './BrandKitEditor.module.css'

export const MAX_BRAND_COLORS = 20
const ROLES: Array<{ role: BrandFont['role']; label: string }> = [
  { role: 'heading', label: msg("Heading font") },
  { role: 'subheading', label: msg("Subheading font") },
  { role: 'body', label: msg("Body font") },
]

export interface BrandKitEditorProps {
  /** `null` creates a new kit; a kit edits it. `undefined` keeps the dialog closed. */
  kit: BrandKit | null | undefined
  busy: boolean
  error?: string
  onClose(): void
  onSave(input: BrandKitInput): void
}

export function BrandKitEditor({ kit, busy, error, onClose, onSave }: BrandKitEditorProps) {
  return (
    <Dialog open={kit !== undefined} onClose={onClose} title={kit ? 'Edit brand kit' : 'New brand kit'} description={msg("Colours, fonts and logos you can reuse in every design.")} size="lg">
      {kit !== undefined ? <EditorForm key={kit?.id ?? 'new'} kit={kit} busy={busy} error={error} onClose={onClose} onSave={onSave} /> : null}
    </Dialog>
  )
}

function ColorRow({ color, onChange, onRemove, index }: { color: BrandColor; onChange(next: BrandColor): void; onRemove(): void; index: number }) {
  const [draft, setDraft] = useState(color.hex)
  const valid = normalizeHex(draft) !== null
  return (
    <li className={styles.colorRow}>
      <input
        type="color"
        className={styles.swatch}
        aria-label={`Colour ${index + 1} picker`}
        value={normalizeHex(draft) ?? '#000000'}
        onChange={(event) => {
          setDraft(event.target.value)
          onChange({ ...color, hex: event.target.value })
        }}
      />
      <Input
        label={`Colour ${index + 1} hex`}
        hideLabel
        value={draft}
        maxLength={7}
        error={valid ? undefined : 'Use a hex colour like #7a64e0.'}
        onChange={(event) => {
          setDraft(event.target.value)
          // Invalid text is passed up as-is so the form knows it cannot be saved yet.
          onChange({ ...color, hex: normalizeHex(event.target.value) ?? event.target.value })
        }}
        spellCheck={false}
      />
      <Input label={`Colour ${index + 1} name`} hideLabel placeholder={msg("Name (optional)")} value={color.name} maxLength={40} onChange={(event) => onChange({ ...color, name: event.target.value })} />
      <IconButton label={`Remove colour ${index + 1}`} size="sm" variant="danger" icon={<Trash2 size={16} />} onClick={onRemove} />
    </li>
  )
}

function EditorForm({ kit, busy, error, onClose, onSave }: { kit: BrandKit | null; busy: boolean; error?: string; onClose(): void; onSave(input: BrandKitInput): void }) {
  const [name, setName] = useState(kit?.name ?? '')
  const [isDefault, setIsDefault] = useState(kit?.is_default ?? false)
  const [colors, setColors] = useState<BrandColor[]>(kit?.colors ?? [{ id: newId(), name: '', hex: '#7a64e0' }])
  const [fonts, setFonts] = useState<BrandFont[]>(kit?.fonts ?? [])
  const [logoIds, setLogoIds] = useState<string[]>(kit?.logos.map((logo) => logo.id) ?? [])
  const fontList = useAllFonts()
  const myFonts = useMyFonts()
  const assets = useAssetsList({ ordering: '-created_at' })
  const library = flattenPages(assets.data)
  const libraryWithSelected = [...(kit?.logos ?? []).filter((logo) => !library.some((asset) => asset.id === logo.id)), ...library]

  const uploaded = new Set((myFonts.data ?? []).map((font) => font.family))
  const families = new Set((fontList.data ?? []).map((font) => font.family))
  for (const family of uploaded) families.add(family)
  for (const font of fonts) families.add(font.family)
  const fontOptions = [{ value: '', label: msg("Default") }, ...[...families].sort((a, b) => a.localeCompare(b)).map((family) => ({ value: family, label: uploaded.has(family) ? `${family} (uploaded)` : family }))]
  const fontFor = (role: BrandFont['role']) => fonts.find((font) => font.role === role)?.family ?? ''

  const nameError = name.trim() ? undefined : 'Give your kit a name.'
  const hasInvalidColor = colors.some((color) => normalizeHex(color.hex) === null)

  function setFont(role: BrandFont['role'], family: string) {
    setFonts((current) => [...current.filter((font) => font.role !== role), ...(family ? [{ role, family }] : [])])
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (nameError || hasInvalidColor) return
    onSave({
      name: name.trim(),
      is_default: isDefault,
      colors: colors.map((color) => ({ ...color, hex: normalizeHex(color.hex) ?? color.hex, name: color.name.trim() })),
      fonts,
      logo_ids: logoIds,
    })
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.row}>
        <Input label={msg("Kit name")} value={name} maxLength={60} autoFocus onChange={(event) => setName(event.target.value)} error={nameError && name.length === 0 ? undefined : nameError} />
        <Switch label={msg("Use as my default kit")} description={msg("Applied to new designs.")} checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
      </div>

      <fieldset className={styles.fieldset}>
        <legend>{msg("Colours")}</legend>
        <ul className={styles.colors}>
          {colors.map((color, index) => (
            <ColorRow key={color.id} color={color} index={index} onChange={(next) => setColors((current) => current.map((item) => (item.id === color.id ? next : item)))} onRemove={() => setColors((current) => current.filter((item) => item.id !== color.id))} />
          ))}
        </ul>
        <Button variant="secondary" size="sm" leftIcon={<Plus size={14} />} disabled={colors.length >= MAX_BRAND_COLORS} onClick={() => setColors((current) => [...current, { id: newId(), name: '', hex: '#1c1517' }])}>
          {msg("Add colour")}</Button>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>{msg("Fonts")}</legend>
        <div className={styles.fonts}>
          {ROLES.map(({ role, label }) => (
            <Select key={role} label={label} value={fontFor(role)} onChange={(event) => setFont(role, event.target.value)} options={fontOptions} />
          ))}
        </div>
        {fontList.isError ? <p className={styles.hint}>{msg("The font list couldn’t be loaded right now.")}</p> : null}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>{msg("Logos")}</legend>
        {assets.isPending ? (
          <Skeleton height="5rem" />
        ) : libraryWithSelected.length === 0 ? (
          <p className={styles.hint}>{msg("Upload images on the Uploads page, then pick your logos here.")}</p>
        ) : (
          <ul className={styles.logos}>
            {libraryWithSelected.map((asset) => (
              <li key={asset.id} className={styles.logo} data-selected={logoIds.includes(asset.id) || undefined}>
                <Thumbnail src={asset.thumb_url || asset.url} alt="" fit="contain" aspect={1} className={styles.logoThumb} />
                <Checkbox
                  label={asset.name}
                  checked={logoIds.includes(asset.id)}
                  onChange={(event) => setLogoIds((current) => (event.target.checked ? [...current, asset.id] : current.filter((id) => id !== asset.id)))}
                />
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className={styles.footer}>
        <Button variant="ghost" onClick={onClose}>
          {msg("Cancel")}</Button>
        <Button type="submit" loading={busy} disabled={Boolean(nameError) || hasInvalidColor}>
          {kit ? 'Save changes' : 'Create kit'}
        </Button>
      </div>
    </form>
  )
}
