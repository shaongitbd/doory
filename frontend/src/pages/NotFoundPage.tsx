import { msg } from '@/i18n/catalog'
import { Compass } from 'lucide-react'
import { EmptyState, LinkButton } from '@/ui'
import { usePageMeta } from '@/lib/usePageMeta'

export default function NotFoundPage() {
  usePageMeta({ title: msg("Page not found"), noindex: true })
  return (
    <div style={{ display: 'grid', minHeight: '70dvh', placeItems: 'center' }}>
      <EmptyState
        icon={<Compass size={28} />}
        title={msg("We can’t find that page")}
        description={msg("The link may be broken, or the page may have moved.")}
        action={
          <>
            <LinkButton to="/">{msg("Go home")}</LinkButton>
            <LinkButton to="/create" variant="secondary">
              {msg("Start designing")}</LinkButton>
          </>
        }
      />
    </div>
  )
}
