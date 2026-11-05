import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { Dialog } from './Dialog'

function Harness({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Rename" description="Pick a name" dismissible={dismissible} footer={<button>Save</button>}>
        <input aria-label="Name" />
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('allows a translated close label while preserving the default for existing callers', () => {
    const { rerender } = render(<Dialog open title="Language" onClose={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument()
    rerender(<Dialog open title="Sprache" closeLabel="Dialog schließen" onClose={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Dialog schließen' })).toBeInTheDocument()
  })
  it('has dialog semantics and moves focus inside', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Pick a name')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('closes on Escape and restores focus to the opener', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('traps Tab focus within the dialog', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = await screen.findByRole('dialog')
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab({ shift: true })
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('locks body scroll while open and releases it after', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('dialog')
    expect(document.body.style.overflow).toBe('hidden')
    await userEvent.keyboard('{Escape}')
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('ignores Escape and hides the close button when not dismissible', async () => {
    render(<Harness dismissible={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: 'Close dialog' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('ConfirmDialog', () => {
  it('focuses cancel first and calls onConfirm', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog open title="Delete design?" confirmLabel="Delete" tone="danger" onConfirm={onConfirm} onCancel={() => undefined} />)
    expect(screen.getByRole('alertdialog', { name: 'Delete design?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('requires typed confirmation before enabling the confirm button', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog open title="Delete account" confirmLabel="Delete" requireText="DELETE" onConfirm={onConfirm} onCancel={() => undefined} />)
    const confirm = screen.getByRole('button', { name: 'Delete' })
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Type "DELETE"/), 'DELETE')
    expect(confirm).toBeEnabled()
  })
})
