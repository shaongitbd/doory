import { FabricImage, Group, Point, Rect } from 'fabric'
import { createBlankDocument } from '@/lib/document'
import type { AssetRef } from '@/types/adapter'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { installImageStub } from '../test/imageStub'
import { EditorEngine } from './editor'
import { asDory } from './objects/dory'
import { gridCellObject, imageGridSpecOf, isEmptyGridCell } from './objects/imageGrid'
import { kindOfLive } from './objects/kinds'
import { createImageGridSpec } from '../grids/model'
import { t } from '../strings'

interface TestEditor {
  engine: EditorEngine
  pageId: string
  view: NonNullable<ReturnType<EditorEngine['activeView']>>
}

const editors: EditorEngine[] = []
let restoreImages: (() => void) | null = null

async function setup(doc = createBlankDocument(800, 600)): Promise<TestEditor> {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({ adapter: handle.adapter, document: doc, meta: { id: 'd1', title: 'Grid test', mode: 'guest' }, ephemeral: true })
  editors.push(engine)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
  return { engine, pageId, view }
}

function selectedGrid(editor: TestEditor): Group {
  const selected = editor.view.selectedObjects()[0]
  expect(selected).toBeInstanceOf(Group)
  expect(kindOfLive(selected)).toBe('image-grid')
  return selected as Group
}

async function asset(engine: EditorEngine, name: string): Promise<AssetRef> {
  return engine.assets.upload(new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' }), name)
}

async function insertPhoto(editor: TestEditor, name: string, at: { x: number; y: number }): Promise<FabricImage> {
  await editor.engine.insert.imageFromAsset(await asset(editor.engine, name), at, editor.pageId)
  const photo = editor.view.selectedObjects()[0]
  expect(photo).toBeInstanceOf(FabricImage)
  return photo as FabricImage
}

beforeEach(() => {
  restoreImages = installImageStub({ width: 600, height: 300 })
  vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined)
  URL.createObjectURL = vi.fn(() => 'blob:grid-test')
})

afterEach(async () => {
  for (const engine of editors.splice(0)) engine.dispose()
  await new Promise((resolve) => setTimeout(resolve, 40))
  vi.restoreAllMocks()
  restoreImages?.()
  restoreImages = null
  document.body.innerHTML = ''
})

