/**
 * Logos for the single sign-on button, one file per provider in `src/assets/sso-icons/` (sources and licences in
 * `sources.json` there). Each is its own lazy chunk, so a page only downloads the one the server names. This table is
 * itself loaded with `import()` (see `useSsoIcon`), so servers without a logo never download it.
 */
const icons = import.meta.glob<string>('/src/assets/sso-icons/*.svg', { query: '?url', import: 'default' })

/** Loader of the named icon's URL, or undefined for an unknown name. */
export const ssoIconLoader = (name: string): (() => Promise<string>) | undefined => icons[`/src/assets/sso-icons/${name}.svg`]

export function hasSsoIcon(name: string | undefined): boolean {
  return Boolean(name && ssoIconLoader(name))
}
