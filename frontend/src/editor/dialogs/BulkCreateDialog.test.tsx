import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBlankDocument } from '@/lib/document'
import { ApiError } from '@/lib/api/client'
import type { BulkFillInput, TemplateField } from '@/types/api'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { EditorProvider } from '../EditorProvider'
import { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import { BulkCreateDialog } from './BulkCreateDialog'

const field = (key: string, type: TemplateField['type'], label: string | null = null): TemplateField => ({ key, type, label, pages: [1], object_ids: [key], current: null, fit: null, overflow: false })

function setup(fields: TemplateField[]) {
  const handle = createMemoryAdapter()
  const run = vi.fn(async (input: BulkFillInput) => ({
    created: input.rows.length,
    rows: input.rows.map((_, i) => ({ row: i + 1, ok: true as const, design_id: `d${i}`, title: `Badge - ${i + 1}`, filled: [], skipped: [], overflow: [] })),
  }))
  const createFolder = vi.fn(async (name: string) => ({ id: 'folder-1', name }))
  handle.adapter.services.bulkFill = { fields: async () => fields, createFolder, run }
  const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'Badge', mode: 'guest' }, ephemeral: true })
  render(
    <EditorProvider engine={engine} portalRoot={document.body}>
      <BulkCreateDialog />
    </EditorProvider>,
  )
  return { engine, run, createFolder }
}

describe('Bulk create dialog', () => {
  let engine: EditorEngine | null = null
  afterEach(() => engine?.dispose())

  it('maps pasted columns, previews the rows, skips bad ones and creates the rest into a new folder', async () => {
    const ctx = setup([field('name', 'text', 'Name'), field('accent', 'color')])
    engine = ctx.engine
    const data = await screen.findByRole('textbox', { name: t.bulk.dataField })
    await userEvent.click(data)
    await userEvent.paste('Name\tColour\nAda\t#ff0000\nGrace\tred')
    await userEvent.click(screen.getByRole('button', { name: t.bulk.next }))

    expect(screen.getByRole('combobox', { name: t.bulk.mapField('Name') })).toHaveValue('0')
    expect(screen.getByRole('combobox', { name: t.bulk.mapField('accent') })).toHaveValue('-1')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: t.bulk.mapField('accent') }), 'Colour')
    expect(screen.getByRole('alert')).toHaveTextContent(t.bulk.rowErrors(1))
    expect(screen.getByRole('alert')).toHaveTextContent(t.bulk.failedRow(2, `accent: ${t.bulk.errorColor}`))

    await userEvent.click(screen.getByRole('button', { name: t.bulk.create(1) }))
    await waitFor(() => expect(ctx.run).toHaveBeenCalledOnce())
    expect(ctx.createFolder).toHaveBeenCalledWith(t.bulk.folderDefault('Badge'))
    expect(ctx.run).toHaveBeenCalledWith({ rows: [{ name: 'Ada', accent: '#ff0000' }], row_numbers: [1], name_pattern: '{title} - {n}', folder: 'folder-1' })
    expect(await screen.findByRole('status')).toHaveTextContent(t.bulk.done(1))
    expect(screen.getByRole('link', { name: t.bulk.open })).toHaveAttribute('href', '/design/d0')
  })

  it('picks a free folder name when the suggested one is taken', async () => {
    const ctx = setup([field('name', 'text', 'Name')])
    engine = ctx.engine
    const taken = new ApiError({ status: 400, code: 'invalid', message: 'Invalid', fields: { name: ['A folder with this name already exists here.'] } })
    ctx.createFolder.mockRejectedValueOnce(taken)
    await userEvent.click(await screen.findByRole('textbox', { name: t.bulk.dataField }))
    await userEvent.paste('Name\nAda')
    await userEvent.click(screen.getByRole('button', { name: t.bulk.next }))
    await userEvent.click(screen.getByRole('button', { name: t.bulk.create(1) }))
    await waitFor(() => expect(ctx.run).toHaveBeenCalledOnce())
    expect(ctx.createFolder.mock.calls.map(([name]) => name)).toEqual([t.bulk.folderDefault('Badge'), `${t.bulk.folderDefault('Badge')} (2)`])
  })

  it('explains when the design has no fields', async () => {
    engine = setup([]).engine
    expect(await screen.findByText(t.bulk.noFields)).toBeInTheDocument()
  })
})
