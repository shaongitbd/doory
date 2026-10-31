import { ImagePlus, Pencil, Plus, Type, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrandFont, BrandKit } from '@/types/api'
import { useEditor, useEditorState, useSelection } from '../context'
import { YourFonts } from '../fonts/YourFonts'
import { useResource } from '../hooks/useResource'
import { pageCentre } from '../drawers/insertAt'
import { pickFiles } from '../engine/files'
import { UploadError } from '../engine/assets'
import { createTextbox, TEXT_PRESETS } from '../engine/objects/factories'
import { fontStack, primaryFamily } from '../engine/text/fontStack'
import { useResolvedSrc } from '../hooks/useResolvedSrc'
import { t } from '../strings'
import { FontPicker } from '../toolbar/FontPicker'
import { Button, IconButton } from '../ui/Button'
import { ColorPicker } from '../ui/ColorPicker'
import { Popover } from '../ui/Popover'
import { Skeleton } from '../ui/Skeleton'
import { BRAND_ROLES, MAX_BRAND_COLORS, MAX_BRAND_LOGOS, assetToRef, emptyKit, fontOf, pickKit, refToAsset, upsertKit, withColor, withFont, withLogo, withoutColor, withoutLogo } from './brandOps'
import { setBrandPalette } from './brandPalette'
import { DeleteControl } from './CommentParts'
import { CategoryMenu, type CategoryEntry } from './library'
import styles from './Brand.module.css'

type Brand = NonNullable<ReturnType<typeof useEditor>['adapter']['services']['brand']>
type Rename = { kind: 'idle' } | { kind: 'renaming'; draft: string }

