import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { loadLocale } from '@/i18n/catalog'
import { setLocale } from '@/i18n/locale'
import zhCN from '@/i18n/zh-CN.json'
import { EditorProblemPage } from './EditorStates'

it('shows the problem page in a language chosen after its module loaded', async () => {
  await loadLocale('zh-CN')
  setLocale('zh-CN')
  try {
    render(
      <MemoryRouter>
        <EditorProblemPage problem="trashed" />
      </MemoryRouter>,
    )
    expect(screen.getByText(zhCN['app.This design is in the trash'])).toBeInTheDocument()
    expect(screen.getByText(zhCN['app.Restore it from the trash to keep editing.'])).toBeInTheDocument()
  } finally {
    setLocale('en')
  }
})
