import { Link2, Unlink2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { CUSTOM_UNITS, formatUnitValue, lockedCounterpart, MAX_DIMENSION, parseCustomSize, pxToUnit, unitToPx, type CustomUnit } from '@/features/presets'
import { PresetShape } from '@/lib/sizePresets/SizePicker'
import { Button, IconButton, Input, Select } from '@/ui'
import styles from './CustomSizeForm.module.css'

const parseNumber = (raw: string): number => Number.parseFloat(raw.replace(',', '.'))

export interface CustomSizeFormProps {
  onSubmit(size: { width: number; height: number; unit: CustomUnit }): void
  submitLabel?: string
}

/** Width × height in px / mm / cm / in with an aspect-ratio lock. Values are validated against 1–20 000 px. */
export function CustomSizeForm({ onSubmit, submitLabel = 'Create design' }: CustomSizeFormProps) {
  const [unit, setUnit] = useState<CustomUnit>('px')
  const [width, setWidth] = useState('1080')
  const [height, setHeight] = useState('1080')
  const [locked, setLocked] = useState(false)
  const [ratio, setRatio] = useState<number | null>(null)
  const [error, setError] = useState<{ field: 'width' | 'height'; message: string } | null>(null)

  function changeDimension(field: 'width' | 'height', raw: string) {
    setError(null)
    if (field === 'width') setWidth(raw)
    else setHeight(raw)
    if (!locked || ratio === null) return
    const changed = parseNumber(raw)
    if (!Number.isFinite(changed) || changed <= 0) return
    const counterpart = formatUnitValue(lockedCounterpart(changed, ratio, field), unit)
    if (field === 'width') setHeight(counterpart)
    else setWidth(counterpart)
  }

  function toggleLock() {
    const next = !locked
    setLocked(next)
    const w = parseNumber(width)
    const h = parseNumber(height)
    // The ratio is captured once, when the lock is switched on, so typing digit by digit cannot drift it.
    setRatio(next && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w / h : null)
  }

  function changeUnit(next: CustomUnit) {
    const w = parseNumber(width)
    const h = parseNumber(height)
    if (Number.isFinite(w) && Number.isFinite(h)) {
      setWidth(formatUnitValue(pxToUnit(unitToPx(w, unit), next), next))
      setHeight(formatUnitValue(pxToUnit(unitToPx(h, unit), next), next))
    }
    setUnit(next)
    setError(null)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = parseCustomSize({ width, height, unit })
    if (!result.ok) {
      setError({ field: result.field, message: result.error })
      return
    }
    onSubmit({ width: Math.round(pxToUnit(result.width, unit) * 100) / 100, height: Math.round(pxToUnit(result.height, unit) * 100) / 100, unit })
  }

  const maxPx = `${MAX_DIMENSION.toLocaleString('en-US')} px`
  const maxHint = unit === 'px' ? `Up to ${maxPx} per side.` : `Up to ${maxPx} (${formatUnitValue(pxToUnit(MAX_DIMENSION, unit), unit)} ${unit}) per side.`
  // The page as it is typed, drawn to scale; nothing while a side is empty or out of range.
  const preview = parseCustomSize({ width, height, unit })

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-label="Custom size">
      <div className={styles.fields}>
        <div className={styles.row}>
          <Input label="Width" inputMode="decimal" value={width} onChange={(event) => changeDimension('width', event.target.value)} error={error?.field === 'width' ? error.message : undefined} />
          <IconButton
            className={styles.lock}
            label={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            pressed={locked}
            icon={locked ? <Link2 size={18} /> : <Unlink2 size={18} />}
            onClick={toggleLock}
          />
          <Input label="Height" inputMode="decimal" value={height} onChange={(event) => changeDimension('height', event.target.value)} error={error?.field === 'height' ? error.message : undefined} />
          <Select label="Unit" value={unit} onChange={(event) => changeUnit(event.target.value as CustomUnit)} options={CUSTOM_UNITS.map((value) => ({ value, label: value }))} />
        </div>
        <p className={styles.hint}>{maxHint}</p>
        <Button type="submit">{submitLabel}</Button>
      </div>
      <figure className={styles.preview} aria-label="Preview">
        {preview.ok ? <PresetShape preset={preview} size={140} /> : null}
        <figcaption>{preview.ok ? `${width} × ${height} ${unit}` : 'Enter a width and a height'}</figcaption>
      </figure>
    </form>
  )
}
