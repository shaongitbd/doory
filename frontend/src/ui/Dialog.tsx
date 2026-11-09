import { X } from 'lucide-react'
import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { cx } from '@/lib/cx'
import { getFocusable } from './hooks'
import { IconButton } from './IconButton'
import { isTopModal, pushModal } from './modalStack'
import { Portal } from './Portal'
import styles from './Dialog.module.css'

export interface DialogProps {
  open: boolean
  onClose(): void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  role?: 'dialog' | 'alertdialog'
  /** When false, ESC and overlay clicks do nothing and the close button is hidden. */
  dismissible?: boolean
  hideTitle?: boolean
  closeLabel?: string
  initialFocusRef?: RefObject<HTMLElement | null>
  className?: string
}

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', role = 'dialog', dismissible = true, hideTitle, closeLabel, initialFocusRef, className }: DialogProps) {
  if (!open) return null
  return (
    <Portal>
      <DialogContent
        onClose={onClose}
        title={title}
        description={description}
        footer={footer}
        size={size}
        role={role}
        dismissible={dismissible}
        hideTitle={hideTitle}
        closeLabel={closeLabel}
        initialFocusRef={initialFocusRef}
        className={className}
      >
        {children}
      </DialogContent>
    </Portal>
  )
}

type ContentProps = Omit<DialogProps, 'open'>

function DialogContent({ onClose, title, description, children, footer, size = 'md', role = 'dialog', dismissible = true, hideTitle, closeLabel = 'Close dialog', initialFocusRef, className }: ContentProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const overlay = overlayRef.current
    const panel = panelRef.current
    if (!overlay || !panel) return undefined
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const release = pushModal(overlay)
    const alreadyFocused = panel.contains(document.activeElement) && document.activeElement !== panel
    const target = initialFocusRef?.current ?? (alreadyFocused ? null : (getFocusable(panel).find((el) => !el.hasAttribute('data-dialog-close')) ?? panel))
    target?.focus({ preventScroll: true })
    return () => {
      release()
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true })
    }
  }, [initialFocusRef])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const overlay = overlayRef.current
    if (!overlay || !isTopModal(overlay)) return
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (dismissible) {
        event.preventDefault()
        onCloseRef.current()
      }
      return
    }
    if (event.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusable = getFocusable(panel)
    if (focusable.length === 0) {
      event.preventDefault()
      panel.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const onOverlayMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (dismissible && event.target === event.currentTarget) onCloseRef.current()
  }

  return (
    <div ref={overlayRef} className={styles.overlay} onMouseDown={onOverlayMouseDown} onKeyDown={onKeyDown} data-doory-modal="">
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(styles.panel, className)}
        data-size={size}
      >
        <header className={cx(styles.header, hideTitle && styles.headerHidden)}>
          <div className={styles.headings}>
            <h2 id={titleId} className={cx(styles.title, hideTitle && styles.srOnly)}>
              {title}
            </h2>
            {description ? (
              <p id={descId} className={styles.description}>
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? <IconButton label={closeLabel} size="sm" icon={<X size={18} />} onClick={() => onCloseRef.current()} data-dialog-close="" /> : null}
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>
  )
}
