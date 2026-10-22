import { useEffect, useState } from 'react'

/**
 * URL of the named single sign-on logo once it has loaded; null while loading, for an unknown name, or when none is set.
 * The table of logos (`ssoIconTable.ts`) is fetched only when a name is set, so it stays out of the first-load bundle.
 */
export function useSsoIcon(name: string | undefined): string | null {
  const [loaded, setLoaded] = useState<{ name: string; url: string } | null>(null)
  useEffect(() => {
    if (!name) return
    let current = true
    import('./ssoIconTable')
      .then(({ ssoIconLoader }) => ssoIconLoader(name)?.())
      .then((url) => current && url && setLoaded({ name, url }), () => undefined)
    return () => {
      current = false
    }
  }, [name])
  return loaded && loaded.name === name ? loaded.url : null
}