describe('image grids', () => {
  it('inserts a semantic group with transparent layout-owned cells', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('feature-left')

    const grid = selectedGrid(editor)
    expect(imageGridSpecOf(grid)).toMatchObject({ version: 1, layoutId: 'feature-left', gap: 8 })
    expect(grid.getObjects()).toHaveLength(3)
    for (const child of grid.getObjects()) {
      expect(child).toBeInstanceOf(Rect)
      expect(isEmptyGridCell(child)).toBe(true)
      expect(child.fill).toBe('transparent')
      expect(asDory(child).isPlaceholder).toBeUndefined()
    }
    expect(editor.engine.state.doc.pages[0].objects[0]).toMatchObject({ type: 'group', imageGrid: { layoutId: 'feature-left' } })
  })

  it('round-trips through document JSON and gives duplicates fresh object ids', async () => {
    const first = await setup()
    await first.engine.imageGrids.insert('four-grid')
    const original = selectedGrid(first)
    const originalIds = [asDory(original).id, ...original.getObjects().map((child) => asDory(child).id)]
    const saved = structuredClone(first.engine.getDocument())

    const reopened = await setup(saved)
    const restored = reopened.view.canvas.getObjects()[0]
    expect(restored).toBeInstanceOf(Group)
    expect(kindOfLive(restored)).toBe('image-grid')
    expect(imageGridSpecOf(restored)?.layoutId).toBe('four-grid')

    reopened.view.selectObjects([restored])
    reopened.engine.refreshSelection()
    await reopened.engine.arrange.duplicate()
    const duplicate = selectedGrid(reopened)
    const duplicateIds = [asDory(duplicate).id, ...duplicate.getObjects().map((child) => asDory(child).id)]
    expect(duplicateIds).toHaveLength(originalIds.length)
    expect(duplicateIds.every((id) => !!id && !originalIds.includes(id))).toBe(true)
    expect(imageGridSpecOf(duplicate)).toEqual(imageGridSpecOf(restored))
  })

  it('saves a filled grid exactly the same after every load, so a reload never rewrites it', async () => {
    const first = await setup()
    await first.engine.imageGrids.insert('three-columns')
    const grid = selectedGrid(first)
    await first.engine.imageGrids.fillCellWith(first.pageId, asDory(grid).id!, 'cell-1', await asset(first.engine, 'photo.png'))
    let saved = structuredClone(first.engine.getDocument())
    const photo = (saved.pages[0].objects[0].objects as Array<Record<string, unknown>>).find((child) => child.type === 'image')!
    // The next editors don't have the first one's upload.
    photo.src = 'https://example.test/photo.png'
    delete photo.assetId
    expect(photo.cropX).toBeGreaterThan(0)
    for (let pass = 0; pass < 3; pass++) {
      const reopened = await setup(structuredClone(saved))
      await vi.waitFor(() => expect(reopened.view.canvas.getObjects()).toHaveLength(1))
      reopened.engine.commit(reopened.pageId, { label: 'Save' })
      const next = structuredClone(reopened.engine.getDocument())
      expect(next.pages[0].objects[0].objects).toEqual(saved.pages[0].objects[0].objects)
      saved = next
    }
  })

  it('removes stale children in one go when a document with many of them is loaded', async () => {
    const first = await setup()
    await first.engine.imageGrids.insert('two-columns')
    const saved = structuredClone(first.engine.getDocument())
    const gridDoc = saved.pages[0].objects[0]
    const children = gridDoc.objects as Array<Record<string, unknown>>
    gridDoc.objects = [...children, ...Array.from({ length: 30 }, (_, i) => ({ ...children[0], id: `stale-${i}`, gridCellId: `gone-${i}` }))]
    const remove = vi.spyOn(Group.prototype, 'remove')
    const reopened = await setup(saved)
    expect((reopened.view.canvas.getObjects()[0] as Group).getObjects()).toHaveLength(2)
    expect(remove.mock.calls.filter((args) => args.length > 0)).toHaveLength(1)
  })

  it('keeps one picture in a cell when two fills overlap', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const grid = selectedGrid(editor)
    const id = asDory(grid).id!
    const [a, b] = [await asset(editor.engine, 'a.png'), await asset(editor.engine, 'b.png')]
    await Promise.all([editor.engine.imageGrids.fillCellWith(editor.pageId, id, 'cell-1', a), editor.engine.imageGrids.fillCellWith(editor.pageId, id, 'cell-1', b)])
    const cells = grid.getObjects().map((child) => asDory(child).gridCellId)
    expect(cells.sort()).toEqual(['cell-1', 'cell-2'])
    expect(new Set(grid.getObjects().map((child) => asDory(child).id)).size).toBe(2)
    expect(gridCellObject(grid, 'cell-1')).toBeInstanceOf(FabricImage)
  })

  it('asks for a picture on double-click, but not for a locked grid', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const grid = selectedGrid(editor)
    const activate = vi.spyOn(editor.engine, 'onImageGridCellActivate').mockImplementation(() => undefined)
    const c = grid.getCenterPoint()
    const click = () => editor.view.canvas.fire('mouse:dblclick', { target: grid, scenePoint: new Point(c.x - grid.width / 4, c.y) } as never)
    click()
    expect(activate).toHaveBeenCalledOnce()
    activate.mockClear()
    editor.view.canvas.discardActiveObject()
    editor.view.selectObjects([grid])
    editor.engine.arrange.toggleLock()
    click()
    expect(activate).not.toHaveBeenCalled()
  })

  it('repairs mismatched grid children and geometry when a merged document is hydrated', async () => {
    const first = await setup()
    await first.engine.imageGrids.insert('two-columns')
    const original = selectedGrid(first)
    await first.engine.imageGrids.fillCellWith(first.pageId, asDory(original).id!, 'cell-1', await asset(first.engine, 'kept.png'))
    const originalCenter = original.getCenterPoint()
    const originalPosition = { left: original.left, top: original.top }
    const saved = structuredClone(first.engine.getDocument())
    const gridDoc = saved.pages[0].objects[0]
    const children = gridDoc.objects as Array<Record<string, unknown>>
    const firstCell = structuredClone(children[0])
    const secondCell = structuredClone(children[1])
    firstCell.src = 'https://example.test/kept.png'
    firstCell.docSrc = firstCell.src
    delete firstCell.assetId
    gridDoc.imageGrid = createImageGridSpec('two-rows', 20)
    gridDoc.scaleX = 1.35
    gridDoc.scaleY = 0.7
    gridDoc.objects = [
      { ...firstCell, left: -900, top: -700, width: 3, height: 4, gridCellId: 'cell-1' },
      { ...secondCell, id: 'duplicate-cell', gridCellId: 'cell-1' },
      { ...secondCell, id: 'stale-cell', gridCellId: 'removed-cell' },
    ]

    const reopened = await setup(saved)
    const grid = reopened.view.canvas.getObjects()[0] as Group
    const cellOne = gridCellObject(grid, 'cell-1') as FabricImage
    const cellTwo = gridCellObject(grid, 'cell-2') as Rect
    expect(kindOfLive(grid)).toBe('image-grid')
    expect(grid.getObjects()).toHaveLength(2)
    expect(grid.getObjects().map((child) => asDory(child).gridCellId).sort()).toEqual(['cell-1', 'cell-2'])
    expect(new Set(grid.getObjects().map((child) => asDory(child).id)).size).toBe(2)
    expect(cellOne).toBeInstanceOf(FabricImage)
    expect(grid.getCenterPoint().x).toBeCloseTo(originalCenter.x)
    expect(grid.getCenterPoint().y).toBeCloseTo(originalCenter.y)
    expect(grid.left).toBeCloseTo(originalPosition.left)
    expect(grid.top).toBeCloseTo(originalPosition.top)
    expect(grid.scaleX).toBe(1)
    expect(grid.scaleY).toBe(1)
    expect(cellOne.scaleX).toBeCloseTo(cellOne.scaleY)
    expect(cellOne.getScaledWidth()).toBeCloseTo(grid.width)
    expect(cellTwo.width).toBeCloseTo(grid.width)
    expect(cellOne.getScaledHeight()).toBeCloseTo((grid.height - 20) / 2)
    expect(cellTwo.height).toBeCloseTo((grid.height - 20) / 2)
    expect(cellOne.selectable).toBe(false)
    expect(cellTwo.evented).toBe(false)
  })

  it('fills and replaces a cell while retaining its stable cell identity', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const grid = selectedGrid(editor)
    const gridId = asDory(grid).id!
    const emptyId = asDory(gridCellObject(grid, 'cell-1')!).id

    await editor.engine.imageGrids.fillCellWith(editor.pageId, gridId, 'cell-1', await asset(editor.engine, 'first.png'))
    const first = gridCellObject(grid, 'cell-1')
    expect(first).toBeInstanceOf(FabricImage)
    expect(asDory(first!).id).toBe(emptyId)
    expect(asDory(first!).docSrc).toContain('idb://')
    expect((first as FabricImage).scaleX).toBeCloseTo((first as FabricImage).scaleY)

    await editor.engine.imageGrids.fillCellWith(editor.pageId, gridId, 'cell-1', await asset(editor.engine, 'replacement.png'))
    const replacement = gridCellObject(grid, 'cell-1')
    expect(replacement).toBeInstanceOf(FabricImage)
    expect(asDory(replacement!).id).toBe(emptyId)
    expect(asDory(replacement!).name).toBe('replacement.png')
    expect(grid.getObjects()).toHaveLength(2)
  })

  it('hit-tests the topmost unlocked visible cell for an image dragged from the asset library', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const lowerGrid = selectedGrid(editor)
    await editor.engine.imageGrids.insert('two-columns')
    const upperGrid = selectedGrid(editor)
    const point = { x: upperGrid.left - upperGrid.width / 4, y: upperGrid.top }

    expect(editor.view.setImageAssetDrop(point)).toEqual({ gridId: asDory(upperGrid).id, gridCellId: 'cell-1' })
    expect(editor.view.setImageAssetDrop(null)).toBeNull()

    upperGrid.visible = false
    expect(editor.view.setImageAssetDrop(point)).toEqual({ gridId: asDory(lowerGrid).id, gridCellId: 'cell-1' })
    asDory(lowerGrid).locked = true
    expect(editor.view.setImageAssetDrop(point)).toBeNull()

    asDory(lowerGrid).locked = false
    editor.engine.setLiveReadOnly(true)
    expect(editor.view.setImageAssetDrop(point)).toBeNull()
  })

  it('changes layouts when removed cells are empty, refuses image loss and applies gaps', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const grid = selectedGrid(editor)

    await editor.engine.imageGrids.setLayout('feature-left')
    expect(imageGridSpecOf(grid)?.layoutId).toBe('feature-left')
    expect(grid.getObjects()).toHaveLength(3)

    await editor.engine.imageGrids.setLayout('two-rows')
    expect(imageGridSpecOf(grid)?.layoutId).toBe('two-rows')
    expect(grid.getObjects()).toHaveLength(2)

    await editor.engine.imageGrids.setLayout('feature-left')
    await editor.engine.imageGrids.fillCellWith(editor.pageId, asDory(grid).id!, 'cell-3', await asset(editor.engine, 'third.png'))
    await editor.engine.imageGrids.setLayout('two-rows')
    expect(imageGridSpecOf(grid)?.layoutId).toBe('feature-left')
    expect(grid.getObjects()).toHaveLength(3)

    await editor.engine.imageGrids.setGap(24)
    expect(imageGridSpecOf(grid)?.gap).toBe(24)
    expect(grid.scaleX).toBeCloseTo(1)
    expect(grid.scaleY).toBeCloseTo(1)
  })

  it('bakes independent size changes and keeps every photo uniformly scaled', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const grid = selectedGrid(editor)
    await editor.engine.imageGrids.fillCellWith(editor.pageId, asDory(grid).id!, 'cell-1', await asset(editor.engine, 'wide.png'))

    editor.engine.arrange.setSize(500, 180)
    const photo = gridCellObject(grid, 'cell-1') as FabricImage
    expect(grid.width).toBeCloseTo(500)
    expect(grid.height).toBeCloseTo(180)
    expect(grid.scaleX).toBeCloseTo(1)
    expect(grid.scaleY).toBeCloseTo(1)
    expect(photo.scaleX).toBeCloseTo(photo.scaleY)
    expect(photo.getScaledWidth()).toBeCloseTo(246)
    expect(photo.getScaledHeight()).toBeCloseTo(180)
  })

  it('swaps image content and clears a cell without creating exportable placeholders', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const grid = selectedGrid(editor)
    const gridId = asDory(grid).id!
    await editor.engine.imageGrids.fillCellWith(editor.pageId, gridId, 'cell-1', await asset(editor.engine, 'one.png'))
    await editor.engine.imageGrids.fillCellWith(editor.pageId, gridId, 'cell-2', await asset(editor.engine, 'two.png'))
    const one = asDory(gridCellObject(grid, 'cell-1')!).docSrc
    const two = asDory(gridCellObject(grid, 'cell-2')!).docSrc

    editor.engine.imageGrids.swapCells(editor.pageId, gridId, 'cell-1', 'cell-2')
    expect(asDory(gridCellObject(grid, 'cell-1')!).docSrc).toBe(two)
    expect(asDory(gridCellObject(grid, 'cell-2')!).docSrc).toBe(one)

    await editor.engine.imageGrids.clearCell('cell-2')
    const empty = gridCellObject(grid, 'cell-2')
    expect(empty).toBeInstanceOf(Rect)
    expect(empty?.fill).toBe('transparent')
    expect(asDory(empty!).isPlaceholder).toBeUndefined()
    const storedChildren = editor.engine.state.doc.pages[0].objects[0].objects as Array<Record<string, unknown>>
    expect(storedChildren.find((child) => child.gridCellId === 'cell-2')).toMatchObject({ fill: 'transparent' })
    expect(storedChildren.some((child) => child.isPlaceholder === true)).toBe(false)
  })

  it('moves a canvas image into an empty cell and restores it through undo and redo', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const grid = selectedGrid(editor)
    const gridId = asDory(grid).id!
    const photo = await insertPhoto(editor, 'source.png', { x: 160, y: 140 })
    const photoId = asDory(photo).id!
    const center = photo.getCenterPoint()
    const frame = {
      center: { x: center.x, y: center.y },
      width: photo.getScaledWidth(),
      height: photo.getScaledHeight(),
      angle: photo.angle || 0,
      flipX: photo.flipX,
      flipY: photo.flipY,
    }

    editor.engine.imageGrids.consumeCanvasImage(editor.pageId, photoId, gridId, 'cell-1', frame)
    expect(editor.view.canvas.getObjects()).toEqual([grid])
    expect(gridCellObject(grid, 'cell-1')).toBe(photo)
    expect(asDory(photo).gridCellId).toBe('cell-1')

    await editor.engine.undo()
    const restoredGrid = editor.view.getById(gridId) as Group
    const restoredPhoto = editor.view.getById(photoId) as FabricImage
    expect(restoredGrid).toBeInstanceOf(Group)
    expect(restoredPhoto).toBeInstanceOf(FabricImage)
    expect(isEmptyGridCell(gridCellObject(restoredGrid, 'cell-1'))).toBe(true)
    expect(restoredPhoto.getCenterPoint().x).toBeCloseTo(frame.center.x)
    expect(restoredPhoto.getCenterPoint().y).toBeCloseTo(frame.center.y)

    await editor.engine.redo()
    const redoneGrid = editor.view.getById(gridId) as Group
    expect(editor.view.getById(photoId)).toBeUndefined()
    expect(asDory(gridCellObject(redoneGrid, 'cell-1')!).id).toBe(photoId)
  })

  it('returns an occupied cell photo to the source frame when a canvas image replaces it', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const grid = selectedGrid(editor)
    const gridId = asDory(grid).id!
    await editor.engine.imageGrids.fillCellWith(editor.pageId, gridId, 'cell-1', await asset(editor.engine, 'displaced.png'))
    const displaced = gridCellObject(grid, 'cell-1') as FabricImage
    const displacedId = asDory(displaced).id!
    const source = await insertPhoto(editor, 'replacement.png', { x: 180, y: 150 })
    const sourceId = asDory(source).id!
    const center = source.getCenterPoint()
    const frame = {
      center: { x: center.x, y: center.y },
      width: source.getScaledWidth(),
      height: source.getScaledHeight(),
      angle: source.angle || 0,
      flipX: source.flipX,
      flipY: source.flipY,
    }

    editor.engine.imageGrids.consumeCanvasImage(editor.pageId, sourceId, gridId, 'cell-1', frame)

    expect(gridCellObject(grid, 'cell-1')).toBe(source)
    expect(asDory(source).gridCellId).toBe('cell-1')
    expect(editor.view.getById(displacedId)).toBe(displaced)
    expect(asDory(displaced).gridCellId).toBeUndefined()
    expect(displaced.getCenterPoint().x).toBeCloseTo(frame.center.x)
    expect(displaced.getCenterPoint().y).toBeCloseTo(frame.center.y)
    expect(displaced.getScaledWidth()).toBeCloseTo(frame.width)
    expect(displaced.getScaledHeight()).toBeCloseTo(frame.height)
  })

  it('does not consume specialised or masked canvas images', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const grid = selectedGrid(editor)
    const gridId = asDory(grid).id!
    const source = await insertPhoto(editor, 'source.png', { x: 180, y: 150 })
    const sourceId = asDory(source).id!
    const center = source.getCenterPoint()
    const frame = {
      center: { x: center.x, y: center.y },
      width: source.getScaledWidth(),
      height: source.getScaledHeight(),
      angle: 0,
      flipX: false,
      flipY: false,
    }

    asDory(source).qr = { text: 'https://example.com', fg: '#000000', bg: '#ffffff' }
    editor.engine.imageGrids.consumeCanvasImage(editor.pageId, sourceId, gridId, 'cell-1', frame)
    expect(editor.view.getById(sourceId)).toBe(source)
    expect(isEmptyGridCell(gridCellObject(grid, 'cell-1'))).toBe(true)

    delete asDory(source).qr
    asDory(source).maskShape = 'circle'
    editor.engine.imageGrids.consumeCanvasImage(editor.pageId, sourceId, gridId, 'cell-1', frame)
    expect(editor.view.getById(sourceId)).toBe(source)
    expect(isEmptyGridCell(gridCellObject(grid, 'cell-1'))).toBe(true)
  })

  it('keeps animated canvas images outside grids without adding a history step', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const grid = selectedGrid(editor)
    const gridId = asDory(grid).id!
    const source = await insertPhoto(editor, 'animated.png', { x: 180, y: 150 })
    const sourceId = asDory(source).id!
    editor.engine.animation.setPreset('enter', 'fade', [sourceId])
    const before = structuredClone(editor.engine.getDocument())
    const toast = vi.spyOn(editor.engine, 'toast')
    const center = source.getCenterPoint()
    const frame = {
      center: { x: center.x, y: center.y },
      width: source.getScaledWidth(),
      height: source.getScaledHeight(),
      angle: source.angle || 0,
      flipX: source.flipX,
      flipY: source.flipY,
    }

    source.set({
      scaleX: source.scaleX * 0.6,
      scaleY: source.scaleY * 1.4,
      angle: 47,
      flipX: !frame.flipX,
      flipY: !frame.flipY,
    })
    source.setPositionByOrigin(new Point(center.x + 240, center.y + 160), 'center', 'center')
    source.setCoords()
    editor.engine.refreshSelection()

    editor.engine.imageGrids.consumeCanvasImage(editor.pageId, sourceId, gridId, 'cell-1', frame)

    expect(editor.engine.getDocument()).toEqual(before)
    expect(editor.view.getById(sourceId)).toBe(source)
    expect(source.getCenterPoint().x).toBeCloseTo(frame.center.x)
    expect(source.getCenterPoint().y).toBeCloseTo(frame.center.y)
    expect(source.getScaledWidth()).toBeCloseTo(frame.width)
    expect(source.getScaledHeight()).toBeCloseTo(frame.height)
    expect(source.angle).toBe(frame.angle)
    expect(source.flipX).toBe(frame.flipX)
    expect(source.flipY).toBe(frame.flipY)
    expect(editor.engine.state.selection.bounds?.x).toBeCloseTo(frame.center.x - frame.width / 2)
    expect(editor.engine.state.selection.bounds?.y).toBeCloseTo(frame.center.y - frame.height / 2)
    expect(editor.engine.state.selection.bounds?.width).toBeCloseTo(frame.width)
    expect(editor.engine.state.selection.bounds?.height).toBeCloseTo(frame.height)
    expect(editor.engine.state.selection.bounds?.angle).toBe(frame.angle)
    expect(isEmptyGridCell(gridCellObject(grid, 'cell-1'))).toBe(true)
    expect(toast).toHaveBeenCalledWith(t.imageGrid.animatedImageDisabled)

    await editor.engine.undo()
    const restoredSource = editor.view.getById(sourceId)
    expect(restoredSource).toBeInstanceOf(FabricImage)
    expect(asDory(restoredSource!).animation).toBeUndefined()
  })

  it('leaves grids unchanged when the editor is read-only', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('feature-left')
    const grid = selectedGrid(editor)
    const gridId = asDory(grid).id!
    editor.engine.setLiveReadOnly(true)

    await editor.engine.imageGrids.setGap(24)
    await editor.engine.imageGrids.setLayout('two-columns')
    editor.engine.imageGrids.swapCells(editor.pageId, gridId, 'cell-1', 'cell-2')

    expect(imageGridSpecOf(grid)).toMatchObject({ layoutId: 'feature-left', gap: 8 })
    expect(grid.getObjects()).toHaveLength(3)
  })
})
