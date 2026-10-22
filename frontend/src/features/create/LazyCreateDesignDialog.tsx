import { lazy, Suspense, useState } from 'react'
import type { CreateDesignDialogProps } from './CreateDesignDialog'

const CreateDesignDialog = lazy(() => import('./CreateDesignDialog').then((m) => ({ default: m.CreateDesignDialog })))

/**
 * The create dialog, downloaded the first time it opens: the pages that offer it (the landing page, the dashboard)
 * do not load the size picker before then. Once open, it stays mounted like the dialog itself.
 */
export function LazyCreateDesignDialog(props: CreateDesignDialogProps) {
  const [opened, setOpened] = useState(props.open)
  if (props.open && !opened) setOpened(true)
  return opened ? (
    <Suspense fallback={null}>
      <CreateDesignDialog {...props} />
    </Suspense>
  ) : null
}
