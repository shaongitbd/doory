import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { createBlankDocument } from '@/lib/document'
import type { DocPage, DoryDocument } from '@/types/document'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { EditorProvider } from '../EditorProvider'
import { EditorEngine } from '../engine/editor'
import { saveLastExport } from '../engine/export/choices'
import { downloadFiles } from '../engine/export/exporter'
import { DEFAULT_EXPORT_OPTIONS } from '../engine/export/registry'
import { t } from '../strings'
import { DownloadDialog } from './DownloadDialog'
import { ComparePreview } from './download/ComparePreview'
import type { ImageOptimizeInfo, OptimizeImageInput, OptimizedImage } from '@/types/adapter'

vi.mock('../engine/export/exporter', async (importOriginal) => ({ ...(await importOriginal<typeof import('../engine/export/exporter')>()), downloadFiles: vi.fn() }))

type ExportPdf = NonNullable<ReturnType<typeof createMemoryAdapter>['adapter']['exportPdf']>

function mixed(): DoryDocument {
  const base = createBlankDocument(1080, 1080)
  const page = (id: string, width?: number, height?: number): DocPage => ({ id, background: { type: 'solid', color: '#ffffff' }, objects: [], ...(width ? { width, height } : {}) })
  return { ...base, pages: [page('a'), page('b', 794, 1123), page('c', 794, 1123), page('d', 400, 300)] }
}

