import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { createUiI18n } from '@/i18n/instance'
import { LanguageDialog } from './LanguageDialog'

function Harness() {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Language…</button><LanguageDialog open={open} onClose={() => setOpen(false)} /></>
}

describe('LanguageDialog', () => {
  it('switches language in place, traps focus and returns it to the opener', async () => {
    render(<I18nextProvider i18n={createUiI18n()}><Harness /></I18nextProvider>)
    const user = userEvent.setup()
    const opener = screen.getByRole('button', { name: 'Language…' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Language' })
    const select = screen.getByRole('combobox', { name: 'UI language' })
    expect(select).toHaveFocus()
    await user.selectOptions(select, 'de')
    expect(screen.getByRole('dialog', { name: 'Sprache' })).toBe(dialog)
    expect(select).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Dialog schließen' })).toBeInTheDocument()
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.tab({ shift: true })
    expect(select).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})
