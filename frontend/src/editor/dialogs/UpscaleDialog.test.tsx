import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { createBlankDocument } from '@/lib/document'
import type { AiService } from '@/types/adapter'
import type { AiOption } from '@/types/api'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { EditorProvider } from '../EditorProvider'
import { EditorEngine } from '../engine/editor'
import type { CropRect, UpscaleMethod } from '../engine/upscale/types'
import { t } from '../strings'
import { UpscaleDialog } from './UpscaleDialog'

// jsdom has no worker or OffscreenCanvas; the dialog only needs to know that this browser can run it.
vi.mock('../engine/upscale/support', async (importOriginal) => ({ ...(await importOriginal<typeof import('../engine/upscale/support')>()), isUpscaleSupported: () => true }))

type Run = (options: { scale: number; method?: UpscaleMethod; detail?: number; option?: string }, onProgress?: (percent: number) => void, signal?: AbortSignal) => Promise<boolean>

const SERVER: AiOption = { id: 'env-1:', label: 'AI upscale', task: 'upscale', kind: 'server', provider_name: 'Upscaler', owner: 'operator', sends_offsite: false }
const EXTERNAL: AiOption = { id: 'env-2:', label: 'External AI', task: 'upscale', kind: 'server', provider_name: 'Provider Z', owner: 'operator', sends_offsite: true }
const DEVICE_LISTED: AiOption = { id: 'device', label: 'On this device', task: 'upscale', kind: 'device', provider_name: '', owner: 'device', sends_offsite: false }

function fakeAi(models: AiOption[], { remembered = null, defaultId = null }: { remembered?: string | null; defaultId?: string | null } = {}) {
  const ai: AiService & { remember: ReturnType<typeof vi.fn> } = {
    options: vi.fn(async () => ({ default: defaultId, models })),
    run: vi.fn(),
    remembered: vi.fn(() => remembered),
    remember: vi.fn<(task: string, option: string) => void>(),
    offsiteNotice: '',
  }
  return ai
}

function setup(run: Run, source: { width: number; height: number; crop: CropRect | null } = { width: 4000, height: 3000, crop: null }, ai: AiService | null = null) {
  const handle = createMemoryAdapter()
  handle.adapter.services.ai = ai
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

  it('says so when nothing was applied', async () => {
    const ctx = setup(() => Promise.resolve(false))
    engine = ctx.engine
    await userEvent.click(screen.getByRole('button', { name: t.dialog.upscaleButton }))
    await waitFor(() => expect(ctx.closeDialog).toHaveBeenCalledTimes(1))
    expect(ctx.toast).toHaveBeenCalledWith(t.dialog.upscaleNotApplied, 'info')
  })

  it('moves the focus to Cancel when the run starts', async () => {
    const ctx = setup(() => new Promise<boolean>(() => undefined))
    engine = ctx.engine
    await userEvent.click(screen.getByRole('button', { name: t.dialog.upscaleButton }))
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.dialog.cancel })).toHaveFocus()
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

describe('UpscaleDialog: server options', () => {
  let engine: EditorEngine | null = null
  afterEach(() => engine?.dispose())

  it('offers no choice when the site has no server option', async () => {
    const ai = fakeAi([DEVICE_LISTED])
    const ctx = setup(() => Promise.resolve(true), undefined, ai)
    engine = ctx.engine
    await waitFor(() => expect(ai.options).toHaveBeenCalledWith('upscale'))
    expect(screen.queryByRole('radiogroup', { name: t.dialog.upscaleMethod })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: t.dialog.upscaleButton }))
    expect(ctx.upscale).toHaveBeenCalledWith({ scale: 2 }, expect.any(Function), expect.any(AbortSignal))
    expect(ai.remember).not.toHaveBeenCalled()
  })

  it('starts on this device even when the server names a server option as its default', async () => {
    const ai = fakeAi([DEVICE_LISTED, SERVER], { defaultId: SERVER.id })
    const ctx = setup(() => Promise.resolve(true), undefined, ai)
    engine = ctx.engine
    const group = await screen.findByRole('radiogroup', { name: t.dialog.upscaleMethod })
    expect(within(group).getAllByRole('radio')).toHaveLength(2)
    expect(within(group).getByRole('radio', { name: new RegExp(t.dialog.upscaleDevice) })).toBeChecked()
    expect(screen.getByText(t.dialog.upscaleNote)).toBeInTheDocument()
  })

  it('runs the picked server option with the scale and remembers it', async () => {
    const ai = fakeAi([SERVER])
    const ctx = setup(() => new Promise<boolean>(() => undefined), { width: 1000, height: 800, crop: null }, ai)
    engine = ctx.engine
    await userEvent.click(await screen.findByRole('radio', { name: new RegExp(SERVER.label) }))
    expect(screen.getByText(t.dialog.upscaleServerNote)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: '4×' }))
    await userEvent.click(screen.getByRole('button', { name: t.dialog.upscaleButton }))
    expect(ctx.upscale).toHaveBeenCalledWith({ scale: 4, option: SERVER.id }, expect.any(Function), expect.any(AbortSignal))
    expect(ai.remember).toHaveBeenCalledWith('upscale', SERVER.id)
    expect(screen.getByText(t.dialog.upscaleServerWorking)).toBeInTheDocument()
  })

  it('starts on the option picked last time and shows the notice of one that sends the image away', async () => {
    const ai = fakeAi([SERVER, EXTERNAL], { remembered: EXTERNAL.id })
    const ctx = setup(() => Promise.resolve(true), undefined, ai)
    engine = ctx.engine
    expect(await screen.findByRole('radio', { name: new RegExp(EXTERNAL.label) })).toBeChecked()
    expect(screen.getByTestId('upscale-offsite')).toHaveTextContent(t.bgRemoval.offsite)
  })

  it('lets a server make what this device cannot hold', async () => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 4 })
    try {
      const ai = fakeAi([SERVER])
      const ctx = setup(() => Promise.resolve(true), undefined, ai)
      engine = ctx.engine
      expect(screen.getByRole('button', { name: t.dialog.upscaleButton })).toBeDisabled()
      await userEvent.click(await screen.findByRole('radio', { name: new RegExp(SERVER.label) }))
      expect(screen.queryByText(t.dialog.upscaleTooLarge)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: t.dialog.upscaleButton })).toBeEnabled()
    } finally {
      Reflect.deleteProperty(navigator, 'deviceMemory')
    }
  })

  it("says in the dialog's words what went wrong on the server", async () => {
    const ai = fakeAi([SERVER], { remembered: SERVER.id })
    const run = vi
      .fn<Run>()
      .mockRejectedValueOnce(new ApiError({ status: 429, code: 'ai_quota', message: 'Quota.', retryAfter: 120 }))
      .mockRejectedValueOnce(new ApiError({ status: 502, code: 'ai_bad_response', message: 'Bad.' }))
    const ctx = setup(run, { width: 1000, height: 800, crop: null }, ai)
    engine = ctx.engine
    expect(await screen.findByRole('radio', { name: new RegExp(SERVER.label) })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: t.dialog.upscaleButton }))
    expect(await screen.findByRole('alert')).toHaveTextContent(t.dialog.upscaleQuota(t.bgRemoval.wait(120)))
    await userEvent.click(screen.getByRole('button', { name: t.dialog.upscaleRetry }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(t.bgRemoval.errors.badResponse))
  })
})
