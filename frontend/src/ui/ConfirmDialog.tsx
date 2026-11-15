import { msg } from '@/i18n/catalog'
import { useId, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { Input } from './Input'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  /** When set, the user must type this exact text before the confirm button enables. */
  requireText?: string
  loading?: boolean
  onConfirm(): void | Promise<void>
  onCancel(): void
  children?: ReactNode
}

export function ConfirmDialog({ open, title, description, confirmLabel = msg('Confirm'), cancelLabel = msg('Cancel'), tone = 'default', requireText, loading, onConfirm, onCancel, children }: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  const inputId = useId()
  const confirmed = !requireText || typed.trim() === requireText

  const handleCancel = () => {
    setTyped('')
    onCancel()
  }

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      title={title}
      description={description}
      size="sm"
      role="alertdialog"
      dismissible={!loading}
      initialFocusRef={requireText ? undefined : cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="ghost" onClick={handleCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            disabled={!confirmed}
            onClick={() => {
              void onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {requireText ? (
        <Input
          id={inputId}
          label={msg('Type "{token}" to confirm', { token: requireText })}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      ) : null}
    </Dialog>
  )
}
