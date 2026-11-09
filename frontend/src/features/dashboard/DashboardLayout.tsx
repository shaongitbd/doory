import { msg } from '@/i18n/catalog'
import { Folder, FolderClosed, Home, LayoutTemplate, Palette, Search, Settings, Star, Trash2, Upload } from 'lucide-react'
import { Suspense, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { PageLoader } from '@/app/PageLoader'
import { AccountMenu } from '@/features/auth/AccountMenu'
import { UsageMeter } from '@/features/uploads/UsageMeter'
import { useFolders } from '@/lib/api/hooks'
import { CreateMenu } from './CreateMenu'
import { VerifyEmailBanner } from './VerifyEmailBanner'
import { usePageMeta } from '@/lib/usePageMeta'
import { Input, Logo } from '@/ui'
import styles from './DashboardLayout.module.css'

type NavItem = { to: string; label: string; icon: typeof Home; end: boolean }

const MAIN: NavItem[] = [
  { to: '/dashboard', label: "Home", icon: Home, end: true },
  { to: '/dashboard/designs', label: "Designs", icon: Folder, end: false },
  { to: '/dashboard/starred', label: "Starred", icon: Star, end: false },
  { to: '/dashboard/templates', label: "Templates", icon: LayoutTemplate, end: false },
]
const LIBRARY: NavItem[] = [
  { to: '/dashboard/brand', label: "Brand", icon: Palette, end: false },
  { to: '/dashboard/uploads', label: "Uploads", icon: Upload, end: false },
]
const FOOT: NavItem[] = [
  { to: '/dashboard/trash', label: "Trash", icon: Trash2, end: false },
  { to: '/settings', label: "Settings", icon: Settings, end: false },
]
/** The tab bar on small screens has room for the main places only. */
const TABS: NavItem[] = [...MAIN, ...LIBRARY, ...FOOT]
const SIDEBAR_FOLDERS = 8

function NavLinks({ items }: { items: NavItem[] }) {
  return (
    <>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={styles.link}>
          <Icon size={18} aria-hidden="true" />
          <span>{msg(label)}</span>
        </NavLink>
      ))}
    </>
  )
}

/** The top-level folders, so a folder is one click away from anywhere in the dashboard. */
function SidebarFolders() {
  const folders = useFolders()
  const top = (folders.data ?? []).filter((folder) => folder.parent === null).sort((a, b) => a.name.localeCompare(b.name))
  if (top.length === 0) return null
  return (
    <div className={styles.group}>
      <p className={styles.groupLabel}>{msg("Folders")}</p>
      {top.slice(0, SIDEBAR_FOLDERS).map((folder) => (
        <NavLink key={folder.id} to={`/dashboard/designs/folder/${folder.id}`} className={`${styles.link} ${styles.folder}`}>
          <FolderClosed size={16} aria-hidden="true" />
          <span className={styles.folderName}>{folder.name}</span>
          <span className={styles.count}>{folder.design_count}</span>
        </NavLink>
      ))}
      {top.length > SIDEBAR_FOLDERS ? (
        <Link to="/dashboard/designs" className={styles.allFolders}>
          {msg("All ")}{top.length} {msg("folders")}</Link>
      ) : null}
    </div>
  )
}

/** Global design search; the field mirrors the `q` shown on the designs page. */
function DashboardSearch({ initial }: { initial: string }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState(initial)

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const q = search.trim()
    navigate(q ? `/dashboard/designs?q=${encodeURIComponent(q)}` : '/dashboard/designs')
  }

  return (
    <form role="search" className={styles.search} onSubmit={submitSearch}>
      <Input label={msg("Search your designs")} hideLabel type="search" placeholder={msg("Search designs")} leftIcon={<Search size={16} />} value={search} onChange={(event) => setSearch(event.target.value)} />
    </form>
  )
}

/** Dashboard chrome: sidebar (tab bar on small screens), search, create menu and account menu. */
export default function DashboardLayout() {
  usePageMeta({ noindex: true })
  const location = useLocation()
  const [params] = useSearchParams()
  const searchValue = location.pathname.startsWith('/dashboard/designs') ? (params.get('q') ?? '') : ''

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link to="/dashboard" className={styles.logo} aria-label={msg("Doory dashboard")}>
          <Logo height={30} />
        </Link>
        <nav aria-label={msg("Dashboard")} className={styles.nav}>
          <div className={styles.group}>
            <NavLinks items={MAIN} />
          </div>
          <div className={styles.group}>
            <p className={styles.groupLabel}>{msg("Library")}</p>
            <NavLinks items={LIBRARY} />
          </div>
          <SidebarFolders />
          <div className={`${styles.group} ${styles.foot}`}>
            <NavLinks items={FOOT} />
          </div>
        </nav>
        <div className={styles.storage}>
          <UsageMeter />
        </div>
      </aside>
      <div className={styles.column}>
        <header className={styles.topbar}>
          <Link to="/dashboard" className={styles.mobileLogo} aria-label={msg("Doory dashboard")}>
            <Logo variant="mark" height={30} />
          </Link>
          <DashboardSearch key={searchValue} initial={searchValue} />
          <div className={styles.actions}>
            <CreateMenu />
            <AccountMenu />
          </div>
        </header>
        <nav aria-label={msg("Dashboard sections")} className={styles.tabs}>
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={styles.tab}>
              <Icon size={16} aria-hidden="true" />
              {msg(label)}
            </NavLink>
          ))}
        </nav>
        <VerifyEmailBanner />
        <main id="main" tabIndex={-1} className={styles.main}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
