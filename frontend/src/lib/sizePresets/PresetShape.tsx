import type { SizePreset } from './catalogue'
import styles from './PresetShape.module.css'

/** The page's shape, drawn to scale inside a fixed box. */
export function PresetShape({ preset, size = 52 }: { preset: Pick<SizePreset, 'width' | 'height'>; size?: number }) {
  const k = size / Math.max(preset.width, preset.height)
  return <span className={styles.shape} style={{ width: Math.max(6, Math.round(preset.width * k)), height: Math.max(6, Math.round(preset.height * k)) }} aria-hidden="true" />
}
