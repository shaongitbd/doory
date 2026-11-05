import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FontFamily } from '@/types/api'
import { createBlankDocument } from '@/lib/document'
import { fontsApi } from '@/lib/api/fonts'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorProvider } from '../../EditorProvider'
import { EditorEngine } from '../../engine/editor'
import { EMPTY_SELECTION } from '../../store/editorStore'
import { TextSection } from './text'

const family: FontFamily = {
  id: '1', family: 'Test Sans', category: 'sans-serif', scripts: ['latin'], is_variable: false,
  is_user_font: false, popularity: 1, variants: [
    { weight: 300, style: 'normal', url: '/light.woff2' },
    { weight: 600, style: 'normal', url: '/semibold.woff2' },
    { weight: 400, style: 'italic', url: '/italic.woff2' },
  ],
}

function mount(weight: number, italic = false, fontFamily = family.family, found: FontFamily | null = family) {
  const doc = createBlankDocument(800, 600)
  const engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: doc, meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
  vi.spyOn(engine.fonts, 'lookup').mockResolvedValue(found)
  const text = vi.spyOn(engine.style, 'text').mockImplementation(() => undefined)
  engine.store.setState({ selection: {
    ...EMPTY_SELECTION, pageId: doc.pages[0].id, ids: ['t1'], kinds: ['text'],
    objects: [{ id: 't1', type: 'textbox', fontFamily, fontWeight: weight, fontStyle: italic ? 'italic' : 'normal' }],
    version: 1,
  } })
  render(<EditorProvider engine={engine} portalRoot={document.body}><TextSection /></EditorProvider>)
  return { engine, text }
}

