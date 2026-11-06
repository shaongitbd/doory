import { act, cleanup, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import type { SaveState } from '@/types/adapter'
import { createUiI18n } from '@/i18n/instance'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from './dev/memoryAdapter'
import { EditorEngine } from './engine/editor'
import { EditorProvider } from './EditorProvider'
import { SaveStatus } from './SaveStatus'

describe('SaveStatus translations', () => {
  let engine: EditorEngine
  afterEach(() => {
    cleanup()
    engine?.dispose()
  })

  it.each([
    [{ status: 'idle' }, 'In diesem Browser gespeichert'],
    [{ status: 'dirty' }, 'Ungespeicherte Änderungen'],
    [{ status: 'saving' }, 'Wird gespeichert…'],
    [{ status: 'saved', savedAt: 0 }, 'Gespeichert'],
    [{ status: 'local', savedAt: 0 }, 'In diesem Browser gespeichert'],
    [{ status: 'conflict' }, 'Konflikt'],
    [{ status: 'error', message: 'Backend message' }, 'Nicht gespeichert'],
  ] satisfies [SaveState, string][])('translates %j without changing stored save state', async (save, expected) => {
    engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: createBlankDocument(800, 600), meta: { id: 'd1', title: 'My design', mode: 'guest' }, ephemeral: true })
    engine.store.setState({ save })
    const instance = createUiI18n()
    render(<I18nextProvider i18n={instance}><EditorProvider engine={engine} portalRoot={document.body}><SaveStatus /></EditorProvider></I18nextProvider>)
    await act(() => instance.changeLanguage('de'))
    expect(screen.getByText(expected)).toBeInTheDocument()
    expect(engine.state.save).toBe(save)
    if (save.status === 'error') {
      expect(screen.getByRole('alert')).toHaveAttribute('title', 'Backend message')
      expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
    }
  })

  it('translates view-only status', () => {
    engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: createBlankDocument(800, 600), meta: { id: 'd1', title: 'My design', mode: 'shared-view' }, ephemeral: true })
    render(<I18nextProvider i18n={createUiI18n('de')}><EditorProvider engine={engine} portalRoot={document.body}><SaveStatus /></EditorProvider></I18nextProvider>)
    expect(screen.getByRole('status')).toHaveTextContent('Nur ansehen')
  })
})
