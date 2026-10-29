import 'fake-indexeddb/auto'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createBlankDocument } from '@/lib/document'
import { createLocalDesign, listLocalDesigns, localRepository } from '@/lib/local'
import { renderApp } from '@/test/app'
import { makeTemplate, makeUser, page } from '@/test/factories'

const categories = [
  { id: 'c1', slug: 'social', name: 'Social media', icon: '', template_count: 2, sort_order: 0 },
  { id: 'c2', slug: 'print', name: 'Print', icon: '', template_count: 1, sort_order: 1 },
]

beforeEach(async () => {
  await localRepository.clear()
})

describe('landing page', () => {
  it('leads with the guest-first promise and a primary call to action', async () => {
    renderApp('/')
    const hero = await screen.findByRole('heading', { level: 1 })
    expect(hero).toHaveTextContent('Make something lovely today.')
    expect(screen.getByText(/Free, and no sign-up to start\./)).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: 'Create a design' })
    expect(cta).toHaveAttribute('href', '/create')
    for (const [name, slug] of [
      [/sale post template/, 'bold-sale-announcement'],
      [/event story template/, 'rooftop-event-story'],
      [/tour poster template/, 'night-bloom-concert-poster'],
    ] as const) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', `/templates/${slug}`)
    }
  })

  it('offers size presets that deep-link into /create', async () => {
    renderApp('/')
    const list = await screen.findByRole('list', { name: 'Or start with a size' })
    expect(within(list).getByRole('link', { name: 'Instagram Post' })).toHaveAttribute('href', '/create?preset=instagram-post')
    expect(within(list).getByRole('link', { name: /Poster/ })).toHaveAttribute('href', '/create?preset=poster')
  })

  it('opens the custom size dialog and navigates to /create with the converted size', async () => {
    const { router } = renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Custom size…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create a design' })
    await userEvent.selectOptions(within(dialog).getByLabelText('Unit'), 'in')
    const width = within(dialog).getByLabelText('Width')
    await userEvent.clear(width)
    await userEvent.type(width, '5')
    const height = within(dialog).getByLabelText('Height')
    await userEvent.clear(height)
    await userEvent.type(height, '7')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create design' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/local\//))
    const [created] = await listLocalDesigns()
    expect(created).toMatchObject({ width: 480, height: 672 })
  })

  it('validates custom sizes and keeps the aspect ratio when locked', async () => {
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Custom size…' }))
    const dialog = await screen.findByRole('dialog')
    const width = within(dialog).getByLabelText('Width')
    const height = within(dialog).getByLabelText('Height')
    await userEvent.clear(width)
    await userEvent.type(width, '30000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create design' }))
    expect(await within(dialog).findByText(/at most 20000 px/)).toBeInTheDocument()
    await userEvent.clear(width)
    await userEvent.type(width, '200')
    await userEvent.clear(height)
    await userEvent.type(height, '100')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lock aspect ratio' }))
    await userEvent.clear(width)
    await userEvent.type(width, '400')
    expect(height).toHaveValue('200')
  })

  it('switches the unit while converting the numbers', async () => {
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Custom size…' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByLabelText('Unit'), 'in')
    expect(within(dialog).getByLabelText('Width')).toHaveValue('11.25')
  })

  it('filters the preset list by search', async () => {
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Custom size…' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('searchbox'), 'poster')
    expect(within(dialog).getByRole('button', { name: /Poster \(18 × 24 in\)/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Instagram Post/ })).not.toBeInTheDocument()
    await userEvent.clear(within(dialog).getByRole('searchbox'))
    await userEvent.type(within(dialog).getByRole('searchbox'), 'zzzz')
    expect(within(dialog).getByText(/No size matches/)).toBeInTheDocument()
  })

  it('has landmarks, a skip link and links to the open-source repository', async () => {
    renderApp('/')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getAllByRole('banner').length).toBeGreaterThan(0)
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    const github = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'GitHub' })
    expect(github).toHaveAttribute('href', 'https://github.com/shaongitbd/doory')
    expect(github).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('the mobile menu toggles and closes after navigating', async () => {
    const { router } = renderApp('/')
    const toggle = await screen.findByRole('button', { name: 'Open menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById('mobile-nav') as HTMLElement
    await userEvent.click(within(panel).getByRole('link', { name: 'Templates' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/templates'))
    await waitFor(() => expect(document.getElementById('mobile-nav')).toBeNull())
  })

  it('shows Dashboard and the account menu instead of Sign in for signed-in users', async () => {
    renderApp('/', { user: makeUser() })
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})

describe('features, FAQ and contact pages', () => {
  it('are linked from the header and the footer, and say what they are', async () => {
    const first = renderApp('/')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    const footer = screen.getByRole('navigation', { name: 'Footer' })
    for (const [name, href] of [['Features', '/features'], ['FAQ', '/faq'], ['Contact', '/contact']]) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href)
      expect(within(footer).getByRole('link', { name })).toHaveAttribute('href', href)
    }
    first.unmount()

    const features = renderApp('/features')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('All the tools. None of the paywalls.')
    expect(screen.getByRole('heading', { name: 'Brand kits' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Step 3: Save it to an account/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a design' })).toHaveAttribute('href', '/create')
    features.unmount()

    const faq = renderApp('/faq')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Frequently asked questions')
    faq.unmount()

    renderApp('/contact')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('We’d love to hear from you.')
  })

  it('the FAQ is an accessible accordion with one answer open at a time', async () => {
    renderApp('/faq')
    const first = await screen.findByRole('button', { name: 'Do I need an account to design?' })
    expect(first).toHaveAttribute('aria-expanded', 'true')
    const second = screen.getByRole('button', { name: 'Is Doory really free?' })
    expect(second).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(second)
    expect(second).toHaveAttribute('aria-expanded', 'true')
    expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: 'Is Doory really free?' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Get in touch' })).toHaveAttribute('href', '/contact')
  })

  it('contact links go to GitHub safely, security reports stay private, and the note becomes a prefilled issue', async () => {
    const opened: string[] = []
    const open = vi.spyOn(window, 'open').mockImplementation((url) => {
      opened.push(String(url))
      return null
    })
    renderApp('/contact')
    const bug = await screen.findByRole('link', { name: 'Report a bug' })
    expect(bug.getAttribute('href')).toMatch(/^https:\/\/github\.com\/shaongitbd\/doory\/issues\/new\?title=Bug/)
    expect(bug).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByRole('link', { name: 'Report privately' })).toHaveAttribute('href', 'https://github.com/shaongitbd/doory/security/advisories/new')

    await userEvent.click(screen.getByRole('button', { name: 'Continue on GitHub' }))
    expect(await screen.findByText('Give your note a short subject.')).toBeInTheDocument()
    expect(opened).toEqual([])

    await userEvent.selectOptions(screen.getByLabelText('What’s it about?'), 'idea')
    await userEvent.type(screen.getByLabelText(/^Subject/), 'Polka dot backgrounds')
    await userEvent.type(screen.getByLabelText('Your note'), 'Please & thank you')
    await userEvent.click(screen.getByRole('button', { name: 'Continue on GitHub' }))
    expect(opened).toHaveLength(1)
    const url = new URL(opened[0])
    expect(url.pathname).toBe('/shaongitbd/doory/issues/new')
    expect(url.searchParams.get('title')).toBe('Idea: Polka dot backgrounds')
    expect(url.searchParams.get('body')).toBe('Please & thank you')
    open.mockRestore()
  })
})

describe('"Your local designs" strip', () => {
  it('offers project restore even when the browser has no local designs', async () => {
    renderApp('/')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('heading', { name: 'Pick up where you left off' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Open a project backup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore project' })).toBeInTheDocument()
  })

  it('lists local designs so guests can come back, and deletes after confirmation', async () => {
    const kept = await createLocalDesign({ title: 'Birthday card', document: createBlankDocument(480, 672) })
    await createLocalDesign({ title: 'Flyer', document: createBlankDocument(528, 816) })
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Pick up where you left off' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore project' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Birthday card/ })).toHaveAttribute('href', `/local/${kept.id}`)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Birthday card' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Birthday card”?' })
    expect(await listLocalDesigns()).toHaveLength(2)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete design' }))
    await waitFor(async () => expect(await listLocalDesigns()).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('link', { name: /Birthday card/ })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: /Flyer/ })).toBeInTheDocument()
  })
})

