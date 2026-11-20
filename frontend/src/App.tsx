import { useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AppProviders } from '@/app/AppProviders'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { createAppRouter } from '@/app/router'

export default function App() {
  const [router] = useState(createAppRouter)
  return (
    <ErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </ErrorBoundary>
  )
}
