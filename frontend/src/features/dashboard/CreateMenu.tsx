import { msg } from '@/i18n/catalog'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LazyCreateDesignDialog } from '@/features/create/LazyCreateDesignDialog'
import { PresetIcon } from '@/features/PresetIcon'
import { createUrl } from '@/features/presets'
import { useSizePresets } from '@/lib/sizePresets'
import { noteUsedSize, useSizeChoices, yourSizes } from '@/lib/sizePresets/choices'
import { Button, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator, useMediaQuery } from '@/ui'

/** "Create a design" dropdown: quick presets plus the full size picker. */
export function CreateMenu() {
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'sizes' | 'custom' | null>(null)
  const compact = useMediaQuery('(max-width: 639px)')
  const catalogue = useSizePresets()
  const choices = useSizeChoices()
  return (
    <>
      <Menu label={msg("Create a design")} placement="bottom-end" trigger={compact ? <IconButton variant="primary" label={msg("Create a design")} icon={<Plus size={20} />} /> : <Button leftIcon={<Plus size={18} />}>{msg("Create a design")}</Button>}>
        <MenuLabel>{msg("Your sizes")}</MenuLabel>
        {yourSizes(catalogue, choices).map((preset) => (
          <MenuItem
            key={preset.id}
            icon={<PresetIcon preset={preset} size={16} />}
            onSelect={() => {
              noteUsedSize(preset.id)
              navigate(createUrl({ presetId: preset.id }))
            }}
          >
            {preset.label}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem icon={<SlidersHorizontal size={16} />} onSelect={() => setDialog('custom')}>
          {msg("Custom size…")}</MenuItem>
        <MenuItem onSelect={() => setDialog('sizes')}>{msg("All sizes…")}</MenuItem>
      </Menu>
      <LazyCreateDesignDialog open={dialog !== null} onClose={() => setDialog(null)} initialTab={dialog === 'custom' ? 'custom' : 'sizes'} />
    </>
  )
}