describe('templates', () => {
  const list = [makeTemplate('bold-sale', { title: 'Bold sale' }), makeTemplate('wedding', { title: 'Wedding invite', category: { id: 'c2', slug: 'print', name: 'Print' }, orientation: 'portrait' })]

  it('browses with category chips, search and orientation filters synced to the URL', async () => {
    const queries: string[] = []
    const { router } = renderApp('/templates', {
      handlers: [
        http.get('*/api/v1/template-categories/', () => HttpResponse.json(categories)),
        http.get('*/api/v1/templates/', ({ request }) => {
          queries.push(new URL(request.url).search)
          return HttpResponse.json(page(list))
        }),
      ],
    })
    expect(await screen.findByRole('link', { name: /Bold sale/ })).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /Print/ }))
    await waitFor(() => expect(router.state.location.search).toContain('category=print'))
    await waitFor(() => expect(queries.some((query) => query.includes('category=print'))).toBe(true))
    await userEvent.click(screen.getByRole('radio', { name: 'Portrait' }))
    await waitFor(() => expect(queries.some((query) => query.includes('orientation=portrait'))).toBe(true))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search templates' }), 'wed')
    await waitFor(() => expect(router.state.location.search).toContain('q=wed'))
    // The list asks again after the search settles; let that request end inside the test, not after its handlers are gone.
    await waitFor(() => expect(queries.some((query) => query.includes('q=wed'))).toBe(true))
  })

  it('leaves out categories without a published template, unless one of them is the selected filter', async () => {
    const withEmpty = [...categories, { id: 'c3', slug: 'education', name: 'Education', icon: '', template_count: 0, sort_order: 2 }]
    const first = renderApp('/templates', { handlers: [http.get('*/api/v1/template-categories/', () => HttpResponse.json(withEmpty))] })
    expect(await screen.findByRole('button', { name: /Print/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Education/ })).not.toBeInTheDocument()
    first.unmount()
    renderApp('/templates?category=education', { handlers: [http.get('*/api/v1/template-categories/', () => HttpResponse.json(withEmpty))] })
    expect(await screen.findByRole('button', { name: /Education/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows an empty state with a way to clear filters', async () => {
    renderApp('/templates?q=nothing', { handlers: [http.get('*/api/v1/template-categories/', () => HttpResponse.json(categories))] })
    expect(await screen.findByText('No templates match')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Templates are on their way')).toBeInTheDocument()
  })

  it('loads more templates', async () => {
    renderApp('/templates', {
      handlers: [
        http.get('*/api/v1/templates/', ({ request }) => {
          const index = Number(new URL(request.url).searchParams.get('page') ?? 1)
          return HttpResponse.json(index === 1 ? page(list, { next: 'http://x/?page=2', count: 3 }) : page([makeTemplate('extra', { title: 'Extra one' })], { count: 3 }))
        }),
      ],
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Load more templates' }))
    expect(await screen.findByRole('link', { name: /Extra one/ })).toBeInTheDocument()
  })

  it('detail: guests start from the template in the browser (/create?template=)', async () => {
    const { router } = renderApp('/templates/bold-sale', {
      handlers: [http.get('*/api/v1/templates/bold-sale/', () => HttpResponse.json({ ...makeTemplate('bold-sale', { title: 'Bold sale', tags: ['sale'], width: 1080, height: 1080 }), description: 'Make noise.', document: createBlankDocument(1080, 1080) }))],
    })
    expect(await screen.findByRole('heading', { name: 'Bold sale' })).toBeInTheDocument()
    expect(screen.getByText('Make noise.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'sale' })).toHaveAttribute('href', '/templates?q=sale')
    await userEvent.click(screen.getByRole('button', { name: 'Use this template' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/local\//))
  })

  it('detail: signed-in users get a copy via POST /templates/:slug/use/ and go to /design/:id', async () => {
    const { router } = renderApp('/templates/bold-sale', {
      user: makeUser(),
      handlers: [
        http.get('*/api/v1/templates/bold-sale/', () => HttpResponse.json({ ...makeTemplate('bold-sale'), description: '', document: createBlankDocument(10, 10) })),
        http.post('*/api/v1/templates/bold-sale/use/', () => HttpResponse.json({ ...makeTemplate('x'), id: 'copy-9', title: 'Bold sale', document: createBlankDocument(10, 10) }, { status: 201 })),
        http.get('*/api/v1/designs/copy-9/', () => HttpResponse.json({ id: 'copy-9', title: 'Bold sale', revision: 1, trashed_at: null, document: createBlankDocument(10, 10) })),
      ],
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Use this template' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/design/copy-9'))
  })

  it('detail: unknown templates get a friendly 404', async () => {
    renderApp('/templates/nope', { handlers: [http.get('*/api/v1/templates/nope/', () => HttpResponse.json({ error: { code: 'not_found', message: 'Not found.' } }, { status: 404 }))] })
    expect(await screen.findByText('We can’t find that template')).toBeInTheDocument()
  })

  it('shows the 404 page for unknown routes', async () => {
    renderApp('/definitely/not/a/page')
    expect(await screen.findByText('We can’t find that page')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
  })
})
