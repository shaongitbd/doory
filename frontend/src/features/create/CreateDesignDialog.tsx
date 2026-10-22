import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createUrl } from '@/features/presets'
import { type SizePreset } from '@/lib/sizePresets'
import { noteUsedSize } from '@/lib/sizePresets/choices'
import { presetSizeText } from '@/lib/sizePresets/picker'
import { PresetShape, SizePicker } from '@/lib/sizePresets/SizePicker'
import { Button, Dialog } from '@/ui'
import { CustomSizeForm } from './CustomSizeForm'
import styles from './CreateDesignDialog.module.css'

export interface CreateDesignDialogProps {
  open: boolean
  onClose(): void
  /** Open on the custom size instead of the popular sizes. */
  initialTab?: 'sizes' | 'custom'
}

/** Pick a size from the catalogue (by format or platform, filtered or searched) or enter a custom size. */
export function CreateDesignDialog({ open, onClose, initialTab = 'sizes' }: CreateDesignDialogProps) {
  const navigate = useNavigate()
  const [chosen, setChosen] = useState<SizePreset | null>(null)
  // The custom size form has its own Create button.
  const [custom, setCustom] = useState(initialTab === 'custom')

  function go(url: string) {
    onClose()
    navigate(url)
  }
  const create = (preset: SizePreset): void => {
    noteUsedSize(preset.id)
    go(createUrl({ presetId: preset.id }))
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create a design"
      description="Choose a size to start with. You can change it any time."
      size="xl"
      footer={
        <>
          <div className={styles.chosen} aria-live="polite">
            {chosen ? (
              <>
                <PresetShape preset={chosen} size={28} />
                <span>
                  <strong>{chosen.label}</strong>
                  <small>
                    {chosen.path.at(-1)?.label} · {presetSizeText(chosen)}
                  </small>
                </span>
              </>
            ) : custom ? null : (
              <small>Pick a size, then create. A double click creates it at once.</small>
            )}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {custom ? null : (
            <Button disabled={!chosen} onClick={() => chosen && create(chosen)}>
              Create design
            </Button>
          )}
        </>
      }
    >
      <SizePicker selectedId={chosen?.id} onSelect={setChosen} onConfirm={create} startWithCustom={initialTab === 'custom'} onCustomChange={setCustom} custom={<CustomSizeForm onSubmit={(size) => go(createUrl(size))} />} />
    </Dialog>
  )
}
