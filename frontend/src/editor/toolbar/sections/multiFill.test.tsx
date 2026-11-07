import { Group } from 'fabric'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorProvider } from '../../EditorProvider'
import { EditorEngine } from '../../engine/editor'
import { MultiSection } from './common'

it('recolors several selected SVG shapes with one fill choice', async () => {
  const engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
  await engine.insert.svgElement('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="50" height="50" fill="#ff0000"/><rect x="50" width="50" height="50" fill="#0000ff"/></svg>', 'demo', 'Demo')
  const group = view.canvas.getObjects()[0] as Group
  view.selectObjects(group.getObjects())
  engine.refreshSelection()
  expect(engine.state.selection.kinds).toEqual(['shape'])

  render(<EditorProvider engine={engine} portalRoot={document.body}><MultiSection /></EditorProvider>)
  await userEvent.click(screen.getByRole('button', { name: 'Fill: mixed colors' }))
  const picker = screen.getByTestId('ed-multi-fill-popover')
  expect(within(picker).getByText('Default colors')).toBeInTheDocument()
  expect(within(picker).getByText('Gradients')).toBeInTheDocument()
  await userEvent.click(within(picker).getByRole('button', { name: 'Use #7a64e0' }))

  expect(group.getObjects().map((object) => object.fill)).toEqual(['#7a64e0', '#7a64e0'])
  expect(engine.state.doc.pages[0].objects[0]).toMatchObject({ objects: [{ fill: '#7a64e0' }, { fill: '#7a64e0' }] })
  cleanup()
  engine.dispose()
  document.body.innerHTML = ''
})
