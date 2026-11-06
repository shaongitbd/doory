import { msg } from '@/i18n/catalog'
import { CircleAlert, MailCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { authApi, isApiError } from '@/lib/api'
import { usePageMeta } from '@/lib/usePageMeta'
import { LinkButton, Spinner } from '@/ui'
import styles from './AuthPage.module.css'

type State = 'working' | 'verified' | 'failed' | 'invalid'

export default function VerifyEmailPage() {
  usePageMeta({ title: msg("Verify your email"), noindex: true })
  const [params] = useSearchParams()
  const uid = params.get('uid') ?? ''
  const token = params.get('token') ?? ''
  const { status, refresh } = useAuth()
  const [state, setState] = useState<State>(uid && token ? 'working' : 'invalid')
  const [message, setMessage] = useState('')
  const started = useRef(false)

  useEffect(() => {
    // The token is single-use: guard against React StrictMode's double effect.
    if (!uid || !token || started.current) return
    started.current = true
    authApi
      .verifyEmail({ uid, token })
      .then(async () => {
        setState('verified')
        if (status === 'authenticated') await refresh().catch(() => null)
      })
      .catch((error: unknown) => {
        setState('failed')
        setMessage(isApiError(error) ? error.message : 'Something went wrong.')
      })
  }, [uid, token, status, refresh])

  if (state === 'working') {
    return (
      <div role="status" aria-live="polite">
        <div className={styles.stateIcon} aria-hidden="true">
          <Spinner size={26} />
        </div>
        <h1 className={styles.title}>{msg("Verifying your email…")}</h1>
      </div>
    )
  }
  if (state === 'verified') {
    return (
      <div role="status">
        <div className={styles.stateIcon} data-tone="success" aria-hidden="true">
          <MailCheck size={28} />
        </div>
        <h1 className={styles.title}>{msg("Email verified")}</h1>
        <p className={styles.lead}>{msg("Thanks! Your address is confirmed.")}</p>
        <div className={styles.actions}>
          <LinkButton to={status === 'authenticated' ? '/dashboard' : '/login'} size="lg">
            {status === 'authenticated' ? 'Go to your dashboard' : 'Log in'}
          </LinkButton>
        </div>
      </div>
    )
  }
  return (
    <div role="alert">
      <div className={styles.stateIcon} aria-hidden="true">
        <CircleAlert size={28} />
      </div>
      <h1 className={styles.title}>{state === 'invalid' ? 'This link isn’t valid' : 'We couldn’t verify that link'}</h1>
      <p className={styles.lead}>{state === 'invalid' ? 'The verification link is incomplete.' : message || 'It may have expired or already been used.'} {msg("Log in and use “Resend verification email” to get a fresh one.")}</p>
      <div className={styles.actions}>
        <Link to="/login">{msg("Go to log in")}</Link>
      </div>
    </div>
  )
}
