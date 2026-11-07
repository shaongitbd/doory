import { useState } from 'react'
import { Palette } from 'lucide-react'
import type { ArrowHead } from '@/types/document'
import { ColorTool } from '../../chrome/ColorTool'
import { useEditor, useSelection } from '../../context'
import { dashStyleOf } from '../../engine/api/style'
import { normalizeColor } from '../../engine/colors'
import { fillCssPreview, gradientCss, readFill, type FillSpec } from '../../engine/objects/fills'
import type { ElementColorMap } from '../../engine/objects/elements'
import { t } from '../../strings'
import { ColorButton } from '../../ui/ColorButton'
import { DEFAULT_COLORS, GRADIENT_PRESETS } from '../../ui/swatches'
import { EffectsPanel } from '../effects'
import { Accordion, LimitedNumber, OpacityTool } from '../controls'
import { CORNER_RADIUS, LINE_WIDTH, POLYGON_SIDES, STAR_INNER_RATIO, STAR_POINTS, STROKE_WIDTH, capLimit } from '../limits'
import { elementColors } from '../kinds'
import { PopoverTool, ToolButton } from '../parts'
import { FrameTool } from './image'
import { LinkPanel, PositionPanel, ArrangePanel } from './common'
import ed from '../../chrome/ed.module.css'
import styles from './sections.module.css'

const DASHES = [
  { id: 'solid', label: t.toolbar.solid },
  { id: 'dashed', label: t.toolbar.dashed },
  { id: 'dotted', label: t.toolbar.dotted },
] as const

function DashPicker({ value, onChange }: { value: string; onChange: (dash: 'solid' | 'dashed' | 'dotted') => void }) {
  return (
    <div className={styles.segment} role="group" aria-label={t.toolbar.dash}>
      {DASHES.map((d) => (
        <button key={d.id} type="button" className={styles.segmentBtn} aria-pressed={value === d.id} data-testid={`ed-dash-${d.id}`} onClick={() => onChange(d.id)}>
          {d.label}
        </button>
      ))}
    </div>
  )
}

function Placeholder({ on }: { on: boolean }) {
  const editor = useEditor()
  return (
    <ToolButton label={on ? t.ctx.placeholderOff : t.ctx.placeholderOnTip} pressed={on} testId="ed-placeholder" onClick={() => editor.style.setPlaceholder(!on)}>
      <span className={ed.textButton}>{on ? t.ctx.placeholderOn : t.ctx.placeholder}</span>
    </ToolButton>
  )
}

