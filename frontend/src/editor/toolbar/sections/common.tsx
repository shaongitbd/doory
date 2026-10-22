import { Check, Group, LayoutGrid, Maximize, Ungroup } from 'lucide-react'
import { useState } from 'react'
import { I } from '../../chrome/icons'
import { useEditor, useEditorState, useSelection } from '../../context'
import { canFitKind } from '../../engine/api/arrange'
import { FIELD_KEY, FIELD_LABEL_MAX, fieldTypeFor, keyClashes, readField } from '../../engine/fields'
import { MIN_FIT_FONT_SIZE, defaultMinFontSize, readTextFit } from '../../engine/objects/textStyle'
import { pxToUnit, unitDecimals, unitToPx } from '../../engine/units'
import { t } from '../../strings'
import type { FieldType } from '@/types/document'
import { NumberField } from '../../ui/NumberField'
import { Switch } from '../../ui/Switch'
import { EffectsPanel } from '../effects'
import { Accordion, CenterTools, DeleteTool, DuplicateTool, FlipTools, LimitedNumber, LockTool, OverflowTool, RotateTool, ZOrderTools } from '../controls'
import { onlyKind } from '../kinds'
import { Field, PopoverStack, PopoverTool, ToolButton } from '../parts'
import ed from '../../chrome/ed.module.css'
import styles from './sections.module.css'

export function FlipRotateSection() {
  return (
    <>
      <FlipTools />
      <RotateTool />
    </>
  )
}

export function ZOrderSection() {
  return <ZOrderTools />
}

export function AlignSection() {
  return <CenterTools />
}

/** Lock, duplicate, delete (and rotate for text, which has no flip group) and the `⋯` of the row. */
export function ActionsSection() {
  const sel = useSelection()
  const text = onlyKind(sel.kinds, 'text')
  const ownMore = sel.kinds.length === 1 && (sel.kinds[0] === 'shape' || sel.kinds[0] === 'line')
  return (
    <>
      {text ? <RotateTool /> : null}
      <LockTool />
      <DuplicateTool />
      <DeleteTool />
      {ownMore ? null : (
        <OverflowTool>
          <OverflowSections />
        </OverflowTool>
      )}
    </>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className={styles.toggleRow}>
      <span>{label}</span>
      <Switch label={label} checked={checked} onChange={onChange} />
    </div>
  )
}

/** The sections of the `⋯` popover that apply to the current selection. */
export function OverflowSections() {
  const editor = useEditor()
  const sel = useSelection()
  const o = sel.objects[0] ?? {}
  const text = onlyKind(sel.kinds, 'text')
  const image = onlyKind(sel.kinds, 'image')
  const placeholderCapable = sel.kinds.every((k) => k === 'shape' || k === 'image')
  const list = typeof o.listStyle === 'string' ? o.listStyle : 'none'
  const fit = readTextFit(o.fit)
  const fontSize = Math.max(MIN_FIT_FONT_SIZE, Math.round(Number(o.fontSize ?? sel.textStyle?.fontSize ?? 24)))
  const minFontSize = fit?.minFontSize ?? defaultMinFontSize(fontSize)
  const isPlaceholder = o.isPlaceholder === true
  const fieldType = sel.ids.length === 1 ? fieldTypeFor(sel.kinds[0]) : null
  return (
    <>
      {text ? (
        <Accordion title={t.ctx.moreSectionText} defaultOpen testId="more-text">
          <ToggleRow label={t.toolbar.strike} checked={!!o.linethrough} onChange={(on) => editor.style.text({ linethrough: on }, t.history.strikethrough)} />
          <ToggleRow label={t.toolbar.bullets} checked={list === 'bullet'} onChange={(on) => editor.style.text({ listStyle: on ? 'bullet' : 'none' }, t.history.changeList)} />
          <ToggleRow label={t.toolbar.numbers} checked={list === 'number'} onChange={(on) => editor.style.text({ listStyle: on ? 'number' : 'none' }, t.history.changeList)} />
          <ToggleRow label={t.toolbar.shrinkToFit} checked={!!fit} onChange={(on) => editor.style.setTextFit(on ? { mode: 'shrink' } : null)} />
          {fit ? (
            <LimitedNumber
              label={t.toolbar.minFontSize}
              value={minFontSize}
              limit={{ min: MIN_FIT_FONT_SIZE, max: fontSize, step: 1, decimals: 0 }}
              onChange={(v) => editor.style.setTextFit({ mode: 'shrink', minFontSize: Math.round(v) }, 'fit-min')}
              testId="ed-fit-min-size"
            />
          ) : null}
        </Accordion>
      ) : null}
      {text || image || sel.kinds.every((k) => k === 'element' || k === 'shape' || k === 'group') ? (
        <Accordion title={t.ctx.moreSectionEffects} testId="more-effects">
          <EffectsPanel text={text} />
        </Accordion>
      ) : null}
      <Accordion title={t.ctx.moreSectionPosition} testId="more-position">
        <PositionPanel />
      </Accordion>
      <Accordion title={t.ctx.moreSectionArrange} testId="more-arrange">
        <ArrangePanel />
      </Accordion>
      <Accordion title={t.ctx.moreSectionLink} testId="more-link">
        <LinkPanel />
      </Accordion>
      {fieldType ? (
        <Accordion title={t.ctx.moreSectionField} testId="more-field">
          <FieldPanel type={fieldType} />
        </Accordion>
      ) : null}
      {placeholderCapable ? (
        <Accordion title={t.ctx.placeholder} testId="more-placeholder">
          <ToggleRow label={isPlaceholder ? t.ctx.placeholderOff : t.ctx.placeholderOnTip} checked={isPlaceholder} onChange={(on) => editor.style.setPlaceholder(on)} />
        </Accordion>
      ) : null}
    </>
  )
}

