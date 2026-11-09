import { forwardRef, lazy, Suspense, type Ref } from 'react'
import type { EditorAppProps, EditorHandle } from '@/types/adapter'
import { EditorSkeleton } from './EditorStates'
import styles from './LazyEditor.module.css'

const EditorApp = lazy(async () => {
  const [module, { UiLanguageProvider }] = await Promise.all([import('@/editor'), import('@/i18n/UiLanguageProvider')])
  const TranslatedEditor = forwardRef<EditorHandle, EditorAppProps>((props, ref) => (
    <UiLanguageProvider><module.EditorApp {...props} ref={ref} /></UiLanguageProvider>
  ))
  return { default: TranslatedEditor }
})

/** The editor lives in its own chunk; the shell only pays for it on editor routes. */
export function LazyEditor(props: EditorAppProps & { editorRef?: Ref<EditorHandle> }) {
  const { editorRef, ...rest } = props
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <div className={styles.frame}>
        <EditorApp ref={editorRef} {...rest} />
      </div>
    </Suspense>
  )
}
