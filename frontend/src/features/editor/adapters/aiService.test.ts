import { isApiError, resetClientState } from '@/lib/api'
import { captureFetch } from '@/test/utils'
import type { AiConfig, AiOption } from '@/types/api'
import { createAccountAdapter } from './accountAdapter'
import { createAiService } from './services'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const error = (status: number, code: string, extra: Record<string, unknown> = {}) => json({ error: { code, message: code, ...extra } }, status)

const DEVICE: AiOption = { id: 'device', label: 'On this device', task: 'background-removal', kind: 'device', provider_name: '', owner: 'device', sends_offsite: false }
const SERVER: AiOption = { id: 'env-1:best', label: 'Best', task: 'background-removal', kind: 'server', provider_name: 'Model server', owner: 'operator', sends_offsite: false }
const MINE: AiOption = { id: 'p1:', label: 'My server', task: 'background-removal', kind: 'server', provider_name: 'My server', owner: 'user', sends_offsite: true }
const CONFIG: AiConfig = { user_providers: 'everyone', offsite_notice: 'Sent to our partner.', background_removal: { default: 'env-1:best', models: [DEVICE, SERVER] } }

function asset(id: string) {
  return { id, url: `/media/${id}.png`, thumb_url: `/media/${id}.webp`, width: 10, height: 10, name: `${id} (no background)`, kind: 'image' }
}

