import { PilcrowLeft, PilcrowRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FontFamily } from '@/types/api'
import { fontsApi } from '@/lib/api/fonts'
import { ColorTool } from '../../chrome/ColorTool'
import { I } from '../../chrome/icons'
import { isBold, textValue } from '../../builtins/textState'
import { useEditor, useSelection } from '../../context'
import { isSystemFont, pickVariant, weightToNumber } from '../../engine/fonts'
import { readFill } from '../../engine/objects/fills'
import { CURVE_MAX } from '../../engine/text/curve'
import { primaryFamily } from '../../engine/text/fontStack'
import { t } from '../../strings'
import { Popover } from '../../ui/Popover'
import { Tooltip } from '../../ui/Tooltip'
import { LimitedNumber, OpacityTool, Stepper } from '../controls'
import { FontPicker } from '../FontPicker'
import { createFontPreview } from '../fontPreview'
import { FONT_SIZE, LETTER_SPACING, LINE_HEIGHT } from '../limits'
import { PopoverTool, ToolButton } from '../parts'
import ed from '../../chrome/ed.module.css'

const ALIGN = [
  { id: 'left', label: t.toolbar.alignLeft, icon: I.alignLeft },
  { id: 'center', label: t.toolbar.alignCenter, icon: I.alignCenter },
  { id: 'right', label: t.toolbar.alignRight, icon: I.alignRight },
  { id: 'justify', label: t.toolbar.justify, icon: I.alignJustify },
] as const

const DIRECTIONS = [
  { id: 'auto', label: t.toolbar.directionAuto, hint: t.toolbar.directionAutoHint },
  { id: 'ltr', label: t.toolbar.directionLtr },
  { id: 'rtl', label: t.toolbar.directionRtl },
] as const

const CASES = [
  { id: 'sentence', label: t.ctx.caseSentenceOption },
  { id: 'lower', label: t.ctx.caseLowerOption },
  { id: 'upper', label: t.ctx.caseUpperOption },
  { id: 'title', label: t.ctx.caseTitleOption },
] as const

const RESTORE_CASE = { id: 'none', label: t.ctx.caseNormal } as const
const FALLBACK_WEIGHTS = [400, 700]
const weightName = (weight: number): string => t.toolbar.weightNames[weight as keyof typeof t.toolbar.weightNames] ?? String(weight)

/** Keep the weight menu in step with uploaded fonts and the catalog's available files. */
function useFontFamily(family: string): [FontFamily | null, (entry: FontFamily) => void] {
  const editor = useEditor()
  const [known, setKnown] = useState<{ family: string; entry: FontFamily | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!family) return
    void editor.fonts.lookup(family).then((f) => {
      if (!cancelled) setKnown({ family, entry: f })
    })
    return () => {
      cancelled = true
    }
  }, [editor, family])
  return [known?.family === family ? known.entry : null, (entry) => setKnown({ family, entry })]
}

function WeightTool({ family, weight, italic, entry, onDownloaded }: { family: string; weight: number; italic: boolean; entry: FontFamily | null; onDownloaded: (entry: FontFamily) => void }) {
  const editor = useEditor()
  const [remote, setRemote] = useState<{ family: string; enabled: boolean; weights: Array<{ weight: number; style: 'normal' | 'italic' }> } | null>(null)
  const [adding, setAdding] = useState<number | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    if (entry?.is_user_font) return
    if (family) void fontsApi.weights(family).then((result) => {
      if (!cancelled) setRemote({ family, ...result })
    }).catch(() => {
      if (!cancelled) setRemote({ family, enabled: false, weights: [] })
    })
    return () => { cancelled = true }
  }, [family, entry?.is_user_font])
  const variants = entry?.variants ?? []
  const style = italic ? 'italic' : 'normal'
  const canDownload = !entry?.is_user_font && remote?.family === family && remote.enabled
  const available = variants.length
    ? [...new Set(variants.filter((v) => v.style === style || (italic && !variants.some((face) => face.style === 'italic'))).map((v) => v.weight))].sort((a, b) => a - b)
    : canDownload ? [] : FALLBACK_WEIGHTS
  const downloadable = canDownload
    ? remote.weights.filter((v) => v.style === style && !variants.some((face) => face.style === style && face.weight === v.weight))
    : []
  // Keep an old document's weight visible unless this menu can download its missing face.
  const weights = available.includes(weight) || downloadable.some((v) => v.weight === weight)
    ? available : [...available, weight].sort((a, b) => a - b)
  const add = async (value: number, close: () => void): Promise<void> => {
    const selectionVersion = editor.state.selection.version
    setAdding(value)
    setError('')
    try {
      const installed = await fontsApi.addWeight(family, value, style)
      editor.fonts.remember([installed])
      onDownloaded(installed)
      // A slow download must not format a different selection made in the meantime.
      if (editor.state.selection.version === selectionVersion) editor.style.text({ fontWeight: value }, t.history.changeFontWeight)
      close()
    } catch {
      setError(t.toolbar.fontWeightDownloadFailed)
    } finally {
      setAdding(null)
    }
  }
  return (
    <PopoverTool label={t.toolbar.fontWeight} trigger={<><span className={ed.toolText}>{weightName(weight)}</span>{I.chevronDown}</>} flush testId="ed-font-weight">
      {(close) => (
        <div className={ed.menuList} role="menu">
          {weights.map((value) => (
            <button key={value} type="button" role="menuitemradio" aria-checked={value === weight} className={ed.menuItem} disabled={!available.includes(value)} data-testid={`ed-weight-${value}`} onClick={() => {
              editor.style.text({ fontWeight: value }, t.history.changeFontWeight)
              close()
            }}>
              {weightName(value)}<span>{value}</span>
            </button>
          ))}
          {downloadable.map(({ weight: value }) => (
            <button key={`add-${value}`} type="button" className={ed.menuItem} disabled={adding !== null} data-testid={`ed-add-weight-${value}`} onClick={() => void add(value, close)}>
              {t.toolbar.addFontWeight(weightName(value))}<span>{value}</span>
            </button>
          ))}
          {error ? <p role="alert" className={ed.hintText}>{error}</p> : null}
        </div>
      )}
    </PopoverTool>
  )
}

