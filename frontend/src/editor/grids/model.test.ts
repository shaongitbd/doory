import {
  DEFAULT_IMAGE_GRID_GAP,
  DEFAULT_IMAGE_GRID_LAYOUT_ID,
  IMAGE_GRID_PRESETS,
  MAX_IMAGE_GRID_GAP,
  clampImageGridGap,
  createImageGridSpec,
  imageGridPreset,
  imageGridSpecOrDefault,
  isImageGridLayoutId,
  readImageGridSpec,
} from './model'

describe('image grid presets', () => {
  it('covers the initial two through six-cell layouts with stable cell labels', () => {
    expect(IMAGE_GRID_PRESETS).toHaveLength(7)
    expect(new Set(IMAGE_GRID_PRESETS.map((preset) => preset.cells.length))).toEqual(new Set([2, 3, 4, 5, 6]))
    for (const preset of IMAGE_GRID_PRESETS) {
      expect(preset.cells.map((cell) => cell.gridCellId)).toEqual(preset.cells.map((_, index) => `cell-${index + 1}`))
    }
  })

  it('creates independent metadata instead of returning the catalogue cells', () => {
    const first = createImageGridSpec('feature-left', 12)
    const second = createImageGridSpec('feature-left', 12)
    expect(first).toEqual(second)
    expect(first.cells).not.toBe(second.cells)
    expect(first.cells[0]).not.toBe(second.cells[0])
  })

  it('falls back to the default layout for an unknown preset id', () => {
    expect(imageGridPreset('missing').id).toBe(DEFAULT_IMAGE_GRID_LAYOUT_ID)
    expect(createImageGridSpec('missing')).toEqual(createImageGridSpec(DEFAULT_IMAGE_GRID_LAYOUT_ID))
    expect(isImageGridLayoutId('six-grid')).toBe(true)
    expect(isImageGridLayoutId('missing')).toBe(false)
  })
})

describe('persisted image grid metadata', () => {
  it('reads a valid future layout and returns its own cell copies', () => {
    const raw = { version: 1, layoutId: 'future-layout', gap: 4, cells: [{ gridCellId: 'hero', x: 0, y: 0, width: 1, height: 1 }] }
    const out = readImageGridSpec(raw)
    expect(out).toEqual(raw)
    expect(out?.cells).not.toBe(raw.cells)
    expect(out?.cells[0]).not.toBe(raw.cells[0])
  })

  it('rejects invalid bounds, duplicate labels and overlapping cells', () => {
    expect(readImageGridSpec({ version: 1, layoutId: 'bad', gap: 8, cells: [{ gridCellId: 'a', x: 0.5, y: 0, width: 0.6, height: 1 }] })).toBeNull()
    expect(
      readImageGridSpec({
        version: 1,
        layoutId: 'bad',
        gap: 8,
        cells: [
          { gridCellId: 'a', x: 0, y: 0, width: 0.5, height: 1 },
          { gridCellId: 'a', x: 0.5, y: 0, width: 0.5, height: 1 },
        ],
      }),
    ).toBeNull()
    expect(
      readImageGridSpec({
        version: 1,
        layoutId: 'bad',
        gap: 8,
        cells: [
          { gridCellId: 'a', x: 0, y: 0, width: 0.7, height: 1 },
          { gridCellId: 'b', x: 0.5, y: 0, width: 0.5, height: 1 },
        ],
      }),
    ).toBeNull()
  })

  it('clamps spacing and replaces malformed metadata with a requested fallback', () => {
    expect(clampImageGridGap(-5)).toBe(0)
    expect(clampImageGridGap(500)).toBe(MAX_IMAGE_GRID_GAP)
    expect(clampImageGridGap('10')).toBe(DEFAULT_IMAGE_GRID_GAP)
    expect(imageGridSpecOrDefault({ nope: true }, 'two-rows')).toEqual(createImageGridSpec('two-rows'))
  })
})