export function AlignPanel({ selectionTarget }: { selectionTarget: boolean }) {
  const editor = useEditor()
  const sel = useSelection()
  const [target, setTarget] = useState<'page' | 'selection'>(selectionTarget ? 'selection' : 'page')
  const many = sel.ids.length > 1
  const at = many ? target : 'page'
  return (
    <PopoverStack width={224}>
      {many ? (
        <Field label={t.toolbar.alignTitle}>
          <div className={styles.segment}>
            <button type="button" className={styles.segmentBtn} aria-pressed={target === 'selection'} onClick={() => setTarget('selection')}>
              {t.toolbar.alignToSelection}
            </button>
            <button type="button" className={styles.segmentBtn} aria-pressed={target === 'page'} onClick={() => setTarget('page')}>
              {t.toolbar.alignToPage}
            </button>
          </div>
        </Field>
      ) : null}
      <div className={styles.grid3}>
        <ToolButton label={t.toolbar.alignLeftEdge} onClick={() => editor.arrange.align('left', at)}>
          {I.alignLeft}
        </ToolButton>
        <ToolButton label={t.toolbar.alignCenterH} onClick={() => editor.arrange.align('center', at)}>
          {I.alignCenter}
        </ToolButton>
        <ToolButton label={t.toolbar.alignRightEdge} onClick={() => editor.arrange.align('right', at)}>
          {I.alignRight}
        </ToolButton>
        <ToolButton label={t.toolbar.alignTop} onClick={() => editor.arrange.align('top', at)}>
          <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>{I.alignLeft}</span>
        </ToolButton>
        <ToolButton label={t.toolbar.alignMiddle} onClick={() => editor.arrange.align('middle', at)}>
          <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>{I.alignCenter}</span>
        </ToolButton>
        <ToolButton label={t.toolbar.alignBottom} onClick={() => editor.arrange.align('bottom', at)}>
          <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>{I.alignRight}</span>
        </ToolButton>
      </div>
      {many || !sel.kinds.every(canFitKind) ? null : (
        <div className={styles.wideTool}>
          <ToolButton label={t.toolbar.fitToPage} disabled={!editor.arrange.canFitToPage()} testId="ed-fit-to-page" onClick={() => editor.arrange.fitToPage()}>
            <Maximize size={18} aria-hidden="true" />
            <span className={ed.toolText}>{t.toolbar.fitToPage}</span>
          </ToolButton>
        </div>
      )}
    </PopoverStack>
  )
}

