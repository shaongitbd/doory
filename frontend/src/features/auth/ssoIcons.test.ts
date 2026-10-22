import { hasSsoIcon } from './ssoIconTable'

const files = import.meta.glob<string>('/src/assets/sso-icons/*.svg', { query: '?raw', import: 'default', eager: true })
const sources: Record<string, { source: string; license: string; url: string }> = JSON.parse(
  Object.values(import.meta.glob<string>('/src/assets/sso-icons/sources.json', { query: '?raw', import: 'default', eager: true }))[0],
)
const names = Object.keys(files).map((path) => path.split('/').pop()!.replace(/\.svg$/, ''))

describe('single sign-on icons', () => {
  it('knows the icons by file name', () => {
    expect(hasSsoIcon('authentik')).toBe(true)
    expect(hasSsoIcon('keycloak')).toBe(true)
    expect(hasSsoIcon('no-such-provider')).toBe(false)
    expect(hasSsoIcon('')).toBe(false)
    expect(hasSsoIcon(undefined)).toBe(false)
  })

  it('has names the server accepts', () => {
    for (const name of names) expect(name).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/)
  })

  it('records a permissive source for every icon, and no source without an icon', () => {
    expect(Object.keys(sources).sort()).toEqual([...names].sort())
    for (const { license, url } of Object.values(sources)) {
      expect(['CC0-1.0', 'MIT', 'Apache-2.0']).toContain(license)
      expect(url).toMatch(/^https:\/\//)
    }
  })

  it('scales every icon: a viewBox, no fixed size, nothing but vector shapes', () => {
    for (const [path, svg] of Object.entries(files)) {
      const root = svg.match(/<svg\b[^>]*>/)?.[0] ?? ''
      expect(root, path).toMatch(/viewBox="/)
      expect(root, path).not.toMatch(/\s(width|height)="/)
      expect(svg, path).not.toMatch(/<image\b|<script\b|\bon[a-z]+="/i)
    }
  })
})
