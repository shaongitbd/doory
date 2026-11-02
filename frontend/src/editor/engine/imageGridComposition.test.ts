import { ActiveSelection, Group } from 'fabric'
import { createBlankDocument } from '@/lib/document'
import { commands, isCommandEnabled } from '../commands'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import '../builtins/commands'
import { EditorEngine } from './editor'
import { isImageGrid } from './objects/imageGrid'

interface TestEditor {
  engine: EditorEngine
  view: NonNullable<ReturnType<EditorEngine['activeView']>>
}

const editors: EditorEngine[] = []

async function setup(): Promise<TestEditor> {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({
    adapter: handle.adapter,
    document: createBlankDocument(800, 600),
    meta: { id: 'd1', title: 'Grid composition test', mode: 'guest' },
    ephemeral: true,
  })
  editors.push(engine)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
  return { engine, view }
}

async function selectGridAndShape(editor: TestEditor): Promise<{ grid: Group; selection: ActiveSelection }> {
  await editor.engine.imageGrids.insert('two-columns')
  const grid = editor.view.selectedObjects()[0]
  expect(grid).toBeInstanceOf(Group)
  expect(isImageGrid(grid)).toBe(true)
  await editor.engine.insert.shape('rect')
  const shape = editor.view.selectedObjects()[0]
  editor.view.selectObjects([grid, shape])
  editor.engine.refreshSelection()
  const selection = editor.view.canvas.getActiveObject()
  expect(selection).toBeInstanceOf(ActiveSelection)
  return { grid: grid as Group, selection: selection as ActiveSelection }
}

afterEach(() => {
  for (const engine of editors.splice(0)) engine.dispose()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('image grid composition', () => {
  it('keeps grids top-level when grouping is requested through the command or API', async () => {
    const editor = await setup()
    const { grid } = await selectGridAndShape(editor)
    const groupCommand = commands.get('edit.group')

    expect(groupCommand).toBeDefined()
    expect(isCommandEnabled(groupCommand!, { editor: editor.engine, state: editor.engine.state })).toBe(false)

    editor.engine.arrange.group()
    expect(editor.view.canvas.getObjects()).toHaveLength(2)
    expect(editor.view.canvas.getObjects()).toContain(grid)

    editor.view.selectObjects([grid])
    editor.engine.arrange.ungroup()
    expect(editor.view.canvas.getObjects()).toHaveLength(2)
    expect(isImageGrid(editor.view.canvas.getObjects()[0])).toBe(true)
  })

  it('rejects grouping a legacy group that contains an image grid', async () => {
    const editor = await setup()
    await editor.engine.imageGrids.insert('two-columns')
    const grid = editor.view.selectedObjects()[0]
    await editor.engine.insert.shape('rect')
    const nestedShape = editor.view.selectedObjects()[0]
    const canvas = editor.view.canvas

    canvas.discardActiveObject()
    canvas.remove(grid, nestedShape)
    const legacyGroup = new Group([grid, nestedShape])
    editor.view.configure(legacyGroup)
    canvas.add(legacyGroup)

    await editor.engine.insert.shape('rect')
    const outsideShape = editor.view.selectedObjects()[0]
    editor.view.selectObjects([legacyGroup, outsideShape])

    editor.engine.arrange.group()

    expect(canvas.getObjects()).toHaveLength(2)
    expect(canvas.getObjects()).toContain(legacyGroup)
    expect(legacyGroup.getObjects()).toContain(grid)
  })

  it('normalizes a grid after numeric resizing of a multi-selection', async () => {
    const editor = await setup()
    const { grid, selection } = await selectGridAndShape(editor)
    const before = { width: grid.width, height: grid.height }
    const bounds = selection.getBoundingRect()

    editor.engine.arrange.setSize(bounds.width * 1.4, bounds.height * 0.6)

    expect(grid.scaleX).toBeCloseTo(1)
    expect(grid.scaleY).toBeCloseTo(1)
    expect(grid.width).not.toBeCloseTo(before.width)
    expect(grid.height).not.toBeCloseTo(before.height)
    for (const child of grid.getObjects()) {
      expect(child.scaleX).toBeCloseTo(1)
      expect(child.scaleY).toBeCloseTo(1)
    }
  })

  it('normalizes a grid after resizing a multi-selection on the canvas', async () => {
    const editor = await setup()
    const { grid, selection } = await selectGridAndShape(editor)
    const before = { width: grid.width, height: grid.height }

    selection.set({ scaleX: 1.35, scaleY: 0.65 })
    selection.setCoords()
    editor.view.canvas.fire('object:modified', { target: selection } as never)

    expect(grid.scaleX).toBeCloseTo(1)
    expect(grid.scaleY).toBeCloseTo(1)
    expect(grid.width).not.toBeCloseTo(before.width)
    expect(grid.height).not.toBeCloseTo(before.height)
    for (const child of grid.getObjects()) {
      expect(child.scaleX).toBeCloseTo(1)
      expect(child.scaleY).toBeCloseTo(1)
    }
  })
})
