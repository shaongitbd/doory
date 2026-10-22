import { hasSsoIcon } from './ssoIconTable'

const files = import.meta.glob<string>('/src/assets/sso-icons/*.svg', { query: '?raw', import: 'default', eager: true })
const sources: Record<string, { source: string; license: string; url: string }> = JSON.parse(
  Object.values(import.meta.glob<string>('/src/assets/sso-icons/sources.json', { query: '?raw', import: 'default', eager: true }))[0],
)
/** The licence each source project publishes its artwork under; a new source must be checked and added here. */
const sourceLicences: Record<string, string> = {
  'Simple Icons': 'CC0-1.0',
  'dashboard-icons': 'Apache-2.0',
  'Bootstrap Icons': 'MIT',
  Authelia: 'Apache-2.0',
  Dex: 'Apache-2.0',
  Gitea: 'MIT',
  'GitLab SVGs': 'MIT',
  'Keycloak website repo': 'Apache-2.0',
  Rauthy: 'Apache-2.0',
}
/** Providers whose logo is not available under a permissive licence: they must not come back. */
const notPermissive = ['hedgedoc', 'jenkins', 'webex', 'forgejo', 'kanidm', 'nextcloud', 'logto', 'zitadel']
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
    for (const [name, { license, url }] of Object.entries(sources)) {
      expect(license, name).toMatch(/^(CC0-1\.0|MIT|Apache-2\.0|BSD-[23]-Clause)$/)
      expect(url, name).toMatch(/^https:\/\//)
    }
  })

  it('states the licence each source project publishes its artwork under', () => {
    for (const [name, { source, license }] of Object.entries(sources)) {
      expect(sourceLicences, `${name}: unknown source "${source}"`).toHaveProperty([source])
      expect(license, name).toBe(sourceLicences[source])
    }
  })

  it('takes Simple Icons from one pinned release, by the same slug', () => {
    const releases = new Set<string>()
    for (const [name, { source, url }] of Object.entries(sources)) {
      if (source !== 'Simple Icons') continue
      const match = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/simple-icons@(\d+\.\d+\.\d+)\/icons\/([a-z0-9]+)\.svg$/)
      expect(match, name).not.toBeNull()
      expect(match![2], name).toBe(name)
      releases.add(match![1])
    }
    expect(releases.size).toBe(1)
  })

  it('leaves out the logos whose artwork is not under a permissive licence', () => {
    for (const denied of notPermissive) {
      expect(names).not.toContain(denied)
      for (const [name, { source, url }] of Object.entries(sources)) {
        expect(`${source} ${url}`.toLowerCase(), name).not.toContain(denied)
      }
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
