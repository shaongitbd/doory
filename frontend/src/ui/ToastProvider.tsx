import { msg } from '@/i18n/catalog'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Portal } from './Portal'
import { IconButton } from './IconButton'
import styles from './ToastProvider.module.css'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface ToastOptions {
  title: string
  description?: ReactNode
  variant?: ToastVariant
  /** Milliseconds; 0 keeps the toast until dismissed. Defaults to 5000 (8000 with an action). */
  duration?: number
  action?: { label: string; onClick(): void }
}

interface ToastItem extends ToastOptions {
  id: number
  variant: ToastVariant
}

interface ToastApi {
  toast(options: ToastOptions): number
  dismiss(id: number): void
}

const ToastContext = createContext<ToastApi | null>(null)
const MAX_TOASTS = 4

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), [])
  const toast = useCallback((options: ToastOptions) => {
    counter.current += 1
    const id = counter.current
    setItems((current) => [...current, { ...options, id, variant: options.variant ?? 'info' }].slice(-MAX_TOASTS))
    return id
  }, [])

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss])
  return (
    <ToastContext.Provider value={api}>
      {children}
      <Portal>
        <div className={styles.region} role="region" aria-label={msg("Notifications")}>
          {items.map((item) => (
            <ToastView key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      </Portal>
    </ToastContext.Provider>
  )
}

const ICONS: Record<ToastVariant, ReactNode> = {
  info: <Info size={20} />,
  success: <CheckCircle2 size={20} />,
  warning: <TriangleAlert size={20} />,
  error: <AlertCircle size={20} />,
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss(id: number): void }) {
  const [paused, setPaused] = useState(false)
  const duration = item.duration ?? (item.action ? 8000 : 5000)
  useEffect(() => {
    if (duration === 0 || paused) return undefined
    const timer = window.setTimeout(() => onDismiss(item.id), duration)
    return () => window.clearTimeout(timer)
  }, [duration, paused, item.id, onDismiss])

  return (
    <div
      className={styles.toast}
      data-variant={item.variant}
      role={item.variant === 'error' ? 'alert' : 'status'}
      aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.icon} aria-hidden="true">
        {ICONS[item.variant]}
      </span>
      <div className={styles.content}>
        <p className={styles.title}>{item.title}</p>
        {item.description ? <p className={styles.description}>{item.description}</p> : null}
      </div>
      {item.action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            item.action?.onClick()
            onDismiss(item.id)
          }}
        >
          {item.action.label}
        </button>
      ) : null}
      <IconButton label={msg("Dismiss notification")} size="sm" icon={<X size={16} />} onClick={() => onDismiss(item.id)} />
    </div>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
