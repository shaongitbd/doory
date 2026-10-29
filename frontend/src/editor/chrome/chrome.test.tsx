import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTRAST_KEY, setContrastPreference } from '@/lib/contrast'
import '../builtins/commands'
import '../builtins/panels'
import '../presenter/commands'
import '../engine/export/formats'
import { setupEditor } from '../animation/testing'
import { createBlankDocument } from '@/lib/document'
import type { DoryDocument } from '@/types/document'
import { downloadFiles, runExport } from '../engine/export/exporter'
import { saveLastExport } from '../engine/export/choices'
import { DEFAULT_EXPORT_OPTIONS } from '../engine/export/registry'
import type { EditorEngine } from '../engine/editor'
import { EditorProvider } from '../EditorProvider'
import { SaveStatus } from '../SaveStatus'
import { t } from '../strings'
import { TopBar } from '../TopBar'
import { ChromeProvider } from './ChromeContext'
import { SidebarHost } from './ToolHost'
import { ToolRail } from './ToolRail'

vi.mock('../engine/export/exporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../engine/export/exporter')>()),
  downloadFiles: vi.fn(),
  runExport: vi.fn(async () => [{ blob: new Blob(['x']), filename: 'Test.jpg' }]),
}))

async function mount(mode?: 'guest' | 'shared-view', doc?: DoryDocument, exportProject?: () => Promise<{ blob: Blob; filename: string }>) {
  const { engine } = await setupEditor({ mode, doc })
  if (exportProject) engine.adapter.exportProject = exportProject
  await act(async () => {
    render(
      <EditorProvider engine={engine} portalRoot={document.body}>
        <ChromeProvider>
          <TopBar onTitle={() => undefined} onPresent={() => undefined} />
          <ToolRail edge="side" />
          <SidebarHost />
        </ChromeProvider>
      </EditorProvider>,
    )
  })
  return engine
}

const objectCount = (engine: EditorEngine): number => engine.state.doc.pages[0].objects.length

