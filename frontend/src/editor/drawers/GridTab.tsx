import { useEditor } from '../context'
import { IMAGE_GRID_PRESETS, type ImageGridLayoutId } from '../grids/model'
import type { PanelProps } from '../panels/registry'
import { t } from '../strings'
import ed from '../chrome/ed.module.css'
import styles from './Drawers.module.css'

function layoutName(id: ImageGridLayoutId): string {
  return t.imageGrid.layouts[id]
}

function GridPreview({ layoutId }: { layoutId: ImageGridLayoutId }) {
  const preset = IMAGE_GRID_PRESETS.find((candidate) => candidate.id === layoutId)
  if (!preset) return null
  return (
    <svg className={styles.gridPreview} viewBox="0 0 100 75" aria-hidden="true">
      {preset.cells.map((cell) => (
        <rect
          key={cell.gridCellId}
          x={cell.x * 100 + 1}
          y={cell.y * 75 + 1}
          width={Math.max(1, cell.width * 100 - 2)}
          height={Math.max(1, cell.height * 75 - 2)}
          rx="2"
        />
      ))}
    </svg>
  )
}

/** Preset image grids. Photos are added after a layout is placed on the page. */
export function GridTab({ close }: PanelProps) {
  const editor = useEditor()
  return (
    <>
      <p className={ed.sectionTitle}>{t.imageGrid.title}</p>
      <p className={styles.gridHelp}>{t.imageGrid.description}</p>
      <div className={styles.gridCards}>
        {IMAGE_GRID_PRESETS.map((preset) => {
          const name = layoutName(preset.id)
          return (
            <button
              key={preset.id}
              type="button"
              className={styles.gridCard}
              aria-label={t.imageGrid.insert(name)}
              data-testid={`grid-preset-${preset.id}`}
              onClick={() => {
                void editor.imageGrids.insert(preset.id)
                close()
              }}
            >
              <GridPreview layoutId={preset.id} />
              <span>{name}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