export function PositionPanel() {
  const editor = useEditor()
  const sel = useSelection()
  const unit = useEditorState((s) => s.doc.unit)
  const [lock, setLock] = useState(true)
  const b = sel.bounds
  const dec = unitDecimals(unit)
  const show = (px: number): number => Number(pxToUnit(px, unit).toFixed(dec))
  const px = (v: number): number => unitToPx(v, unit)
  if (!b) return null
  return (
    <PopoverStack width={248}>
      <div className={styles.posGrid}>
        <NumberField label={t.toolbar.x} showLabel value={show(b.x)} decimals={dec} step={unit === 'px' ? 1 : 0.1} onChange={(v) => editor.arrange.setPosition(px(v), undefined)} suffix={unit} />
        <NumberField label={t.toolbar.y} showLabel value={show(b.y)} decimals={dec} step={unit === 'px' ? 1 : 0.1} onChange={(v) => editor.arrange.setPosition(undefined, px(v))} suffix={unit} />
        <NumberField label={t.tools.widthShort} showLabel value={show(b.width)} decimals={dec} min={0.01} step={unit === 'px' ? 1 : 0.1} onChange={(v) => editor.arrange.setSize(px(v), undefined, lock)} suffix={unit} />
        <NumberField label={t.tools.heightShort} showLabel value={show(b.height)} decimals={dec} min={0.01} step={unit === 'px' ? 1 : 0.1} onChange={(v) => editor.arrange.setSize(undefined, px(v), lock)} suffix={unit} />
        <NumberField label={t.toolbar.angle} showLabel value={Math.round(b.angle)} min={0} max={360} step={1} suffix="°" disabled={sel.locked} onChange={(v) => editor.arrange.setAngle(v)} />
      </div>
      <Switch label={t.toolbar.lockAspect} checked={lock} onChange={setLock} />
    </PopoverStack>
  )
}

export function ArrangePanel() {
  const editor = useEditor()
  return (
    <PopoverStack width={248}>
      <div className={styles.grid3}>
        <ToolButton label={t.toolbar.toFront} shortcut="Mod+Alt+]" onClick={() => editor.arrange.zOrder('front')}>
          {I.layerUp}
        </ToolButton>
        <ToolButton label={t.toolbar.forward} shortcut="Mod+]" onClick={() => editor.arrange.zOrder('forward')}>
          {I.layerUp}
        </ToolButton>
        <ToolButton label={t.toolbar.backward} shortcut="Mod+[" onClick={() => editor.arrange.zOrder('backward')}>
          {I.layerDown}
        </ToolButton>
        <ToolButton label={t.toolbar.toBack} shortcut="Mod+Alt+[" onClick={() => editor.arrange.zOrder('back')}>
          {I.layerDown}
        </ToolButton>
        <ToolButton label={t.toolbar.flipH} onClick={() => editor.arrange.flip('horizontal')}>
          {I.flipH}
        </ToolButton>
        <ToolButton label={t.toolbar.flipV} onClick={() => editor.arrange.flip('vertical')}>
          {I.flipV}
        </ToolButton>
      </div>
      <Field label={t.ctx.alignPage}>
        <AlignPanel selectionTarget={false} />
      </Field>
    </PopoverStack>
  )
}

export function LinkPanel() {
  const editor = useEditor()
  const sel = useSelection()
  const url = (sel.objects[0]?.link as { url?: string } | undefined)?.url ?? ''
  const [value, setValue] = useState(url)
  const valid = /^https?:\/\/\S+$/i.test(value)
  return (
    <PopoverStack width={248}>
      <input
        className={ed.propInput}
        value={value}
        placeholder={t.tools.linkPlaceholder}
        aria-label={t.toolbar.link}
        inputMode="url"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && valid) editor.style.setLink(value)
        }}
      />
      <div className={styles.actionsRow}>
        {url ? (
          <button
            type="button"
            className={`${ed.btn} ${ed.ghost}`}
            onClick={() => {
              editor.style.setLink(null)
              setValue('')
            }}
          >
            {t.tools.linkRemove}
          </button>
        ) : null}
        <button type="button" className={`${ed.btn} ${ed.primary}`} disabled={!valid} onClick={() => editor.style.setLink(value)}>
          <Check size={14} aria-hidden="true" />
          {t.tools.linkApply}
        </button>
      </div>
    </PopoverStack>
  )
}

