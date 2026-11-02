import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import type { EditorServices } from '@/types/adapter'
import type { StockPage, StockPhoto, StockProviders } from '@/types/api'
import { setupEditor } from '../animation/testing'
import { EditorProvider } from '../EditorProvider'
import type { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import { ImageDrawer } from './ImageDrawer'

type Stock = NonNullable<EditorServices['stock']>

const PROVIDERS: StockProviders = {
  providers: [
    { name: 'unsplash', label: 'Unsplash', attribution: 'Photos from Unsplash', url: 'https://unsplash.com/?utm_source=doory' },
    { name: 'pexels', label: 'Pexels', attribution: 'Photos provided by Pexels', url: 'https://www.pexels.com/' },
    { name: 'pixabay', label: 'Pixabay', attribution: 'Images from Pixabay', url: 'https://pixabay.com/' },
  ],
  all: ['unsplash', 'pexels', 'pixabay'],
  default: 'all',
}

const photo = (provider: string, id: string, author = 'Ada'): StockPhoto => ({
  id,
  provider,
  thumb_url: `https://img.example/${provider}/${id}.jpg`,
  preview_url: `https://img.example/${provider}/${id}-big.jpg`,
  width: 400,
  height: 300,
  author,
  author_url: '',
  source_url: '',
})

const page = (provider: string, results: StockPhoto[], extra: Partial<StockPage> = {}): StockPage => ({
  configured: true,
  provider,
  total: results.length,
  next_page: null,
  results,
  ...extra,
})

let engine: EditorEngine | null = null

async function open(stock: Stock) {
  const setup = await setupEditor()
  engine = setup.engine
  ;(engine.adapter.services as { stock: Stock | null }).stock = stock
  await act(async () => {
    render(
      <EditorProvider engine={engine!} portalRoot={document.body}>
        <ImageDrawer close={() => undefined} />
      </EditorProvider>,
    )
  })
  await userEvent.click(screen.getByTestId('image-tab-stock'))
}

function fakeStock(overrides: Partial<Stock> = {}): Stock {
  return {
    providers: vi.fn(async () => PROVIDERS),
    search: vi.fn(async (_q: string, _page: number | string, provider?: string) =>
      provider === 'all'
        ? page('all', [photo('unsplash', 'u1', 'Ada'), photo('pexels', 'p1', 'Grace'), photo('pixabay', 'x1', 'Josch')], { skipped: [] })
        : page(provider ?? '', [photo(provider ?? 'unsplash', 'only', 'Linus')]),
    ),
    importPhoto: vi.fn(),
    ...overrides,
  }
}

describe('ImageDrawer stock photos', () => {
  beforeEach(() => window.localStorage.removeItem('doory.stock.tab'))
  afterEach(() => {
    engine?.dispose()
    engine = null
  })

  it('offers grid layouts even when stock photos are not configured', async () => {
    const setup = await setupEditor()
    engine = setup.engine
    ;(engine.adapter.services as { stock: Stock | null }).stock = null
    const insert = vi.spyOn(engine.imageGrids, 'insert').mockResolvedValue()
    const close = vi.fn()
    await act(async () => {
      render(
        <EditorProvider engine={engine!} portalRoot={document.body}>
          <ImageDrawer close={close} />
        </EditorProvider>,
      )
    })

    expect(screen.getByTestId('image-tab-uploads')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('image-tab-grids')).toBeVisible()
    expect(screen.queryByTestId('image-tab-stock')).toBeNull()

    await userEvent.click(screen.getByTestId('image-tab-grids'))
    expect(screen.getByRole('tabpanel', { name: t.imageDrawer.grids })).toBeVisible()
    await userEvent.click(await screen.findByTestId('grid-preset-two-columns'))
    expect(insert).toHaveBeenCalledWith('two-columns')
    expect(close).toHaveBeenCalledOnce()
  })

  it('opens on the All tab, with a badge and credit for every provider', async () => {
    const stock = fakeStock()
    await open(stock)
    expect(await screen.findAllByTestId('stock-photo')).toHaveLength(3)
    expect(screen.getByTestId('stock-source-all')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByTestId('stock-badge').map((b) => b.textContent)).toEqual(['Unsplash', 'Pexels', 'Pixabay'])
    expect(stock.search).toHaveBeenCalledWith('nature', 1, 'all')
    expect(screen.getAllByTestId('stock-photo')[1]).toHaveAttribute('title', 'Photo by Grace on Pexels')
    const credits = screen.getByTestId('stock-attribution')
    expect(credits).toHaveTextContent('Photos from Unsplash')
    expect(credits).toHaveTextContent('Photos provided by Pexels')
    expect(credits).toHaveTextContent('Images from Pixabay')
  })

  it('searches one provider from its tab and remembers the choice', async () => {
    const stock = fakeStock()
    await open(stock)
    await screen.findAllByTestId('stock-photo')
    await userEvent.click(screen.getByTestId('stock-source-pexels'))
    await waitFor(() => expect(stock.search).toHaveBeenLastCalledWith('nature', 1, 'pexels'))
    expect(await screen.findAllByTestId('stock-photo')).toHaveLength(1)
    expect(screen.queryByTestId('stock-badge')).toBeNull()
    expect(screen.getByTestId('stock-attribution')).toHaveTextContent(/^Photos provided by Pexels$/)
    expect(window.localStorage.getItem('doory.stock.tab')).toBe('pexels')

    engine?.dispose()
    document.body.innerHTML = ''
    const again = fakeStock()
    await open(again)
    await waitFor(() => expect(again.search).toHaveBeenCalledWith('nature', 1, 'pexels'))
  })

  it('has no source tabs with a single provider', async () => {
    const single: StockProviders = { providers: [PROVIDERS.providers[2]], all: [], default: 'pixabay' }
    const stock = fakeStock({ providers: vi.fn(async () => single) })
    await open(stock)
    await screen.findAllByTestId('stock-photo')
    expect(screen.queryByTestId('stock-source-all')).toBeNull()
    expect(stock.search).toHaveBeenCalledWith('nature', 1, 'pixabay')
  })

  it('names the providers the All search skipped', async () => {
    const stock = fakeStock({
      search: vi.fn(async () => page('all', [photo('unsplash', 'u1')], { skipped: [{ provider: 'pexels', reason: 'busy', retry_after: 30 }] })),
    })
    await open(stock)
    expect(await screen.findByTestId('stock-skipped')).toHaveTextContent('Pexels is busy. Showing Unsplash.')
    // Only the providers whose photos are on screen are credited.
    expect(screen.getByTestId('stock-attribution')).toHaveTextContent(/^Photos from Unsplash$/)
  })

  it('names why each provider was skipped', async () => {
    const stock = fakeStock({
      search: vi.fn(async () =>
        page('all', [photo('unsplash', 'u1')], {
          skipped: [
            { provider: 'pexels', reason: 'timeout', retry_after: null },
            { provider: 'pixabay', reason: 'unavailable', retry_after: null },
          ],
        }),
      ),
    })
    await open(stock)
    expect(await screen.findByTestId('stock-skipped')).toHaveTextContent('Pexels didn’t answer in time, Pixabay is unavailable. Showing Unsplash.')
  })

  it('does not carry an All cursor into a provider tab when the answer arrives after the switch', async () => {
    let answerAll: ((p: StockPage) => void) | null = null
    const stock = fakeStock({
      search: vi.fn((_q: string, p: number | string, provider?: string) => {
        if (provider === 'all') return new Promise<StockPage>((resolve) => (answerAll = resolve))
        return Promise.resolve(page('pexels', [photo('pexels', `p${String(p)}`)], { next_page: p === 1 ? 2 : null, total: 99 }))
      }),
    })
    let fire: (() => void) | null = null
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          fire = () => cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
        }
        observe() {}
        disconnect() {}
      },
    )
    try {
      await open(stock)
      await waitFor(() => expect(answerAll).not.toBeNull())
      await userEvent.click(screen.getByTestId('stock-source-pexels'))
      await screen.findAllByTestId('stock-photo')
      await act(async () => answerAll?.(page('all', [photo('unsplash', 'u1')], { next_page: 'CURSOR', total: 99 })))
      await act(async () => fire?.())
      await waitFor(() => expect(stock.search).toHaveBeenLastCalledWith('nature', 2, 'pexels'))
      expect(stock.search).not.toHaveBeenCalledWith('nature', 'CURSOR', 'pexels')
      expect((await screen.findAllByTestId('stock-photo')).map((b) => b.getAttribute('title'))).toEqual(['Photo by Ada on Pexels', 'Photo by Ada on Pexels'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('pages on with the cursor the All search returned', async () => {
    const stock = fakeStock({
      search: vi.fn(async (_q: string, p: number | string) => (p === 1 ? page('all', [photo('unsplash', 'u1')], { next_page: 'CURSOR', total: 99 }) : page('all', [photo('pexels', 'p2')]))),
    })
    let fire: (() => void) | null = null
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          fire = () => cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
        }
        observe() {}
        disconnect() {}
      },
    )
    try {
      await open(stock)
      await screen.findAllByTestId('stock-photo')
      await act(async () => fire?.())
      await waitFor(() => expect(stock.search).toHaveBeenLastCalledWith('nature', 'CURSOR', 'all'))
      expect(await screen.findAllByTestId('stock-photo')).toHaveLength(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('says when a provider is busy', async () => {
    const stock = fakeStock({
      providers: vi.fn(async () => ({ ...PROVIDERS, default: 'pexels' })),
      search: vi.fn(async () => {
        throw new ApiError({ status: 429, code: 'stock_busy', message: 'busy', retryAfter: 12 })
      }),
    })
    await open(stock)
    expect(await screen.findByRole('alert')).toHaveTextContent(t.imageDrawer.stockBusy('Pexels', 12))
  })
})
