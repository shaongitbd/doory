import { msg } from '@/i18n/catalog'
import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { OfflineBanner } from '@/app/OfflineBanner'
import { AuthModalProvider } from '@/features/auth/AuthModalProvider'
import { scrollToFragment } from '@/lib/navigation'
import styles from './RootLayout.module.css'

/** Skip link, offline banner, the sign-in modal host, and focus/scroll management on route changes. */
export function RootLayout() {
  const location = useLocation()
  const lastPath = useRef(location.pathname)

  useEffect(() => {
    // A link to `/#faq` or `#features` must scroll there; React Router changes the address but leaves the scrolling to us.
    if (location.hash) {
      lastPath.current = location.pathname
      return scrollToFragment(location.hash)
    }
    // Only a real navigation moves focus (StrictMode re-running this effect must not).
    if (lastPath.current === location.pathname) return undefined
    lastPath.current = location.pathname
    window.scrollTo(0, 0)
    const main = document.getElementById('main')
    main?.focus({ preventScroll: true })
    return undefined
  }, [location.pathname, location.hash, location.key])

  return (
    <AuthModalProvider>
      <a href="#main" className={styles.skip}>
        {msg("Skip to content")}</a>
      <OfflineBanner />
      <Outlet />
    </AuthModalProvider>
  )
}