function setup({ server = true, doc = mixed(), id = 'design-1' }: { server?: boolean; doc?: DoryDocument; id?: string } = {}) {
  const handle = createMemoryAdapter()
  const exportPdf = vi.fn<ExportPdf>(async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
  if (server) handle.adapter.exportPdf = exportPdf
  const engine = new EditorEngine({ adapter: handle.adapter, document: doc, meta: { id, title: 'Menu', mode: server ? 'account' : 'guest' }, ephemeral: true })
  const view = render(
    <EditorProvider engine={engine} portalRoot={document.body}>
      <DownloadDialog />
    </EditorProvider>,
  )
  return { engine, exportPdf, view }
}

const dialog = () => screen.getByRole('dialog', { name: t.dialog.downloadTitle })
const pick = (name: RegExp | string) => userEvent.click(within(dialog()).getByRole('radio', { name }))
const download = () => userEvent.click(within(dialog()).getByRole('button', { name: t.dialog.downloadButton }))
/** Pages and file names sit under More settings. */
const more = () => userEvent.click(within(dialog()).getByRole('button', { name: new RegExp(t.dialog.downloadMoreSettings) }))

describe('Download dialog: print options', () => {
  let engine: EditorEngine | null = null
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(downloadFiles).mockClear()
  })
  afterEach(() => {
    engine?.dispose()
    engine = null
    vi.useRealTimers()
  })

  it('shows the print section for the PDF formats only', async () => {
    const ctx = setup()
    engine = ctx.engine
    expect(screen.queryByTestId('print-section')).toBeNull() // PNG is first
    await pick(/^PDF/)
    expect(screen.getByTestId('print-section')).toBeInTheDocument()
    await pick(/^SVG/)
    expect(screen.queryByTestId('print-section')).toBeNull()
    await pick(/Print-quality PDF/)
    expect(screen.getByTestId('print-section')).toBeInTheDocument()
  })

  it('the print-quality PDF is only offered when the server can make it', () => {
    const ctx = setup({ server: false })
    engine = ctx.engine
    expect(within(dialog()).queryByRole('radio', { name: /Print-quality PDF/ })).toBeNull()
    expect(within(dialog()).getByRole('radio', { name: /^PDF/ })).toBeInTheDocument()
  })

  it('has the three presets, and Screen is the starting point', async () => {
    const ctx = setup()
    engine = ctx.engine
    await pick(/^PDF/)
    const presets = within(screen.getByRole('radiogroup', { name: t.print.preset }))
    expect(presets.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      `${t.print.presets.screen}${t.print.presetHints.screen}`,
      `${t.print.presets.standard}${t.print.presetHints.standard}`,
      `${t.print.presets.custom}${t.print.presetHints.custom}`,
    ])
    expect(presets.getByRole('radio', { name: new RegExp(t.print.presets.screen) })).toBeChecked()
    expect(screen.getByRole('switch', { name: new RegExp(t.print.cropMarks) })).not.toBeChecked()
  })

  it('Standard print is 3 mm of bleed and crop marks; the numbers follow and the preview draws them', async () => {
    const ctx = setup()
    engine = ctx.engine
    await pick(/^PDF/)
    expect(screen.getByTestId('print-preview')).toHaveAttribute('data-bleed', 'false')
    await pick(new RegExp(t.print.presets.standard))
    expect(screen.getByRole('textbox', { name: t.print.bleed })).toHaveValue('3')
    expect(screen.getByRole('switch', { name: new RegExp(t.print.cropMarks) })).toBeChecked()
    const preview = screen.getByTestId('print-preview')
    expect(preview).toHaveAttribute('data-bleed', 'true')
    expect(preview).toHaveAttribute('data-marks', 'true')
    expect(preview.querySelector('[data-part="marks"]')?.querySelectorAll('line')).toHaveLength(8)
    expect(preview).toHaveAccessibleName(/3 mm bleed/)
    expect(screen.getByText('= 11 px')).toBeInTheDocument()
    await pick(new RegExp(t.print.presets.screen))
    expect(screen.getByRole('textbox', { name: t.print.bleed })).toHaveValue('0')
    expect(screen.getByTestId('print-preview')).toHaveAttribute('data-bleed', 'false')
  })

  it('typing a bleed or flipping the marks turns the setup into Custom; the bleed stays within 0 to 10 mm', async () => {
    const ctx = setup()
    engine = ctx.engine
    await pick(/^PDF/)
    await pick(new RegExp(t.print.presets.standard))
    const bleed = screen.getByRole('textbox', { name: t.print.bleed })
    await userEvent.clear(bleed)
    await userEvent.type(bleed, '4.5{Enter}')
    expect(screen.getByRole('radio', { name: new RegExp(t.print.presets.custom) })).toBeChecked()
    expect(bleed).toHaveValue('4.5')
    await userEvent.clear(bleed)
    await userEvent.type(bleed, '25{Enter}')
    expect(bleed).toHaveValue('10')
    await userEvent.click(screen.getByRole('switch', { name: new RegExp(t.print.cropMarks) }))
    expect(screen.getByRole('switch', { name: new RegExp(t.print.cropMarks) })).not.toBeChecked()
    expect(screen.getByTestId('print-preview')).toHaveAttribute('data-marks', 'false')
  })

  it('says how large a page becomes with the bleed and the marks, or that every page grows when they differ in size', async () => {
    const uniform = setup({ doc: createBlankDocument(800, 600) })
    engine = uniform.engine
    await pick(/^PDF/)
    expect(screen.queryByTestId('print-sheet')).toBeNull()
    await pick(new RegExp(t.print.presets.standard))
    expect(screen.getByTestId('print-sheet')).toHaveTextContent('Each page is 868 × 668 px with bleed and crop marks.')
    await userEvent.click(screen.getByRole('switch', { name: new RegExp(t.print.cropMarks) }))
    expect(screen.getByTestId('print-sheet')).toHaveTextContent('Each page is 823 × 623 px with bleed.')
    uniform.view.unmount()
    uniform.engine.dispose()

    localStorage.clear()
    const sizes = setup()
    engine = sizes.engine
    await pick(/^PDF/)
    await pick(new RegExp(t.print.presets.standard))
    expect(screen.getByTestId('print-sheet')).toHaveTextContent('Each page grows by the bleed and crop marks.')
    expect(screen.getByText(t.print.bleedHelp)).toBeInTheDocument()
  })

  it('tells the bleed in the unit of the design', async () => {
    const doc = mixed()
    const ctx = setup({ doc: { ...doc, unit: 'in' } })
    engine = ctx.engine
    await pick(/^PDF/)
    await pick(new RegExp(t.print.presets.standard))
    expect(screen.getByText('= 0.12 in')).toBeInTheDocument()
  })

  it('sums up the chosen pages and their sizes, and follows the page selection', async () => {
    const ctx = setup()
    engine = ctx.engine
    await pick(/^PDF/)
    expect(screen.getByTestId('print-summary')).toHaveTextContent('4 pages · 3 sizes: 1080×1080, A4, 400×300')
    await more()
    await pick(new RegExp(t.dialog.downloadCurrentPage))
    expect(screen.getByTestId('print-summary')).toHaveTextContent('1 page · 1 size: 1080×1080')
    await pick(t.dialog.downloadRange)
    await userEvent.type(screen.getByRole('textbox', { name: t.dialog.downloadRange }), '2-3')
    expect(screen.getByTestId('print-summary')).toHaveTextContent('2 pages · 1 size: A4')
  })

  it('an invalid range blocks the download and says so', async () => {
    const ctx = setup()
    engine = ctx.engine
    await pick(/^PDF/)
    await more()
    await pick(t.dialog.downloadRange)
    await userEvent.type(screen.getByRole('textbox', { name: t.dialog.downloadRange }), '1-9')
    expect(screen.getByTestId('print-summary')).toHaveTextContent(t.print.noPages)
    expect(within(dialog()).getByRole('button', { name: t.dialog.downloadButton })).toBeDisabled()
  })

  it('says which engine makes the file, and that colours are RGB', async () => {
    const ctx = setup()
    engine = ctx.engine
    await pick(/^PDF/)
    expect(screen.getByText(t.print.engineClient)).toBeInTheDocument()
    expect(screen.getByTestId('print-colour-note')).toHaveTextContent(/RGB/)
    await pick(/Print-quality PDF/)
    expect(screen.getByText(t.print.engineServer)).toBeInTheDocument()
  })

  it('remembers the choice for this design, and only for this design', async () => {
    const first = setup({ id: 'one' })
    await pick(/^PDF/)
    await pick(new RegExp(t.print.presets.standard))
    const bleed = screen.getByRole('textbox', { name: t.print.bleed })
    await userEvent.clear(bleed)
    await userEvent.type(bleed, '6{Enter}')
    first.view.unmount()
    first.engine.dispose()

    const again = setup({ id: 'one' })
    await pick(/^PDF/)
    expect(screen.getByRole('textbox', { name: t.print.bleed })).toHaveValue('6')
    expect(screen.getByRole('radio', { name: new RegExp(t.print.presets.custom) })).toBeChecked()
    again.view.unmount()
    again.engine.dispose()

    const other = setup({ id: 'two' })
    engine = other.engine
    await pick(/^PDF/)
    expect(screen.getByRole('textbox', { name: t.print.bleed })).toHaveValue('0')
  })

  it('works when the browser refuses to store anything', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const ctx = setup()
    engine = ctx.engine
    await pick(/^PDF/)
    await pick(new RegExp(t.print.presets.standard))
    expect(screen.getByRole('textbox', { name: t.print.bleed })).toHaveValue('3')
    vi.restoreAllMocks()
  })
})

