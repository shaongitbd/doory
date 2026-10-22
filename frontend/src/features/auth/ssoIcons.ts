import { useEffect, useState } from 'react'

/**
 * Logos for the single sign-on button, one file per provider in `src/assets/sso-icons/` (sources and licences in
 * `sources.json` there). Each is its own lazy chunk, so a page only downloads the one the server names.
 */
const icons = import.meta.glob<string>('/src/assets/sso-icons/*.svg', { query: '?url', import: 'default' })

const loaderFor = (name: string) => icons[`/src/assets/sso-icons/${name}.svg`]

export function hasSsoIcon(name: string | undefined): boolean {
  return Boolean(name && loaderFor(name))
}

/** URL of the named icon once it has loaded; null while loading, for an unknown name, or when none is set. */
export function useSsoIcon(name: string | undefined): string | null {
  const [loaded, setLoaded] = useState<{ name: string; url: string } | null>(null)
  useEffect(() => {
    const load = name ? loaderFor(name) : undefined
    if (!name || !load) return
    let current = true
    load().then((url) => current && setLoaded({ name, url }), () => undefined)
    return () => {
      current = false
    }
  }, [name])
  return loaded && loaded.name === name ? loaded.url : null
}
