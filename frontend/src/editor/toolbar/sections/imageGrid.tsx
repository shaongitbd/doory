import { ArrowLeft, ArrowRight, ImagePlus, LayoutGrid, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useEditor, useSelection } from '../../context'
import {
  DEFAULT_IMAGE_GRID_GAP,
  DEFAULT_IMAGE_GRID_LAYOUT_ID,
  IMAGE_GRID_PRESETS,
  MAX_IMAGE_GRID_GAP,
  type ImageGridLayoutId,
} from '../../grids/model'
import { t } from '../../strings'
import { PopoverTool } from '../parts'
import ed from '../../chrome/ed.module.css'
import styles from './sections.module.css'

interface SelectedGridSpec {
  layoutId?: unknown
  gap?: unknown
  cells?: unknown
}

interface SelectedGridObject {
  imageGrid?: unknown
  objects?: unknown
}

interface SelectedGridCell {
  gridCellId: string
}

function selectedGridSpec(value: unknown): { layoutId: ImageGridLayoutId; gap: number; cellCount: number; cells: SelectedGridCell[]; occupiedCellIds: string[] } {
  const object = value && typeof value === 'object' ? (value as SelectedGridObject) : {}
  const spec = object.imageGrid && typeof object.imageGrid === 'object' ? (object.imageGrid as SelectedGridSpec) : {}
  const layoutId = IMAGE_GRID_PRESETS.some((preset) => preset.id === spec.layoutId) ? (spec.layoutId as ImageGridLayoutId) : DEFAULT_IMAGE_GRID_LAYOUT_ID
  const gap = typeof spec.gap === 'number' && Number.isFinite(spec.gap) ? Math.max(0, Math.min(MAX_IMAGE_GRID_GAP, Math.round(spec.gap))) : DEFAULT_IMAGE_GRID_GAP
  const presetCellCount = IMAGE_GRID_PRESETS.find((preset) => preset.id === layoutId)?.cells.length ?? 0
  const cells = Array.isArray(spec.cells)
    ? spec.cells.flatMap((cell) => {
        if (!cell || typeof cell !== 'object' || typeof (cell as { gridCellId?: unknown }).gridCellId !== 'string') return []
        return [{ gridCellId: (cell as { gridCellId: string }).gridCellId }]
      })
    : []
  const cellCount = cells.length || presetCellCount
  const occupiedCellIds = Array.isArray(object.objects)
    ? object.objects.flatMap((child) => {
        if (!child || typeof child !== 'object') return []
        const candidate = child as { gridCellId?: unknown; type?: unknown }
        const type = typeof candidate.type === 'string' ? candidate.type.toLowerCase().replace(/-/g, '') : ''
        if (typeof candidate.gridCellId !== 'string' || type === 'rect') return []
        return [candidate.gridCellId]
      })
    : []
  return { layoutId, gap, cellCount, cells, occupiedCellIds }
}

function GridLayoutPicker({ current, occupiedCellIds, close }: { current: ImageGridLayoutId; occupiedCellIds: string[]; close: () => void }) {
  const editor = useEditor()
  return (
    <div className={styles.presetGrid} role="radiogroup" aria-label={t.imageGrid.chooseLayout}>
      {IMAGE_GRID_PRESETS.map((preset) => {
        const selected = preset.id === current
        const nextCells = new Set(preset.cells.map((cell) => cell.gridCellId))
        const wouldRemoveImages = occupiedCellIds.some((gridCellId) => !nextCells.has(gridCellId))
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={wouldRemoveImages}
            title={wouldRemoveImages ? t.imageGrid.fewerCellsDisabled : undefined}
            className={`${styles.presetBtn} ${selected ? styles.presetOn : ''}`}
            data-testid={`ed-grid-layout-${preset.id}`}
            onClick={() => {
              void editor.imageGrids.setLayout(preset.id)
              close()
            }}
          >
            <svg viewBox="0 0 100 75" aria-hidden="true" style={{ width: '100%', aspectRatio: '4 / 3', background: 'var(--ed-surface-3)' }}>
              {preset.cells.map((cell) => (
                <rect
                  key={cell.gridCellId}
                  x={cell.x * 100 + 1.5}
                  y={cell.y * 75 + 1.5}
                  width={Math.max(1, cell.width * 100 - 3)}
                  height={Math.max(1, cell.height * 75 - 3)}
                  rx="2"
                  fill="currentColor"
                  opacity="0.75"
                />
              ))}
            </svg>
            <span>{t.imageGrid.layouts[preset.id]}</span>
          </button>
        )
      })}
    </div>
  )
}

