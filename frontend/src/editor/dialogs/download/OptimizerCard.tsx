import { Zap } from 'lucide-react'
import type { ImageOptimizerInfo } from '@/types/adapter'
import { t } from '../../strings'
import styles from './download.module.css'

interface OptimizerCardProps {
  optimizers: ImageOptimizerInfo[]
  on: boolean
  onToggle: (on: boolean) => void
  value: string | undefined
  onPick: (id: string) => void
  /** The chosen format, to say when the optimizer leaves it as it is. */
  format: string
  formatLabel: string
}

/** "Optimize file size": on or off, and which of the optimizers the admin set up does it. */
export function OptimizerCard({ optimizers, on, onToggle, value, onPick, format, formatLabel }: OptimizerCardProps) {
  const chosen = optimizers.find((o) => o.id === value) ?? optimizers[0]
  if (!chosen) return null
  const skips = !(chosen.formats as string[]).includes(format)
  return (
    <section className={styles.optimize}>
      <label className={styles.optimizeTop}>
        <Zap size={18} aria-hidden="true" className={styles.purposeIcon} />
        <span className={styles.purposeText}>
          <strong>{t.dialog.downloadOptimize}</strong>
          <small>{t.dialog.downloadOptimizeHint}</small>
        </span>
        <input type="checkbox" role="switch" className={styles.toggle} checked={on} onChange={(e) => onToggle(e.target.checked)} />
      </label>
      {on ? (
        <div className={styles.engines}>
          {optimizers.length > 1 ? (
            <div className={styles.chips} role="radiogroup" aria-label={t.dialog.downloadOptimizer}>
              {optimizers.map((o) => (
                <label key={o.id} className={`${styles.chip} ${o.id === chosen.id ? styles.on : ''}`}>
                  <input type="radio" name="export-optimizer" checked={o.id === chosen.id} onChange={() => onPick(o.id)} />
                  {o.name}
                </label>
              ))}
            </div>
          ) : null}
          <small className={styles.hint}>
            {skips ? t.dialog.downloadOptimizerSkips(chosen.name, formatLabel) : chosen.sendsOffsite ? t.dialog.downloadOptimizerOffsite(chosen.name) : t.dialog.downloadOptimizerLocal(chosen.name)}
          </small>
        </div>
      ) : null}
    </section>
  )
}
