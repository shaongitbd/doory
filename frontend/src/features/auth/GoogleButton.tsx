import { msg } from '@/i18n/catalog'
import { useEffect, useRef, useState } from 'react'
import { loadGoogleIdentity, type GoogleButtonOptions } from '@/lib/googleIdentity'
import { Skeleton } from '@/ui'
import { useAuth } from './AuthProvider'
import styles from './GoogleButton.module.css'

export interface GoogleButtonProps {
  onCredential(credential: string): void
  text?: GoogleButtonOptions['text']
}

/** Official Google button, rendered by Google's script — and only when the server has a client id. */
export function GoogleButton({ onCredential, text = 'continue_with' }: GoogleButtonProps) {
  const { config } = useAuth()
  const clientId = config.google_client_id
  const container = useRef<HTMLDivElement>(null)
  const handler = useRef(onCredential)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    handler.current = onCredential
  })

  useEffect(() => {
    if (!clientId) return undefined
    let cancelled = false
    loadGoogleIdentity()
      .then((google) => {
        const el = container.current
        if (cancelled || !el) return
        google.initialize({ client_id: clientId, callback: (response) => handler.current(response.credential), auto_select: false, cancel_on_tap_outside: true })
        google.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text, width: Math.min(Math.max(el.clientWidth, 200), 400), logo_alignment: 'center' })
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('failed')
      })
    return () => {
      cancelled = true
    }
  }, [clientId, text])

  if (!clientId) return null
  if (state === 'failed') return <p className={styles.unavailable}>{msg("Google sign-in is unavailable right now. You can still use your email.")}</p>
  return (
    <div className={styles.wrap}>
      {state === 'loading' ? <Skeleton height={44} radius="var(--radius-full)" /> : null}
      <div ref={container} className={styles.button} data-ready={state === 'ready' || undefined} />
    </div>
  )
}
