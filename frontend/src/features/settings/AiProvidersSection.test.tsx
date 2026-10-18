import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '@/test/app'
import { makeConfig, makeUser } from '@/test/factories'
import type { AiProvider, AiUserProviders, AppConfig } from '@/types/api'

function config(userProviders: AiUserProviders = 'everyone'): AppConfig {
  const base = makeConfig()
  return makeConfig({ features: { ...base.features, ai_providers: userProviders !== 'off' }, ai: { user_providers: userProviders, offsite_notice: '', background_removal: { default: 'device', models: [] } } })
}

function provider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    id: 'p1',
    name: 'My model server',
    base_url: 'https://ai.example.com',
    style: 'doory',
    style_config: {},
    auth_header: 'Authorization',
    has_secret: true,
    tasks: ['background-removal'],
    timeout_seconds: 60,
    max_image_bytes: 0,
    sends_offsite: true,
    enabled: true,
    sort_order: 0,
    models: [],
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

const list = (items: AiProvider[]) => http.get('*/api/v1/ai/providers/', () => HttpResponse.json(items))

async function openEditor(name = 'My model server') {
  const row = (await screen.findByRole('list', { name: 'Your AI servers' })).querySelector('li') as HTMLElement
  await userEvent.click(within(row).getByRole('button', { name: `Edit ${name}` }))
}

