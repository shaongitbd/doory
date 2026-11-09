import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { createUiI18n } from '@/i18n/instance'
import { getLanguagePreferences } from '@/i18n/preferences'
import './builtins/commands'
import './builtins/panels'
import './presenter/commands'
import './animation/commands'
import './engine/export/formats'
import { setupEditor, rectObject, textObject } from './animation/testing'
import { ChromeProvider } from './chrome/ChromeContext'
import { type Peer, frames, move, open, owner, seedDocument } from './collab/engineTesting'
import { FakeCollabServer } from './collab/fakeServer'
import { EditorProvider } from './EditorProvider'
import type { EditorEngine } from './engine/editor'
import { createTextbox } from './engine/objects/factories'
import { installImageStub } from './test/imageStub'
import { TopBar } from './TopBar'

vi.setConfig({ testTimeout: 30_000 })

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() { this.callback([{ contentRect: { width: 1400 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
  disconnect() {}
  unobserve() {}
}

function mount(engine: EditorEngine, peer?: Peer) {
  const instance = createUiI18n()
  render(
    <I18nextProvider i18n={instance}>
      <EditorProvider engine={engine} portalRoot={document.body} collab={peer?.session}>
        <ChromeProvider><TopBar onTitle={() => undefined} onPresent={() => undefined} /></ChromeProvider>
      </EditorProvider>
    </I18nextProvider>,
  )
  return instance
}

function openLanguage() {
  fireEvent.click(screen.getByTestId('ed-menu-view'))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Language…' }))
  return screen.getByRole('combobox', { name: 'UI language' })
}

describe('language switching preserves the editor', () => {
  let restoreImage: () => void
  let engine: EditorEngine | undefined
  let peer: Peer | undefined
  beforeEach(() => {
    restoreImage = installImageStub()
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['thumb'], { type: 'image/webp' })))
  })
  afterEach(() => {
    cleanup()
    peer?.session.destroy()
    engine?.dispose()
    peer = undefined
    engine = undefined
    restoreImage()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('keeps the canvas, dirty document, selection and undo/redo entries, without adding autosaves', async () => {
    const setup = await setupEditor({ objects: [rectObject('rect', 100, 100), { ...textObject('text', 300, 100), name: 'My heading', text: 'My original content' }] })
    engine = setup.engine
    engine.start()
    engine.select(['rect'])
    engine.arrange.nudge(5, 0)
    engine.sealHistory()
    engine.arrange.nudge(10, 0)
    await engine.undo()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    engine.persistence.start({})
    engine.setTitle('My design')
    const instance = mount(engine)
    const select = openLanguage()
    const state = engine.state
    const history = JSON.stringify(engine.history)
    const view = engine.viewOf(setup.pageId)
    const canvas = view?.canvas.lowerCanvasEl
    const save = vi.spyOn(engine.adapter, 'save')
    const changes = vi.fn()
    const unsubscribe = engine.store.subscribe((next, previous) => { if (next.doc !== previous.doc) changes() })
    const stop = vi.spyOn(engine, 'stop')
    const dispose = vi.spyOn(engine, 'dispose')
    expect(engine.persistence.isDirty()).toBe(true)
    expect(state.history).toMatchObject({ canUndo: true, canRedo: true })

    fireEvent.change(select, { target: { value: 'de' } })
    expect(screen.getByRole('dialog', { name: 'Sprache' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sprache der Benutzeroberfläche' })).toBe(select)
    expect(engine.state.doc).toBe(state.doc)
    expect(engine.state.title).toBe(state.title)
    expect(engine.state.selection).toBe(state.selection)
    expect(engine.state.history).toBe(state.history)
    expect(JSON.stringify(engine.history)).toBe(history)
    expect(engine.viewOf(setup.pageId)).toBe(view)
    expect(view?.canvas.lowerCanvasEl).toBe(canvas)
    expect(engine.persistence.isDirty()).toBe(true)
    expect(save).not.toHaveBeenCalled()
    expect(changes).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(dispose).not.toHaveBeenCalled()
    fireEvent.keyDown(select, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Ansicht' })).toHaveFocus()
    act(() => getLanguagePreferences(instance).setPreference('en'))
    expect(engine.state.doc).toBe(state.doc)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(save).toHaveBeenCalledOnce() // The already pending user edit still saves once.
    unsubscribe()
  })

  it('does not write Yjs updates or change live history, presence, or the room connection', async () => {
    const doc = await seedDocument()
    const server = new FakeCollabServer(doc)
    peer = await open(server, owner('u1', 'Ada'), doc)
    engine = peer.engine
    await frames()
    move(peer, 'rect-1', 5)
    await frames()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    await vi.advanceTimersByTimeAsync(6000)
    mount(engine, peer)
    const select = openLanguage()
    const before = engine.state
    const session = peer.session
    const collab = session.store.getState()
    const presence = JSON.stringify(session.awareness.getLocalState())
    const liveSession = engine.liveSession
    const view = engine.viewOf(peer.pageId)
    const update = vi.fn()
    session.ydoc.on('update', update)
    const saves = peer.handle.saves.length
    const received = server.received.length

    fireEvent.change(select, { target: { value: 'de' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(engine.state.doc).toBe(before.doc)
    expect(engine.state.history).toBe(before.history)
    expect(engine.state.selection).toBe(before.selection)
    expect(engine.liveSession).toBe(liveSession)
    expect(engine.viewOf(peer.pageId)).toBe(view)
    expect(session.store.getState()).toBe(collab)
    expect(JSON.stringify(session.awareness.getLocalState())).toBe(presence)
    expect(server.received).toHaveLength(received)
    expect(peer.handle.saves).toHaveLength(saves)
    expect(update).not.toHaveBeenCalled()
    expect(screen.getByTestId('collab-status')).toHaveAttribute('aria-label', 'Live')
  }, 30_000)

  it('leaves all starter text presets unchanged when the UI language changes', () => {
    const instance = createUiI18n()
    for (const preset of ['heading', 'subheading', 'body'] as const) {
      const english = createTextbox({ width: 800, height: 600 }, { x: 100, y: 100 }, { preset })
      getLanguagePreferences(instance).setPreference('de')
      const german = createTextbox({ width: 800, height: 600 }, { x: 100, y: 100 }, { preset })
      expect(german.text).toBe(english.text)
      expect(german.fontFamily).toBe(english.fontFamily)
      getLanguagePreferences(instance).setPreference('en')
    }
  })
})
