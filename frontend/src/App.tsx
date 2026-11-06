import { useState, useSyncExternalStore } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AppProviders } from '@/app/AppProviders'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { createAppRouter } from '@/app/router'
import { getLocale, subscribeLocale } from '@/i18n/locale'

export default function App() {
  const [router] = useState(createAppRouter)
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => 'en')
  return (
    <ErrorBoundary>
      <AppProviders>
        <RouterProvider key={locale} router={router} />
      </AppProviders>
    </ErrorBoundary>
  )
}
