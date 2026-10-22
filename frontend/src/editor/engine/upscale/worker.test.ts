import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UpscaleWorkerReply, UpscaleWorkerRequest } from './protocol'

const decodeImage = vi.fn()
const upscaleImageData = vi.fn()
vi.mock('./image', () => ({ decodeImage: (...args: unknown[]) => decodeImage(...args), encodeResult: vi.fn() }))
vi.mock('./core', () => ({ upscaleImageData: (...args: unknown[]) => upscaleImageData(...args) }))

interface Scope {
  postMessage(message: UpscaleWorkerReply): void
  onmessage: ((event: MessageEvent<UpscaleWorkerRequest>) => void) | null
}

/**
 * Loads a fresh worker module against a fake scope and runs one request; resolves with its final
 * reply. `arrange` gets the module's own `UpscaleError`, the class the worker checks against.
 */
async function runWorker(arrange: (types: typeof import('./types')) => void): Promise<UpscaleWorkerReply> {
  const replies: UpscaleWorkerReply[] = []
  const scope: Scope = { postMessage: (message) => replies.push(message), onmessage: null }
  vi.stubGlobal('self', scope)
  vi.resetModules()
  arrange(await import('./types'))
  await import('./worker')
  scope.onmessage?.({ data: { type: 'run', id: 1, image: new Blob(['x']), options: { scale: 2 } } } as MessageEvent<UpscaleWorkerRequest>)
  await vi.waitFor(() => expect(replies.some((reply) => reply.type !== 'progress')).toBe(true))
  return replies.at(-1) as UpscaleWorkerReply
}

describe('upscaling worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    decodeImage.mockReset()
    upscaleImageData.mockReset()
  })

  it('sends the text of an UpscaleError', async () => {
    const reply = await runWorker(({ UpscaleError }) => decodeImage.mockRejectedValue(new UpscaleError('This image cannot be decoded.')))
    expect(reply).toEqual({ type: 'failed', id: 1, message: 'This image cannot be decoded.' })
  })

  it('leaves out the wording of a browser error such as running out of memory', async () => {
    const reply = await runWorker(() => {
      decodeImage.mockResolvedValue({ rgba: new Uint8ClampedArray(4), width: 1, height: 1 })
      upscaleImageData.mockImplementation(() => {
        throw new RangeError('Array buffer allocation failed')
      })
    })
    expect(reply).toEqual({ type: 'failed', id: 1, message: undefined })
  })
})