describe('Download dialog: making the file', () => {
  let engine: EditorEngine | null = null
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(downloadFiles).mockClear()
  })
  afterEach(() => {
    engine?.dispose()
    engine = null
    vi.useRealTimers()
  })

  it('sends the options of the Standard print preset with the sizes of every page', async () => {
    const ctx = setup()
    engine = ctx.engine
    await pick(/Print-quality PDF/)
    await pick(new RegExp(t.print.presets.standard))
    await download()
    await waitFor(() => expect(downloadFiles).toHaveBeenCalledTimes(1))
    const [input] = ctx.exportPdf.mock.calls[0]
    expect(input).toMatchObject({ bleedMm: 3, cropMarks: true, title: 'Menu', width: 1080, height: 1080 })
    expect(input.sizes).toEqual([
      { width: 1080, height: 1080 },
      { width: 794, height: 1123 },
      { width: 794, height: 1123 },
      { width: 400, height: 300 },
    ])
    expect(vi.mocked(downloadFiles).mock.calls[0][0][0].filename).toBe('Menu-print.pdf')
    expect(ctx.engine.state.ui.dialog).toBeNull()
  })

  it('the Screen setup sends no bleed and no marks', async () => {
    const ctx = setup()
    engine = ctx.engine
    await pick(/Print-quality PDF/)
    await download()
    await waitFor(() => expect(ctx.exportPdf).toHaveBeenCalled())
    expect(ctx.exportPdf.mock.calls[0][0]).toMatchObject({ bleedMm: 0, cropMarks: false })
  })

  it('a chosen range sends only those pages', async () => {
    const ctx = setup()
    engine = ctx.engine
    await pick(/Print-quality PDF/)
    await more()
    await pick(t.dialog.downloadRange)
    await userEvent.type(screen.getByRole('textbox', { name: t.dialog.downloadRange }), '1, 4')
    await download()
    await waitFor(() => expect(ctx.exportPdf).toHaveBeenCalled())
    expect(ctx.exportPdf.mock.calls[0][0].sizes).toEqual([
      { width: 1080, height: 1080 },
      { width: 400, height: 300 },
    ])
  })

  it('without a server the same options make the PDF in the browser', async () => {
    const ctx = setup({ server: false })
    engine = ctx.engine
    await pick(/^PDF/)
    await pick(new RegExp(t.print.presets.standard))
    await download()
    await waitFor(() => expect(downloadFiles).toHaveBeenCalledTimes(1), { timeout: 20_000 })
    const [files] = vi.mocked(downloadFiles).mock.calls[0]
    expect(files[0].filename).toBe('Menu.pdf')
    expect(files[0].blob.size).toBeGreaterThan(1000)
  }, 30_000)

  it('shows progress with what is going on, and Cancel stops the download without closing the dialog', async () => {
    const ctx = setup()
    engine = ctx.engine
    let seen: AbortSignal | undefined
    ctx.exportPdf.mockImplementation(
      (input) =>
        new Promise<Blob>((_resolve, reject) => {
          seen = input.signal
          input.onUploadProgress?.(0.4)
          input.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    await pick(/Print-quality PDF/)
    await download()
    const bar = await screen.findByRole('progressbar')
    await waitFor(() => expect(screen.getByTestId('export-stage')).toHaveTextContent(t.print.stage.uploading))
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    expect(within(dialog()).queryByRole('button', { name: t.dialog.downloadCopy })).toBeNull()
    await userEvent.click(within(dialog()).getByRole('button', { name: t.print.cancel }))
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
    expect(seen?.aborted).toBe(true)
    expect(screen.queryByTestId('export-problem')).toBeNull()
    expect(within(dialog()).getByRole('button', { name: t.dialog.downloadButton })).toBeEnabled()
    expect(engine?.state.toasts.at(-1)?.message).toBe(t.print.cancelled)
    expect(downloadFiles).not.toHaveBeenCalled()
  })

  it('closing the dialog while it works cancels the request', async () => {
    const ctx = setup()
    engine = ctx.engine
    let seen: AbortSignal | undefined
    ctx.exportPdf.mockImplementation((input) => {
      seen = input.signal
      return new Promise<Blob>(() => undefined)
    })
    await pick(/Print-quality PDF/)
    await download()
    await screen.findByRole('progressbar')
    await userEvent.click(within(dialog()).getByRole('button', { name: t.dialog.close }))
    expect(seen?.aborted).toBe(true)
  })
})

describe('Download dialog: when the print service says no', () => {
  let engine: EditorEngine | null = null
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(downloadFiles).mockClear()
  })
  afterEach(() => {
    engine?.dispose()
    engine = null
    vi.useRealTimers()
  })

  const fail = (status: number, code: string, message: string, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) => new ApiError({ status, code, message, ...extra })

  it('a busy service: counts down the wait it asked for, then Try again works', async () => {
    const ctx = setup()
    engine = ctx.engine
    ctx.exportPdf.mockRejectedValueOnce(fail(503, 'export_busy', 'busy', { retryAfter: 2 }))
    await pick(/Print-quality PDF/)
    await download()
    const problem = await screen.findByTestId('export-problem')
    expect(problem).toHaveAttribute('data-kind', 'busy')
    expect(problem).toHaveTextContent(t.print.problems.busy)
    const retry = within(problem).getByRole('button', { name: /Try again in \d s/ })
    expect(retry).toBeDisabled()
    await waitFor(() => expect(within(screen.getByTestId('export-problem')).getByRole('button', { name: t.print.retry })).toBeEnabled(), { timeout: 4000 })
    await userEvent.click(within(screen.getByTestId('export-problem')).getByRole('button', { name: t.print.retry }))
    await waitFor(() => expect(downloadFiles).toHaveBeenCalledTimes(1))
    expect(ctx.exportPdf).toHaveBeenCalledTimes(2)
  })

  it('a timeout: advises fewer pages and can be retried at once', async () => {
    const ctx = setup()
    engine = ctx.engine
    ctx.exportPdf.mockRejectedValueOnce(fail(504, 'export_timeout', 'too slow'))
    await pick(/Print-quality PDF/)
    await download()
    const problem = await screen.findByTestId('export-problem')
    expect(problem).toHaveTextContent(t.print.problems.timeout)
    expect(problem).toHaveTextContent(t.print.problems.timeoutHint)
    expect(within(problem).getByRole('button', { name: t.print.retry })).toBeEnabled()
    expect(within(dialog()).getByRole('button', { name: t.dialog.downloadButton })).toBeEnabled()
  })

  it('an unusable font: says what the server said and offers no retry', async () => {
    const ctx = setup()
    engine = ctx.engine
    ctx.exportPdf.mockRejectedValueOnce(fail(400, 'invalid_font', 'A requested font file does not exist.'))
    await pick(/Print-quality PDF/)
    await download()
    const problem = await screen.findByTestId('export-problem')
    expect(problem).toHaveTextContent('A requested font file does not exist.')
    expect(within(problem).queryByRole('button')).toBeNull()
  })

  it('an unavailable service points to the standard PDF', async () => {
    const ctx = setup()
    engine = ctx.engine
    ctx.exportPdf.mockRejectedValueOnce(fail(503, 'export_unavailable', 'no browser'))
    await pick(/Print-quality PDF/)
    await download()
    expect(await screen.findByTestId('export-problem')).toHaveTextContent(t.print.problems.unavailableHint)
  })

  it('a new failure replaces the old message, and a new download clears it', async () => {
    const ctx = setup()
    engine = ctx.engine
    ctx.exportPdf.mockRejectedValueOnce(fail(504, 'export_timeout', 'slow')).mockRejectedValueOnce(fail(500, 'export_failed', 'boom'))
    await pick(/Print-quality PDF/)
    await download()
    expect(await screen.findByTestId('export-problem')).toHaveAttribute('data-kind', 'timeout')
    await download()
    await waitFor(() => expect(screen.getByTestId('export-problem')).toHaveAttribute('data-kind', 'failed'))
    expect(screen.getAllByTestId('export-problem')).toHaveLength(1)
  })

  it('a failure of the browser-side export is shown with its own words', async () => {
    const ctx = setup()
    engine = ctx.engine
    ctx.exportPdf.mockRejectedValueOnce(new Error('An image in this design could not be embedded.'))
    await pick(/Print-quality PDF/)
    await download()
    expect(await screen.findByRole('alert')).toHaveTextContent('An image in this design could not be embedded.')
  })

  it('keeps the countdown honest when time passes (fake timers)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const ctx = setup()
    engine = ctx.engine
    ctx.exportPdf.mockRejectedValueOnce(fail(503, 'export_busy', 'busy', { retryAfter: 3 }))
    await pick(/Print-quality PDF/)
    await download()
    const problem = await screen.findByTestId('export-problem')
    expect(within(problem).getByRole('button')).toHaveTextContent('Try again in 3 s')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(within(screen.getByTestId('export-problem')).getByRole('button')).toHaveTextContent('Try again in 2 s')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
    expect(within(screen.getByTestId('export-problem')).getByRole('button')).toHaveTextContent(t.print.retry)
  })
})

