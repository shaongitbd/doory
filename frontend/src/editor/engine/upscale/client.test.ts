import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import { upscaleImage } from './client'
import type { UpscaleWorkerReply } from './protocol'
import { UpscaleError } from './types'

/** Stands in for the module worker; the test answers for it. */
class FakeWorker {
  static last: FakeWorker | null = null
  onmessage: ((event: MessageEvent<UpscaleWorkerReply>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  terminated = false
  constructor() {
    FakeWorker.last = this
  }
  postMessage(): void {}
  terminate(): void {
    this.terminated = true
  }
  reply(reply: UpscaleWorkerReply): void {
    this.onmessage?.({ data: reply } as MessageEvent<UpscaleWorkerReply>)
  }
}

function start(): { result: Promise<Blob>; worker: FakeWorker } {
  const result = upscaleImage(new Blob(['x'], { type: 'image/png' }), { scale: 2 })
  const worker = FakeWorker.last
  if (!worker) throw new Error('no worker was started')
  return { result, worker }
}

describe('upscaleImage', () => {
  beforeEach(() => vi.stubGlobal('Worker', FakeWorker))
  afterEach(() => {
    FakeWorker.last = null
    vi.unstubAllGlobals()
  })

  it('passes on the message of an UpscaleError from the worker', async () => {
    const { result, worker } = start()
    worker.reply({ type: 'failed', id: 1, message: 'The image is too large to upscale.' })
    await expect(result).rejects.toThrow('The image is too large to upscale.')
    expect(worker.terminated).toBe(true)
  })

  it('reports any other failure in the worker with the friendly text', async () => {
    const { result, worker } = start()
    worker.reply({ type: 'failed', id: 1 })
    const error = await result.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UpscaleError)
    expect((error as Error).message).toBe(t.errors.upscale)
  })

  it('does not show the browser wording of an uncaught worker error', async () => {
    const { result, worker } = start()
    worker.onerror?.({ message: 'Uncaught RangeError: Array buffer allocation failed' } as ErrorEvent)
    await expect(result).rejects.toThrow(t.errors.upscale)
  })
})
