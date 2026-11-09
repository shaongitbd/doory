import { msg, activateLocale } from '@/i18n/catalog'
import { getLocale, subscribeLocale, type Locale } from '@/i18n/locale'
import { GitBranch, Menu as MenuIcon, X } from 'lucide-react'
import { Suspense, useState, useSyncExternalStore } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { PageLoader } from '@/app/PageLoader'
import { AccountMenu } from '@/features/auth/AccountMenu'
import { useAuth } from '@/features/auth/AuthProvider'
import bunny from '@/assets/bunny-sticker.webp'
import { REPO_URL } from '@/lib/links'
import { IconButton, LinkButton, Logo } from '@/ui'
import { cx } from '@/lib/cx'
import styles from './MarketingLayout.module.css'

const NAV = [
  { to: '/templates', label: 'Templates' },
  { to: '/features', label: 'Features' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
] as const

function HeaderNav({ onNavigate, orientation }: { onNavigate?: () => void; orientation: 'row' | 'column' }) {
  return (
    <nav aria-label={msg("Main")} className={cx(styles.nav, orientation === 'column' && styles.navColumn)}>
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} className={styles.navLink} onClick={onNavigate}>
          {msg(item.label)}
        </NavLink>
      ))}
      <a href={REPO_URL} className={styles.navLink} target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
        <GitBranch size={16} aria-hidden="true" /> {msg("GitHub")}</a>
    </nav>
  )
}

export function MarketingHeader() {
  const { status } = useAuth()
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => 'en')
  const location = useLocation()
  const place = `${location.pathname}${location.hash}`
  // The menu is "open for" the place it was opened on, so navigating anywhere closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === place
  const setOpen = (next: boolean) => setOpenAt(next ? place : null)

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link to="/" className={styles.logo} aria-label={msg("Doory home")}>
          <Logo height={30} />
        </Link>
        <div className={styles.desktopNav}>
          <HeaderNav orientation="row" />
        </div>
        <div className={styles.actions}>
          <select aria-label={msg("Language")} className={styles.language} value={locale} onChange={event => { void activateLocale(event.target.value as Locale) }}>
            <option value="en">{msg("English")}</option>
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
          </select>
          {status === 'authenticated' ? (
            <>
              <LinkButton to="/dashboard" variant="secondary" size="sm" className={styles.hideSmall}>
                {msg("Dashboard")}</LinkButton>
              <AccountMenu />
            </>
          ) : (
            <>
              <Link to="/login" className={cx(styles.hideSmall, styles.signIn)}>
                {msg("Sign in")}</Link>
              <LinkButton to="/create" size="sm">
                {msg("Start designing")}</LinkButton>
            </>
          )}
          <IconButton
            className={styles.menuButton}
            label={open ? 'Close menu' : 'Open menu'}
            icon={open ? <X size={20} /> : <MenuIcon size={20} />}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen(!open)}
          />
        </div>
      </div>
      {open ? (
        <div id="mobile-nav" className={styles.mobilePanel}>
          <HeaderNav orientation="column" onNavigate={() => setOpen(false)} />
          {status !== 'authenticated' ? (
            <LinkButton to="/login" variant="secondary" fullWidth>
              {msg("Sign in")}</LinkButton>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}

export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <svg className={styles.wave} viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 28 C 160 6, 320 6, 480 22 S 800 40, 960 20 S 1280 2, 1440 22 L 1440 40 L 0 40 Z" />
      </svg>
      <img className={styles.peek} src={bunny} alt="" width={110} height={150} draggable={false} />
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <Logo height={28} />
          <p>{msg("Free, open-source design for everyone. Make it, share it, keep it.")}</p>
        </div>
        <nav aria-label={msg("Footer")} className={styles.footerNav}>
          <div>
            <h2 className={styles.footerHeading}>{msg("Make things")}</h2>
            <ul>
              <li>
                <Link to="/create">{msg("Start designing")}</Link>
              </li>
              <li>
                <Link to="/templates">{msg("Templates")}</Link>
              </li>
              <li>
                <Link to="/signup">{msg("Create an account")}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className={styles.footerHeading}>{msg("Get to know us")}</h2>
            <ul>
              <li>
                <Link to="/features">{msg("Features")}</Link>
              </li>
              <li>
                <Link to="/faq">FAQ</Link>
              </li>
              <li>
                <Link to="/contact">{msg("Contact")}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className={styles.footerHeading}>{msg("Open source")}</h2>
            <ul>
              <li>
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  {msg("Source on GitHub")}</a>
              </li>
              <li>
                <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
                  {msg("Report an issue")}</a>
              </li>
              <li>
                <a href={`${REPO_URL}#quick-start`} target="_blank" rel="noopener noreferrer">
                  {msg("Self-host Doory")}</a>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      {/* The attribution the Attribution Assurance License (LICENSE) asks every copy of Doory to display. */}
      <p className={styles.legal}>
        {msg("Doory by Siam, creator and maintainer of Doory ·")}{' '}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          {msg("github.com/shaongitbd/doory")}</a>{' '}
        {msg("· Released under the Attribution Assurance License. No ads. No watermarks.")}</p>
    </footer>
  )
}

export function MarketingLayout() {
  return (
    <div className={styles.page}>
      <MarketingHeader />
      <main id="main" tabIndex={-1} className={styles.main}>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <MarketingFooter />
    </div>
  )
}