/** The font pill and its searchable list. */
function FontTool({ family, stack, sample, weight, italic }: { family: string; stack: string; sample: string; weight: number; italic: boolean }) {
  const editor = useEditor()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const preview = useMemo(() => createFontPreview(editor), [editor])
  const close = useCallback(() => {
    preview.cancel()
    setOpen(false)
  }, [preview])
  return (
    <>
      <Tooltip label={t.toolbar.font} disabled={open}>
        <button ref={ref} type="button" className={ed.select} aria-label={`${t.toolbar.font}: ${family}`} aria-haspopup="dialog" aria-expanded={open} data-testid="ed-font" style={{ fontFamily: stack }} onClick={() => (open ? close() : setOpen(true))}>
          <span className={ed.selectValue}>{family || t.tools.fontFallback}</span>
          {I.chevronDown}
        </button>
      </Tooltip>
      <Popover open={open} onClose={close} anchorRef={ref} label={t.toolbar.font} placement="bottom" variant="plain" cover>
        <FontPicker
          current={family}
          sample={sample}
          onPreview={preview.preview}
          onPick={(next, picked) => {
            preview.commit()
            const entry = editor.fonts.known(picked)
            const style = italic ? 'italic' : 'normal'
            const installed = entry?.variants.length
              ? pickVariant(entry.variants, weight, style)?.weight
              : isSystemFont(picked) && !editor.fonts.isUserFont(picked)
                ? [...FALLBACK_WEIGHTS].sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight))[0]
                : undefined
            editor.style.text({ fontFamily: next, ...(installed !== undefined && installed !== weight ? { fontWeight: installed } : {}) }, t.history.changeFont)
            if (installed !== undefined && installed !== weight) {
              editor.toast(t.toolbar.fontWeightAdjusted(picked, weightName(weight), weightName(installed)), 'info')
            }
            setOpen(false)
          }}
          onClose={close}
        />
      </Popover>
    </>
  )
}

