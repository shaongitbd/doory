import { msg } from '@/i18n/catalog'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { SignupForm } from '@/features/auth/SignupForm'
import { safeNextPath } from '@/lib/navigation'
import { usePageMeta } from '@/lib/usePageMeta'
import styles from './AuthPage.module.css'

export default function SignupPage() {
  usePageMeta({ title: msg("Sign up"), noindex: true })
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { status } = useAuth()
  const next = safeNextPath(params.get('next'))
  const nextQuery = params.get('next') ? `?next=${encodeURIComponent(params.get('next') ?? '')}` : ''

  if (status === 'authenticated') return <Navigate to={next} replace />

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>{msg("Create your free account")}</h1>
        <p className={styles.lead}>{msg("Save designs to the cloud, build brand kits and share with anyone.")}</p>
      </div>
      <SignupForm onSuccess={() => navigate(next, { replace: true })} ssoNext={next} />
      <p className={styles.footer}>
        {msg("Already have an account? ")}<Link to={`/login${nextQuery}`}>{msg("Log in")}</Link>
      </p>
    </>
  )
}
