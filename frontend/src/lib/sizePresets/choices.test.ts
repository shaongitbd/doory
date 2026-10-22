import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw'
import { getSizeChoices, loadSizeChoices, noteUsedSize, setCollapsed, togglePinned } from './choices'

const URL = '/api/v1/size-presets/mine/'

afterEach(() => localStorage.removeItem('doory.sizeChoices'))

describe('your sizes', () => {
  it('signed in, reads them from the server and saves changes there', async () => {
    const saved: unknown[] = []
    server.use(
      http.get('*/api/v1/auth/csrf/', () => new HttpResponse(null, { status: 204 })),
      http.get(URL, () => HttpResponse.json({ pinned: null, recent: ['a4'], collapsed: [] })),
      http.patch(URL, async ({ request }) => {
        saved.push(await request.json())
        return HttpResponse.json({ pinned: ['logo'], recent: ['a4'], collapsed: [] })
      }),
    )
    await loadSizeChoices(true)
    expect(getSizeChoices()).toEqual({ pinned: null, recent: ['a4'], collapsed: [] })

    // The first pin starts from what the person sees: the popular sizes.
    togglePinned('logo', ['a4'])
    expect(getSizeChoices().pinned).toEqual(['a4', 'logo'])
    setCollapsed(['social'])
    noteUsedSize('poster') // the server reads recent sizes from the person's designs
    expect(getSizeChoices().recent).toEqual(['a4'])
    await vi.waitFor(() => expect(saved).toEqual([{ pinned: ['a4', 'logo'] }, { collapsed: ['social'] }]))
    expect(localStorage.getItem('doory.sizeChoices')).toBeNull()
  })

  it('signed out, keeps them in this browser', async () => {
    localStorage.setItem('doory.sizeChoices', JSON.stringify({ pinned: ['a4'], recent: [], collapsed: [] }))
    server.use(http.get(URL, () => HttpResponse.json({ error: { code: 'not_authenticated', message: 'x' } }, { status: 401 })))
    await loadSizeChoices(true)
    expect(getSizeChoices().pinned).toEqual(['a4'])

    togglePinned('a4', [])
    noteUsedSize('poster')
    noteUsedSize('a4')
    noteUsedSize('poster')
    expect(JSON.parse(localStorage.getItem('doory.sizeChoices')!)).toEqual({ pinned: [], recent: ['poster', 'a4'], collapsed: [] })
  })
})
