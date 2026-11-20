import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { activateLocale } from '@/i18n/catalog'
import { setLocale } from '@/i18n/locale'
import { useLocale } from '@/i18n/useLocale'
import { imposePages } from '../../engine/export/imposition'
import { t } from '../../strings'
import { FoldSection, type FoldChoice } from './FoldSection'

afterEach(() => setLocale('en'))

function Controls({ valid = true }: { valid?: boolean }) {
  useLocale()
  const [value, setValue] = useState<FoldChoice>({ layout: 'booklet', binding: 'left', sides: 'both', signaturePages: 4 })
  return <FoldSection value={value} onChange={setValue} pages={5} valid={valid} size={{ width: 559, height: 794 }} />
}

it('keeps folded layout, binding, side and signature choices while translating the sheet preview', async () => {
  render(<Controls />)
  fireEvent.click(screen.getByRole('radio', { name: 'Book signatures' }))
  fireEvent.change(screen.getByLabelText('Binding edge'), { target: { value: 'right' } })
  fireEvent.change(screen.getByLabelText('Pages per signature'), { target: { value: '8' } })
  fireEvent.change(screen.getByLabelText('PDF sheet sides'), { target: { value: 'back' } })

  await act(() => activateLocale('de'))
  expect(screen.getByRole('radio', { name: 'Buch mit Falzlagen' })).toBeChecked()
  expect(screen.getByLabelText('Bindekante')).toHaveValue('right')
  expect(screen.getByLabelText('Seiten pro Falzlage')).toHaveValue('8')
  expect(screen.getByLabelText('Druckbogenseiten im PDF')).toHaveValue('back')
  const preview = screen.getByTestId('fold-preview')
  expect(preview).toHaveTextContent('5 Seiten · 2 Druckbögen · 3 Leerseiten · Ausgewählt: Rückseite')
  expect(within(preview).getAllByRole('listitem').map(item => item.textContent)).toEqual([
    'Druckbogen 1, Rückseite: Leerseite | Seite 2',
    'Druckbogen 2, Rückseite: Seite 5 | Seite 4',
  ])

  await act(() => activateLocale('en'))
  expect(screen.getByLabelText('Binding edge')).toHaveValue('right')
  expect(screen.getByLabelText('Pages per signature')).toHaveValue('8')
  expect(screen.getByLabelText('PDF sheet sides')).toHaveValue('back')
  expect(preview).toHaveTextContent('Sheet 1, back: Blank | Page 2')
})

it('localizes invalid folded sizes and engine validation without producing a preview', async () => {
  await activateLocale('de')
  render(<Controls valid={false} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Wähle für gefaltete Druckbögen gleich große Seiten im Hochformat.')
  expect(screen.queryByTestId('fold-preview')).not.toBeInTheDocument()
  expect(() => imposePages(0, 'booklet', 4, 'left')).toThrow(t.print.fold.errors.pages)
  expect(() => imposePages(4, 'book', 6, 'left')).toThrow(t.print.fold.errors.signature)
})