/** The top bar measures itself; jsdom has no ResizeObserver, and a desktop-wide bar keeps File and View apart. */
class FakeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(): void {
    this.callback([{ contentRect: { width: 1400 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
  disconnect(): void {}
  unobserve(): void {}
}

describe('editor chrome', () => {
  let engine: EditorEngine | null = null
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeObserver)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['x'], { type: 'image/webp' })))
  })
  afterEach(() => {
    // Unmount first: an open menu is portalled into the body.
    cleanup()
    engine?.dispose()
    engine = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    setContrastPreference('system')
    document.body.innerHTML = ''
  })

  it('lists the tools in the rail, most used first, and none of them in the top bar', async () => {
    engine = await mount()
    const rail = screen.getByRole('navigation', { name: t.chrome.tools })
    const names = within(rail)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(names.slice(0, 5)).toEqual([t.rail.templates, t.rail.text, t.rail.shapes, t.rail.elements, t.rail.image])
    expect(within(screen.getByTestId('ed-topbar')).queryByRole('button', { name: t.rail.text })).not.toBeInTheDocument()
  })

  it('keeps a tool open beside the rail while things are added from it, until its entry is pressed again', async () => {
    engine = await mount()
    const shapes = screen.getByRole('button', { name: t.rail.shapes })
    await userEvent.click(shapes)
    expect(shapes).toHaveAttribute('aria-pressed', 'true')
    const panel = screen.getByRole('complementary', { name: t.rail.shapes })
    await userEvent.click(within(panel).getByTestId('shape-rect'))
    await waitFor(() => expect(objectCount(engine!)).toBe(1))
    await userEvent.click(within(panel).getByTestId('shape-ellipse'))
    await waitFor(() => expect(objectCount(engine!)).toBe(2))
    expect(screen.getByRole('complementary', { name: t.rail.shapes })).toBeInTheDocument()
    await userEvent.click(shapes)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('closes the open tool with Escape from inside it and gives focus back to its rail entry', async () => {
    engine = await mount()
    const text = screen.getByRole('button', { name: t.rail.text })
    await userEvent.click(text)
    within(screen.getByRole('complementary', { name: t.rail.text })).getAllByRole('button')[1].focus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(text).toHaveFocus()
  })

  it('shows no Comments button on a guest design, where commenting would only ask to sign up', async () => {
    engine = await mount('guest')
    expect(screen.queryByTestId('ed-end-comments')).not.toBeInTheDocument()
  })

  it('puts the design commands in File and View menus at the left of the bar', async () => {
    engine = await mount()
    await userEvent.click(screen.getByRole('button', { name: t.topbar.file }))
    const file = screen.getByRole('menu', { name: t.topbar.file })
    expect(within(file).getByRole('menuitem', { name: /Rename/ })).toBeInTheDocument()
    expect(within(file).getByRole('menuitem', { name: /Version history/ })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: t.topbar.view }))
    const view = screen.getByRole('menu', { name: t.topbar.view })
    expect(within(view).getByRole('menuitemcheckbox', { name: t.menu.rulers })).toBeInTheDocument()
    expect(within(view).getByRole('menuitem', { name: /Keyboard shortcuts/ })).toBeInTheDocument()
  })

  it('downloads a portable project backup from the File menu for a guest design', async () => {
    const exportProject = vi.fn(async () => ({ blob: new Blob(['project']), filename: 'Test.doory' }))
    const createObjectURL = vi.fn(() => 'blob:project')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL: vi.fn() }))
    engine = await mount('guest', undefined, exportProject)
    await userEvent.click(screen.getByRole('button', { name: t.topbar.file }))
    await userEvent.click(within(screen.getByRole('menu', { name: t.topbar.file })).getByRole('menuitem', { name: t.cmd.fileExportProject }))
    await waitFor(() => expect(exportProject).toHaveBeenCalledOnce())
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
  })

  it('switches high contrast from the View menu', async () => {
    engine = await mount()
    await userEvent.click(screen.getByRole('button', { name: t.topbar.view }))
    const item = within(screen.getByRole('menu', { name: t.topbar.view })).getByRole('menuitemcheckbox', { name: t.cmd.viewHighContrast })
    expect(item).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(item)
    expect(document.documentElement.dataset.contrast).toBe('more')
    expect(localStorage.getItem(CONTRAST_KEY)).toBe('more')
    await userEvent.click(screen.getByRole('button', { name: t.topbar.view }))
    expect(within(screen.getByRole('menu', { name: t.topbar.view })).getByRole('menuitemcheckbox', { name: t.cmd.viewHighContrast })).toHaveAttribute('aria-checked', 'true')
  })

  it('offers high contrast on a view-only link too', async () => {
    engine = await mount('shared-view')
    await userEvent.click(screen.getByRole('button', { name: t.topbar.view }))
    const item = within(screen.getByRole('menu', { name: t.topbar.view })).getByRole('menuitemcheckbox', { name: t.cmd.viewHighContrast })
    expect(item).toBeEnabled()
    await userEvent.click(item)
    expect(document.documentElement.dataset.contrast).toBe('more')
  })

  it('gathers sharing, downloads and presenting in the one Share menu', async () => {
    engine = await mount()
    expect(screen.queryByTestId('ed-download')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('ed-share'))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: new RegExp(t.topbar.shareWithPeople) })).toBeInTheDocument()
    expect(within(menu).getByText(t.topbar.downloadHeading)).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /PNG/ })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: t.topbar.presentFull })).toBeInTheDocument()
  })

  it('downloads in one click from the format tiles, and opens the dialog for video and for every option', async () => {
    localStorage.clear()
    vi.mocked(runExport).mockClear()
    engine = await mount()
    await userEvent.click(screen.getByTestId('ed-share'))
    const menu = screen.getByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: new RegExp(t.topbar.lastUsed) })).toBeNull()
    for (const name of [/^PNG/, /^JPG/, /^PDF/, /^SVG/, new RegExp(`^${t.topbar.videoDownload}`)]) expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: new RegExp(t.topbar.copyImage) })).toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('menuitem', { name: /^JPG/ }))
    await waitFor(() => expect(downloadFiles).toHaveBeenCalled())
    expect(vi.mocked(runExport).mock.calls[0][1]).toMatchObject({ formatId: 'jpg', pages: { kind: 'all' } })
    await userEvent.click(screen.getByTestId('ed-share'))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: new RegExp(`^${t.topbar.videoDownload}`) }))
    expect(engine.state.ui.dialog).toEqual({ id: 'download', props: { format: 'mp4' } })
    engine.closeDialog()
    await userEvent.click(screen.getByTestId('ed-share'))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: new RegExp(t.topbar.moreDownloadOptions) }))
    expect(engine.state.ui.dialog?.id).toBe('download')
  })

  it('suggests a download for the design\'s size preset, and offers the last download again', async () => {
    localStorage.clear()
    vi.mocked(runExport).mockClear()
    saveLastExport({ formatId: 'png', options: { ...DEFAULT_EXPORT_OPTIONS, size: '2x', transparent: true } })
    engine = await mount(undefined, { ...createBlankDocument(1080, 1920), meta: { presetId: 'instagram-story' } })
    await userEvent.click(screen.getByTestId('ed-share'))
    const menu = screen.getByRole('menu')
    const suggested = within(menu).getByRole('menuitem', { name: new RegExp(t.topbar.suggestedFor('Instagram Story')) })
    expect(suggested).toHaveTextContent('JPG · 1x · 1080 × 1920')
    const last = within(menu).getByRole('menuitem', { name: new RegExp(t.topbar.lastUsed) })
    expect(last).toHaveTextContent('PNG · 2x')
    await userEvent.click(suggested)
    await waitFor(() => expect(runExport).toHaveBeenCalledTimes(1))
    expect(vi.mocked(runExport).mock.calls[0][1]).toMatchObject({ formatId: 'jpg', options: { size: '1x', qualityPreset: 'balanced' } })
    // The suggestion is now the last download.
    await waitFor(() => expect(JSON.parse(localStorage.getItem('doory-export-last') ?? '{}').formatId).toBe('jpg'))
  })

  it('Last used sends an optimizer the server still offers, not one it dropped since', async () => {
    localStorage.clear()
    vi.mocked(runExport).mockClear()
    saveLastExport({ formatId: 'jpg', options: { ...DEFAULT_EXPORT_OPTIONS, optimize: true, optimizer: 'gone' } })
    engine = await mount()
    engine.adapter.imageOptimize = { formats: ['png', 'jpg'], optimizers: [{ id: 'builtin', name: 'Built-in', formats: ['jpg', 'png'], sendsOffsite: false }], default: 'builtin' }
    await userEvent.click(screen.getByTestId('ed-share'))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: new RegExp(t.topbar.lastUsed) }))
    await waitFor(() => expect(runExport).toHaveBeenCalledTimes(1))
    expect(vi.mocked(runExport).mock.calls[0][1].options).toMatchObject({ optimize: true, optimizer: 'builtin' })
  })

  it('has no suggestion once the page no longer has the preset\'s size', async () => {
    engine = await mount(undefined, { ...createBlankDocument(1000, 1000), meta: { presetId: 'instagram-story' } })
    await userEvent.click(screen.getByTestId('ed-share'))
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: /Suggested for/ })).toBeNull()
  })

  it('offers downloads without sharing on a view-only link, and no tools that change the design', async () => {
    engine = await mount('shared-view')
    expect(screen.queryByRole('button', { name: t.rail.text })).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('ed-share'))
    const menu = screen.getByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: new RegExp(t.topbar.shareWithPeople) })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /PNG/ })).toBeInTheDocument()
  })
})

describe('SaveStatus', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('says a guest design is saved in this browser from the start, not just "Saved"', async () => {
    const { engine } = await setupEditor({ mode: 'guest' })
    render(
      <EditorProvider engine={engine} portalRoot={document.body}>
        <SaveStatus />
      </EditorProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent(t.save.local)
    engine.dispose()
  })
})