/** Guests: what a brand kit is, and the way to an account. */
function BrandGate({ onDone }: { onDone: () => void }) {
  const editor = useEditor()
  const [busy, setBusy] = useState(false)
  const signUp = async (): Promise<void> => {
    setBusy(true)
    try {
      const ok = await editor.adapter.requireAccount('brand-kit', async () => ({ document: editor.getDocument(), title: editor.state.title }))
      if (ok) onDone()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={styles.gate} data-testid="brand-gate">
      <strong>{t.brand.gateTitle}</strong>
      <span>{t.brand.gateBody}</span>
      <Button variant="primary" disabled={busy} onClick={() => void signUp()} data-testid="brand-signup">
        {t.brand.gateAction}
      </Button>
    </div>
  )
}

function LogoThumb({ kit, logoId, onUse, onRemove }: { kit: BrandKit; logoId: string; onUse: () => void; onRemove: () => void }) {
  const logo = kit.logos.find((l) => l.id === logoId)
  const url = useResolvedSrc(logo?.thumb_url || logo?.url || '')
  if (!logo) return null
  return (
    <div className={styles.swatchWrap}>
      <button type="button" className={styles.logo} aria-label={t.brand.addLogoToDesign(logo.name)} title={logo.name} data-testid="brand-logo" onClick={onUse}>
        {url ? <img src={url} alt="" draggable={false} /> : <Skeleton width={40} height={40} radius={6} />}
      </button>
      <button type="button" className={styles.remove} aria-label={t.brand.removeLogo(logo.name)} onClick={onRemove}>
        <X size={10} aria-hidden="true" />
      </button>
    </div>
  )
}

function FontRole({ role, family, onPick, onAdd, onUse, canUse }: { role: BrandFont['role']; family: string | null; onPick: (family: string) => void; onAdd: () => void; onUse: () => void; canUse: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.fontRow}>
      <span className={styles.fontRole}>{t.brand.roles[role]}</span>
      <button ref={ref} type="button" className={styles.fontPick} style={family ? { fontFamily: fontStack(family, 'sans-serif') } : undefined} aria-haspopup="dialog" aria-expanded={open} aria-label={t.brand.chooseFont(t.brand.roles[role])} data-testid={`brand-font-${role}`} onClick={() => setOpen((o) => !o)}>
        {family ?? t.brand.noFont}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} label={t.brand.chooseFont(t.brand.roles[role])} placement="bottom-start" variant="plain" cover>
        <FontPicker
          current={family ?? ''}
          onPreview={() => undefined}
          onPick={(_stack, picked) => {
            onPick(primaryFamily(picked))
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      </Popover>
      {family ? (
        <Button size="sm" variant="soft" icon={<Type size={14} aria-hidden="true" />} onClick={canUse ? onUse : onAdd} data-testid={`brand-font-add-${role}`}>
          {canUse ? t.brand.useFont : t.brand.addText}
        </Button>
      ) : null}
    </div>
  )
}

function AddColor({ onAdd }: { onAdd: (color: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [color, setColor] = useState('#7a64e0')
  return (
    <>
      <button ref={ref} type="button" className={styles.addBtn} aria-label={t.brand.addColor} aria-haspopup="dialog" aria-expanded={open} title={t.brand.addColor} data-testid="brand-add-color" onClick={() => setOpen((o) => !o)}>
        <Plus size={16} aria-hidden="true" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} label={t.brand.addColor} placement="bottom-start" cover>
        <div className={styles.pickPopover}>
          <ColorPicker value={color} onChange={setColor} />
          <Button
            variant="primary"
            style={{ width: '100%', marginTop: 12 }}
            onClick={() => {
              onAdd(color)
              setOpen(false)
            }}
            data-testid="brand-add-color-confirm"
          >
            {t.brand.addColorConfirm}
          </Button>
        </div>
      </Popover>
    </>
  )
}

/** Applies a brand colour: to the selected text or shape, or to the page background when nothing is selected. */
function useApplyColor(): (color: string) => void {
  const editor = useEditor()
  return useCallback(
    (color: string) => {
      const sel = editor.state.selection
      if (sel.ids.length === 0) editor.pages.setBackground(editor.state.activePageId, { type: 'solid', color })
      else if (sel.kinds.every((k) => k === 'text')) editor.style.text({ fill: { type: 'solid', color } }, t.history.changeTextColor)
      else editor.style.setFill({ type: 'solid', color })
    },
    [editor],
  )
}

function Kit({ brand }: { brand: Brand }) {
  const editor = useEditor()
  const sel = useSelection()
  const apply = useApplyColor()
  const load = useCallback(() => brand.list(), [brand])
  const resource = useResource(load)
  const kits = resource.data
  const [kitId, setKitId] = useState<string | null>(null)
  const [failure, setError] = useState<string | null>(null)
  const error = failure ?? (resource.failed ? t.brand.loadFailed : null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [rename, setRename] = useState<Rename>({ kind: 'idle' })

  const kit = (kits && (kits.find((k) => k.id === kitId) ?? pickKit(kits))) ?? null

  useEffect(() => {
    if (kits) setBrandPalette(kit)
  }, [kits, kit])

  // The kit's fonts are shown in their own faces (an uploaded font is not loaded until something uses it).
  useEffect(() => {
    if (kit) for (const f of kit.fonts) void editor.fonts.load(f.family, 400, 'normal', f.family)
  }, [editor, kit])

  const save = async (next: BrandKit): Promise<BrandKit | null> => {
    setSaving(true)
    setError(null)
    try {
      const saved = await brand.save(next)
      resource.update((cur) => upsertKit(cur, saved))
      setKitId(saved.id)
      return saved
    } catch {
      setError(t.brand.saveFailed)
      return null
    } finally {
      setSaving(false)
    }
  }

  const renameTo = async (target: BrandKit, draft: string): Promise<void> => {
    if (!draft.trim()) return
    if (await save({ ...target, name: draft.trim() })) setRename({ kind: 'idle' })
  }

  const remove = async (target: BrandKit): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      await brand.remove(target.id)
      resource.update((cur) => cur.filter((k) => k.id !== target.id))
      setKitId(null)
    } catch {
      setError(t.brand.deleteFailed)
    } finally {
      setSaving(false)
    }
  }

  const create = async (): Promise<void> => {
    if (!name.trim()) return
    const saved = await save(emptyKit(name, (kits ?? []).length === 0))
    if (saved) {
      setName('')
      setCreating(false)
    }
  }

  const addTextIn = async (role: BrandFont['role'], family: string): Promise<void> => {
    const spec = TEXT_PRESETS[role]
    await editor.fonts.load(family, spec.weight)
    const page = editor.pageSizeOf(editor.state.activePageId)
    const box = createTextbox(page, pageCentre(editor), { preset: role, fontFamily: fontStack(family, 'sans-serif') })
    await editor.insert.add([box], t.history.addText, { edit: true })
  }

  const addLogo = async (target: BrandKit): Promise<void> => {
    const [file] = await pickFiles('image/png,image/jpeg,image/webp,image/svg+xml', false)
    if (!file) return
    try {
      const ref = await editor.assets.upload(file, file.name)
      await save(withLogo(target, refToAsset(ref)))
    } catch (err) {
      editor.toast(err instanceof UploadError ? err.message : t.errors.upload, 'error')
    }
  }

  if (error && !kits) {
    return (
      <div className={styles.gate} role="alert">
        <span>{error}</span>
        <Button onClick={resource.reload}>{t.stickers.retry}</Button>
      </div>
    )
  }
  if (!kits) return <Skeleton height={120} radius={12} aria-busy="true" aria-label={t.brand.loading} />

  const entries: CategoryEntry[] = [...kits.map((k): CategoryEntry => ({ kind: 'option', id: k.id, label: k.name })), { kind: 'option', id: '+new', label: t.brand.newKit }]
  const textSelected = sel.ids.length > 0 && sel.kinds.every((k) => k === 'text')

  return (
    <div className={styles.panel} data-testid="brand-panel">
      {kits.length > 0 ? (
        <CategoryMenu
          name={t.brand.kit}
          label={kit?.name ?? t.brand.newKit}
          entries={entries}
          activeId={creating ? '+new' : (kit?.id ?? '')}
          testId="brand-kit-menu"
          onSelect={(id) => {
            setRename({ kind: 'idle' })
            if (id === '+new') setCreating(true)
            else {
              setCreating(false)
              setKitId(id)
            }
          }}
        />
      ) : null}

      {kits.length === 0 || creating ? (
        <section className={styles.section}>
          <h3 className={styles.heading}>{t.brand.newKit}</h3>
          <p className={styles.note}>{t.brand.createHint}</p>
          <div className={styles.nameRow}>
            <input className={styles.nameInput} value={name} maxLength={80} placeholder={t.brand.kitName} aria-label={t.brand.kitName} data-testid="brand-kit-name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} />
            <Button variant="primary" disabled={!name.trim() || saving} onClick={() => void create()} data-testid="brand-kit-create">
              {t.brand.create}
            </Button>
          </div>
        </section>
      ) : null}

      {kit && !creating ? (
        <>
          {rename.kind === 'renaming' ? (
            <div className={styles.nameRow}>
              <input className={styles.nameInput} value={rename.draft} maxLength={80} autoFocus aria-label={t.brand.kitName} data-testid="brand-kit-rename-input" onChange={(e) => setRename({ kind: 'renaming', draft: e.target.value })} onKeyDown={(e) => (e.key === 'Enter' ? void renameTo(kit, rename.draft) : e.key === 'Escape' && setRename({ kind: 'idle' }))} />
              <Button variant="primary" disabled={!rename.draft.trim() || saving} onClick={() => void renameTo(kit, rename.draft)} data-testid="brand-kit-rename-save">
                {t.brand.saveName}
              </Button>
              <Button variant="ghost" onClick={() => setRename({ kind: 'idle' })}>
                {t.dialog.cancel}
              </Button>
            </div>
          ) : (
            <div className={styles.actions}>
              <IconButton label={t.brand.renameKit} size="sm" onClick={() => setRename({ kind: 'renaming', draft: kit.name })} data-testid="brand-kit-rename">
                <Pencil size={14} aria-hidden="true" />
              </IconButton>
              <DeleteControl label={t.brand.deleteKit} confirmLabel={t.brand.deleteKit} onConfirm={() => void remove(kit)} confirmTestId="brand-kit-delete-confirm" />
            </div>
          )}
          <section className={styles.section}>
            <div className={styles.head}>
              <h3 className={styles.heading}>{t.brand.colors}</h3>
            </div>
            <div className={styles.swatches} role="group" aria-label={t.brand.colors}>
              {kit.colors.map((c) => (
                <div key={c.id} className={styles.swatchWrap}>
                  <button type="button" className={styles.swatch} style={{ background: c.hex }} aria-label={t.brand.applyColor(c.name)} title={c.name} data-testid="brand-color" onClick={() => apply(c.hex)} />
                  <button type="button" className={styles.remove} aria-label={t.brand.removeColor(c.name)} onClick={() => void save(withoutColor(kit, c.id))}>
                    <X size={10} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {kit.colors.length < MAX_BRAND_COLORS ? <AddColor onAdd={(color) => void save(withColor(kit, color))} /> : null}
            </div>
            {kit.colors.length === 0 ? <p className={styles.note}>{t.brand.noColors}</p> : null}
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>{t.brand.fonts}</h3>
            {BRAND_ROLES.map((role) => {
              const family = fontOf(kit, role)
              return <FontRole key={role} role={role} family={family} canUse={textSelected} onPick={(f) => void save(withFont(kit, role, f))} onAdd={() => family && void addTextIn(role, family)} onUse={() => family && editor.style.text({ fontFamily: fontStack(family, 'sans-serif') }, t.history.changeFont)} />
            })}
          </section>

          <YourFonts />

          <section className={styles.section}>
            <div className={styles.head}>
              <h3 className={styles.heading}>{t.brand.logos}</h3>
            </div>
            <div className={styles.logos}>
              {kit.logos.map((l) => (
                <LogoThumb key={l.id} kit={kit} logoId={l.id} onUse={() => void editor.insert.imageFromAsset(assetToRef(l))} onRemove={() => void save(withoutLogo(kit, l.id))} />
              ))}
            </div>
            {kit.logos.length === 0 ? <p className={styles.note}>{t.brand.noLogos}</p> : null}
            {kit.logos.length < MAX_BRAND_LOGOS ? (
              <Button icon={<ImagePlus size={16} aria-hidden="true" />} disabled={saving} onClick={() => void addLogo(kit)} data-testid="brand-add-logo">
                {t.brand.addLogo}
              </Button>
            ) : null}
          </section>
        </>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Brand sidebar: kits of colours, fonts and logos (signed-in users); guests are invited to sign up. */
export function BrandPanel() {
  const editor = useEditor()
  useEditorState((s) => s.mode)
  const [, refresh] = useState(0)
  const brand = editor.adapter.services.brand
  return brand ? <Kit brand={brand} /> : <BrandGate onDone={() => refresh((n) => n + 1)} />
}
