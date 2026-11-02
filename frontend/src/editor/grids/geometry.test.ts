import { createImageGridSpec } from './model'
import { gridCellFrame, gridCellFrames, hitTestGridCell } from './geometry'

describe('image grid geometry', () => {
  it('splits an internal gap without adding padding around the grid', () => {
    const frames = gridCellFrames(createImageGridSpec('two-columns', 12), 400, 200)
    expect(frames).toEqual([
      { gridCellId: 'cell-1', left: 0, top: 0, width: 194, height: 200 },
      { gridCellId: 'cell-2', left: 206, top: 0, width: 194, height: 200 },
    ])
  })

  it('applies horizontal and vertical gaps to a regular grid', () => {
    const frames = gridCellFrames(createImageGridSpec('four-grid', 10), 400, 200)
    expect(frames[0]).toEqual({ gridCellId: 'cell-1', left: 0, top: 0, width: 195, height: 95 })
    expect(frames[1]).toEqual({ gridCellId: 'cell-2', left: 205, top: 0, width: 195, height: 95 })
    expect(frames[2]).toEqual({ gridCellId: 'cell-3', left: 0, top: 105, width: 195, height: 95 })
    expect(frames[3]).toEqual({ gridCellId: 'cell-4', left: 205, top: 105, width: 195, height: 95 })
  })

  it('keeps every cell positive when a tiny grid has the largest allowed gap', () => {
    const frames = gridCellFrames(createImageGridSpec('six-grid', 64), 10, 6)
    expect(frames.every((frame) => frame.width >= 1 && frame.height >= 1)).toBe(true)
  })

  it('finds cells but not the space between them', () => {
    const frames = gridCellFrames(createImageGridSpec('two-columns', 12), 400, 200)
    expect(hitTestGridCell(frames, { x: 20, y: 20 })?.gridCellId).toBe('cell-1')
    expect(hitTestGridCell(frames, { x: 380, y: 180 })?.gridCellId).toBe('cell-2')
    expect(hitTestGridCell(frames, { x: 200, y: 100 })).toBeNull()
    expect(hitTestGridCell(frames, { x: -1, y: 20 })).toBeNull()
  })

  it('looks up one calculated frame by its stable cell label', () => {
    const frames = gridCellFrames(createImageGridSpec('feature-left'), 500, 300)
    expect(gridCellFrame(frames, 'cell-2')?.top).toBe(0)
    expect(gridCellFrame(frames, 'cell-3')?.top).toBeGreaterThan(0)
    expect(gridCellFrame(frames, 'missing')).toBeNull()
  })
})
