/** Image-grid layouts, cell editing and canvas-image drop. */
import { type Page, expect, test } from '@playwright/test'
import { click, drag, getDoc, openEditor, openTool, pageObjects, pngBuffer, toolbarOf, waitForObjectCount } from './helpers'

interface GridCell {
  gridCellId: string
  x: number
  y: number
  width: number
  height: number
}

interface GridObject {
  id: string
  type: string
  left: number
  top: number
  width: number
  height: number
  scaleX: number
  scaleY: number
  imageGrid: { layoutId: string; gap: number; cells: GridCell[] }
  objects: Array<{ id: string; type: string; gridCellId: string; name?: string; scaleX?: number; scaleY?: number }>
}

async function insertGrid(page: Page, layoutId: string): Promise<GridObject> {
  const before = (await pageObjects(page)).length
  await openTool(page, 'image')
  await page.getByTestId('image-tab-grids').click()
  await page.getByTestId(`grid-preset-${layoutId}`).click()
  await waitForObjectCount(page, before + 1)
  return (await pageObjects(page)).at(-1) as unknown as GridObject
}

function cellCentre(grid: GridObject, gridCellId: string): { x: number; y: number } {
  const cell = grid.imageGrid.cells.find((candidate) => candidate.gridCellId === gridCellId)
  if (!cell) throw new Error(`Missing ${gridCellId}`)
  return {
    x: grid.left - grid.width / 2 + (cell.x + cell.width / 2) * grid.width,
    y: grid.top - grid.height / 2 + (cell.y + cell.height / 2) * grid.height,
  }
}

async function fillFromToolbar(page: Page, position: number, name: string, rgb: readonly [number, number, number]): Promise<void> {
  await toolbarOf(page).getByTestId('ed-grid-cells').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: `Replace the image in grid cell ${position}` }).click()
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: pngBuffer(240, 160, rgb) })
}

async function uploadPhoto(page: Page, name: string, rgb: readonly [number, number, number]): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('upload-zone').click()
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: pngBuffer(240, 160, rgb) })
  await expect(page.getByTestId('uploaded-thumb').filter({ hasText: name })).toBeVisible()
}

async function dragUploadedToCell(page: Page, name: string, grid: GridObject, gridCellId: string): Promise<void> {
  const artboard = page.locator('[data-artboard]')
  const box = await artboard.boundingBox()
  if (!box) throw new Error('artboard not found')
  const doc = await getDoc(page)
  const zoom = box.width / doc.width
  const point = cellCentre(grid, gridCellId)
  await page.getByTestId('uploaded-thumb').filter({ hasText: name }).dragTo(artboard, {
    targetPosition: { x: point.x * zoom, y: point.y * zoom },
  })
}

