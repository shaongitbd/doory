import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { EditorProvider } from '../EditorProvider'
import { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import { ResizeDialog } from './ResizeDialog'

function setup(width = 800, height = 600) {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(width, height), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
  const resize = vi.spyOn(engine.pages, 'resize').mockImplementation(() => undefined)
  render(
    <EditorProvider engine={engine} portalRoot={document.body}>
      <ResizeDialog />
    </EditorProvider>,
  )
  return { engine, resize, width: screen.getByRole('textbox', { name: t.dialog.resizeWidth }), height: screen.getByRole('textbox', { name: t.dialog.resizeHeight }) }
}

describe('Resize dialog size fields', () => {
  let engine: EditorEngine | null = null
  afterEach(() => engine?.dispose())

  it('show the limit as their tooltip, in the unit of the field', async () => {
    const ctx = setup()
    engine = ctx.engine
    expect(ctx.width).toHaveAttribute('title', 'Between 1 and 20000 px')
    expect(ctx.height).toHaveAttribute('title', 'Between 1 and 20000 px')
    await userEvent.click(screen.getByRole('radio', { name: 'mm' }))
    expect(screen.getByRole('textbox', { name: t.dialog.resizeWidth })).toHaveAttribute('title', 'Between 0.3 and 5291.6 mm')
  })

  it.each([
    ['99999', 20000],
    ['0', 1],
  ])('clamp %s to %i when the field is committed', async (typed, expected) => {
    const ctx = setup()
    engine = ctx.engine
    await userEvent.clear(ctx.width)
    await userEvent.type(ctx.width, `${typed}{Enter}`)
    expect(ctx.width).toHaveValue(String(expected))
    expect(screen.getByText(new RegExp(`New: ${expected} × 600 px`))).toBeInTheDocument()
  })

  it('applies the clamped size', async () => {
    const ctx = setup()
    engine = ctx.engine
    await userEvent.clear(ctx.height)
    await userEvent.type(ctx.height, '123456{Enter}')
    await userEvent.click(screen.getByRole('button', { name: t.dialog.resizeTitle }))
    expect(ctx.resize).toHaveBeenCalledExactlyOnceWith(800, 20000, 'scale', { scope: 'all', pageId: ctx.engine.state.activePageId })
  })

  it('with the ratio locked the other side follows but stays inside the limits', async () => {
    const ctx = setup(100, 800)
    engine = ctx.engine
    await userEvent.click(screen.getByRole('button', { name: t.dialog.resizeLock }))
    await userEvent.clear(ctx.width)
    await userEvent.type(ctx.width, '20000{Enter}')
    expect(screen.getByText(/New: 20000 × 20000 px/)).toBeInTheDocument()
  })
})

describe('Resize dialog on a design with several pages', () => {
  let engine: EditorEngine | null = null
  afterEach(() => engine?.dispose())

  function setupMany(props?: Record<string, unknown>, mixed = true) {
    const handle = createMemoryAdapter()
    const eng = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
    eng.pages.add(1, mixed ? { width: 300, height: 400 } : undefined)
    const resize = vi.spyOn(eng.pages, 'resize').mockImplementation(() => undefined)
    render(
      <EditorProvider engine={eng} portalRoot={document.body}>
        <ResizeDialog props={props} />
      </EditorProvider>,
    )
    return { engine: eng, resize }
  }

  it('starts on this page for a design that mixes sizes, with the size of the page in view', async () => {
    const ctx = setupMany()
    engine = ctx.engine
    expect(screen.getByRole('radio', { name: t.dialog.resizeThisPage })).toBeChecked()
    expect(screen.getByRole('textbox', { name: t.dialog.resizeWidth })).toHaveValue('300')
    expect(screen.getByText(/Current size: 300 × 400 px/)).toBeInTheDocument()
    await userEvent.clear(screen.getByRole('textbox', { name: t.dialog.resizeWidth }))
    await userEvent.type(screen.getByRole('textbox', { name: t.dialog.resizeWidth }), '320{Enter}')
    await userEvent.click(screen.getByRole('button', { name: t.dialog.resizeTitle }))
    expect(ctx.resize).toHaveBeenCalledExactlyOnceWith(320, 400, 'scale', { scope: 'page', pageId: ctx.engine.state.activePageId })
  })

  it('starts on all pages when they share a size and can be switched', async () => {
    const ctx = setupMany(undefined, false)
    engine = ctx.engine
    expect(screen.getByRole('radio', { name: t.dialog.resizeAllPages(2) })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: t.dialog.resizeThisPage }))
    await userEvent.clear(screen.getByRole('textbox', { name: t.dialog.resizeHeight }))
    await userEvent.type(screen.getByRole('textbox', { name: t.dialog.resizeHeight }), '500{Enter}')
    await userEvent.click(screen.getByRole('button', { name: t.dialog.resizeTitle }))
    expect(ctx.resize).toHaveBeenCalledExactlyOnceWith(800, 500, 'scale', { scope: 'page', pageId: ctx.engine.state.activePageId })
  })

  it('takes the scope and the page from its props', () => {
    const handle = createMemoryAdapter()
    const eng = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
    eng.pages.add(1, { width: 300, height: 400 })
    engine = eng
    render(
      <EditorProvider engine={eng} portalRoot={document.body}>
        <ResizeDialog props={{ pageId: eng.state.doc.pages[0].id, scope: 'all' }} />
      </EditorProvider>,
    )
    expect(screen.getByRole('radio', { name: t.dialog.resizeAllPages(2) })).toBeChecked()
    expect(screen.getByRole('textbox', { name: t.dialog.resizeWidth })).toHaveValue('800')
  })

  it('draws the page before and after, from the same content mapping the resize uses', async () => {
    const ctx = setupMany()
    engine = ctx.engine
    expect(screen.getByTestId('resize-preview')).toBeInTheDocument()
    await userEvent.clear(screen.getByRole('textbox', { name: t.dialog.resizeWidth }))
    await userEvent.type(screen.getByRole('textbox', { name: t.dialog.resizeWidth }), '600{Enter}')
    const after = await screen.findByAltText(t.dialog.resizePreviewAlt(t.dialog.resizePreviewAfter, 600, 400))
    expect(after).toHaveAttribute('src', expect.stringMatching(/^data:image\/png/))
  })

  it('does not draw a preview of a page too large to draw, and keeps the empty frame', async () => {
    const ctx = setupMany()
    engine = ctx.engine
    await userEvent.clear(screen.getByRole('textbox', { name: t.dialog.resizeWidth }))
    await userEvent.type(screen.getByRole('textbox', { name: t.dialog.resizeWidth }), '20000{Enter}')
    await userEvent.clear(screen.getByRole('textbox', { name: t.dialog.resizeHeight }))
    await userEvent.type(screen.getByRole('textbox', { name: t.dialog.resizeHeight }), '20000{Enter}')
    expect(await screen.findByTestId('resize-preview-after')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.queryByAltText(/After resizing/)).toBeNull()
  })

  it('does nothing on a double click of the size the page already has, like the disabled Resize button', async () => {
    const ctx = setup(1080, 1080)
    engine = ctx.engine
    await userEvent.dblClick(screen.getByRole('button', { name: /^Post 1080 × 1080 px/, pressed: true }))
    expect(ctx.resize).not.toHaveBeenCalled()
    await userEvent.dblClick(screen.getByRole('button', { name: /^Story 1080 × 1920 px/ }))
    expect(ctx.resize).toHaveBeenCalledExactlyOnceWith(1080, 1920, 'scale', { scope: 'all', pageId: ctx.engine.state.activePageId })
  })

  it('has no scope choice for a single page', () => {
    const ctx = setup()
    engine = ctx.engine
    expect(screen.queryByRole('radiogroup', { name: t.dialog.resizeScope })).toBeNull()
  })
})
