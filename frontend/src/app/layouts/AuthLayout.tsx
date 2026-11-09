import { msg } from '@/i18n/catalog'
import { Suspense } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { PageLoader } from '@/app/PageLoader'
import { AuthBrandPanel } from '@/features/auth/AuthBrandPanel'
import { Logo } from '@/ui'
import styles from './AuthLayout.module.css'

/** Split-screen layout shared by login, sign-up and password flows. */
export function AuthLayout() {
  return (
    <div className={styles.page}>
      <div className={styles.formSide}>
        <header className={styles.top}>
          <Link to="/" aria-label={msg("Doory home")} className={styles.logo}>
            <Logo height={30} />
          </Link>
        </header>
        <main id="main" tabIndex={-1} className={styles.main}>
          <div className={styles.card}>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <AuthBrandPanel />
    </div>
  )
}
