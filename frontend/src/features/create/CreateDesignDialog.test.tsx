import { screen, within } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { buildCatalogue, setSizePresetsForTests, type SizePresetCatalogue } from '@/lib/sizePresets'
import { setSizeChoicesForTests } from '@/lib/sizePresets/choices'
import { renderWithProviders } from '@/test/utils'
import { CreateDesignDialog } from './CreateDesignDialog'

const custom = buildCatalogue({
  version: 1,
  groups: [
    {
      slug: 'print',
      label: 'Print',
      children: [
        {
          slug: 'cards',
          label: 'Cards',
          children: [{ slug: 'cards-business', label: 'Business cards', presets: [{ slug: 'card', label: 'Card', width: 85, height: 55, unit: 'mm', is_quick: true }] }],
        },
      ],
    },
    {
      slug: 'social',
      label: 'Social media',
      children: [
        {
          slug: 'platform-a',
          label: 'Platform A',
          presets: [
            { slug: 'example-portrait', label: 'Platform A Portrait post', width: 1000, height: 1250, tags: ['4:5'] },
            { slug: 'example-square', label: 'Platform A Square post', width: 1000, height: 1000, tags: ['1:1'] },
            { slug: 'example-ad', label: 'Platform A Feed ad', width: 1000, height: 1250, tags: ['4:5', 'ad'] },
          ],
        },
      ],
    },
  ],
}) as SizePresetCatalogue

function Location() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

const list = () => screen.getByRole('navigation', { name: 'Size groups' })
const cards = () => screen.queryAllByRole('button', { pressed: false }).concat(screen.queryAllByRole('button', { pressed: true })).filter((b) => b.closest('ul') && !/your sizes/.test(b.getAttribute('aria-label') ?? ''))
const names = () => cards().map((card) => card.querySelector('span:nth-child(2)')?.textContent)

