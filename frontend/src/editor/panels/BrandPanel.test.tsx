import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBlankDocument } from '@/lib/document'
import type { EditorServices } from '@/types/adapter'
import type { BrandKit } from '@/types/api'
import { setupEditor } from '../animation/testing'
import { EditorProvider } from '../EditorProvider'
import type { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import { BrandPanel } from './BrandPanel'

const kit = (id: string, name: string, isDefault = false): BrandKit => ({ id, name, is_default: isDefault, colors: [], fonts: [], logos: [], created_at: '', updated_at: '' })

async function open(initial: BrandKit[]) {
  const { engine } = await setupEditor({ doc: createBlankDocument(1080, 1920) })
  const brand = {
    list: vi.fn(async () => initial),
    save: vi.fn(async (next: BrandKit) => next),
    remove: vi.fn(async () => undefined),
  }
  ;(engine.adapter.services as EditorServices).brand = brand
  await act(async () => {
    render(
      <EditorProvider engine={engine} portalRoot={document.body}>
        <BrandPanel />
      </EditorProvider>,
    )
  })
  return { engine, brand }
}

const menu = (name: string) => screen.getByRole('button', { name: `${t.brand.kit}: ${name}` })

describe('Brand panel kit actions', () => {
  let engine: EditorEngine | null = null

  afterEach(() => {
    engine?.dispose()
    engine = null
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('renames the kit that is open', async () => {
    const opened = await open([kit('a', 'Acme', true), kit('b', 'Beta')])
    engine = opened.engine
    fireEvent.click(await screen.findByTestId('brand-kit-rename'))
    const input = screen.getByTestId('brand-kit-rename-input')
    expect(input).toHaveValue('Acme')
    fireEvent.change(input, { target: { value: '  Acme Studio ' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('brand-kit-rename-save'))
    })
    expect(opened.brand.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', name: 'Acme Studio' }))
    expect(menu('Acme Studio')).toBeInTheDocument()
    expect(screen.queryByTestId('brand-kit-rename-input')).toBeNull()
  })

  it('does not rename to a blank name, and Escape leaves the name alone', async () => {
    const opened = await open([kit('a', 'Acme', true)])
    engine = opened.engine
    fireEvent.click(await screen.findByTestId('brand-kit-rename'))
    const input = screen.getByTestId('brand-kit-rename-input')
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByTestId('brand-kit-rename-save')).toBeDisabled()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('brand-kit-rename-input')).toBeNull()
    expect(opened.brand.save).not.toHaveBeenCalled()
    expect(menu('Acme')).toBeInTheDocument()
  })

  it('deletes the kit after a confirmation and opens the other one', async () => {
    const opened = await open([kit('a', 'Acme', true), kit('b', 'Beta')])
    engine = opened.engine
    fireEvent.click(await screen.findByRole('button', { name: t.brand.deleteKit }))
    expect(opened.brand.remove).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByTestId('brand-kit-delete-confirm'))
    })
    expect(opened.brand.remove).toHaveBeenCalledWith('a')
    expect(menu('Beta')).toBeInTheDocument()
  })

  it('offers a new kit when the last one is deleted', async () => {
    const opened = await open([kit('a', 'Acme', true)])
    engine = opened.engine
    fireEvent.click(await screen.findByRole('button', { name: t.brand.deleteKit }))
    await act(async () => {
      fireEvent.click(screen.getByTestId('brand-kit-delete-confirm'))
    })
    expect(screen.getByTestId('brand-kit-name')).toBeInTheDocument()
    expect(screen.queryByTestId('brand-kit-rename')).toBeNull()
  })

  it('keeps the kit and says so when the delete fails', async () => {
    const opened = await open([kit('a', 'Acme', true)])
    engine = opened.engine
    opened.brand.remove.mockRejectedValueOnce(new Error('nope'))
    fireEvent.click(await screen.findByRole('button', { name: t.brand.deleteKit }))
    await act(async () => {
      fireEvent.click(screen.getByTestId('brand-kit-delete-confirm'))
    })
    expect(screen.getByRole('alert')).toHaveTextContent(t.brand.deleteFailed)
    expect(menu('Acme')).toBeInTheDocument()
  })
})
