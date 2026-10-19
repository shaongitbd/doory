import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { EditorEngine } from './editor'

/** Switching high contrast on <html> restyles the live canvases (selection handles, guides) without a reload. */
describe('high contrast on the canvas', () => {
  const root = document.documentElement

  afterEach(() => {
    delete root.dataset.contrast
    root.style.removeProperty('--selection-color')
  })

  it('re-reads the canvas theme and passes it to every view when data-contrast changes', async () => {
    const engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: createBlankDocument(400, 300), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
    engine.start()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const pageId = engine.state.doc.pages[0].id
    engine.mountPage(pageId, host)
    const view = await engine.whenView(pageId)
    const setTheme = vi.spyOn(view, 'setTheme')

    // What tokens.css does under high contrast (the tests load no stylesheets).
    root.style.setProperty('--selection-color', '#4a35a3')
    root.dataset.contrast = 'more'
    await Promise.resolve()

    expect(setTheme).toHaveBeenCalledTimes(1)
    expect(engine.theme.selection).toBe('#4a35a3')
    expect(setTheme).toHaveBeenCalledWith(engine.theme)
    engine.dispose()
    host.remove()
  })
})