describe('Create a design dialog', () => {
  beforeEach(() => setSizePresetsForTests(custom))

  it('opens on your sizes (the popular ones until you pin) and lists formats before platforms', () => {
    renderWithProviders(<CreateDesignDialog open onClose={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'Your sizes' })).toBeInTheDocument()
    expect(names()).toEqual(['Card'])
    const sections = within(list()).getAllByRole('button', { expanded: true }).map((b) => b.textContent)
    expect(sections).toEqual(['Everything else', 'Social media'])
  })

  it('shows a format under its sub-group headings, and a platform with its ads last', async () => {
    renderWithProviders(<CreateDesignDialog open onClose={() => undefined} />)
    await userEvent.click(within(list()).getByRole('button', { name: /Cards/ }))
    expect(screen.getByRole('heading', { name: /Business cards/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Card\s*85 × 55 mm/ })).toBeInTheDocument()
    await userEvent.click(within(list()).getByRole('button', { name: /Platform A/ }))
    // The platform's name is not repeated on its own cards.
    expect(names()).toEqual(['Portrait post', 'Square post', 'Feed ad'])
    expect(screen.getByRole('heading', { name: /Ads/ })).toBeInTheDocument()
  })

  it('filters by shape and by posts or ads', async () => {
    renderWithProviders(<CreateDesignDialog open onClose={() => undefined} />)
    await userEvent.click(within(list()).getByRole('button', { name: /Platform A/ }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Shape' })).getByRole('button', { name: 'Square' }))
    expect(names()).toEqual(['Square post'])
    await userEvent.click(within(screen.getByRole('group', { name: 'Shape' })).getByRole('button', { name: 'All' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Posts or ads' })).getByRole('button', { name: 'Ads' }))
    expect(names()).toEqual(['Feed ad'])
  })

  it('searches every size and names where each one is', async () => {
    renderWithProviders(<CreateDesignDialog open onClose={() => undefined} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search sizes' }), '1:1')
    expect(names()).toEqual(['Platform A Square post'])
    expect(cards()[0].lastElementChild).toHaveTextContent('Platform A')
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search sizes' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search sizes' }), 'zzzz')
    expect(screen.getByText(/No size matches/)).toBeInTheDocument()
  })

  it('creates the chosen size, and remembers a folded section', async () => {
    renderWithProviders(
      <>
        <CreateDesignDialog open onClose={() => undefined} />
        <Location />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Create design' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /Card\s*85 × 55 mm/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Create design' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/create?preset=card')

    await userEvent.click(within(list()).getByRole('button', { name: 'Social media' }))
    expect(within(list()).queryByRole('button', { name: /Platform A/ })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('doory.sizeChoices') ?? '{}').collapsed).toEqual(['social'])
    localStorage.removeItem('doory.sizeChoices')
  })

  it('shows every entry of a folded section on a phone, where sections have no titles to unfold them', () => {
    setSizeChoicesForTests({ collapsed: ['social'] })
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(max-width: 639px)', addEventListener: () => undefined, removeEventListener: () => undefined }))
    try {
      renderWithProviders(<CreateDesignDialog open onClose={() => undefined} />)
      expect(within(list()).getByRole('button', { name: /Platform A/ })).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
      setSizeChoicesForTests()
    }
  })

  it('opens again with nothing chosen', async () => {
    function Host() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <CreateDesignDialog open={open} onClose={() => setOpen(false)} />
        </>
      )
    }
    renderWithProviders(<Host />)
    await userEvent.click(screen.getByRole('button', { name: /Card\s*85 × 55 mm/ }))
    expect(screen.getByRole('button', { name: 'Create design' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Open' }))
    expect(await screen.findByRole('button', { name: 'Create design' })).toBeDisabled()
  })

  it('pins a size to your sizes and shows recent ones', async () => {
    setSizeChoicesForTests({ recent: ['example-square'] })
    renderWithProviders(<CreateDesignDialog open onClose={() => undefined} />)
    await userEvent.click(within(list()).getByRole('button', { name: /Recent/ }))
    expect(names()).toEqual(['Platform A Square post'])
    await userEvent.click(screen.getByRole('button', { name: 'Add to your sizes' }))
    await userEvent.click(within(list()).getByRole('button', { name: /Your sizes/ }))
    expect(names()).toEqual(['Card', 'Platform A Square post'])
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove from your sizes' })[0])
    expect(names()).toEqual(['Platform A Square post'])
    // With none left, it says how to add one.
    await userEvent.click(screen.getByRole('button', { name: 'Remove from your sizes' }))
    expect(screen.getByText(/choose the star in the corner of its card/)).toBeInTheDocument()
    localStorage.removeItem('doory.sizeChoices')
  })

  it('moves between size cards with the arrow keys', async () => {
    renderWithProviders(<CreateDesignDialog open onClose={() => undefined} />)
    await userEvent.click(within(list()).getByRole('button', { name: /Platform A/ }))
    cards()[0].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(cards()[1])
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(document.activeElement).toBe(cards()[0])
  })

  it('shows the custom size as it is typed, and the limit once', async () => {
    renderWithProviders(<CreateDesignDialog open onClose={() => undefined} initialTab="custom" />)
    expect(screen.getByText('Up to 20,000 px per side.')).toBeInTheDocument()
    const width = screen.getByLabelText('Width')
    await userEvent.clear(width)
    await userEvent.type(width, '300')
    expect(screen.getByRole('figure', { name: 'Preview' })).toHaveTextContent('300 × 1080 px')
    await userEvent.clear(width)
    expect(screen.getByRole('figure', { name: 'Preview' })).toHaveTextContent('Enter a width and a height')
    await userEvent.selectOptions(screen.getByLabelText('Unit'), 'in')
    expect(screen.getByText(/Up to 20,000 px \(208\.33 in\) per side\./)).toBeInTheDocument()
  })

  it('offers the built-in sizes by default', async () => {
    setSizePresetsForTests()
    renderWithProviders(<CreateDesignDialog open onClose={() => undefined} />)
    expect(screen.getByRole('button', { name: /Instagram Story/ })).toBeInTheDocument()
    await userEvent.click(within(list()).getByRole('button', { name: /Paper/ }))
    expect(screen.getByRole('heading', { name: /ISO paper \(A & B\)/ })).toBeInTheDocument()
  })
})
