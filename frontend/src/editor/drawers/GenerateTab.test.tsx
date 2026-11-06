import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiService, AssetRef } from '@/types/adapter'
import type { AiOption } from '@/types/api'
import { setupEditor } from '../animation/testing'
import { EditorProvider } from '../EditorProvider'
import type { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import { ImageDrawer } from './ImageDrawer'

const SERVER: AiOption = { id: 'env-1:gpt-image-2', label: 'GPT Image 2', task: 'text-to-image', kind: 'server', provider_name: 'Image server', owner: 'operator', sends_offsite: true }
const CREATED: AssetRef = { id: 'a1', url: 'https://img.example/a1.png', thumbUrl: '', width: 48, height: 32, name: 'A red fox (created)', kind: 'image' }

function aiWith(models: AiOption[], generate: AiService['generate'] = vi.fn(async () => CREATED)): AiService {
  return { options: vi.fn(async () => ({ default: null, models })), run: vi.fn(), generate, remembered: () => null, remember: vi.fn() }
}

let engine: EditorEngine | null = null

async function open(ai: AiService) {
  const setup = await setupEditor()
  engine = setup.engine
  ;(engine.adapter.services as { ai?: AiService | null }).ai = ai
  const close = vi.fn()
  await act(async () => {
    render(
      <EditorProvider engine={engine!} portalRoot={document.body}>
        <ImageDrawer close={close} />
      </EditorProvider>,
    )
  })
  return { close }
}

describe('ImageDrawer create tab', () => {
  afterEach(() => {
    engine?.dispose()
    engine = null
  })

  it('is hidden when the server offers no text-to-image option', async () => {
    const ai = aiWith([])
    await open(ai)
    await waitFor(() => expect(ai.options).toHaveBeenCalledWith('text-to-image'))
    expect(screen.queryByTestId('image-tab-create')).toBeNull()
  })

  it('creates a picture from the prompt and places it', async () => {
    const ai = aiWith([SERVER])
    const { close } = await open(ai)
    const insert = vi.spyOn(engine!.insert, 'imageFromAsset').mockResolvedValue(undefined as never)
    await userEvent.click(await screen.findByTestId('image-tab-create'))
    await userEvent.type(screen.getByTestId('create-prompt'), '  A red fox in the snow ')
    expect(screen.getByText(t.imageDrawer.createOffsite)).toBeTruthy()
    await userEvent.click(screen.getByTestId('create-image'))
    await waitFor(() => expect(close).toHaveBeenCalled())
    expect(ai.generate).toHaveBeenCalledWith('text-to-image', { model: SERVER.id, prompt: 'A red fox in the snow' })
    expect(insert).toHaveBeenCalledWith(CREATED)
    expect(ai.remember).toHaveBeenCalledWith('text-to-image', SERVER.id)
  })

  it('shows an error when the server cannot make the picture', async () => {
    const ai = aiWith(
      [SERVER],
      vi.fn(async () => {
        throw new Error('failed')
      }),
    )
    const { close } = await open(ai)
    await userEvent.click(await screen.findByTestId('image-tab-create'))
    await userEvent.type(screen.getByTestId('create-prompt'), 'A red fox')
    await userEvent.click(screen.getByTestId('create-image'))
    expect((await screen.findByRole('alert')).textContent).toBe(t.imageDrawer.createFailed)
    expect(close).not.toHaveBeenCalled()
  })
})