describe('font weight menu', () => {
  it('offers the selected font’s installed normal weights and applies a choice', async () => {
    const { engine, text } = mount(300)
    await waitFor(() => expect(screen.getByTestId('ed-font-weight')).toHaveTextContent('Light'))
    fireEvent.click(screen.getByTestId('ed-font-weight'))
    expect(screen.getByTestId('ed-weight-300')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('ed-weight-600')).toBeEnabled()
    expect(screen.queryByTestId('ed-weight-400')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ed-weight-600'))
    expect(text).toHaveBeenCalledWith({ fontWeight: 600 }, 'Change font weight')
    engine.dispose()
  })

  it('offers italic weights when italic is selected and keeps an unavailable saved weight visible', async () => {
    const { engine } = mount(600, true)
    await waitFor(() => expect(engine.fonts.lookup).toHaveBeenCalled())
    fireEvent.click(screen.getByTestId('ed-font-weight'))
    expect(screen.getByTestId('ed-weight-400')).toBeEnabled()
    expect(screen.getByTestId('ed-weight-600')).toBeDisabled()
    expect(screen.queryByTestId('ed-weight-300')).not.toBeInTheDocument()
    engine.dispose()
  })

  it('does not claim that a system font has unverified intermediate weights', async () => {
    const { engine } = mount(400, false, 'Arial', null)
    await waitFor(() => expect(engine.fonts.lookup).toHaveBeenCalledWith('Arial'))
    fireEvent.click(screen.getByTestId('ed-font-weight'))
    expect(screen.getByTestId('ed-weight-400')).toBeEnabled()
    expect(screen.getByTestId('ed-weight-700')).toBeEnabled()
    expect(screen.queryByTestId('ed-weight-500')).not.toBeInTheDocument()
    engine.dispose()
  })

  it('adjusts an unsupported weight when switching fonts and explains the change', async () => {
    const { engine, text } = mount(600)
    vi.mocked(engine.fonts.lookup).mockImplementation(async (name) => name === family.family ? family : null)
    fireEvent.click(screen.getByTestId('ed-font'))
    fireEvent.change(screen.getByTestId('font-search'), { target: { value: 'Georgia' } })
    await waitFor(() => expect(screen.getAllByRole('option').filter((row) => row.hasAttribute('data-font'))).toHaveLength(1))
    await userEvent.click(screen.getByRole('option', { name: 'Georgia' }))
    await waitFor(() => expect(text).toHaveBeenCalledWith({ fontFamily: '"Georgia", serif', fontWeight: 700 }, 'Change font'))
    expect(engine.state.toasts.at(-1)?.message).toBe("Semi Bold isn't available for Georgia. Changed to Bold.")
    engine.dispose()
  })

  it('uses the nearest installed catalog face when the new family lacks the current weight', async () => {
    const inter = { ...family, family: 'Inter', variants: [{ weight: 400, style: 'normal' as const, url: '/inter-regular.woff2' }, { weight: 700, style: 'normal' as const, url: '/inter-bold.woff2' }] }
    const { engine, text } = mount(800)
    engine.fonts.remember([inter])
    engine.store.setState({ recentFonts: ['Inter'] })
    fireEvent.click(screen.getByTestId('ed-font'))
    await userEvent.click(await screen.findByRole('option', { name: 'Inter' }))
    expect(text).toHaveBeenCalledWith({ fontFamily: '"Inter", sans-serif', fontWeight: 700 }, 'Change font')
    expect(engine.state.toasts.at(-1)?.message).toBe("Extra Bold isn't available for Inter. Changed to Bold.")
    engine.dispose()
  })

  it('downloads an offered weight before applying it', async () => {
    vi.spyOn(fontsApi, 'weights').mockResolvedValue({ enabled: true, weights: [{ weight: 500, style: 'normal' }] })
    const added = vi.spyOn(fontsApi, 'addWeight').mockResolvedValue({ ...family, variants: [...family.variants, { weight: 500, style: 'normal', url: '/medium.woff2' }] })
    const { engine, text } = mount(300)
    fireEvent.click(screen.getByTestId('ed-font-weight'))
    const option = await screen.findByTestId('ed-add-weight-500')
    fireEvent.click(option)
    await waitFor(() => expect(added).toHaveBeenCalledWith('Test Sans', 500, 'normal'))
    await waitFor(() => expect(text).toHaveBeenCalledWith({ fontWeight: 500 }, 'Change font weight'))
    expect(screen.queryByTestId('ed-add-weight-500')).not.toBeInTheDocument()
    engine.dispose()
    vi.restoreAllMocks()
  })

  it('does not apply a downloaded weight to a later selection', async () => {
    vi.spyOn(fontsApi, 'weights').mockResolvedValue({ enabled: true, weights: [{ weight: 500, style: 'normal' }] })
    let resolveDownload!: (value: FontFamily) => void
    vi.spyOn(fontsApi, 'addWeight').mockImplementation(() => new Promise((resolve) => { resolveDownload = resolve }))
    const { engine, text } = mount(300)
    fireEvent.click(screen.getByTestId('ed-font-weight'))
    fireEvent.click(await screen.findByTestId('ed-add-weight-500'))
    engine.store.setState({ selection: { ...engine.state.selection, ids: ['another'], version: engine.state.selection.version + 1 } })
    resolveDownload({ ...family, variants: [...family.variants, { weight: 500, style: 'normal', url: '/medium.woff2' }] })
    await waitFor(() => expect(screen.queryByTestId('ed-add-weight-500')).not.toBeInTheDocument())
    expect(text).not.toHaveBeenCalled()
    engine.dispose()
    vi.restoreAllMocks()
  })

  it('does not offer catalog downloads for a user-uploaded family', async () => {
    vi.spyOn(fontsApi, 'weights').mockResolvedValue({ enabled: true, weights: [{ weight: 500, style: 'normal' }] })
    const { engine } = mount(300, false, family.family, { ...family, is_user_font: true })
    fireEvent.click(screen.getByTestId('ed-font-weight'))
    await waitFor(() => expect(screen.getByTestId('ed-weight-600')).toBeEnabled())
    expect(screen.queryByTestId('ed-add-weight-500')).not.toBeInTheDocument()
    engine.dispose()
    vi.restoreAllMocks()
  })

  it('offers a download instead of pretending an uninstalled catalog weight is ready', async () => {
    vi.spyOn(fontsApi, 'weights').mockResolvedValue({ enabled: true, weights: [{ weight: 700, style: 'normal' }] })
    const { engine } = mount(700, false, 'Test Sans', null)
    fireEvent.click(screen.getByTestId('ed-font-weight'))
    expect(await screen.findByTestId('ed-add-weight-700')).toBeEnabled()
    expect(screen.queryByTestId('ed-weight-700')).not.toBeInTheDocument()
    engine.dispose()
    vi.restoreAllMocks()
  })
})