export function TextSection() {
  const editor = useEditor()
  const sel = useSelection()
  const obj = sel.objects[0] ?? {}
  const stack = String(textValue(sel, 'fontFamily') ?? '')
  const family = primaryFamily(stack)
  const [fontEntry, setFontEntry] = useFontFamily(family)
  const hasItalic = !fontEntry || fontEntry.variants.length === 0 || fontEntry.variants.some((v) => v.style === 'italic')
  const size = Math.round(Number(textValue(sel, 'fontSize') ?? 16))
  const fill = readFill(textValue(sel, 'fill'), '#1c1517')
  const weight = textValue(sel, 'fontWeight')
  const italic = textValue(sel, 'fontStyle') === 'italic'
  const align = (typeof obj.textAlign === 'string' ? obj.textAlign : 'left') as (typeof ALIGN)[number]['id']
  const AlignIcon = ALIGN.find((a) => a.id === align)?.icon ?? I.alignLeft
  const textCase = typeof obj.textCase === 'string' ? obj.textCase : 'none'
  const lineHeight = Number(obj.lineHeight ?? 1.16)
  const spacing = Math.round(Number(obj.charSpacing ?? 0))
  const curve = typeof obj.curveAmount === 'number' ? obj.curveAmount : 0
  const multiline = String(obj.text ?? '').includes('\n')
  const rtl = obj.direction === 'rtl'
  const dirChoice = obj.textDir === 'ltr' || obj.textDir === 'rtl' ? obj.textDir : 'auto'

  return (
    <>
      <FontTool family={family} stack={stack} sample={String(obj.text ?? '')} weight={weightToNumber(weight as string | number | undefined)} italic={italic} />
      <WeightTool family={family} weight={weightToNumber(weight as string | number | undefined)} italic={italic} entry={fontEntry} onDownloaded={setFontEntry} />
      <Stepper label={t.ctx.sizeInput} value={size} limit={FONT_SIZE} testId="ed-font-size" onChange={(n, key) => editor.style.text({ fontSize: n }, t.history.changeFontSize, key === 'step' ? 'size-step' : 'font-size')} />
      <ColorTool label={t.toolbar.textColor} value={fill} allowGradient testId="ed-text-color" onChange={(f, key) => editor.style.text({ fill: f }, t.history.changeTextColor, key ?? 'text-color')} />

      <ToolButton label={t.toolbar.bold} shortcut="Mod+B" pressed={isBold(weight)} testId="ed-bold" onClick={() => editor.style.text({ fontWeight: isBold(weight) ? 400 : 700 }, t.history.bold)}>
        {I.bold}
      </ToolButton>
      <ToolButton label={hasItalic ? t.toolbar.italic : t.ctx.noItalic(family)} shortcut="Mod+I" pressed={italic} disabled={!hasItalic} testId="ed-italic" onClick={() => editor.style.text({ fontStyle: italic ? 'normal' : 'italic' }, t.history.italic)}>
        {I.italic}
      </ToolButton>
      <ToolButton label={t.toolbar.underline} shortcut="Mod+U" pressed={!!textValue(sel, 'underline')} testId="ed-underline" onClick={() => editor.style.text({ underline: !textValue(sel, 'underline') }, t.history.underline)}>
        {I.underline}
      </ToolButton>

      <PopoverTool label={t.toolbar.alignTitle} trigger={AlignIcon} inline testId="ed-text-align">
        {(close) =>
          ALIGN.map((a) => (
            <ToolButton
              key={a.id}
              label={a.label}
              pressed={align === a.id}
              testId={`ed-align-${a.id}`}
              onClick={() => {
                editor.style.text({ textAlign: a.id }, t.history.alignText)
                close()
              }}
            >
              {a.icon}
            </ToolButton>
          ))
        }
      </PopoverTool>

      <PopoverTool label={t.toolbar.directionTitle} trigger={rtl ? <PilcrowLeft size={18} aria-hidden="true" /> : <PilcrowRight size={18} aria-hidden="true" />} flush testId="ed-text-direction">
        {(close) => (
          <div className={ed.menuList} role="menu">
            {DIRECTIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                role="menuitemradio"
                aria-checked={dirChoice === d.id}
                className={ed.menuItem}
                data-testid={`ed-direction-${d.id}`}
                onClick={() => {
                  editor.style.text({ direction: d.id }, t.history.textDirection)
                  close()
                }}
              >
                {d.label}
                {'hint' in d ? <span>{d.hint}</span> : null}
              </button>
            ))}
          </div>
        )}
      </PopoverTool>

      <PopoverTool label={t.toolbar.lineHeight} trigger={I.lineHeight} width={180} testId="ed-line-height">
        <LimitedNumber label={t.toolbar.lineHeight} value={lineHeight} limit={LINE_HEIGHT} testId="ed-line-height-input" onChange={(v) => editor.style.text({ lineHeight: v }, t.history.changeLineHeight, 'line-height')} />
      </PopoverTool>

      <PopoverTool label={t.toolbar.letterSpacing} trigger={I.spacing} width={180} testId="ed-letter-spacing">
        <LimitedNumber label={t.toolbar.letterSpacing} value={spacing} limit={LETTER_SPACING} testId="ed-letter-spacing-input" onChange={(v) => editor.style.text({ charSpacing: v }, t.history.changeLetterSpacing, 'char-spacing')} />
      </PopoverTool>

      <PopoverTool label={t.ctx.caseTitle} trigger={I.letterCase} flush testId="ed-case">
        {(close) => (
          <div className={ed.menuList} role="menu">
            {(textCase === 'none' ? CASES : [...CASES, RESTORE_CASE]).map((c) => (
              <button
                key={c.id}
                type="button"
                role="menuitemradio"
                aria-checked={textCase === c.id}
                className={ed.menuItem}
                data-testid={`ed-case-${c.id}`}
                onClick={() => {
                  editor.style.text({ textCase: c.id }, t.history.changeCase)
                  close()
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </PopoverTool>

      <PopoverTool label={multiline ? t.ctx.curveSingleLine : t.toolbar.curve} trigger={I.curve} width={200} disabled={multiline} testId="ed-curve">
        <div className={ed.propLabel}>{t.toolbar.curve}</div>
        <div className={ed.curveWrap}>
          <input type="range" className={ed.slider} min={-CURVE_MAX} max={CURVE_MAX} step={10} value={curve} aria-label={t.toolbar.curve} data-testid="ed-curve-range" onChange={(e) => editor.style.setCurve(Number(e.target.value))} />
          <span className={ed.curveTick} aria-hidden="true" />
        </div>
        <p className={ed.hintText}>{t.ctx.curveHelp}</p>
      </PopoverTool>

      <OpacityTool />
    </>
  )
}
