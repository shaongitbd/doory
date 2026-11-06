import { msg } from '@/i18n/catalog'
import { TriangleAlert } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { Button, EmptyState, LinkButton } from '@/ui'

/** Router `errorElement`: catches render errors and failed lazy chunks. */
export function RouteErrorPage() {
  const error = useRouteError()
  const missing = isRouteErrorResponse(error) && error.status === 404
  const chunkFailed = error instanceof Error && /dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message)
  return (
    <div style={{ display: 'grid', minHeight: '100dvh', placeItems: 'center', padding: 'var(--space-4)' }}>
      <EmptyState
        icon={<TriangleAlert size={28} />}
        title={missing ? 'We can’t find that page' : 'Something went wrong'}
        description={
          missing
            ? 'The link may be broken, or the page may have moved.'
            : chunkFailed
              ? 'A part of Doory couldn’t be loaded. Your connection may have dropped, or a new version was released. Reload to continue. Your work is saved.'
              : 'Doory hit an unexpected problem. Reloading usually fixes it, and your saved work is safe.'
        }
        role="alert"
        action={
          <>
            <Button onClick={() => window.location.reload()}>{msg("Reload page")}</Button>
            <LinkButton to="/" variant="secondary">
              {msg("Go home")}</LinkButton>
          </>
        }
      />
    </div>
  )
}