test.describe('[engine] image grids', () => {
  test('inserts different presets, changes layout and gap, and reloads their metadata', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    let grid = await insertGrid(page, 'two-columns')
    await waitForObjectCount(page, 1)
    expect(grid.type).toBe('group')
    expect(grid.imageGrid).toMatchObject({ layoutId: 'two-columns', gap: 8 })
    expect(grid.imageGrid.cells).toHaveLength(2)
    expect(grid.objects.map((cell) => cell.gridCellId)).toEqual(['cell-1', 'cell-2'])

    const toolbar = toolbarOf(page)
    await expect(toolbar.getByTestId('ed-grid-layout')).toBeVisible()
    await expect(toolbar.getByTestId('ed-grid-cells')).toContainText('2 cells')
    await toolbar.getByTestId('ed-grid-gap').click()
    await page.getByTestId('ed-grid-gap-number').fill('18')
    await expect.poll(async () => ((await pageObjects(page))[0] as unknown as GridObject).imageGrid.gap).toBe(18)
    await page.keyboard.press('Escape')

    await toolbar.getByTestId('ed-grid-layout').click()
    await page.getByTestId('ed-grid-layout-four-grid').click()
    await expect.poll(async () => ((await pageObjects(page))[0] as unknown as GridObject).imageGrid.layoutId).toBe('four-grid')
    grid = (await pageObjects(page))[0] as unknown as GridObject
    expect(grid.imageGrid.cells).toHaveLength(4)
    expect(grid.objects).toHaveLength(4)

    const second = await insertGrid(page, 'six-grid')
    await waitForObjectCount(page, 2)
    expect(second.imageGrid.layoutId).toBe('six-grid')
    expect(second.objects).toHaveLength(6)

    const saved = await getDoc(page)
    await page.evaluate((document) => localStorage.setItem('doory.harness.doc', JSON.stringify(document)), saved)
    await openEditor(page, 'doc=stored')
    const restored = (await pageObjects(page)) as unknown as GridObject[]
    expect(restored.map((item) => item.imageGrid.layoutId)).toEqual(['four-grid', 'six-grid'])
    expect(restored.map((item) => item.objects.length)).toEqual([4, 6])
    await page.evaluate(() => localStorage.removeItem('doory.harness.doc'))
  })

  test('fills and reorders cells, resizes by an edge, and consumes a canvas image in one history step', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    let grid = await insertGrid(page, 'two-columns')
    await fillFromToolbar(page, 1, 'red.png', [220, 38, 38])
    await expect.poll(async () => ((await pageObjects(page))[0] as unknown as GridObject).objects.filter((cell) => cell.type === 'image').length).toBe(1)
    await page.keyboard.press('Escape')

    grid = (await pageObjects(page))[0] as unknown as GridObject
    const first = cellCentre(grid, 'cell-1')
    const second = cellCentre(grid, 'cell-2')
    const chooser = page.waitForEvent('filechooser')
    const firstClient = await page.locator('[data-artboard]').boundingBox()
    if (!firstClient) throw new Error('artboard not found')
    const doc = await getDoc(page)
    const zoom = firstClient.width / doc.width
    await page.mouse.dblclick(firstClient.x + first.x * zoom, firstClient.y + first.y * zoom)
    await (await chooser).setFiles([])
    await drag(page, first, second)
    await expect
      .poll(async () => ((await pageObjects(page))[0] as unknown as GridObject).objects.find((cell) => cell.type === 'image')?.gridCellId)
      .toBe('cell-2')

    await page.keyboard.press('Escape')
    grid = (await pageObjects(page))[0] as unknown as GridObject
    await click(page, grid.left, grid.top)
    const beforeWidth = grid.width
    await drag(page, { x: grid.left + grid.width / 2, y: grid.top }, { x: grid.left + grid.width / 2 + 120, y: grid.top })
    await expect.poll(async () => ((await pageObjects(page))[0] as unknown as GridObject).width).toBeGreaterThan(beforeWidth + 80)
    grid = (await pageObjects(page))[0] as unknown as GridObject
    expect(grid.scaleX).toBeCloseTo(1, 5)
    expect(grid.scaleY).toBeCloseTo(1, 5)
    const filled = grid.objects.find((cell) => cell.type === 'image')
    expect(filled?.scaleX).toBeCloseTo(filled?.scaleY ?? 0, 5)

    await openTool(page, 'image')
    await page.getByTestId('image-tab-uploads').click()
    const upload = page.waitForEvent('filechooser')
    await page.getByTestId('upload-zone').click()
    await (await upload).setFiles({ name: 'blue.png', mimeType: 'image/png', buffer: pngBuffer(160, 240, [37, 99, 235]) })
    await page.getByTestId('uploaded-thumb').filter({ hasText: 'blue.png' }).click()
    await waitForObjectCount(page, 2)
    const objects = await pageObjects(page)
    grid = objects.find((object) => object.type === 'group') as unknown as GridObject
    const image = objects.find((object) => object.type === 'image')!
    await drag(page, { x: image.left as number, y: image.top as number }, cellCentre(grid, 'cell-1'))
    await waitForObjectCount(page, 1)
    await expect.poll(async () => ((await pageObjects(page))[0] as unknown as GridObject).objects.filter((cell) => cell.type === 'image').length).toBe(2)

    await page.keyboard.press('Control+z')
    await waitForObjectCount(page, 2)
    await page.keyboard.press('Control+Shift+z')
    await waitForObjectCount(page, 1)
  })

  test('drags uploaded images directly into empty and occupied grid cells', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    const grid = await insertGrid(page, 'two-columns')
    await openTool(page, 'image')
    await page.getByTestId('image-tab-uploads').click()

    await uploadPhoto(page, 'blue.png', [37, 99, 235])
    await dragUploadedToCell(page, 'blue.png', grid, 'cell-1')
    await expect.poll(async () => ((await pageObjects(page))[0] as unknown as GridObject).objects.find((cell) => cell.gridCellId === 'cell-1')?.name).toBe('blue.png')
    await waitForObjectCount(page, 1)

    await uploadPhoto(page, 'green.png', [22, 163, 74])
    await dragUploadedToCell(page, 'green.png', grid, 'cell-1')
    await expect.poll(async () => ((await pageObjects(page))[0] as unknown as GridObject).objects.find((cell) => cell.gridCellId === 'cell-1')?.name).toBe('green.png')
    await waitForObjectCount(page, 1)

    await page.keyboard.press('Control+z')
    await expect.poll(async () => ((await pageObjects(page))[0] as unknown as GridObject).objects.find((cell) => cell.gridCellId === 'cell-1')?.name).toBe('blue.png')
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(async () => ((await pageObjects(page))[0] as unknown as GridObject).objects.find((cell) => cell.gridCellId === 'cell-1')?.name).toBe('green.png')
  })
})