/** The "More options" popover of shapes (stroke width, corner radius, opacity) with the extra shape controls under it. */
function ShapeMore({ stroke }: { stroke: boolean }) {
  const editor = useEditor()
  const sel = useSelection()
  const o = sel.objects[0] ?? {}
  const kind = typeof o.shapeKind === 'string' ? o.shapeKind : ''
  const width = Math.round(Number(o.strokeWidth ?? 0))
  const radius = Math.round(Number(o.rx ?? 0))
  const maxRadius = Math.max(1, Math.round(Math.min(Number(o.width ?? 100), Number(o.height ?? 100)) / 2))
  const dash = dashStyleOf(Array.isArray(o.strokeDashArray) ? (o.strokeDashArray as number[]) : null)
  const opacity = Number(o.opacity ?? 1)
  return (
    <PopoverTool label={t.ctx.moreOptions} trigger={<span aria-hidden="true">⋯</span>} width={248} flush testId="ed-shape-more">
      <div className={ed.overflow}>
        <div className={ed.accordionBody} style={{ paddingTop: 8 }}>
          {stroke ? <LimitedNumber label={t.toolbar.strokeWidth} value={width} limit={STROKE_WIDTH} testId="ed-stroke-width" onChange={(w) => editor.style.setStroke({ width: w }, 'stroke-width')} /> : null}
          {kind === 'rect' ? <LimitedNumber label={t.toolbar.cornerRadius} value={radius} limit={capLimit(CORNER_RADIUS, maxRadius)} testId="ed-corner-radius" onChange={(v) => editor.style.setCornerRadius(v)} /> : null}
          <div>
            <div className={`${ed.propLabel} ${ed.propLabelRow}`}>
              <span>{t.toolbar.opacity}</span>
              <span>{Math.round(opacity * 100)}%</span>
            </div>
            <input type="range" className={ed.slider} min={0} max={1} step={0.05} value={opacity} aria-label={t.toolbar.opacity} data-testid="ed-shape-opacity" onChange={(e) => editor.style.setOpacity(Number(e.target.value))} />
          </div>
        </div>
        {stroke ? (
          <Accordion title={t.toolbar.dash} testId="more-dash">
            <DashPicker value={dash} onChange={(d) => editor.style.setStroke({ dash: d })} />
          </Accordion>
        ) : null}
        {kind === 'polygon' ? (
          <Accordion title={t.ctx.moreSectionShape} testId="more-sides">
            <LimitedNumber label={t.toolbar.sides} value={Number(o.sides ?? 6)} limit={POLYGON_SIDES} testId="ed-sides" onChange={(v) => editor.style.setPolygonSides(v)} />
          </Accordion>
        ) : null}
        {kind === 'star' ? (
          <Accordion title={t.ctx.moreSectionShape} testId="more-star">
            <LimitedNumber label={t.toolbar.points} value={Number(o.starPoints ?? 5)} limit={STAR_POINTS} testId="ed-star-points" onChange={(v) => editor.style.setStarShape({ points: v })} />
            <LimitedNumber label={`${t.toolbar.innerRadius} (%)`} value={Math.round(Number(o.innerRatio ?? 0.45) * 100)} limit={STAR_INNER_RATIO} testId="ed-star-inner" onChange={(v) => editor.style.setStarShape({ innerRatio: v / 100 })} />
          </Accordion>
        ) : null}
        <Accordion title={t.ctx.moreSectionEffects} testId="more-effects">
          <EffectsPanel text={false} />
        </Accordion>
        <Accordion title={t.ctx.moreSectionPosition} testId="more-position">
          <PositionPanel />
        </Accordion>
        <Accordion title={t.ctx.moreSectionArrange} testId="more-arrange">
          <ArrangePanel />
        </Accordion>
        <Accordion title={t.ctx.moreSectionLink} testId="more-link">
          <LinkPanel />
        </Accordion>
      </div>
    </PopoverTool>
  )
}

export function ShapeSection() {
  const editor = useEditor()
  const sel = useSelection()
  const o = sel.objects[0] ?? {}
  const fill = readFill(o.fill, 'transparent')
  const strokeColor = typeof o.stroke === 'string' && Number(o.strokeWidth ?? 0) > 0 ? o.stroke : 'transparent'
  return (
    <>
      <Placeholder on={false} />
      <ColorTool label={t.toolbar.fill} value={fill} allowNone allowGradient testId="ed-fill" onChange={(f, key) => editor.style.setFill(f, key)} />
      <ColorTool
        label={t.toolbar.stroke}
        value={{ type: 'solid', color: strokeColor }}
        allowNone
        ring
        testId="ed-stroke"
        onChange={(f) => {
          if (f.type !== 'solid') return
          editor.style.setStroke(f.color === 'transparent' ? { color: null } : { color: f.color }, 'stroke-color')
        }}
      />
      <ShapeMore stroke />
    </>
  )
}

const HEADS: { id: ArrowHead; label: string; glyph: string }[] = [
  { id: 'none', label: t.tools.headNone, glyph: '—' },
  { id: 'triangle', label: t.tools.headTriangle, glyph: '▶' },
  { id: 'open', label: t.tools.headOpen, glyph: '›' },
  { id: 'circle', label: t.tools.headCircle, glyph: '●' },
  { id: 'diamond', label: t.tools.headDiamond, glyph: '◆' },
]