beforeEach(() => {
  resetClientState()
  document.cookie = 'csrftoken=tok; path=/'
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AI service of the account adapter', () => {
  it('exists only when the server has AI providers', () => {
    expect(createAccountAdapter('d1', () => 1).services.ai ?? null).toBeNull()
    expect(createAccountAdapter('d1', () => 1, { config: { features: { stock_photos: false, server_pdf: false, google_login: false, email_verification: false, ai_providers: false }, ai: CONFIG } }).services.ai ?? null).toBeNull()
    const on = createAccountAdapter('d1', () => 1, { config: { features: { stock_photos: false, server_pdf: false, google_login: false, email_verification: false, ai_providers: true }, ai: CONFIG } })
    expect(on.services.ai?.offsiteNotice).toBe('Sent to our partner.')
  })

  it("lists the user's own options with the default from /config/, and asks only once a minute", async () => {
    const calls = captureFetch(() => json([DEVICE, SERVER, MINE]))
    const ai = createAiService({ config: CONFIG, userId: 'u1' })
    expect(await ai.options('background-removal')).toEqual({ default: 'env-1:best', models: [DEVICE, SERVER, MINE] })
    await ai.options('background-removal')
    expect(calls).toHaveLength(1)
    expect(calls[0].url.pathname).toBe('/api/v1/ai/models/')
    expect(calls[0].url.searchParams.get('task')).toBe('background-removal')
  })

  it('falls back to the options of /config/ when the list cannot be loaded, and asks again next time', async () => {
    const calls = captureFetch(() => error(500, 'server_error'))
    const ai = createAiService({ config: CONFIG })
    expect(await ai.options('background-removal')).toEqual(CONFIG.background_removal)
    await ai.options('background-removal')
    expect(calls).toHaveLength(2)
  })

  it("runs on the image's own asset", async () => {
    const bodies: unknown[] = []
    captureFetch((request) => {
      bodies.push(JSON.parse(String(request.body)))
      return json(asset('cut'), 201)
    })
    const ai = createAiService({ config: CONFIG })
    const ref = await ai.run('background-removal', { model: 'env-1:best', image: new Blob(['x'], { type: 'image/png' }), assetId: 'a1' })
    expect(bodies).toEqual([{ asset_id: 'a1', model: 'env-1:best' }])
    expect(ref).toMatchObject({ id: 'cut', url: '/media/cut.png', thumbUrl: '/media/cut.webp' })
  })

  it("sends the task's options when there are some", async () => {
    const bodies: unknown[] = []
    captureFetch((request) => {
      bodies.push(JSON.parse(String(request.body)))
      return json(asset('big'), 201)
    })
    const ai = createAiService({ config: CONFIG })
    await ai.run('upscale', { model: 'env-2:', image: new Blob(['x'], { type: 'image/png' }), assetId: 'a1', options: { scale: 4 } })
    expect(bodies).toEqual([{ asset_id: 'a1', model: 'env-2:', options: { scale: 4 } }])
  })

  it('uploads the picture first when it has no asset of this user', async () => {
    const calls = captureFetch((request) => {
      if (request.url.pathname === '/api/v1/assets/') return json(asset('copy'), 201)
      const body = JSON.parse(String(request.body)) as { asset_id: string }
      return body.asset_id === 'copy' ? json(asset('cut'), 201) : error(404, 'not_found')
    })
    const ai = createAiService({ config: CONFIG })
    const ref = await ai.run('background-removal', { model: 'env-1:best', image: new Blob(['x'], { type: 'image/jpeg' }), assetId: 'someone-elses' })
    expect(ref.id).toBe('cut')
    expect(calls.map((call) => call.url.pathname)).toEqual(['/api/v1/ai/background-removal/', '/api/v1/assets/', '/api/v1/ai/background-removal/'])
    const upload = calls[1].body as FormData
    expect((upload.get('file') as File).name).toBe('image.jpg')

    const fresh = captureFetch((request) => (request.url.pathname === '/api/v1/assets/' ? json(asset('copy2'), 201) : json(asset('cut2'), 201)))
    await ai.run('background-removal', { model: 'env-1:best', image: new Blob(['x'], { type: 'image/png' }) })
    expect(fresh.map((call) => call.url.pathname)).toEqual(['/api/v1/assets/', '/api/v1/ai/background-removal/'])
  })

  it('passes the errors of the server on, with their codes and wait', async () => {
    captureFetch(() => error(429, 'ai_quota', { retry_after: 3600 }))
    const ai = createAiService({ config: CONFIG })
    const failure: unknown = await ai.run('background-removal', { model: 'env-1:best', image: new Blob(['x']), assetId: 'a1' }).catch((e: unknown) => e)
    expect(isApiError(failure) && failure.code).toBe('ai_quota')
    expect(isApiError(failure) && failure.retryAfter).toBe(3600)

    const calls = captureFetch(() => error(404, 'ai_model_not_found'))
    const gone: unknown = await ai.run('background-removal', { model: 'p9:', image: new Blob(['x']), assetId: 'a1' }).catch((e: unknown) => e)
    expect(isApiError(gone) && gone.code).toBe('ai_model_not_found')
    expect(calls).toHaveLength(1) // an option that is gone is not retried on an uploaded copy

    const unknownCalls = captureFetch(() => error(404, 'unknown_task'))
    const unknownTask: unknown = await ai.run('unknown-task', { model: 'p9:', image: new Blob(['x']), assetId: 'a1' }).catch((e: unknown) => e)
    expect(isApiError(unknownTask) && unknownTask.code).toBe('unknown_task')
    expect(unknownCalls).toHaveLength(1) // an unknown task is not retried on an uploaded copy
  })

  it('resolves image lazily only when upload is actually needed', async () => {
    captureFetch((request) => {
      const body = JSON.parse(String(request.body)) as { asset_id: string }
      return body.asset_id === 'a1' ? json(asset('cut'), 201) : error(404, 'not_found')
    })
    const ai = createAiService({ config: CONFIG })
    const getImage = vi.fn(async () => new Blob(['x'], { type: 'image/png' }))
    const ref = await ai.run('background-removal', { model: 'env-1:best', image: getImage, assetId: 'a1' })
    expect(ref.id).toBe('cut')
    expect(getImage).not.toHaveBeenCalled()
  })

  it('remembers the last choice per user and task', () => {
    const mine = createAiService({ config: CONFIG, userId: 'u1' })
    const theirs = createAiService({ config: CONFIG, userId: 'u2' })
    expect(mine.remembered('background-removal')).toBeNull()
    mine.remember('background-removal', 'p1:')
    expect(mine.remembered('background-removal')).toBe('p1:')
    expect(createAiService({ config: CONFIG, userId: 'u1' }).remembered('background-removal')).toBe('p1:')
    expect(theirs.remembered('background-removal')).toBeNull()
  })
})
