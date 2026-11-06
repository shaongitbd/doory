import { msg } from '@/i18n/catalog'
import { useState, type FormEvent } from 'react'
import type { Asset } from '@/types/api'
import { Button, Dialog, Input } from '@/ui'
import { parseTags } from './tags'

export interface EditAssetDialogProps {
  asset: Asset | null
  busy: boolean
  onClose(): void
  onSave(input: { name: string; tags: string[] }): void
}

export function EditAssetDialog({ asset, busy, onClose, onSave }: EditAssetDialogProps) {
  return (
    <Dialog open={asset !== null} onClose={onClose} title={msg("Edit upload")} size="sm">
      {asset ? <EditForm key={asset.id} asset={asset} busy={busy} onClose={onClose} onSave={onSave} /> : null}
    </Dialog>
  )
}

function EditForm({ asset, busy, onClose, onSave }: { asset: Asset; busy: boolean; onClose(): void; onSave(input: { name: string; tags: string[] }): void }) {
  const [name, setName] = useState(asset.name)
  const [tags, setTags] = useState(asset.tags.join(', '))

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), tags: parseTags(tags) })
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Input label={msg("Name")} value={name} maxLength={120} autoFocus onChange={(event) => setName(event.target.value)} />
      <Input label={msg("Tags")} hint={msg("Separate tags with commas.")} value={tags} onChange={(event) => setTags(event.target.value)} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
        <Button variant="ghost" onClick={onClose}>
          {msg("Cancel")}</Button>
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          {msg("Save")}</Button>
      </div>
    </form>
  )
}
