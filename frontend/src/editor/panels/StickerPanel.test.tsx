import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activateLocale } from '@/i18n/catalog'
import { setLocale } from '@/i18n/locale'
import type { EditorServices } from '@/types/adapter'
import type { ElementItem, ElementKind, ElementPack, ElementQuery } from '@/types/api'
import { setupEditor } from '../animation/testing'
import { EditorProvider } from '../EditorProvider'
import type { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import { StickerPanel } from './StickerPanel'

type Elements = EditorServices['elements']

const pack = (slug: string, name: string, kind: ElementKind): ElementPack => ({ id: slug, slug, name, kind, thumbnail_url: null, element_count: 2, license: 'MIT', license_url: '', attribution: '', source_url: '' })

const PACKS = [pack('tabler-outline', 'Tabler Outline', 'icon'), pack('bootstrap-fill', 'Bootstrap Icons Fill', 'icon'), pack('openmoji', 'OpenMoji', 'sticker')]

const item = (id: string, name: string, p: ElementPack): ElementItem => ({
  id,
  name,
  kind: p.kind,
  style: 'outline' as ElementItem['style'],
  pack: { id: p.id, slug: p.slug, name: p.name },
  tags: [],
  svg_url: `https://cdn.example/${id}.svg`,
  width: 24,
  height: 24,
  colors: [],
  is_recolorable: false,
})

const ITEMS = [item('h1', 'Heart', PACKS[0]), item('h2', 'Heart', PACKS[1]), item('s1', 'Smile', PACKS[2])]

let engine: EditorEngine | null = null

function fakeElements(): Elements & { list: ReturnType<typeof vi.fn> } {
  return {
    packs: vi.fn(async () => PACKS),
    list: vi.fn(async (q: ElementQuery) => {
      const results = ITEMS.filter((i) => (!q.kind || i.kind === q.kind) && (!q.pack || i.pack.slug === q.pack))
      return { count: results.length, next: null, previous: null, results }
    }),
  } as Elements & { list: ReturnType<typeof vi.fn> }
}

async function open(elements: Elements) {
  const setup = await setupEditor()
  engine = setup.engine
  ;(engine.adapter.services as { elements: Elements }).elements = elements
  await act(async () => {
    render(
      <EditorProvider engine={engine!} portalRoot={document.body}>
        <StickerPanel />
      </EditorProvider>,
    )
  })
}

async function chooseKind(kind: ElementKind | 'all') {
  await userEvent.click(screen.getByTestId('sticker-category'))
  await userEvent.click(screen.getByRole('option', { name: kind === 'all' ? t.stickers.all : t.stickers.kinds[kind] }))
}

const lastQuery = (elements: { list: ReturnType<typeof vi.fn> }) => elements.list.mock.calls.at(-1)?.[0] as ElementQuery

describe('StickerPanel packs', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => {
    cleanup()
    setLocale('en')
    engine?.dispose()
    engine = null
  })

  it('updates cached category labels in place when the language changes, keeping the search draft', async () => {
    await open(fakeElements())
    const search = screen.getByTestId('sticker-search')
    await userEvent.type(search, 'Heart')
    await userEvent.click(screen.getByTestId('sticker-category'))
    expect(screen.getByRole('option', { name: 'Icons' })).toBeInTheDocument()

    await act(() => activateLocale('zh-CN'))
    expect(screen.getByTestId('sticker-search')).toBe(search)
    expect(search).toHaveValue('Heart')
    expect(screen.getByRole('option', { name: t.stickers.kinds.icon })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Icons' })).not.toBeInTheDocument()
  })

  it('shows only the packs of the chosen type and sends kind and pack together', async () => {
    const elements = fakeElements()
    await open(elements)
    await chooseKind('icon')
    const tabs = within(await screen.findByRole('group', { name: t.stickers.packs })).getAllByRole('button')
    expect(tabs.map((b) => b.textContent)).toEqual([t.stickers.allPacks, 'Tabler Outline', 'Bootstrap Icons Fill'])
    await userEvent.click(screen.getByTestId('sticker-pack-bootstrap-fill'))
    await waitFor(() => expect(lastQuery(elements)).toMatchObject({ kind: 'icon', pack: 'bootstrap-fill' }))
    expect(screen.getByTestId('sticker-pack-bootstrap-fill')).toHaveAttribute('aria-pressed', 'true')
  })

  it('resets the pack to All when the type no longer matches it', async () => {
    const elements = fakeElements()
    await open(elements)
    await chooseKind('icon')
    await userEvent.click(await screen.findByTestId('sticker-pack-tabler-outline'))
    await chooseKind('sticker')
    await waitFor(() => expect(lastQuery(elements)).toMatchObject({ kind: 'sticker', pack: undefined }))
  })

  it('restores the choice from storage, and ignores a pack that is gone', async () => {
    window.localStorage.setItem('doory.stickers.filter', JSON.stringify({ kind: 'icon', pack: 'bootstrap-fill' }))
    const elements = fakeElements()
    await open(elements)
    expect(await screen.findByTestId('sticker-pack-bootstrap-fill')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(lastQuery(elements)).toMatchObject({ kind: 'icon', pack: 'bootstrap-fill' }))
    engine?.dispose()
    cleanup()

    window.localStorage.setItem('doory.stickers.filter', JSON.stringify({ kind: 'icon', pack: 'removed-pack' }))
    const again = fakeElements()
    await open(again)
    expect(await screen.findByTestId('sticker-pack-all')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(lastQuery(again)).toMatchObject({ kind: 'icon', pack: undefined }))
  })

  it('names the pack on each tile and badges it only under All', async () => {
    await open(fakeElements())
    await chooseKind('icon')
    const cells = await screen.findAllByTestId('sticker-cell')
    expect(cells[0]).toHaveAccessibleName(t.stickers.addOfPack('Heart', 'Tabler Outline'))
    expect(cells[0]).toHaveAttribute('title', 'Heart · Tabler Outline')
    expect(cells[1].textContent).toBe('Bootstrap Icons Fill')
    await userEvent.click(screen.getByTestId('sticker-pack-tabler-outline'))
    await waitFor(() => expect(screen.getAllByTestId('sticker-cell')).toHaveLength(1))
    expect(screen.getByTestId('sticker-cell').textContent).toBe('')
  })
})