describe('settings: AI providers', () => {
  it('is not there when users may not add servers', async () => {
    const requests: string[] = []
    renderApp('/settings', { user: makeUser(), config: config('off'), handlers: [http.get('*/api/v1/ai/providers/', ({ request }) => (requests.push(request.url), HttpResponse.json([])))] })
    await screen.findByRole('heading', { name: 'Settings' })
    expect(screen.queryByRole('heading', { name: 'AI providers' })).toBeNull()
    expect(requests).toEqual([])
  })

  it('hides itself when the server says this user may not (staff only)', async () => {
    renderApp('/settings', {
      user: makeUser(),
      config: config('staff'),
      handlers: [http.get('*/api/v1/ai/providers/', () => HttpResponse.json({ error: { code: 'ai_user_providers_disabled', message: 'Not enabled.' } }, { status: 403 }))],
    })
    expect(await screen.findByRole('heading', { name: 'AI providers' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'AI providers' })).toBeNull())
  })

  it('lists the servers with their style, key status and models, never a key', async () => {
    renderApp('/settings', {
      user: makeUser(),
      config: config(),
      handlers: [
        list([
          provider({ models: [{ id: 'm1', task: 'background-removal', remote_name: 'fast-v2', label: 'Fast', enabled: true }, { id: 'm2', task: 'background-removal', remote_name: 'best-v1', label: 'Best', enabled: false }] }),
          provider({ id: 'p2', name: 'External API', base_url: 'https://api.example.com/v1', style: 'json', has_secret: false, enabled: false }),
        ]),
      ],
    })
    const rows = within(await screen.findByRole('list', { name: 'Your AI servers' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('My model server')
    expect(rows[0]).toHaveTextContent('Doory-compatible')
    expect(rows[0]).toHaveTextContent('Key stored')
    expect(rows[0]).toHaveTextContent('ai.example.com · Fast')
    expect(rows[1]).toHaveTextContent('JSON → base64')
    expect(rows[1]).not.toHaveTextContent('Key stored')
    expect(rows[1]).toHaveTextContent('Off')
    expect(rows[1]).toHaveTextContent('api.example.com · the server’s default model')
  })

  it('adds a server with its style settings and key, then offers models and a test', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', {
      user: makeUser(),
      config: config(),
      handlers: [
        list([]),
        http.post('*/api/v1/ai/providers/', async ({ request }) => {
          bodies.push(await request.json())
          return HttpResponse.json(provider({ id: 'p9', name: 'Provider X', style: 'multipart', style_config: { path: '/api/remove' }, auth_header: 'X-Api-Key' }), { status: 201 })
        }),
      ],
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Add a server' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Provider X')
    await userEvent.type(screen.getByLabelText('Server address'), 'https://ai.example.com')
    await userEvent.selectOptions(screen.getByLabelText('API style'), 'multipart')
    expect(screen.getByText(/The picture goes up as a file field/)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Style settings (JSON)'))
    await userEvent.paste('{"path": "/api/remove", "model_field": "model"}')
    await userEvent.type(screen.getByLabelText('Auth header'), 'X-Api-Key')
    await userEvent.type(screen.getByLabelText('Key'), 'k-123')
    await userEvent.click(screen.getByRole('button', { name: 'Add server' }))

    await waitFor(() =>
      expect(bodies).toEqual([
        {
          name: 'Provider X',
          base_url: 'https://ai.example.com',
          style: 'multipart',
          style_config: { path: '/api/remove', model_field: 'model' },
          auth_header: 'X-Api-Key',
          secret: 'k-123',
          tasks: ['background-removal'],
          timeout_seconds: 60,
          sends_offsite: true,
          enabled: true,
        },
      ]),
    )
    expect(await screen.findByRole('region', { name: 'Models' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Test connection' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load models' })).toBeNull() // only Doory-compatible servers list their models
    expect(screen.getByLabelText('Key')).toHaveValue('') // the key is never shown again
    expect(screen.getByText('A key is stored. Leave this empty to keep it.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Your AI servers' })).getByText(/Provider X/)).toBeInTheDocument()
  })

  it('checks the form before sending it', async () => {
    const bodies: unknown[] = []
    renderApp('/settings', { user: makeUser(), config: config(), handlers: [list([]), http.post('*/api/v1/ai/providers/', async ({ request }) => (bodies.push(await request.json()), HttpResponse.json(provider(), { status: 201 })))] })
    await userEvent.click(await screen.findByRole('button', { name: 'Add a server' }))
    await userEvent.click(screen.getByLabelText('Style settings (JSON)'))
    await userEvent.paste('path: /remove')
    await userEvent.click(screen.getByLabelText('Background removal'))
    await userEvent.click(screen.getByRole('button', { name: 'Add server' }))
    expect(screen.getByText('Name the server, e.g. “My model server”.')).toBeInTheDocument()
    expect(screen.getByText(/Enter the server’s address/)).toBeInTheDocument()
    expect(screen.getByText(/Write the settings as a JSON object/)).toBeInTheDocument()
    expect(screen.getByText('Choose at least one task.')).toBeInTheDocument()
    expect(bodies).toEqual([])
  })

  it('shows the server’s reasons next to the fields', async () => {
    renderApp('/settings', {
      user: makeUser(),
      config: config(),
      handlers: [list([]), http.post('*/api/v1/ai/providers/', () => HttpResponse.json({ error: { code: 'validation_error', message: 'Invalid input.', fields: { base_url: ['That server address is not allowed.'] } } }, { status: 400 }))],
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Add a server' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Mine')
    await userEvent.type(screen.getByLabelText('Server address'), 'https://10.0.0.5')
    await userEvent.click(screen.getByRole('button', { name: 'Add server' }))
    expect(await screen.findByText('That server address is not allowed.')).toBeInTheDocument()
  })

  it('keeps the stored key unless it is replaced or removed', async () => {
    const bodies: Record<string, unknown>[] = []
    renderApp('/settings', {
      user: makeUser(),
      config: config(),
      handlers: [
        list([provider()]),
        http.patch('*/api/v1/ai/providers/p1/', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          bodies.push(body)
          return HttpResponse.json(provider({ has_secret: body.secret !== '', updated_at: `2026-10-0${bodies.length + 1}T00:00:00Z` }))
        }),
      ],
    })
    await openEditor()
    expect(screen.getByLabelText('Key')).toHaveAttribute('placeholder', 'Stored')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).not.toHaveProperty('secret')

    await userEvent.click(screen.getByLabelText('Remove the stored key'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toMatchObject({ secret: '' })
  })

  it('loads the models of a Doory-compatible server, then saves the picked ones with their labels', async () => {
    const puts: unknown[] = []
    const loaded = provider({
      updated_at: '2026-10-02T00:00:00Z',
      models: [
        { id: 'm1', task: 'background-removal', remote_name: 'fast-v2', label: 'fast-v2', enabled: true },
        { id: 'm2', task: 'background-removal', remote_name: 'best-v1', label: 'best-v1', enabled: true },
      ],
    })
    renderApp('/settings', {
      user: makeUser(),
      config: config(),
      handlers: [
        list([provider()]),
        http.post('*/api/v1/ai/providers/p1/load-models/', () => HttpResponse.json(loaded)),
        http.put('*/api/v1/ai/providers/p1/models/', async ({ request }) => {
          puts.push(await request.json())
          return HttpResponse.json(provider({ ...loaded, updated_at: '2026-10-03T00:00:00Z' }))
        }),
      ],
    })
    await openEditor()
    await userEvent.click(within(screen.getByRole('region', { name: 'Models' })).getByRole('button', { name: 'Load models' }))
    const rows = await within(await screen.findByRole('list', { name: 'Models to offer' })).findAllByRole('listitem')
    const models = screen.getByRole('region', { name: 'Models' })
    expect(rows).toHaveLength(2)
    const fast = within(rows[0]).getByLabelText('Label')
    await userEvent.clear(fast)
    await userEvent.type(fast, 'Fast')
    await userEvent.click(within(rows[1]).getByLabelText('Offer'))
    await userEvent.click(within(models).getByRole('button', { name: 'Add model' }))
    const added = within(models).getAllByRole('listitem')[2]
    await userEvent.type(within(added).getByLabelText('Model'), 'custom-1')
    await userEvent.click(within(models).getByRole('button', { name: 'Save models' }))
    await waitFor(() =>
      expect(puts).toEqual([
        {
          models: [
            { task: 'background-removal', remote_name: 'fast-v2', label: 'Fast', enabled: true, sort_order: 0 },
            { task: 'background-removal', remote_name: 'best-v1', label: 'best-v1', enabled: false, sort_order: 1 },
            { task: 'background-removal', remote_name: 'custom-1', label: '', enabled: true, sort_order: 2 },
          ],
        },
      ]),
    )
  })

  it('says why the models could not be loaded', async () => {
    renderApp('/settings', {
      user: makeUser(),
      config: config(),
      handlers: [list([provider()]), http.post('*/api/v1/ai/providers/p1/load-models/', () => HttpResponse.json({ error: { code: 'ai_unreachable', message: 'The server could not be reached.' } }, { status: 502 }))],
    })
    await openEditor()
    await userEvent.click(screen.getByRole('button', { name: 'Load models' }))
    expect(await screen.findByText('The server could not be reached.')).toBeInTheDocument()
  })

  it('tests the connection and shows the result with its timing', async () => {
    let ok = true
    renderApp('/settings', {
      user: makeUser(),
      config: config(),
      handlers: [
        list([provider()]),
        http.post('*/api/v1/ai/providers/p1/test/', () =>
          HttpResponse.json(
            ok
              ? { ok: true, duration_ms: 1234, task: 'background-removal', model: '', preview: 'data:image/png;base64,AAAA', error: null }
              : { ok: false, duration_ms: 30000, task: 'background-removal', model: '', preview: '', error: { code: 'timeout', message: 'The server took too long to answer.' } },
          ),
        ),
      ],
    })
    await openEditor()
    const test = screen.getByRole('region', { name: 'Test connection' })
    await userEvent.click(within(test).getByRole('button', { name: 'Test connection' }))
    expect(await within(test).findByText(/It works: answered in 1.2 s/)).toBeInTheDocument()
    expect(within(test).getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,AAAA')

    ok = false
    await userEvent.click(within(test).getByRole('button', { name: 'Test connection' }))
    expect(await within(test).findByText(/The server took too long to answer. \(30 s\)/)).toBeInTheDocument()
    expect(within(test).queryByRole('img')).toBeNull()
  })

  it('removes a server after asking', async () => {
    const deleted: string[] = []
    renderApp('/settings', {
      user: makeUser(),
      config: config(),
      handlers: [
        list([provider()]),
        http.delete('*/api/v1/ai/providers/p1/', ({ request }) => {
          deleted.push(new URL(request.url).pathname)
          return new HttpResponse(null, { status: 204 })
        }),
      ],
    })
    const row = (await screen.findByRole('list', { name: 'Your AI servers' })).querySelector('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: 'Remove My model server' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(deleted).toEqual(['/api/v1/ai/providers/p1/']))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Your AI servers' })).toBeNull())
  })

  it('preserves unsaved model labels when saving connection details', async () => {
    const initialProvider = provider({
      models: [{ id: 'm1', task: 'background-removal', remote_name: 'model-a', label: 'Initial Label', enabled: true }],
    })
    renderApp('/settings', {
      user: makeUser(),
      config: config(),
      handlers: [
        list([initialProvider]),
        http.patch('*/api/v1/ai/providers/p1/', async () => {
          return HttpResponse.json(provider({ ...initialProvider, name: 'Renamed Server', updated_at: '2026-10-02T12:00:00Z' }))
        }),
      ],
    })
    await openEditor()
    const modelsRegion = screen.getByRole('region', { name: 'Models' })
    const labelInput = within(modelsRegion).getByLabelText('Label')
    await userEvent.clear(labelInput)
    await userEvent.type(labelInput, 'Unsaved New Label')
    expect(labelInput).toHaveValue('Unsaved New Label')

    // Change connection name and save connection
    const nameInput = screen.getByLabelText('Name')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Renamed Server')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    // After connection save completes, updated_at changed but the unsaved model row label must remain intact
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Renamed Server'))
    expect(within(screen.getByRole('region', { name: 'Models' })).getByLabelText('Label')).toHaveValue('Unsaved New Label')
  })

  it('does not reopen previous server when late save response arrives after switching servers', async () => {
    let resolveSave!: (res: Response) => void
    const savePromise = new Promise<Response>((resolve) => {
      resolveSave = resolve
    })
    const p1 = provider({ id: 'p1', name: 'Server 1' })
    const p2 = provider({ id: 'p2', name: 'Server 2' })
    renderApp('/settings', {
      user: makeUser(),
      config: config(),
      handlers: [
        list([p1, p2]),
        http.patch('*/api/v1/ai/providers/p1/', () => savePromise),
      ],
    })
    await openEditor('Server 1')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    // Switch to editing Server 2 while p1 save is still in flight
    const listEl = screen.getByRole('list', { name: 'Your AI servers' })
    const row2 = within(listEl).getByText(/Server 2/).closest('li') as HTMLElement
    await userEvent.click(within(row2).getByRole('button', { name: 'Edit Server 2' }))

    expect(screen.getByLabelText('Name')).toHaveValue('Server 2')

    // Now resolve p1 save
    await act(async () => {
      resolveSave(HttpResponse.json(provider({ ...p1, updated_at: '2026-10-03T00:00:00Z' })))
      await new Promise((r) => setTimeout(r, 50))
    })

    // Active editor must still be Server 2
    expect(screen.getByLabelText('Name')).toHaveValue('Server 2')
  })

  it('keeps a half-filled new server when an earlier save answers late', async () => {
    let resolveSave!: (res: Response) => void
    const savePromise = new Promise<Response>((resolve) => {
      resolveSave = resolve
    })
    const p1 = provider({ id: 'p1', name: 'Server 1' })
    renderApp('/settings', { user: makeUser(), config: config(), handlers: [list([p1]), http.patch('*/api/v1/ai/providers/p1/', () => savePromise)] })
    await openEditor('Server 1')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add a server' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Half typed')

    await act(async () => {
      resolveSave(HttpResponse.json(provider({ ...p1, updated_at: '2026-10-03T00:00:00Z' })))
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(screen.getByLabelText('Name')).toHaveValue('Half typed')
  })
})
