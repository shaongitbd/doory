import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { EditorProvider } from '../EditorProvider'
import { EditorEngine } from '../engine/editor'
import type { CropRect, UpscaleMethod } from '../engine/upscale/types'
import { t } from '../strings'
import { UpscaleDialog } from './UpscaleDialog'

// jsdom has no worker or OffscreenCanvas; the dialog only needs to know that this browser can run it.
vi.mock('../engine/upscale/support', async (importOriginal) => ({ ...(await importOriginal<typeof import('../engine/upscale/support')>()), isUpscaleSupported: () => true }))

type Run = (options: { scale: number; method?: UpscaleMethod; detail?: number }, onProgress?: (percent: number) => void, signal?: AbortSignal) => Promise<boolean>

function setup(run: Run, source: { width: number; height: number; crop: CropRect | null } = { width: 4000, height: 3000, crop: null }) {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
  vi.spyOn(engine.style, 'selectedImageSource').mockReturnValue(source)
  const upscale = vi.spyOn(engine.style, 'upscale').mockImplementation(run)
  const closeDialog = vi.spyOn(engine, 'closeDialog').mockImplementation(() => undefined)
  const toast = vi.spyOn(engine, 'toast').mockImplementation(() => undefined)
  render(
    <EditorProvider engine={engine} portalRoot={document.body}>
      <UpscaleDialog />
    </EditorProvider>,
  )
  return { engine, upscale, closeDialog, toast }
}

describe('UpscaleDialog', () => {
  let engine: EditorEngine | null = null
  beforeEach(() => {
    engine = null
  })
  afterEach(() => engine?.dispose())

  it('shows the current size and the 2x target', () => {
    const ctx = setup(() => Promise.resolve(true))
    engine = ctx.engine
    expect(screen.getByText(`${t.dialog.upscaleSource}: 4000 × 3000 px`)).toBeInTheDocument()
    expect(screen.getByText(`${t.dialog.upscaleTarget}: 8000 × 6000 px`)).toBeInTheDocument()
  })

  it('shows the visible crop when the photo has one', () => {
    const ctx = setup(() => Promise.resolve(true), { width: 240, height: 160, crop: { x: 40, y: 0, width: 160, height: 160 } })
    engine = ctx.engine
    expect(screen.getByText(`${t.dialog.upscaleCrop}: 160 × 160 px`)).toBeInTheDocument()
    expect(screen.getByText(`${t.dialog.upscaleTarget}: 480 × 320 px`)).toBeInTheDocument()
  })

  it('disables the action when the chosen factor would exceed the limit', async () => {
    const ctx = setup(() => Promise.resolve(true))
    engine = ctx.engine
    await userEvent.click(screen.getByRole('radio', { name: '4×' }))
    expect(screen.getByText(`${t.dialog.upscaleTarget}: 16000 × 12000 px`)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(t.dialog.upscaleTooLarge)
    expect(screen.getByRole('button', { name: t.dialog.upscaleButton })).toBeDisabled()
  })

  it('refuses a result this device cannot hold', () => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 4 })
    try {
      const ctx = setup(() => Promise.resolve(true))
      engine = ctx.engine
      expect(screen.getByText(`${t.dialog.upscaleTarget}: 8000 × 6000 px`)).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent(t.dialog.upscaleTooLarge)
      expect(screen.getByRole('button', { name: t.dialog.upscaleButton })).toBeDisabled()
    } finally {
      Reflect.deleteProperty(navigator, 'deviceMemory')
    }
  })

  it('runs the 2x upscale, reports progress and closes with a toast', async () => {
    let finish: (applied: boolean) => void = () => undefined
    const ctx = setup((_options, onProgress) => {
      onProgress?.(60)
      return new Promise<boolean>((resolve) => (finish = resolve))
    })
    engine = ctx.engine
    await userEvent.click(screen.getByRole('button', { name: t.dialog.upscaleButton }))
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60'))
    expect(ctx.upscale).toHaveBeenCalledWith({ scale: 2 }, expect.any(Function), expect.any(AbortSignal))
    finish(true)
    await waitFor(() => expect(ctx.closeDialog).toHaveBeenCalledTimes(1))
    expect(ctx.toast).toHaveBeenCalledWith(t.dialog.upscaleDone, 'success')
  })

  it('shows the error and offers a retry', async () => {
    const run = vi.fn<Run>().mockRejectedValueOnce(new Error('boom')).mockReturnValue(new Promise<boolean>(() => undefined))
    const ctx = setup(run)
    engine = ctx.engine
    await userEvent.click(screen.getByRole('button', { name: t.dialog.upscaleButton }))
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: t.dialog.upscaleRetry }))
    expect(run).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('cancels the run it started without a toast', async () => {
    let signal: AbortSignal | undefined
    const ctx = setup((_options, _onProgress, s) => {
      signal = s
      return new Promise<boolean>(() => undefined)
    })
    engine = ctx.engine
    await userEvent.click(screen.getByRole('button', { name: t.dialog.upscaleButton }))
    await userEvent.click(screen.getByRole('button', { name: t.dialog.cancel }))
    expect(signal?.aborted).toBe(true)
    expect(ctx.closeDialog).toHaveBeenCalledTimes(1)
    expect(ctx.toast).not.toHaveBeenCalled()
  })
})
