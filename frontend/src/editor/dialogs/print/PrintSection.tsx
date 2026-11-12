import type { DocUnit } from '@/types/document'
import type { PageSize } from '../../engine/docOps'
import { MAX_BLEED_MM, printGeometry } from '../../engine/export/printGeometry'
import { sameSize } from '../../engine/pageSizes'
import { formatUnit } from '../../engine/units'
import { t } from '../../strings'
import { NumberField } from '../../ui/NumberField'
import { Switch } from '../../ui/Switch'
import { PrintPreview } from './PrintPreview'
import { type PrintPresetId, type PrintSettings, applyPreset, bleedInUnit, customize } from './printOptions'
import styles from './print.module.css'

interface PrintSectionProps {
  settings: PrintSettings
  onChange: (next: PrintSettings) => void
  /** Sizes of the pages that will be exported (empty while the page range is invalid). */
  sizes: readonly PageSize[]
  unit: DocUnit
  /** Made by the print server (vector) or by the browser (300 dpi pictures); said honestly under the options. */
  server: boolean
  folded?: boolean
}

const PRESETS: readonly PrintPresetId[] = ['screen', 'standard', 'custom']

/** Bleed, crop marks and a schematic of the result: the "Print" part of the Download dialog for PDF files. */
export function PrintSection({ settings, onChange, sizes, unit, server, folded = false }: PrintSectionProps) {
  const inUnit = bleedInUnit(settings.bleedMm, unit)
  const bleedOn = settings.bleedMm > 0
  const bleedLabel = `${settings.bleedMm} mm`
  const grows = bleedOn || settings.cropMarks
  const sheet = sizes.length > 0 ? printGeometry(sizes[0], settings.bleedMm, settings.cropMarks) : null
  const extras = bleedOn && settings.cropMarks ? t.print.extras.both : bleedOn ? t.print.extras.bleed : t.print.extras.marks
  const sheetText = !grows || !sheet ? null : sizes.every((size) => sameSize(size, sizes[0])) ? t.print.sheet(formatUnit(sheet.sheetWidth, unit), formatUnit(sheet.sheetHeight, unit), unit, extras) : t.print.sheetMixed(extras)
  return (
    <fieldset className={styles.section} data-testid="print-section">
      <legend>{t.print.section}</legend>
      {folded ? <p className={styles.note}>Bleed and crop marks need a larger sheet and are unavailable for folded pages at this size.</p> : <>
      <div className={styles.chips} role="radiogroup" aria-label={t.print.preset}>
        {PRESETS.map((id) => (
          <label key={id} className={`${styles.chip} ${settings.preset === id ? styles.chipOn : ''}`}>
            <input type="radio" name="print-preset" checked={settings.preset === id} onChange={() => onChange(applyPreset(id, settings))} />
            <strong>{t.print.presets[id]}</strong>
            <small>{t.print.presetHints[id]}</small>
          </label>
        ))}
      </div>
      <p className={styles.presetHint}>{t.print.presetHints[settings.preset]}</p>

      <div className={styles.grid}>
        <div className={styles.controls}>
          <div className={styles.bleedRow}>
            <NumberField
              label={t.print.bleed}
              scrub={false}
              value={settings.bleedMm}
              min={0}
              max={MAX_BLEED_MM}
              step={0.5}
              decimals={1}
              suffix="mm"
              hint={t.print.bleedRange}
              width={150}
              onChange={(value) => onChange(customize(settings, { bleedMm: value }))}
            />
            {inUnit && bleedOn ? <small className={styles.hint}>{t.print.bleedIn(inUnit.value, inUnit.unit)}</small> : null}
          </div>
          <small className={styles.hint}>{t.print.bleedHelp}</small>
          <Switch label={t.print.cropMarks} hint={t.print.cropMarksHint} checked={settings.cropMarks} onChange={(checked) => onChange(customize(settings, { cropMarks: checked }))} />
          {sheetText ? (
            <small className={styles.hint} data-testid="print-sheet">
              {sheetText}
            </small>
          ) : null}
        </div>

        <PrintPreview size={sizes[0] ?? { width: 4, height: 3 }} bleed={bleedOn} marks={settings.cropMarks} bleedLabel={bleedLabel} />
      </div>
      </>}

      <p className={styles.note}>{server ? t.print.engineServer : t.print.engineClient}</p>
      <p className={styles.note} data-testid="print-colour-note">
        {t.print.colour}
      </p>
    </fieldset>
  )
}
