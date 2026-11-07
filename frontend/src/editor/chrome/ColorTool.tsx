import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useDocument } from '../context'
import { normalizeColor } from '../engine/colors'
import { documentColors } from '../engine/docOps'
import { useCanvasIllustrationColors } from '../hooks/useCanvasIllustrationColors'
import { type FillSpec, fillCssPreview, gradientCss } from '../engine/objects/fills'
import { t } from '../strings'
import { ColorPicker } from '../ui/ColorPicker'
import { FillEditor } from '../ui/FillEditor'
import { Popover } from '../ui/Popover'
import { DEFAULT_COLORS, GRADIENT_PRESETS, palettes } from '../ui/swatches'
import { Tooltip } from '../ui/Tooltip'
import ed from './ed.module.css'
import { I } from './icons'

const DESIGN_COLORS_SHOWN = 5

interface ColorToolProps {
  label: string
  value: FillSpec
  onChange: (fill: FillSpec, key?: string) => void
  /** Offers a "No fill" tile (fills of shapes, borders). */
  allowNone?: boolean
  /** Offers gradients (fills of shapes and text); borders are solid only. */
  allowGradient?: boolean
  /** Draw the swatch as a ring in the colour (a border swatch). */
  ring?: boolean
  testId: string
}

const isNone = (c: string): boolean => c === 'transparent' || c === ''

/** The round colour swatch of the toolbar and its popover: design colours, defaults, gradients, custom. */
export function ColorTool({ label, value, onChange, allowNone, allowGradient, ring, testId }: ColorToolProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [keyboard, setKeyboard] = useState(false)
  const none = value.type === 'solid' && isNone(value.color)
  const css = value.type === 'solid' ? (none ? undefined : value.color) : fillCssPreview(value)
  return (
    <>
      <Tooltip label={label} disabled={open}>
        <button
          ref={ref}
          type="button"
          className={`${ed.swatch} ${none ? ed.swatchNone : ''}`}
          style={ring ? { background: 'transparent', border: `3px solid ${css ?? 'var(--ed-border)'}` } : css ? { background: css } : undefined}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid={testId}
          onClick={(e) => {
            setKeyboard(e.detail === 0)
            setOpen((o) => !o)
          }}
        />
      </Tooltip>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} label={label} placement="bottom" variant="plain" cover focusOnOpen={keyboard}>
        <SwatchGrid value={value} onChange={onChange} allowNone={allowNone} allowGradient={allowGradient} testId={testId} />
      </Popover>
    </>
  )
}

function SwatchGrid({ value, onChange, allowNone, allowGradient, testId }: Pick<ColorToolProps, 'value' | 'onChange' | 'allowNone' | 'allowGradient' | 'testId'>) {
  const doc = useDocument()
  const canvasColors = useCanvasIllustrationColors()
  const [showAll, setShowAll] = useState(false)
  const [view, setView] = useState<'swatches' | 'custom'>('swatches')
  const design = useMemo(() => documentColors(doc, 30), [doc])
  const brand = useSyncExternalStore(palettes.subscribe, palettes.getSnapshot).find((p) => p.id === 'brand')
  const active = value.type === 'solid' ? normalizeColor(value.color).toLowerCase() : null
  const shown = showAll ? design : design.slice(0, DESIGN_COLORS_SHOWN)

  const solid = (color: string, key?: string): void => onChange({ type: 'solid', color }, key)
  const swatch = (color: string, id: string): React.ReactNode => (
    <button key={id} type="button" className={`${ed.cpSwatch} ${active === color.toLowerCase() ? ed.cpOn : ''}`} style={{ background: color, border: color.toLowerCase() === '#ffffff' ? '1px solid var(--ed-border)' : undefined }} title={color} aria-label={t.swatches.use(color)} data-testid={`${testId}-swatch`} onClick={() => solid(color)} />
  )

  if (view === 'custom') {
    return (
      <div className={ed.colorPicker} style={{ width: 280 }}>
        <button type="button" className={ed.cpBack} onClick={() => setView('swatches')}>
          <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>{I.chevronDown}</span>
          {t.swatches.back}
        </button>
        {allowGradient ? <FillEditor value={value} onChange={(f) => onChange(f, 'fill-custom')} /> : <ColorPicker value={value.type === 'solid' ? value.color : '#000000'} onChange={(c) => solid(c, 'fill-custom')} />}
      </div>
    )
  }

  return (
    <div className={ed.colorPicker} data-testid={`${testId}-popover`}>
      {brand ? (
        <>
          <p className={ed.cpTitle}>{brand.label}</p>
          <div className={ed.cpGrid} data-testid={`${testId}-brand`}>
            {brand.colors.map((c, i) => swatch(c, `b-${i}-${c}`))}
          </div>
        </>
      ) : null}
      {canvasColors.length > 0 ? (
        <>
          <p className={ed.cpTitle}>{t.toolbar.canvasColors}</p>
          <div className={ed.cpGrid}>
            {canvasColors.map((c) => swatch(c, `i-${c}`))}
          </div>
        </>
      ) : null}
      {design.length > 0 ? (
        <>
          <p className={ed.cpTitle}>{t.swatches.design}</p>
          <div className={ed.cpGrid}>
            {shown.map((c) => swatch(c, `d-${c}`))}
            {design.length > DESIGN_COLORS_SHOWN ? (
              <button type="button" className={`${ed.cpSwatch} ${ed.cpMore}`} title={showAll ? t.swatches.showLess : t.swatches.showAll} aria-label={showAll ? t.swatches.showLess : t.swatches.showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? '−' : '…'}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      <p className={ed.cpTitle}>{t.swatches.defaults}</p>
      <div className={ed.cpGrid}>
        {allowNone ? <button type="button" className={`${ed.cpSwatch} ${ed.cpNoFill} ${value.type === 'solid' && isNone(value.color) ? ed.cpOn : ''}`} title={t.swatches.noFill} aria-label={t.swatches.noFill} data-testid={`${testId}-none`} onClick={() => solid('transparent')} /> : null}
        {DEFAULT_COLORS.map((c) => swatch(c, `f-${c}`))}
        <button type="button" className={`${ed.cpSwatch} ${ed.cpRainbow}`} title={t.swatches.custom} aria-label={t.swatches.custom} data-testid={`${testId}-custom`} onClick={() => setView('custom')} />
      </div>

      {allowGradient ? (
        <>
          <p className={ed.cpTitle}>{t.swatches.gradients}</p>
          <div className={ed.cpGrid}>
            {GRADIENT_PRESETS.map((g) => {
              const spec: FillSpec = { type: 'gradient', kind: 'linear', angle: g.angle, stops: g.stops }
              return <button key={g.id} type="button" className={ed.cpSwatch} style={{ backgroundImage: gradientCss(spec) }} title={g.label} aria-label={t.swatches.gradient(g.label)} data-testid={`${testId}-gradient`} onClick={() => onChange(spec)} />
            })}
            <button type="button" className={`${ed.cpSwatch} ${ed.cpMore}`} title={t.swatches.customGradient} aria-label={t.swatches.customGradient} onClick={() => setView('custom')}>
              +
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