/** Lines and arrows: stroke colour, with width, style and arrowheads under `⋯`. */
export function LineSection() {
  const editor = useEditor()
  const sel = useSelection()
  const o = sel.objects[0] ?? {}
  const color = typeof o.stroke === 'string' ? o.stroke : '#000000'
  const width = Math.round(Number(o.strokeWidth ?? 6))
  const dash = dashStyleOf(Array.isArray(o.strokeDashArray) ? (o.strokeDashArray as number[]) : null)
  const opacity = Number(o.opacity ?? 1)
  return (
    <>
      <ColorTool label={t.toolbar.stroke} value={{ type: 'solid', color: normalizeColor(color) }} ring testId="ed-stroke" onChange={(f) => (f.type === 'solid' ? editor.style.setLine({ color: f.color }) : undefined)} />
      <PopoverTool label={t.ctx.moreOptions} trigger={<span aria-hidden="true">⋯</span>} width={248} flush testId="ed-shape-more">
        <div className={ed.overflow}>
          <div className={ed.accordionBody} style={{ paddingTop: 8 }}>
            <LimitedNumber label={t.toolbar.lineWidth} value={width} limit={LINE_WIDTH} testId="ed-stroke-width" onChange={(w) => editor.style.setLine({ width: w })} />
            <div>
              <div className={`${ed.propLabel} ${ed.propLabelRow}`}>
                <span>{t.toolbar.opacity}</span>
                <span>{Math.round(opacity * 100)}%</span>
              </div>
              <input type="range" className={ed.slider} min={0} max={1} step={0.05} value={opacity} aria-label={t.toolbar.opacity} data-testid="ed-shape-opacity" onChange={(e) => editor.style.setOpacity(Number(e.target.value))} />
            </div>
          </div>
          <Accordion title={t.toolbar.dash} testId="more-dash">
            <DashPicker value={dash} onChange={(d) => editor.style.setLine({ dash: d })} />
          </Accordion>
          <Accordion title={t.tools.arrowheads} testId="more-arrows" defaultOpen>
            {(['arrowStart', 'arrowEnd'] as const).map((key) => (
              <div key={key}>
                <div className={ed.propLabel}>{key === 'arrowStart' ? t.toolbar.arrowStart : t.toolbar.arrowEnd}</div>
                <div className={styles.arrowOptions}>
                  {HEADS.map((h) => (
                    <button key={h.id} type="button" className={`${styles.arrowBtn} ${(o[key] ?? 'none') === h.id ? styles.arrowOn : ''}`} aria-label={t.tools.arrowheadOf(key === 'arrowStart' ? t.toolbar.arrowStart : t.toolbar.arrowEnd, h.label)} aria-pressed={(o[key] ?? 'none') === h.id} onClick={() => editor.style.setLine({ [key]: h.id })}>
                      {key === 'arrowStart' && h.id === 'triangle' ? '◀' : key === 'arrowStart' && h.id === 'open' ? '‹' : h.glyph}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Accordion>
          <Accordion title={t.ctx.moreSectionPosition} testId="more-position">
            <PositionPanel />
          </Accordion>
          <Accordion title={t.ctx.moreSectionArrange} testId="more-arrange">
            <ArrangePanel />
          </Accordion>
          <Accordion title={t.ctx.moreSectionLink} testId="more-link">
            <LinkPanel />
          </Accordion>
        </div>
      </PopoverTool>
    </>
  )
}

/** Stickers and catalog elements: one swatch per original colour. */
export function ElementSection() {
  const editor = useEditor()
  const sel = useSelection()
  const o = sel.objects[0] ?? {}
  const map = (o.colorMap ?? {}) as ElementColorMap
  const list = elementColors(o)
  const [selected, setSelected] = useState(list[0] ?? '')
  if (list.length === 0) return null
  const source = list.includes(selected) ? selected : list[0]
  const valueOf = (color: string): FillSpec => {
    const current = map[color]
    return typeof current === 'string' || !current ? { type: 'solid', color: current ?? color } : current
  }
  const current = valueOf(source)
  return (
    <PopoverTool label={t.toolbar.colorPalette} trigger={<span className={styles.paletteTrigger}><Palette size={18} aria-hidden="true" /><span className={ed.toolText}>{t.toolbar.colorPalette}</span></span>} width={280} testId="ed-recolor" flush>
      <div className={ed.colorPicker}>
        <p className={ed.cpTitle}>{t.toolbar.recolor}</p>
        <div className={ed.cpGrid} role="group" aria-label={t.toolbar.recolor}>
          {list.map((color) => (
            <button key={color} type="button" className={`${ed.cpSwatch} ${source === color ? ed.cpOn : ''}`} style={{ background: fillCssPreview(valueOf(color)) }} aria-label={t.tools.recolorOf(color)} aria-pressed={source === color} title={color} onClick={() => setSelected(color)} />
          ))}
        </div>
        <p className={ed.cpTitle}>{t.swatches.defaults}</p>
        <div className={ed.cpGrid} role="group" aria-label={t.swatches.defaults}>
          {DEFAULT_COLORS.map((color) => <button key={color} type="button" className={ed.cpSwatch} style={{ background: color }} aria-label={t.swatches.use(color)} title={color} onClick={() => editor.style.recolor(source, color)} />)}
        </div>
        <p className={ed.cpTitle}>{t.swatches.gradients}</p>
        <div className={ed.cpGrid} role="group" aria-label={t.swatches.gradients}>
          {GRADIENT_PRESETS.map((preset) => {
            const fill: Extract<FillSpec, { type: 'gradient' }> = { type: 'gradient', kind: 'linear', angle: preset.angle, stops: preset.stops }
            return <button key={preset.id} type="button" className={ed.cpSwatch} style={{ background: gradientCss(fill) }} aria-label={t.swatches.gradient(preset.label)} title={preset.label} onClick={() => editor.style.recolorFill(source, fill)} />
          })}
        </div>
        <div className={styles.paletteFooter}>
          <ColorButton label={t.swatches.custom} value={current} extraSwatches={{ label: t.tools.originalColors, colors: list }} onChange={(fill) => editor.style.recolorFill(source, fill)} />
          <span>{t.swatches.custom}</span>
          {Object.keys(map).length > 0 ? <button type="button" className={`${ed.btn} ${ed.ghost}`} onClick={() => editor.style.resetColors()}>{t.toolbar.reset}</button> : null}
        </div>
      </div>
    </PopoverTool>
  )
}

export function QrSection() {
  const editor = useEditor()
  const sel = useSelection()
  const qr = (sel.objects[0]?.qr ?? { text: '', fg: '#000000', bg: '#ffffff' }) as { text: string; fg: string; bg: string }
  const [text, setText] = useState(qr.text)
  const [seen, setSeen] = useState(qr.text)
  if (qr.text !== seen) {
    setSeen(qr.text)
    setText(qr.text)
  }
  const apply = (): void => {
    if (text.trim() && text !== qr.text) void editor.style.setQr({ text })
  }
  return (
    <>
      <PopoverTool label={t.toolbar.qrText} trigger={<span className={ed.textButton}>{t.toolbar.qrText}</span>} width={288} testId="ed-qr-text">
        <div className={ed.propLabel}>{t.toolbar.qrText}</div>
        <textarea
          className={styles.textInput}
          value={text}
          maxLength={1000}
          aria-label={t.toolbar.qrText}
          onChange={(e) => setText(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              apply()
            }
          }}
        />
      </PopoverTool>
      <ColorTool label={t.toolbar.qrForeground} value={{ type: 'solid', color: qr.fg }} testId="ed-qr-fg" onChange={(f) => (f.type === 'solid' ? void editor.style.setQr({ fg: f.color }) : undefined)} />
      <ColorTool label={t.toolbar.qrBackground} value={{ type: 'solid', color: qr.bg }} testId="ed-qr-bg" onChange={(f) => (f.type === 'solid' ? void editor.style.setQr({ bg: f.color }) : undefined)} />
    </>
  )
}

/** A photo placeholder: pick the photo, choose the frame shape. */
export function PlaceholderSection() {
  const editor = useEditor()
  const sel = useSelection()
  const o = sel.objects[0] ?? {}
  const circle = o.maskShape === 'circle'
  return (
    <>
      <Placeholder on />
      <ToolButton label={t.ctx.cropBox} pressed={!circle} testId="ed-placeholder-box" onClick={() => editor.style.setMask(undefined)}>
        <span className={ed.textButton}>▭ {t.ctx.box}</span>
      </ToolButton>
      <ToolButton label={t.ctx.cropCircle} pressed={circle} testId="ed-placeholder-circle" onClick={() => editor.style.setMask('circle')}>
        <span className={ed.textButton}>⬤ {t.ctx.circle}</span>
      </ToolButton>
      <FrameTool />
      <ToolButton label={t.panels.chooseImage} testId="ed-placeholder-fill" onClick={() => void editor.insert.fillPlaceholder(editor.state.activePageId, sel.ids[0])}>
        <span className={ed.textButton}>{t.panels.chooseImage}</span>
      </ToolButton>
      <OpacityTool />
    </>
  )
}
