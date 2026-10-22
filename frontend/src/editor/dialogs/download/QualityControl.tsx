import { type CSSProperties, useState } from 'react'
import { QUALITY_PRESETS, type QualityPreset } from '../../engine/export/registry'
import { t } from '../../strings'
import sliderStyles from '../../ui/Slider.module.css'
import styles from './download.module.css'

const MB = 1024 * 1024
const MIN = 1

interface QualityControlProps {
  /** 1..100 */
  value: number
  preset: QualityPreset | undefined
  onChange: (value: number, preset?: QualityPreset) => void
  /** The cap per file in bytes, or undefined for none. */
  maxBytes: number | undefined
  onMaxBytes: (bytes: number | undefined) => void
  /** "≈ 65 KB per page" */
  estimate: string | null
}

/** Quality: a slider and a number, four stops (Small, Balanced, Best, Original), and "keep each file under N MB". */
export function QualityControl({ value, preset, onChange, maxBytes, onMaxBytes, estimate }: QualityControlProps) {
  const pct = ((value - MIN) / (100 - MIN)) * 100
  const capMb = maxBytes ? Math.round((maxBytes / MB) * 100) / 100 : 1
  const set = (raw: number): void => onChange(Math.min(100, Math.max(MIN, Math.round(raw) || MIN)))
  // The number as typed: an empty or half-typed field changes nothing until it is a quality (or loses focus).
  const [typed, setTyped] = useState<string | null>(null)
  const number = (text: string): number | null => {
    const n = Number(text)
    return text.trim() !== '' && Number.isFinite(n) ? n : null
  }
  return (
    <section className={styles.section}>
      <h3 className={styles.label}>
        {t.dialog.downloadQuality}
        {estimate ? <small data-testid="download-quality-size">{estimate}</small> : null}
      </h3>
      <div className={styles.qualityRow}>
        <input type="range" className={sliderStyles.range} min={MIN} max={100} value={value} aria-label={t.dialog.downloadQuality} style={{ '--pct': `${pct}%` } as CSSProperties} onChange={(e) => set(Number(e.target.value))} />
        <input
          type="number"
          className={styles.number}
          min={MIN}
          max={100}
          value={typed ?? value}
          aria-label={t.dialog.downloadQualityValue}
          onChange={(e) => {
            setTyped(e.target.value)
            const n = number(e.target.value)
            if (n !== null && n >= MIN && n <= 100) set(n)
          }}
          onBlur={() => {
            const n = typed === null ? null : number(typed)
            if (n !== null) set(n)
            setTyped(null)
          }}
        />
      </div>
      <div className={styles.stops}>
        {(Object.keys(QUALITY_PRESETS) as QualityPreset[]).map((id) => (
          <button key={id} type="button" className={`${styles.stop} ${preset === id || (!preset && value === QUALITY_PRESETS[id]) ? styles.on : ''}`} aria-pressed={preset === id} onClick={() => onChange(QUALITY_PRESETS[id], id)}>
            {t.dialog.downloadStops[id]}
            <small>{QUALITY_PRESETS[id]}</small>
          </button>
        ))}
      </div>
      <label className={styles.inline}>
        <input type="checkbox" checked={maxBytes !== undefined} onChange={(e) => onMaxBytes(e.target.checked ? capMb * MB : undefined)} />
        {t.dialog.downloadKeepUnder}
        <input
          type="number"
          className={styles.number}
          min={0.05}
          step={0.1}
          value={capMb}
          aria-label={t.dialog.downloadMaxMb}
          onChange={(e) => {
            const mb = Number.parseFloat(e.target.value)
            if (Number.isFinite(mb) && mb >= 0.05) onMaxBytes(Math.round(mb * MB))
          }}
        />
        MB
      </label>
    </section>
  )
}