function GridGapControl({ gap }: { gap: number }) {
  const editor = useEditor()
  const [value, setValue] = useState(gap)
  const [seen, setSeen] = useState(gap)
  if (gap !== seen) {
    setSeen(gap)
    setValue(gap)
  }
  const change = (next: number): void => {
    const clamped = Math.max(0, Math.min(MAX_IMAGE_GRID_GAP, Math.round(next)))
    setValue(clamped)
    void editor.imageGrids.setGap(clamped)
  }
  return (
    <div style={{ width: 224 }}>
      <label className={`${ed.propLabel} ${ed.propLabelRow}`} htmlFor="ed-grid-gap-number">
        <span>{t.imageGrid.gap}</span>
        <span>{t.imageGrid.gapValue(value)}</span>
      </label>
      <input
        id="ed-grid-gap-number"
        type="number"
        className={ed.propInput}
        min={0}
        max={MAX_IMAGE_GRID_GAP}
        step={1}
        value={value}
        data-testid="ed-grid-gap-number"
        onChange={(e) => change(Number(e.target.value))}
      />
      <input
        type="range"
        className={ed.slider}
        min={0}
        max={MAX_IMAGE_GRID_GAP}
        step={1}
        value={value}
        aria-label={t.imageGrid.gap}
        data-testid="ed-grid-gap-range"
        onChange={(e) => change(Number(e.target.value))}
      />
    </div>
  )
}

function GridCellControls({ cells }: { cells: SelectedGridCell[] }) {
  const editor = useEditor()
  return (
    <div style={{ display: 'grid', gap: 6, width: 288 }} role="list" aria-label={t.imageGrid.manageCells}>
      {cells.map((cell, index) => {
        const position = index + 1
        const buttonStyle = { width: 30, height: 30, padding: 0, display: 'inline-grid', placeItems: 'center' } as const
        return (
          <div key={cell.gridCellId} role="listitem" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', alignItems: 'center', gap: 4 }}>
            <span className={ed.propLabel}>{t.imageGrid.cell(position)}</span>
            <button
              type="button"
              className={`${ed.btn} ${ed.ghost}`}
              style={buttonStyle}
              aria-label={t.imageGrid.replaceImageInCell(position)}
              title={t.imageGrid.replaceImageInCell(position)}
              onClick={() => void editor.imageGrids.replaceCell(cell.gridCellId)}
            >
              <ImagePlus size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${ed.btn} ${ed.ghost}`}
              style={buttonStyle}
              aria-label={`${t.imageGrid.moveImageEarlier}: ${t.imageGrid.cell(position)}`}
              title={t.imageGrid.moveImageEarlier}
              disabled={index === 0}
              onClick={() => void editor.imageGrids.moveCell(cell.gridCellId, -1)}
            >
              <ArrowLeft size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${ed.btn} ${ed.ghost}`}
              style={buttonStyle}
              aria-label={`${t.imageGrid.moveImageLater}: ${t.imageGrid.cell(position)}`}
              title={t.imageGrid.moveImageLater}
              disabled={index === cells.length - 1}
              onClick={() => void editor.imageGrids.moveCell(cell.gridCellId, 1)}
            >
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${ed.btn} ${ed.ghost}`}
              style={buttonStyle}
              aria-label={`${t.imageGrid.removeImage}: ${t.imageGrid.cell(position)}`}
              title={t.imageGrid.removeImage}
              onClick={() => void editor.imageGrids.clearCell(cell.gridCellId)}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Layout and spacing controls for a selected semantic image grid. */
export function ImageGridSection() {
  const selection = useSelection()
  const grid = selectedGridSpec(selection.objects[0])
  return (
    <>
      <PopoverTool label={t.imageGrid.chooseLayout} trigger={<LayoutGrid size={18} aria-hidden="true" />} width={276} testId="ed-grid-layout">
        {(close) => <GridLayoutPicker current={grid.layoutId} occupiedCellIds={grid.occupiedCellIds} close={close} />}
      </PopoverTool>
      <PopoverTool label={t.imageGrid.gap} trigger={<span className={ed.textButton}>{grid.gap}px</span>} width={248} testId="ed-grid-gap">
        <GridGapControl gap={grid.gap} />
      </PopoverTool>
      <PopoverTool label={t.imageGrid.manageCells} trigger={<span className={ed.textButton}>{t.imageGrid.cells(grid.cellCount)}</span>} width={312} testId="ed-grid-cells">
        <GridCellControls cells={grid.cells} />
      </PopoverTool>
    </>
  )
}