describe('Download dialog: file names', () => {
  let engine: EditorEngine | null = null
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(downloadFiles).mockClear()
  })
  afterEach(() => {
    engine?.dispose()
    engine = null
  })

  const story = (): DoryDocument => ({ ...createBlankDocument(1080, 1920), meta: { presetId: 'instagram-story' } })

  it('starts simple, shows the name, and remembers a switch to detailed names with a timestamp', async () => {
    ;({ engine } = setup({ doc: story() }))
    await pick(/^PNG/)
    await more()
    expect(screen.getByTestId('download-filename')).toHaveTextContent('Menu.png')
    expect(within(dialog()).queryByRole('switch', { name: t.dialog.downloadNamesTimestamp })).toBeNull()
    await userEvent.click(within(dialog()).getByRole('radio', { name: t.dialog.downloadNamesStructured }))
    expect(screen.getByTestId('download-filename')).toHaveTextContent('menu_instagram_instagram-story_1080x1920.png')
    await userEvent.click(within(dialog()).getByRole('switch', { name: t.dialog.downloadNamesTimestamp }))
    expect(screen.getByTestId('download-filename')).toHaveTextContent(/menu_instagram_instagram-story_1080x1920_\d{10}\.png/)
    await download()
    await waitFor(() => expect(downloadFiles).toHaveBeenCalled())
    expect(vi.mocked(downloadFiles).mock.calls[0][0][0].filename).toMatch(/^menu_instagram_instagram-story_1080x1920_\d{10}\.png$/)
    expect(localStorage.getItem('doory-export-filenames')).toBe('structured')
    expect(localStorage.getItem('doory-export-filename-timestamp')).toBe('on')
  })

  it("starts from the instance's default", async () => {
    const handle = createMemoryAdapter()
    handle.adapter.exportFilenames = { style: 'structured', timestamp: false }
    engine = new EditorEngine({ adapter: handle.adapter, document: story(), meta: { id: 'd', title: 'Menu', mode: 'account' }, ephemeral: true })
    render(
      <EditorProvider engine={engine} portalRoot={document.body}>
        <DownloadDialog />
      </EditorProvider>,
    )
    await more()
    expect(within(dialog()).getByRole('radio', { name: t.dialog.downloadNamesStructured })).toBeChecked()
  })
})

