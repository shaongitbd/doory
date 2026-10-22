import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { ssoErrorMessage } from '@/features/auth/errors'
import { LoginForm } from '@/features/auth/LoginForm'
import { safeNextPath } from '@/lib/navigation'
import { usePageMeta } from '@/lib/usePageMeta'
import styles from './AuthPage.module.css'

export default function LoginPage() {
  usePageMeta({ title: 'Log in', noindex: true })
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { status } = useAuth()
  const next = safeNextPath(params.get('next'))
  const nextQuery = params.get('next') ? `?next=${encodeURIComponent(params.get('next') ?? '')}` : ''
  // Single sign-on comes back here with `?sso_error=<code>`: shown once, then taken off the address.
  const [ssoError] = useState(() => params.get('sso_error'))

  useEffect(() => {
    if (!params.has('sso_error')) return
    const rest = new URLSearchParams(params)
    rest.delete('sso_error')
    setParams(rest, { replace: true })
  }, [params, setParams])

  if (status === 'authenticated') return <Navigate to={next} replace />

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.lead}>Log in to pick up where you left off.</p>
      </div>
      <LoginForm onSuccess={() => navigate(next, { replace: true })} ssoNext={next} initialError={ssoError ? ssoErrorMessage(ssoError) : undefined} />
      <p className={styles.footer}>
        New to Doory? <Link to={`/signup${nextQuery}`}>Create a free account</Link>
      </p>
    </>
  )
}
