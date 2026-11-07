import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorProvider } from '../../EditorProvider'
import { EditorEngine } from '../../engine/editor'
import { ElementSection } from './shapes'

it('opens vector colors from one toolbar button', async () => {
  const engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
  await engine.insert.svgElement('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="50" height="50" fill="#ff0000"/><rect x="50" width="50" height="50" fill="#0000ff"/></svg>', 'demo', 'Demo')
  view.selectObjects([view.canvas.getObjects()[0]])

  render(<EditorProvider engine={engine} portalRoot={document.body}><ElementSection /></EditorProvider>)
  expect(screen.getByRole('button', { name: 'Color palette' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Recolor #ff0000' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Color palette' }))
  expect(screen.getByRole('button', { name: 'Recolor #ff0000' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Recolor #0000ff' })).toBeInTheDocument()
  const palette = screen.getByRole('dialog', { name: 'Color palette' })
  expect(within(palette).getByRole('group', { name: 'Default colors' })).toBeInTheDocument()
  expect(within(palette).getByRole('group', { name: 'Gradients' })).toBeInTheDocument()
  await userEvent.click(within(palette).getByRole('button', { name: 'Recolor #ff0000' }))
  await userEvent.click(within(palette).getByRole('button', { name: 'Sunset gradient' }))
  expect(engine.state.doc.pages[0].objects[0].colorMap).toMatchObject({ '#ff0000': { type: 'gradient', kind: 'linear' } })

  cleanup()
  engine.dispose()
  document.body.innerHTML = ''
})