describe('Download dialog: pictures', () => {
  let engine: EditorEngine | null = null
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(downloadFiles).mockClear()
  })
  afterEach(() => {
    engine?.dispose()
    engine = null
  })

  const story = (): DoryDocument => ({ ...createBlankDocument(1080, 1920), meta: { presetId: 'instagram-story' } })
  const OPTIMIZE: ImageOptimizeInfo = {
    formats: ['png', 'jpg', 'webp', 'avif'],
    optimizers: [
      { id: 'builtin', name: 'Built-in', formats: ['jpg', 'png'], sendsOffsite: false },
      { id: 'custom', name: 'Our optimizer', formats: ['png', 'jpg', 'webp', 'avif'], sendsOffsite: true },
    ],
    default: 'builtin',
  }

  function withServer(doc: DoryDocument, answer: (input: OptimizeImageInput) => Promise<OptimizedImage>) {
    const handle = createMemoryAdapter()
    handle.adapter.imageOptimize = OPTIMIZE
    const optimizeImage = vi.fn(answer)
    handle.adapter.optimizeImage = optimizeImage
    const created = new EditorEngine({ adapter: handle.adapter, document: doc, meta: { id: 'd', title: 'Menu', mode: 'account' }, ephemeral: true })
    render(
      <EditorProvider engine={created} portalRoot={document.body}>
        <DownloadDialog />
      </EditorProvider>,
    )
    return { engine: created, optimizeImage }
  }

  const sizeField = () => within(dialog()).getByRole('textbox', { name: t.dialog.downloadSize })

  it("starts on the design's own size: its card, JPG at 1x and the Balanced stop", () => {
    ;({ engine } = setup({ doc: story() }))
    const own = within(dialog()).getByRole('button', { name: /Instagram Story/ })
    expect(own).toHaveAttribute('aria-pressed', 'true')
    expect(own).toHaveTextContent(t.dialog.downloadYourSize)
    expect(within(dialog()).getByRole('radio', { name: /^JPG/ })).toBeChecked()
    expect(sizeField()).toHaveValue('1x')
    expect(within(dialog()).getByRole('spinbutton', { name: t.dialog.downloadQualityValue })).toHaveValue(82)
    expect(within(dialog()).getByRole('button', { name: /Balanced/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('download-size')).toHaveTextContent('1,080 × 1,920 px')
  })

  it('has no own-size card for a custom size, and a card sets the format and its options', async () => {
    ;({ engine } = setup())
    expect(within(dialog()).queryByText(t.dialog.downloadYourSize)).toBeNull()
    await userEvent.click(within(dialog()).getByRole('button', { name: new RegExp(t.dialog.downloadPurposes.graphic) }))
    expect(within(dialog()).getByRole('radio', { name: /^PNG/ })).toBeChecked()
    expect(sizeField()).toHaveValue('2x')
    await more()
    expect(within(dialog()).getByRole('switch', { name: new RegExp(t.dialog.downloadTransparent) })).toBeChecked()
    // PNG has no quality to set.
    expect(within(dialog()).queryByRole('spinbutton', { name: t.dialog.downloadQualityValue })).toBeNull()
  })

  it('takes 2x, 1080w or 1350h as the size, and blocks the download for anything else', async () => {
    ;({ engine } = setup({ doc: story() }))
    await userEvent.clear(sizeField())
    await userEvent.type(sizeField(), '540w')
    expect(screen.getByTestId('download-size')).toHaveTextContent('540 × 960 px')
    await userEvent.clear(sizeField())
    await userEvent.type(sizeField(), 'big')
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(t.dialog.downloadSizeInvalid)
    expect(within(dialog()).getByRole('button', { name: t.dialog.downloadButton })).toBeDisabled()
    await userEvent.click(within(dialog()).getByRole('button', { name: '2x' }))
    expect(screen.getByTestId('download-size')).toHaveTextContent('2,160 × 3,840 px')
    expect(within(dialog()).getByRole('button', { name: t.dialog.downloadButton })).toBeEnabled()
  })

  it('the stops and the number set the quality; a typed number leaves the stops', async () => {
    ;({ engine } = setup({ doc: story() }))
    await userEvent.click(within(dialog()).getByRole('button', { name: /Small file/ }))
    const number = within(dialog()).getByRole('spinbutton', { name: t.dialog.downloadQualityValue })
    expect(number).toHaveValue(65)
    expect(within(dialog()).getByRole('slider', { name: t.dialog.downloadQuality })).toHaveValue('65')
    await userEvent.clear(number)
    await userEvent.type(number, '70')
    expect(within(dialog()).getByRole('button', { name: /Small file/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('downloads at the typed size, and remembers the settings as Last used', async () => {
    ;({ engine } = setup({ doc: story() }))
    await userEvent.clear(sizeField())
    await userEvent.type(sizeField(), '540w')
    await download()
    await waitFor(() => expect(downloadFiles).toHaveBeenCalled())
    expect(vi.mocked(downloadFiles).mock.calls[0][0][0].filename).toBe('Menu.jpg')
    expect(JSON.parse(localStorage.getItem('doory-export-last') ?? '{}')).toMatchObject({ formatId: 'jpg', options: { size: '540w', qualityPreset: 'balanced' } })
  })

  it('without a server: no AVIF, no optimizer, no palette PNG', () => {
    ;({ engine } = setup({ doc: story() }))
    expect(within(dialog()).queryByRole('radio', { name: /^AVIF/ })).toBeNull()
    expect(within(dialog()).queryByRole('switch', { name: new RegExp(t.dialog.downloadOptimize) })).toBeNull()
  })

  it('optimizes on the server with the chosen optimizer, and says when it leaves the format alone', async () => {
    const answer = async (input: OptimizeImageInput): Promise<OptimizedImage> => ({ blob: new Blob(['small'], { type: 'image/jpeg' }), format: input.format, width: 1080, height: 1920, quality: 82, bytesBefore: 9000, optimizer: 'builtin', optimized: true, warnings: [] })
    const ctx = withServer(story(), answer)
    engine = ctx.engine
    expect(within(dialog()).getByRole('radio', { name: /^AVIF/ })).toBeInTheDocument()
    const toggle = within(dialog()).getByRole('switch', { name: new RegExp(t.dialog.downloadOptimize) })
    expect(toggle).toBeChecked()
    expect(within(dialog()).getByText(t.dialog.downloadOptimizerLocal)).toBeInTheDocument()
    await userEvent.click(within(dialog()).getByRole('radio', { name: 'Our optimizer' }))
    expect(within(dialog()).getByText(t.dialog.downloadOptimizerOffsite('Our optimizer'))).toBeInTheDocument()
    await userEvent.click(within(dialog()).getByRole('radio', { name: 'Built-in' }))
    await userEvent.click(within(dialog()).getByRole('radio', { name: /^WebP/ }))
    expect(within(dialog()).getByText(t.dialog.downloadOptimizerSkips('Built-in', 'WebP'))).toBeInTheDocument()
    await userEvent.click(within(dialog()).getByRole('radio', { name: /^JPG/ }))
    await download()
    await waitFor(() => expect(downloadFiles).toHaveBeenCalled())
    const sent = ctx.optimizeImage.mock.calls.map(([input]) => input).find((input) => input.optimize === 'builtin' && input.format === 'jpg')
    expect(sent).toMatchObject({ format: 'jpg', quality: 82, optimize: 'builtin' })
    expect(vi.mocked(downloadFiles).mock.calls[0][0][0].filename).toBe('Menu.jpg')
  })

  it('starts on the default optimizer when the one used last is no longer offered', async () => {
    saveLastExport({ formatId: 'jpg', options: { ...DEFAULT_EXPORT_OPTIONS, optimize: true, optimizer: 'gone' } })
    const answer = async (input: OptimizeImageInput): Promise<OptimizedImage> => ({ blob: new Blob(['small'], { type: 'image/jpeg' }), format: input.format, width: 1080, height: 1080, quality: 82, bytesBefore: 9000, optimizer: 'builtin', optimized: true, warnings: [] })
    const ctx = withServer(createBlankDocument(1080, 1080), answer)
    engine = ctx.engine
    expect(within(dialog()).getByRole('radio', { name: 'Built-in' })).toBeChecked()
    await download()
    await waitFor(() => expect(downloadFiles).toHaveBeenCalled())
    expect(ctx.optimizeImage.mock.calls.map(([input]) => input.optimize)).not.toContain('gone')
    expect(ctx.optimizeImage).toHaveBeenCalledWith(expect.objectContaining({ format: 'jpg', optimize: 'builtin' }))
  })

  it('when the server fails, downloads the browser file and says so', async () => {
    const ctx = withServer(story(), async () => {
      throw new ApiError({ status: 503, code: 'export_busy', message: 'Busy' })
    })
    engine = ctx.engine
    await download()
    await waitFor(() => expect(downloadFiles).toHaveBeenCalled())
    const file = vi.mocked(downloadFiles).mock.calls[0][0][0]
    expect(file.filename).toBe('Menu.jpg')
    expect(file.blob.type).toBe('image/jpeg')
    expect(ctx.engine.state.toasts.map((toast) => toast.message)).toContain(t.dialog.downloadServerSkipped)
  })

  it('shows the same export as an MCP tool call and a REST request', async () => {
    ;({ engine } = setup({ doc: story(), id: 'design-9' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: t.dialog.downloadApi }))
    const api = screen.getByTestId('download-api')
    expect(api).toHaveTextContent('// MCP tool export_design')
    expect(api).toHaveTextContent('"format": "jpg"')
    expect(api).toHaveTextContent('"quality": "balanced"')
    expect(api).toHaveTextContent('/api/v1/designs/design-9/export/image/')
  })

  it('shows the API call for the PDFs with their print options, and for SVG', async () => {
    ;({ engine } = setup({ doc: story(), id: 'design-9' }))
    await pick(/Print-quality PDF/)
    await pick(new RegExp(t.print.presets.standard))
    await userEvent.click(within(dialog()).getByRole('button', { name: t.dialog.downloadApi }))
    const api = screen.getByTestId('download-api')
    expect(api).toHaveTextContent('"format": "pdf-print"')
    expect(api).toHaveTextContent('"bleed_mm": 3')
    expect(api).toHaveTextContent('"crop_marks": true')
    expect(api).not.toHaveTextContent('quality')
    await pick(/^SVG/)
    expect(screen.getByTestId('download-api')).toHaveTextContent('"format": "svg"')
    expect(screen.getByTestId('download-api')).not.toHaveTextContent('bleed_mm')
  })

  it('sums up the files in the footer and names the button by their number', async () => {
    ;({ engine } = setup())
    await pick(/^PNG/)
    expect(screen.getByTestId('download-summary')).toHaveTextContent(`${t.dialog.downloadFiles(4, 'PNG')} ${t.dialog.downloadInZip}`)
    expect(within(dialog()).getByRole('button', { name: t.dialog.downloadNFiles(4) })).toBeInTheDocument()
    await pick(/^PDF/)
    expect(screen.getByTestId('download-summary')).toHaveTextContent('1 PDF · 4 pages · screen')
  })
})

describe('Download dialog: the compare preview', () => {
  let engine: EditorEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })

  function preview(zoom: 'fit' | 'detail') {
    engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: createBlankDocument(400, 500), meta: { id: 'd', title: 'Menu', mode: 'account' }, ephemeral: true })
    return render(
      <EditorProvider engine={engine} portalRoot={document.body}>
        <ComparePreview before="blob:before" after="blob:after" size={{ width: 400, height: 500 }} zoom={zoom} tag="JPG 82 · 65 KB" />
      </EditorProvider>,
    )
  }

  it('moves the line with the arrow keys, Home and End', async () => {
    preview('fit')
    const slider = screen.getByRole('slider', { name: t.dialog.downloadCompare })
    expect(slider).toHaveAttribute('aria-valuenow', '50')
    slider.focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(slider).toHaveAttribute('aria-valuenow', '60')
    await userEvent.keyboard('{Home}')
    expect(slider).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByTestId('download-compare-tag')).toHaveTextContent('JPG 82 · 65 KB')
  })

  it('in Detail the arrow keys pan the 3× picture, and the line stays', async () => {
    preview('detail')
    const frame = screen.getByTestId('download-compare')
    expect(frame).toHaveAttribute('data-zoom', 'detail')
    expect(frame.style.getPropertyValue('--px')).toBe('-100%')
    frame.focus()
    await userEvent.keyboard('{ArrowRight}{ArrowDown}')
    expect(frame.style.getPropertyValue('--px')).toBe('-110%')
    expect(frame.style.getPropertyValue('--py')).toBe('-110%')
    expect(frame.style.getPropertyValue('--split')).toBe('50%')
    // The file's side is clipped by a frame-sized box, not by the zoomed picture.
    expect(frame.querySelector('[aria-hidden="true"] > img')?.parentElement).not.toBe(frame)
  })
})