/** Tags the selected object as a template field: a key data can be filled in by, and an optional label. */
export function FieldPanel({ type }: { type: FieldType }) {
  const editor = useEditor()
  const sel = useSelection()
  const doc = useEditorState((s) => s.doc)
  const current = readField(sel.objects[0]?.field)
  const [key, setKey] = useState(current?.key ?? '')
  const [label, setLabel] = useState(current?.label ?? '')
  const page = doc.pages.findIndex((p) => p.id === sel.pageId) + 1
  const valid = FIELD_KEY.test(key)
  const clash = valid && keyClashes(doc, key, type, sel.ids[0] ?? '', page)
  const apply = (): void => {
    if (valid && !clash) editor.style.setField({ key, type, ...(label.trim() ? { label: label.trim() } : {}) })
  }
  return (
    <PopoverStack width={248}>
      <span className={styles.count}>{t.ctx.fieldType(type)}</span>
      <input
        className={ed.propInput}
        value={key}
        placeholder={t.ctx.fieldKeyPlaceholder}
        aria-label={t.ctx.fieldKey}
        aria-invalid={key !== '' && (!valid || clash)}
        title={t.ctx.fieldKeyHint}
        maxLength={40}
        spellCheck={false}
        onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply()
        }}
      />
      <input
        className={ed.propInput}
        value={label}
        placeholder={t.ctx.fieldLabelPlaceholder}
        aria-label={t.ctx.fieldLabel}
        maxLength={FIELD_LABEL_MAX}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply()
        }}
      />
      {clash ? (
        <span role="alert" className={styles.fieldError}>
          {t.ctx.fieldDuplicate}
        </span>
      ) : null}
      <div className={styles.actionsRow}>
        {current ? (
          <button
            type="button"
            className={`${ed.btn} ${ed.ghost}`}
            onClick={() => {
              editor.style.setField(null)
              setKey('')
              setLabel('')
            }}
          >
            {t.ctx.fieldRemove}
          </button>
        ) : null}
        <button type="button" className={`${ed.btn} ${ed.primary}`} disabled={!valid || clash} onClick={apply}>
          <Check size={14} aria-hidden="true" />
          {t.ctx.fieldApply}
        </button>
      </div>
    </PopoverStack>
  )
}

/** Several objects selected: count, group, align, tidy up. */
export function MultiSection() {
  const editor = useEditor()
  const sel = useSelection()
  return (
    <>
      <span className={styles.count} data-testid="ed-multi-count">
        {t.ctx.selected(sel.ids.length)}
      </span>
      <ToolButton label={t.toolbar.group} shortcut="Mod+G" testId="ed-group" onClick={() => editor.arrange.group()}>
        <Group size={18} aria-hidden="true" />
      </ToolButton>
      <PopoverTool label={t.toolbar.alignTitle} trigger={I.alignLeft} testId="ed-multi-align">
        <AlignPanel selectionTarget />
      </PopoverTool>
      <ToolButton label={t.toolbar.distributeH} disabled={sel.ids.length < 3} testId="ed-distribute-h" onClick={() => editor.arrange.distribute('horizontal')}>
        <span style={{ display: 'inline-flex', transform: 'scaleX(1)' }}>{I.alignJustify}</span>
      </ToolButton>
      <ToolButton label={t.toolbar.distributeV} disabled={sel.ids.length < 3} testId="ed-distribute-v" onClick={() => editor.arrange.distribute('vertical')}>
        <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>{I.alignJustify}</span>
      </ToolButton>
      <ToolButton label={t.toolbar.tidy} disabled={sel.ids.length < 2} testId="ed-tidy" onClick={() => editor.arrange.tidy()}>
        <LayoutGrid size={18} aria-hidden="true" />
      </ToolButton>
    </>
  )
}

export function GroupSection() {
  const editor = useEditor()
  return (
    <ToolButton label={t.toolbar.ungroup} shortcut="Mod+Shift+G" testId="ed-ungroup" onClick={() => editor.arrange.ungroup()}>
      <Ungroup size={18} aria-hidden="true" />
    </ToolButton>
  )
}

