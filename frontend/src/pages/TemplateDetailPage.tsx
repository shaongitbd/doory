import { msg } from '@/i18n/catalog'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { createUrl } from '@/features/presets'
import { TemplateCard } from '@/features/templates/TemplateCard'
import { isApiError } from '@/lib/api'
import { useTemplate, useTemplatesList } from '@/lib/api/hooks'
import { templatesApi } from '@/lib/api'
import { usePageMeta } from '@/lib/usePageMeta'
import { useMutation } from '@tanstack/react-query'
import { Badge, Button, EmptyState, LinkButton, Skeleton, Thumbnail, useToast } from '@/ui'
import styles from './TemplateDetailPage.module.css'

export default function TemplateDetailPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const { status } = useAuth()
  const { toast } = useToast()
  const query = useTemplate(slug)
  const template = query.data
  usePageMeta({
    title: template?.title ?? 'Template',
    description: template ? (template.description || `A free, editable ${template.width} × ${template.height} px ${template.title} template. Open it in your browser and make it yours.`) : undefined,
    canonical: template ? `/templates/${template.slug}` : undefined,
    image: template?.thumbnail_url || undefined,
  })

  const related = useTemplatesList({ category: template?.category?.slug, page_size: 6, ordering: '-use_count' }, Boolean(template?.category))
  const relatedItems = (related.data?.pages[0]?.results ?? []).filter((item) => item.slug !== slug).slice(0, 4)

  const use = useMutation({
    mutationFn: () => templatesApi.use(slug),
    onSuccess: (design) => navigate(`/design/${design.id}`),
    onError: (error) => toast({ title: msg("Couldn’t use this template"), description: isApiError(error) ? error.message : 'Please try again.', variant: 'error' }),
  })

  if (query.isPending) {
    return (
      <div className={styles.page} aria-busy="true">
        <div className={styles.layout}>
          <Skeleton height="28rem" radius="var(--radius-xl)" />
          <div className={styles.skeletonSide}>
            <Skeleton width="70%" height={36} />
            <Skeleton width="40%" height={20} />
            <Skeleton height={80} />
          </div>
        </div>
      </div>
    )
  }

  if (query.isError || !template) {
    const notFound = isApiError(query.error) && query.error.status === 404
    return (
      <EmptyState
        title={notFound ? 'We can’t find that template' : 'This template didn’t load'}
        description={notFound ? 'It may have been unpublished or the link is mistyped.' : 'Check your connection and try again.'}
        role="alert"
        action={
          <>
            {notFound ? null : <Button onClick={() => void query.refetch()}>{msg("Try again")}</Button>}
            <LinkButton to="/templates" variant="secondary">
              {msg("Browse templates")}</LinkButton>
          </>
        }
      />
    )
  }

  const aspect = template.width > 0 && template.height > 0 ? template.width / template.height : 1

  function startFromTemplate() {
    if (status === 'authenticated') use.mutate()
    else navigate(createUrl({ template: slug }))
  }

  return (
    <div className={styles.page}>
      <Link to="/templates" className={styles.back}>
        <ArrowLeft size={16} aria-hidden="true" /> {msg("All templates")}</Link>
      <div className={styles.layout}>
        <div className={styles.preview}>
          <Thumbnail src={template.thumbnail_url} alt={`${template.title} template preview`} aspect={Math.min(Math.max(aspect, 0.45), 2.2)} fit="contain" className={styles.previewImage} />
        </div>
        <div className={styles.side}>
          {template.category ? <Badge tone="brand">{template.category.name}</Badge> : null}
          <h1 className={styles.title}>{template.title}</h1>
          <p className={styles.facts}>
            {template.width} × {template.height} {msg("px · ")}{template.page_count} {template.page_count === 1 ? 'page' : 'pages'}
          </p>
          {template.description ? <p className={styles.description}>{template.description}</p> : null}
          {template.tags.length > 0 ? (
            <ul className={styles.tags} aria-label={msg("Tags")}>
              {template.tags.map((tag) => (
                <li key={tag}>
                  <Link to={`/templates?q=${encodeURIComponent(tag)}`} className={styles.tag}>
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <div className={styles.actions}>
            <Button size="lg" leftIcon={<Sparkles size={18} />} loading={use.isPending} onClick={startFromTemplate}>
              {msg("Use this template")}</Button>
            <p className={styles.hint}>{status === 'authenticated' ? 'We’ll add a copy to your designs.' : 'No account needed. It opens right in your browser.'}</p>
          </div>
        </div>
      </div>

      {relatedItems.length > 0 ? (
        <section className={styles.related} aria-labelledby="related-title">
          <h2 id="related-title" className={styles.relatedTitle}>
            {msg("More like this")}</h2>
          <ul className={styles.relatedGrid}>
            {relatedItems.map((item) => (
              <li key={item.id}>
                <TemplateCard template={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
