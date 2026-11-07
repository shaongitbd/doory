import { Pipette } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { type Hsva, hsvToRgb, parseColor, rgbToHsv, rgbaToHex } from '../engine/colors'
import { useDocument, useEditorStateShallow } from '../context'
import { documentColors } from '../engine/docOps'
import { useCanvasIllustrationColors } from '../hooks/useCanvasIllustrationColors'
import { palettes } from './swatches'
import { t } from '../strings'
import styles from './ColorPicker.module.css'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  allowAlpha?: boolean
  /** Extra swatches shown first (e.g. the colours of an element or brand kit). */
  extraSwatches?: { label: string; colors: readonly string[] }
}

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))
const withHash = (text: string): string => (text.startsWith('#') ? text : `#${text}`)

function toHsva(value: string): Hsva {
  const rgba = parseColor(value) ?? { r: 0, g: 0, b: 0, a: 1 }
  return rgbToHsv(rgba)
}

export function ColorPicker({ value, onChange, allowAlpha = true, extraSwatches }: ColorPickerProps) {
  const [hsva, setHsva] = useState<Hsva>(() => toHsva(value))
  const emitted = useRef(value)
  const canvasColors = useCanvasIllustrationColors()
  const docColors = useDocumentColors()
  const recent = useEditorStateShallow((s) => s.recentColors)
  const allPalettes = useSyncExternalStore(palettes.subscribe, palettes.getSnapshot)

  // External changes (selecting another object) reset the picker; our own emissions do not (keeps hue stable).
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value
      setHsva((cur) => {
        const next = toHsva(value)
        // Keep the hue when the colour is achromatic so the hue slider does not jump to 0.
        return next.s === 0 || next.v === 0 ? { ...next, h: cur.h } : next
      })
    }
  }, [value])

  const emit = useCallback(
    (next: Hsva) => {
      setHsva(next)
      const hex = rgbaToHex(hsvToRgb(next))
      emitted.current = hex
      onChange(hex)
    },
    [onChange],
  )

  const rgb = hsvToRgb(hsva)
  const hex = rgbaToHex({ ...rgb, a: 1 })

  /** What the user is typing into the hex field; `null` while the field mirrors the current colour. */
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const hexInvalid = hexDraft !== null && parseColor(withHash(hexDraft)) === null

  const typeHex = (text: string): void => {
    setHexDraft(text)
    const parsed = parseColor(withHash(text))
    if (parsed) {
      const hsv = rgbToHsv(parsed)
      emit({ ...hsv, h: hsv.s === 0 ? hsva.h : hsv.h, a: allowAlpha && withHash(text).length > 7 ? parsed.a : hsva.a })
    }
  }

  const pick = (color: string): void => {
    const parsed = parseColor(color)
    if (parsed) emit({ ...rgbToHsv(parsed), a: allowAlpha ? parsed.a : 1 })
  }

  const eyeDropper = (): void => {
    const Ctor = (window as unknown as { EyeDropper?: new () => EyeDropperLike }).EyeDropper
    if (!Ctor) return
    new Ctor()
      .open()
      .then((r) => pick(r.sRGBHex))
      .catch(() => undefined)
  }
  const canDrop = typeof window !== 'undefined' && 'EyeDropper' in window

  return (
    <div className={styles.picker}>
      <SaturationArea hsva={hsva} onChange={emit} />
      <div className={styles.sliders}>
        <div className={styles.slidersCol}>
          <HueSlider hue={hsva.h} onChange={(h) => emit({ ...hsva, h })} />
          {allowAlpha ? <AlphaSlider hsva={hsva} onChange={(a) => emit({ ...hsva, a })} /> : null}
        </div>
        {canDrop ? (
          <button type="button" className={styles.eye} onClick={eyeDropper} aria-label={t.picker.eyedropper} title={t.picker.eyedropper}>
            <Pipette size={16} />
          </button>
        ) : null}
      </div>
      <div className={styles.inputs}>
        <label className={`${styles.input} ${styles.hex}`}>
          <span>{t.picker.hex}</span>
          <input
            value={hexDraft ?? hex}
            aria-label={t.picker.hexColor}
            aria-invalid={hexInvalid || undefined}
            spellCheck={false}
            maxLength={9}
            onChange={(e) => typeHex(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => setHexDraft(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setHexDraft(null)
            }}
          />
        </label>
        {(['r', 'g', 'b'] as const).map((ch) => (
          <label key={ch} className={styles.input}>
            <span>{ch.toUpperCase()}</span>
            <input
              inputMode="numeric"
              aria-label={t.picker.channel(ch)}
              value={rgb[ch]}
              onChange={(e) => {
                const n = Math.min(255, Math.max(0, Number.parseInt(e.target.value || '0', 10) || 0))
                const next = { ...rgb, [ch]: n }
                emit({ ...rgbToHsv(next), h: rgbToHsv(next).s === 0 ? hsva.h : rgbToHsv(next).h })
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
        ))}
        {allowAlpha ? (
          <label className={styles.input}>
            <span>A</span>
            <input
              inputMode="numeric"
              aria-label={t.picker.alpha}
              value={Math.round(hsva.a * 100)}
              onChange={(e) => emit({ ...hsva, a: clamp01((Number.parseInt(e.target.value || '0', 10) || 0) / 100) })}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
        ) : null}
      </div>
      <div className={styles.swatchArea}>
        {extraSwatches && extraSwatches.colors.length > 0 ? <SwatchRow label={extraSwatches.label} colors={extraSwatches.colors} onPick={pick} current={hex} /> : null}
        {canvasColors.length > 0 ? <SwatchRow label={t.toolbar.canvasColors} colors={canvasColors} onPick={pick} current={hex} /> : null}
        {docColors.length > 0 ? <SwatchRow label={t.picker.documentColors} colors={docColors} onPick={pick} current={hex} /> : null}
        {recent.length > 0 ? <SwatchRow label={t.picker.recent} colors={recent} onPick={pick} current={hex} /> : null}
        {allPalettes.map((p) => (
          <SwatchRow key={p.id} label={p.label} colors={p.colors} onPick={pick} current={hex} />
        ))}
      </div>
    </div>
  )
}

function useDocumentColors(): string[] {
  const doc = useDocument()
  return useMemo(() => documentColors(doc), [doc])
}

function SwatchRow({ label, colors, onPick, current }: { label: string; colors: readonly string[]; onPick: (c: string) => void; current: string }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>{label}</div>
      <div className={styles.swatches} role="group" aria-label={label}>
        {colors.map((c, i) => (
          <button
            key={`${c}-${i}`}
            type="button"
            className={`${styles.swatch} ${c.toLowerCase() === current.toLowerCase() ? styles.swatchOn : ''}`}
            style={{ background: c }}
            aria-label={t.picker.use(c)}
            title={c}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  )
}

/** Pointer-drag helper: reports the pointer position relative to the element the drag started on. */
function dragHandler(onMove: (x: number, y: number, rect: DOMRect) => void) {
  return (e: React.PointerEvent<HTMLElement>): void => {
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    onMove(e.clientX, e.clientY, el.getBoundingClientRect())
    const move = (ev: PointerEvent): void => onMove(ev.clientX, ev.clientY, el.getBoundingClientRect())
    const up = (): void => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
}

function SaturationArea({ hsva, onChange }: { hsva: Hsva; onChange: (h: Hsva) => void }) {
  const onPointerDown = dragHandler((x, y, r) => onChange({ ...hsva, s: clamp01((x - r.left) / r.width), v: clamp01(1 - (y - r.top) / r.height) }))
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const step = e.shiftKey ? 0.1 : 0.02
    let { s, v } = hsva
    if (e.key === 'ArrowLeft') s -= step
    else if (e.key === 'ArrowRight') s += step
    else if (e.key === 'ArrowUp') v += step
    else if (e.key === 'ArrowDown') v -= step
    else return
    e.preventDefault()
    onChange({ ...hsva, s: clamp01(s), v: clamp01(v) })
  }
  return (
    <div
      className={styles.sv}
      style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsva.h} 100% 50%))` }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="slider"
      aria-label={t.picker.area}
      aria-valuetext={t.picker.areaValue(Math.round(hsva.s * 100), Math.round(hsva.v * 100))}
      aria-valuenow={Math.round(hsva.s * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className={styles.svHandle} style={{ left: `${hsva.s * 100}%`, top: `${(1 - hsva.v) * 100}%`, background: rgbaToHex({ ...hsvToRgb(hsva), a: 1 }) }} />
    </div>
  )
}

function HueSlider({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  return (
    <input
      type="range"
      className={`${styles.range} ${styles.hue}`}
      min={0}
      max={360}
      step={1}
      value={Math.round(hue)}
      aria-label={t.picker.hue}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

function AlphaSlider({ hsva, onChange }: { hsva: Hsva; onChange: (a: number) => void }) {
  const solid = rgbaToHex({ ...hsvToRgb(hsva), a: 1 })
  return (
    <div className={`${styles.alphaWrap}`}>
      <input
        type="range"
        className={`${styles.range} ${styles.alpha}`}
        style={{ backgroundImage: `linear-gradient(to right, transparent, ${solid})` }}
        min={0}
        max={100}
        step={1}
        value={Math.round(hsva.a * 100)}
        aria-label={t.picker.opacity}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
    </div>
  )
}
