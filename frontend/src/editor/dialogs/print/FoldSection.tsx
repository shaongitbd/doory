import type { PageSize } from '../../engine/docOps'
import { foldedSheet, imposePages, type Binding, type FoldLayout } from '../../engine/export/imposition'
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
  const pageName = (index: number | null) => index === null ? 'Blank' : `Page ${index + 1}`
  const sheet = foldedSheet(size.width, size.height)
  const millimeters = (px: number) => Math.round(px * 25.4 / 96)
  return (
    <fieldset className={styles.section} data-testid="fold-section">
      <legend>Page layout</legend>
      <div className={styles.chips} role="radiogroup" aria-label="Page layout">
        {(['normal', 'booklet', 'book'] as const).map((layout) => (
          <label key={layout} className={`${styles.chip} ${value.layout === layout ? styles.chipOn : ''}`}>
            <input type="radio" name="fold-layout" checked={value.layout === layout} onChange={() => onChange({ ...value, layout })} />
            <strong>{layout === 'normal' ? 'Normal pages' : layout === 'booklet' ? 'Booklet' : 'Book signatures'}</strong>
          </label>
        ))}
      </div>
      {value.layout !== 'normal' ? (
        <>
          <p className={styles.note}>Two portrait pages are placed at full size on each {millimeters(sheet.width)} × {millimeters(sheet.height)} mm sheet side. Print double-sided, flipping on the short edge.</p>
          {!valid && pages > 0 ? <p role="alert" className={styles.note}>Choose portrait pages of the same size for folded sheets.</p> : null}
          <div className={styles.controls}>
            <label>Binding edge{' '}
              <select value={value.binding} onChange={(event) => onChange({ ...value, binding: event.target.value as Binding })}>
                <option value="left">Left</option><option value="right">Right</option>
              </select>
            </label>
            {value.layout === 'book' ? (
              <label>Pages per signature{' '}
                <select value={value.signaturePages} onChange={(event) => onChange({ ...value, signaturePages: Number(event.target.value) })}>
                  {[4, 8, 12, 16, 20, 24, 28, 32].map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
            ) : null}
            <label>PDF sheet sides{' '}
              <select value={value.sides} onChange={(event) => onChange({ ...value, sides: event.target.value as FoldChoice['sides'] })}>
                <option value="both">Front and back</option>
                <option value="front">Front only</option>
                <option value="back">Back only</option>
              </select>
            </label>
          </div>
          {value.sides !== 'both' ? <p className={styles.note}>For manual duplex printing, export the other side separately. Check your printer's paper order before refeeding sheets.</p> : null}
          {sides.length > 0 ? (
            <div className={styles.controls} data-testid="fold-preview">
              <p>{pages} pages · {sides.length / 2} sheets · {sides.length * 2 - pages} blanks{value.sides !== 'both' ? ` · ${value.sides} sides selected` : ''}</p>
              <ol>
                {sides.filter((side) => value.sides === 'both' || side.side === value.sides).map((side) => <li key={`${side.sheet}-${side.side}`}>
                  Sheet {side.sheet + 1}, {side.side}: {pageName(side.left)} | {pageName(side.right)}
                </li>)}
              </ol>
            </div>
          ) : null}
        </>
      ) : null}
    </fieldset>
  )
}
