import type { PageSize } from '../../engine/docOps'
import { foldedSheet, imposePages, type Binding, type FoldLayout } from '../../engine/export/imposition'
import { t } from '../../strings'
import styles from './print.module.css'

export interface FoldChoice {
  layout: 'normal' | FoldLayout
  signaturePages: number
  binding: Binding
  sides: 'both' | 'front' | 'back'
}

/** The sheet order is calculated from the selected pages, so the preview matches the export. */
export function FoldSection({ value, onChange, pages, valid, size }: {
  value: FoldChoice
  onChange: (next: FoldChoice) => void
  pages: number
  valid: boolean
  size: PageSize
}) {
  const sides = value.layout !== 'normal' && pages > 0 && valid
    ? imposePages(pages, value.layout, value.signaturePages, value.binding) : []
  const f = t.print.fold
  const pageName = (index: number | null) => index === null ? f.blank : f.page(index + 1)
  const sheet = foldedSheet(size.width, size.height)
  const millimeters = (px: number) => Math.round(px * 25.4 / 96)
  return (
    <fieldset className={styles.section} data-testid="fold-section">
      <legend>{f.section}</legend>
      <div className={styles.chips} role="radiogroup" aria-label={f.section}>
        {(['normal', 'booklet', 'book'] as const).map((layout) => (
          <label key={layout} className={`${styles.chip} ${value.layout === layout ? styles.chipOn : ''}`}>
            <input type="radio" name="fold-layout" checked={value.layout === layout} onChange={() => onChange({ ...value, layout })} />
            <strong>{f.layouts[layout]}</strong>
          </label>
        ))}
      </div>
      {value.layout !== 'normal' ? (
        <>
          <p className={styles.note}>{f.sheetNote(millimeters(sheet.width), millimeters(sheet.height))}</p>
          {!valid && pages > 0 ? <p role="alert" className={styles.note}>{f.invalid}</p> : null}
          <div className={styles.controls}>
            <label>{f.binding}{' '}
              <select value={value.binding} onChange={(event) => onChange({ ...value, binding: event.target.value as Binding })}>
                <option value="left">{f.bindings.left}</option><option value="right">{f.bindings.right}</option>
              </select>
            </label>
            {value.layout === 'book' ? (
              <label>{f.signaturePages}{' '}
                <select value={value.signaturePages} onChange={(event) => onChange({ ...value, signaturePages: Number(event.target.value) })}>
                  {[4, 8, 12, 16, 20, 24, 28, 32].map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
            ) : null}
            <label>{f.sheetSides}{' '}
              <select value={value.sides} onChange={(event) => onChange({ ...value, sides: event.target.value as FoldChoice['sides'] })}>
                <option value="both">{f.sideChoices.both}</option>
                <option value="front">{f.sideChoices.front}</option>
                <option value="back">{f.sideChoices.back}</option>
              </select>
            </label>
          </div>
          {value.sides !== 'both' ? <p className={styles.note}>{f.manualDuplex}</p> : null}
          {sides.length > 0 ? (
            <div className={styles.controls} data-testid="fold-preview">
              <p>{f.summary(pages, sides.length / 2, sides.length * 2 - pages)}{value.sides !== 'both' ? f.selectedSides(f.sides[value.sides]) : ''}</p>
              <ol>
                {sides.filter((side) => value.sides === 'both' || side.side === value.sides).map((side) => <li key={`${side.sheet}-${side.side}`}>
                  {f.sheetSide(side.sheet + 1, f.sides[side.side], pageName(side.left), pageName(side.right))}
                </li>)}
              </ol>
            </div>
          ) : null}
        </>
      ) : null}
    </fieldset>
  )
}
