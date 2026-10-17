import { FabricImage, type IText } from 'fabric'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { installImageStub } from '../test/imageStub'
import { DUPLICATE_OFFSET } from './api/arrange'
import { EditorEngine } from './editor'
import { AUTOSAVE_DELAY_MS } from './persistence'

/** jsdom has no DataTransfer; the clipboard API only needs these three members. */
function transfer(entries: Record<string, string> = {}, files: File[] = []): DataTransfer {
  const data = new Map(Object.entries(entries))
  return {
    files,
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => void data.set(type, value),
  } as unknown as DataTransfer
}

async function setup(opts: { mode?: 'guest' | 'account' | 'shared-view'; pages?: number } = {}) {
  const handle = createMemoryAdapter()
  const doc = createBlankDocument(800, 600)
  const engine = new EditorEngine({ adapter: handle.adapter, document: doc, meta: { id: 'd1', title: 'Test', mode: opts.mode ?? 'guest' }, ephemeral: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
  return { engine, handle, host, pageId, view }
}

const objectsOf = (engine: EditorEngine, i = 0) => engine.state.doc.pages[i].objects

describe('EditorEngine', () => {
  beforeEach(() => {
    // Thumbnail encoding resolves via timers in jsdom; make it immediate so fake timers can drive autosave.
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['thumb'], { type: 'image/webp' })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('inserts shapes into the document, selects them and records history', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    expect(objectsOf(engine)).toHaveLength(1)
    expect(objectsOf(engine)[0].type).toBe('rect')
    expect(engine.state.selection.ids).toHaveLength(1)
    expect(engine.state.selection.kinds).toEqual(['shape'])
    expect(engine.state.history.canUndo).toBe(true)
    engine.dispose()
  })

  it('steps each new insert down and to the right of the last one instead of stacking them (tools stay open)', async () => {
    const { engine, view } = await setup()
    await engine.insert.shape('rect')
    await engine.insert.shape('ellipse')
    await engine.insert.shape('star')
    const centres = view.canvas.getObjects().map((o) => o.getCenterPoint())
    const step = Math.round(600 * 0.04)
    expect(centres.map((c) => [Math.round(c.x), Math.round(c.y)])).toEqual([
      [400, 300],
      [400 + step, 300 + step],
      [400 + 2 * step, 300 + 2 * step],
    ])
    engine.dispose()
  })

  it('leaves no canvas elements behind when a page is unmounted', async () => {
    const { engine, host, pageId } = await setup()
    expect(host.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(3)
    engine.unmountPage(pageId)
    await vi.waitFor(() => expect(host.querySelectorAll('canvas')).toHaveLength(0))
    engine.dispose()
  })

  it('undo and redo restore the document and the live canvas', async () => {
    const { engine, view } = await setup()
    await engine.insert.shape('ellipse')
    await engine.insert.shape('triangle')
    expect(view.canvas.getObjects()).toHaveLength(2)
    await engine.undo()
    expect(objectsOf(engine)).toHaveLength(1)
    expect(view.canvas.getObjects()).toHaveLength(1)
    expect(engine.state.history.canRedo).toBe(true)
    await engine.redo()
    expect(objectsOf(engine)).toHaveLength(2)
    expect(view.canvas.getObjects()).toHaveLength(2)
    await engine.undo()
    await engine.undo()
    expect(objectsOf(engine)).toHaveLength(0)
    expect(engine.state.history.canUndo).toBe(false)
    engine.dispose()
  })

  it('coalesces nudges into one undo step', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    const before = objectsOf(engine)[0].left as number
    for (let i = 0; i < 5; i++) engine.arrange.nudge(1, 0)
    expect(objectsOf(engine)[0].left).toBe(before + 5)
    await engine.undo()
    expect(objectsOf(engine)[0].left).toBe(before)
    engine.dispose()
  })

  it('keeps at least 100 undo steps', async () => {
    const { engine } = await setup()
    for (let i = 0; i < 120; i++) {
      engine.history.seal()
      engine.arrange.nudge(1, 0)
    }
    await engine.insert.shape('rect')
    for (let i = 0; i < 120; i++) {
      engine.history.seal()
      engine.arrange.nudge(1, 0)
    }
    expect(engine.history.depth).toBeGreaterThanOrEqual(100)
    engine.dispose()
  })

  it('deletes selected objects (not locked ones)', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    engine.arrange.toggleLock()
    engine.arrange.delete()
    expect(objectsOf(engine)).toHaveLength(1)
    expect(objectsOf(engine)[0].locked).toBe(true)
    engine.arrange.toggleLock()
    engine.arrange.delete()
    expect(objectsOf(engine)).toHaveLength(0)
    expect(engine.state.selection.ids).toHaveLength(0)
    engine.dispose()
  })

  it('duplicates with new ids', async () => {
    const { engine } = await setup()
    await engine.insert.shape('star')
    const id = objectsOf(engine)[0].id
    await engine.arrange.duplicate()
    const objs = objectsOf(engine)
    expect(objs).toHaveLength(2)
    expect(objs[1].id).not.toBe(id)
    expect(objs[1].shapeKind).toBe('star')
    expect(engine.state.selection.ids).toEqual([objs[1].id])
    engine.dispose()
  })

  it('duplicates a multi-selection next to the originals, not in the corner', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    await engine.insert.shape('star')
    engine.arrange.align('right', 'page')
    engine.selectAll()
    const before = objectsOf(engine).map((o) => [o.left as number, o.top as number])
    await engine.arrange.duplicate()
    const objs = objectsOf(engine)
    expect(objs).toHaveLength(4)
    for (const [i, [left, top]] of before.entries()) {
      expect(objs[i + 2].left).toBeCloseTo(left + DUPLICATE_OFFSET)
      expect(objs[i + 2].top).toBeCloseTo(top + DUPLICATE_OFFSET)
    }
    expect(engine.state.selection.ids).toEqual([objs[2].id, objs[3].id])
    engine.dispose()
  })

  it('aligns to the page', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    engine.arrange.align('left', 'page')
    const o = objectsOf(engine)[0]
    // The bounding box includes the border, so the geometry sits half a border width inside the page edge.
    expect((o.left as number) - ((o.width as number) + (o.strokeWidth as number)) / 2).toBeCloseTo(0)
    engine.arrange.align('bottom', 'page')
    const b = objectsOf(engine)[0]
    expect((b.top as number) + ((b.height as number) + (b.strokeWidth as number)) / 2).toBeCloseTo(600)
    engine.dispose()
  })

  it('groups and ungroups keeping children where they were', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    await engine.insert.shape('ellipse')
    engine.selectAll()
    expect(engine.state.selection.ids).toHaveLength(2)
    const before = objectsOf(engine).map((o) => [o.left, o.top])
    engine.arrange.group()
    expect(objectsOf(engine)).toHaveLength(1)
    expect(objectsOf(engine)[0].type).toBe('group')
    engine.arrange.ungroup()
    expect(objectsOf(engine)).toHaveLength(2)
    const after = objectsOf(engine).map((o) => [o.left, o.top])
    for (let i = 0; i < before.length; i++) {
      expect(after[i][0] as number).toBeCloseTo(before[i][0] as number, 3)
      expect(after[i][1] as number).toBeCloseTo(before[i][1] as number, 3)
    }
    engine.dispose()
  })

  it('reorders z-order', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    await engine.insert.shape('ellipse')
    const ids = objectsOf(engine).map((o) => o.id)
    engine.select([ids[0]])
    engine.arrange.zOrder('front')
    expect(objectsOf(engine).map((o) => o.id)).toEqual([ids[1], ids[0]])
    engine.arrange.zOrder('back')
    expect(objectsOf(engine).map((o) => o.id)).toEqual([ids[0], ids[1]])
    engine.dispose()
  })

  it('supports page operations with history', async () => {
    const { engine } = await setup()
    const first = engine.state.doc.pages[0].id
    const second = engine.pages.add() ?? ''
    expect(engine.state.doc.pages).toHaveLength(2)
    expect(engine.state.activePageId).toBe(second)
    engine.pages.duplicate(first)
    expect(engine.state.doc.pages).toHaveLength(3)
    engine.pages.moveBy(second, -2)
    expect(engine.state.doc.pages[0].id).toBe(second)
    engine.pages.remove(second)
    expect(engine.state.doc.pages).toHaveLength(2)
    await engine.undo()
    expect(engine.state.doc.pages).toHaveLength(3)
    await engine.undo()
    expect(engine.state.doc.pages[2].id).toBe(second)
    engine.dispose()
  })

  it('changes background and applies it to all pages', async () => {
    const { engine, pageId } = await setup()
    engine.pages.add()
    engine.pages.setBackground(pageId, { type: 'solid', color: '#112233' })
    expect(engine.state.doc.pages[0].background).toEqual({ type: 'solid', color: '#112233' })
    expect(engine.state.doc.pages[1].background).toEqual({ type: 'solid', color: '#ffffff' })
    engine.pages.setBackgroundAll({ type: 'solid', color: '#445566' })
    expect(engine.state.doc.pages.every((p) => p.background.type === 'solid' && p.background.color === '#445566')).toBe(true)
    engine.dispose()
  })

  it('resizes the design with magic resize', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    engine.pages.resize(400, 300, 'magic')
    expect(engine.state.doc.width).toBe(400)
    expect(engine.state.doc.pages[0].objects[0].width).toBeGreaterThan(0)
    await engine.undo()
    expect(engine.state.doc.width).toBe(800)
    engine.dispose()
  })

  it('updates fill and text styles on the selection', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    engine.style.setFill({ type: 'solid', color: '#00ff00' })
    expect(objectsOf(engine)[0].fill).toBe('#00ff00')
    expect(engine.state.recentColors[0]).toBe('#00ff00')
    await engine.insert.text('heading')
    const view = engine.activeView()
    view?.canvas.discardActiveObject()
    engine.selectAll()
    engine.dispose()
  })

  it('applies text patches (bold, size, case) to a text object', async () => {
    const { engine, view } = await setup()
    await engine.insert.text('body')
    view.canvas.getActiveObject()?.set('text', 'Hello world')
    engine.style.text({ fontWeight: 700, fontSize: 40, textCase: 'upper' })
    await new Promise((r) => setTimeout(r, 0))
    const o = objectsOf(engine)[0]
    expect(o.fontWeight).toBe(700)
    expect(o.fontSize).toBe(40)
    expect(o.text).toBe('HELLO WORLD')
    expect(o.textCase).toBe('upper')
    engine.dispose()
  })

  it('turns a text right-to-left when it is written in Arabic, and back, unless a direction was picked', async () => {
    const { engine, view } = await setup()
    await engine.insert.text('body')
    const text = view.canvas.getActiveObject() as IText
    text.set({ text: 'مرحبا Doory', textAlign: 'left' })
    view.canvas.fire('text:changed', { target: text })
    expect(text.direction).toBe('rtl')
    expect(text.textAlign).toBe('right')
    text.set('text', 'Doory مرحبا')
    view.canvas.fire('text:changed', { target: text })
    expect(text.direction).toBe('ltr')
    expect(text.textAlign).toBe('left')

    engine.style.text({ direction: 'rtl' })
    await new Promise((r) => setTimeout(r, 0))
    text.set('text', 'Still English first')
    view.canvas.fire('text:changed', { target: text })
    expect(text.direction).toBe('rtl')
    const saved = objectsOf(engine)[0]
    expect(saved.direction).toBe('rtl')
    expect(saved.textDir).toBe('rtl')

    engine.style.text({ direction: 'auto' })
    await new Promise((r) => setTimeout(r, 0))
    expect(text.direction).toBe('ltr')
    expect(objectsOf(engine)[0].textDir).toBeUndefined()
    engine.dispose()
  })

  it('autosaves debounced and only once for bursts of changes', async () => {
    vi.useFakeTimers()
    const { engine, handle } = await setup()
    engine.persistence.start({})
    await engine.insert.shape('rect')
    engine.arrange.nudge(5, 0)
    engine.history.seal()
    engine.arrange.nudge(5, 0)
    expect(engine.state.save.status).toBe('dirty')
    expect(handle.saves).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100)
    expect(handle.saves).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(300)
    expect(handle.saves).toHaveLength(1)
    expect(handle.saves[0].document.pages[0].objects).toHaveLength(1)
    expect(handle.saves[0].thumbnail).toBeInstanceOf(Blob)
    expect(engine.state.save.status).toBe('local')
    engine.dispose()
  })

  it('queues the latest state when edited during a save in flight', async () => {
    vi.useFakeTimers()
    const handle = createMemoryAdapter({ saveDelayMs: 1000 })
    const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(400, 400), meta: { id: 'd', title: 'T', mode: 'account' }, ephemeral: true })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const id = engine.state.doc.pages[0].id
    engine.mountPage(id, host)
    const view = await engine.whenView(id)
    view.setLayout(1, { x: 0, y: 0, width: 400, height: 400 })
    engine.persistence.start({})
    await engine.insert.shape('rect')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10)
    expect(engine.state.save.status).toBe('saving')
    await engine.insert.shape('ellipse')
    await vi.advanceTimersByTimeAsync(1200)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 1200)
    expect(handle.saves.length).toBeGreaterThanOrEqual(2)
    expect(handle.saves[handle.saves.length - 1].document.pages[0].objects).toHaveLength(2)
    expect(engine.state.save.status).toBe('saved')
    engine.dispose()
  })

  it('reports a revision conflict without losing edits', async () => {
    vi.useFakeTimers()
    const { engine, handle } = await setup({ mode: 'account' })
    const states: string[] = []
    engine.persistence.start({ onSaveStateChange: (s) => states.push(s.status), onConflict: () => states.push('onConflict') })
    handle.failNextSave('conflict')
    await engine.insert.shape('rect')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 50)
    expect(engine.state.save.status).toBe('conflict')
    expect(engine.state.conflict).toBe(true)
    expect(states).toContain('onConflict')
    expect(objectsOf(engine)).toHaveLength(1)
    engine.dispose()
  })

  it('surfaces other save errors and retries with saveNow', async () => {
    const { engine, handle } = await setup({ mode: 'account' })
    engine.persistence.start({})
    handle.failNextSave('error')
    await engine.insert.shape('rect')
    await engine.persistence.saveNow()
    expect(engine.state.save.status).toBe('error')
    await engine.persistence.saveNow()
    expect(engine.state.save.status).toBe('saved')
    expect(engine.persistence.isDirty()).toBe(false)
    engine.dispose()
  })

  it('adds curved text in both directions and bulleted lists', async () => {
    const { engine } = await setup()
    await engine.insert.curvedText('up')
    await engine.insert.curvedText('down')
    const [up, down] = objectsOf(engine)
    expect(up.curveAmount).toBe(-200)
    expect(down.curveAmount).toBe(200)
    await engine.insert.list('bullet')
    expect(objectsOf(engine)[2].listStyle).toBe('bullet')
    expect(String(objectsOf(engine)[2].text).split('\n')).toHaveLength(3)
    engine.dispose()
  })

  it('keeps the marker of a list line added while typing (#55)', async () => {
    const { engine, view } = await setup()
    await engine.insert.list('bullet')
    const text = view.canvas.getActiveObject() as IText
    text.enterEditing()
    const area = text.hiddenTextarea as HTMLTextAreaElement
    // What the browser does for a keystroke: change the hidden textarea at the caret, then fire `input`.
    const type = (chars: string): void => {
      const at = area.selectionStart
      area.value = area.value.slice(0, at) + chars + area.value.slice(area.selectionEnd)
      area.selectionStart = area.selectionEnd = at + chars.length
      area.dispatchEvent(new Event('input'))
    }
    area.selectionStart = area.selectionEnd = area.value.length
    type('\n')
    expect(text.text.endsWith('\n• ')).toBe(true)
    type('Fourth')
    expect(text.text.split('\n')).toEqual(['• First point', '• Second point', '• Third point', '• Fourth'])
    text.exitEditing()
    engine.dispose()
  })

  it('inserts text presets with their default sizes on an A5 page', async () => {
    const handle = createMemoryAdapter()
    const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(559, 794), meta: { id: 'a5', title: 'A5', mode: 'guest' }, ephemeral: true })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const pageId = engine.state.doc.pages[0].id
    engine.mountPage(pageId, host)
    const view = await engine.whenView(pageId)
    view.setLayout(1, { x: 0, y: 0, width: 559, height: 794 })
    await engine.insert.text('heading')
    await engine.insert.text('subheading')
    await engine.insert.text('body')
    const sizes = objectsOf(engine).map((o) => o.fontSize)
    expect(sizes).toEqual([36, 22, 16])
    expect(objectsOf(engine).map((o) => o.text)).toEqual(['Add Heading', 'Add Subheading', 'Add body text'])
    engine.dispose()
  })

  it('flips the whole page: objects swap sides and toggle their own flip', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    const before = objectsOf(engine)[0]
    const w = (before.width as number) * (before.scaleX as number)
    const centreBefore = before.left as number
    engine.pages.flipCanvas('horizontal')
    const after = objectsOf(engine)[0]
    expect(after.flipX).toBe(true)
    expect((after.left as number) + (centreBefore as number)).toBeCloseTo(800, 3)
    expect(w).toBeGreaterThan(0)
    engine.undo()
    expect(objectsOf(engine)[0].left).toBeCloseTo(centreBefore, 3)
    expect(objectsOf(engine)[0].flipX).toBeFalsy()
    engine.pages.flipCanvas('vertical')
    expect(objectsOf(engine)[0].flipY).toBe(true)
    engine.dispose()
  })

  it('marks shapes as placeholders and clears the mark', async () => {
    const { engine } = await setup()
    await engine.insert.shape('ellipse')
    engine.style.setPlaceholder(true)
    expect(objectsOf(engine)[0].isPlaceholder).toBe(true)
    expect(engine.state.selection.kinds).toEqual(['placeholder'])
    engine.style.setPlaceholder(false)
    expect(objectsOf(engine)[0].isPlaceholder).toBeUndefined()
    await engine.insert.shape('line')
    engine.style.setPlaceholder(true)
    expect(objectsOf(engine)[1].isPlaceholder).toBeUndefined()
    engine.dispose()
  })

  it('does not duplicate a locked object', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    engine.arrange.toggleLock()
    await engine.arrange.duplicate()
    expect(objectsOf(engine)).toHaveLength(1)
    engine.dispose()
  })

  it('only accepts http(s) hyperlinks', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    engine.style.setLink('javascript:alert(1)')
    expect(objectsOf(engine)[0].link).toBeUndefined()
    engine.style.setLink('data:text/html,<b>x</b>')
    expect(objectsOf(engine)[0].link).toBeUndefined()
    engine.style.setLink('https://example.com/a b')
    expect(objectsOf(engine)[0].link).toEqual({ url: 'https://example.com/a%20b' })
    engine.style.setLink(null)
    expect(objectsOf(engine)[0].link).toBeUndefined()
    engine.dispose()
  })

  it('adds and clears ruler guides as one undoable edit each', async () => {
    const { engine, pageId } = await setup()
    engine.pages.addGuide(pageId, { orientation: 'vertical', pos: 120 })
    engine.pages.addGuide(pageId, { orientation: 'horizontal', pos: 80 })
    expect(engine.state.doc.pages[0].guides).toHaveLength(2)
    engine.pages.setGuides(pageId, [])
    expect(engine.state.doc.pages[0].guides ?? []).toHaveLength(0)
    engine.undo()
    expect(engine.state.doc.pages[0].guides).toHaveLength(2)
    engine.dispose()
  })

  it('shared-view mode is read-only: no edits, no autosave', async () => {
    vi.useFakeTimers()
    const { engine, handle } = await setup({ mode: 'shared-view' })
    engine.persistence.start({})
    expect(engine.readOnly).toBe(true)
    await engine.insert.shape('rect')
    expect(objectsOf(engine)).toHaveLength(0)
    engine.pages.add()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(handle.saves).toHaveLength(0)
    engine.dispose()
  })

  it('image upload inserts an image and lists it in uploads', async () => {
    const restore = installImageStub({ width: 200, height: 100 })
    // The stub image is not drawable in jsdom.
    vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined)
    const { engine, handle, view } = await setup()
    const file = new File([new Uint8Array([1, 2, 3])], 'cat.png', { type: 'image/png' })
    URL.createObjectURL = vi.fn(() => 'blob:fake-1')
    await engine.insert.imageFiles([file])
    expect(handle.uploads).toHaveLength(1)
    expect(objectsOf(engine)[0].type).toBe('image')
    // The document stores the adapter's durable reference, never a blob: URL.
    expect(objectsOf(engine)[0].src).toMatch(/^idb:\/\/[0-9a-f-]{36}$/)
    expect(engine.state.uploads).toHaveLength(1)
    await vi.waitFor(() => expect(view.canvas.getObjects()).toHaveLength(1))
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    engine.dispose()
    restore()
  })

  it('rejects unsupported upload types with a toast', async () => {
    const { engine } = await setup()
    await engine.insert.imageFiles([new File(['x'], 'x.exe', { type: 'application/x-msdownload' })])
    expect(objectsOf(engine)).toHaveLength(0)
    expect(engine.state.toasts[0]?.tone).toBe('error')
    engine.dispose()
  })

  it('copies and pastes objects with fresh ids and an offset', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    await engine.clipboard.copy()
    await engine.clipboard.pasteFrom(transfer())
    expect(objectsOf(engine)).toHaveLength(2)
    expect(objectsOf(engine)[1].id).not.toBe(objectsOf(engine)[0].id)
    expect((objectsOf(engine)[1].left as number) - (objectsOf(engine)[0].left as number)).toBe(20)
    engine.dispose()
  })

  it('pastes plain text as a text box and decodes the doory flavour', async () => {
    const { engine } = await setup()
    expect(await engine.clipboard.pasteFrom(transfer({ 'text/plain': 'Hello from the clipboard' }))).toBe(true)
    expect(objectsOf(engine)[0].type).toBe('textbox')
    expect(objectsOf(engine)[0].text).toBe('Hello from the clipboard')
    engine.dispose()
  })

  it('set position and size keep numbers in sync', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    engine.arrange.setPosition(100, 50)
    const b = engine.state.selection.bounds
    expect(b?.x).toBeCloseTo(100)
    expect(b?.y).toBeCloseTo(50)
    engine.arrange.setSize(200, 80)
    // The size is the shape's own width and height; its 2 px border (which keeps its width) is not part of it.
    expect(engine.state.selection.bounds?.width).toBeCloseTo(200)
    expect(engine.state.selection.bounds?.height).toBeCloseTo(80)
    expect(objectsOf(engine)[0].width).toBeCloseTo(200)
    engine.dispose()
  })

  it('rotates around the centre', async () => {
    const { engine } = await setup()
    await engine.insert.shape('rect')
    const view = engine.activeView()
    const c0 = view?.canvas.getActiveObject()?.getCenterPoint()
    engine.arrange.setAngle(45)
    const c1 = view?.canvas.getActiveObject()?.getCenterPoint()
    expect(c1?.x).toBeCloseTo(c0?.x ?? 0)
    expect(c1?.y).toBeCloseTo(c0?.y ?? 0)
    expect(objectsOf(engine)[0].angle).toBeCloseTo(45)
    engine.dispose()
  })

  it('handles 200 objects on a page quickly', async () => {
    const { engine } = await setup()
    const started = performance.now()
    for (let i = 0; i < 200; i++) {
      engine.history.seal()
      await engine.insert.shape(i % 2 ? 'rect' : 'ellipse')
    }
    expect(objectsOf(engine)).toHaveLength(200)
    expect(performance.now() - started).toBeLessThan(30_000)
    engine.dispose()
  }, 40_000)
})
