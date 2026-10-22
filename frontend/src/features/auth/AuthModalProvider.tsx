import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AccountReason } from '@/types/adapter'
import { Dialog, Tab, TabList, TabPanel, Tabs } from '@/ui'
import { useAuth } from './AuthProvider'
import { LoginForm } from './LoginForm'
import { SignupForm } from './SignupForm'
import styles from './AuthModal.module.css'

export type AuthModalReason = AccountReason | 'generic' | 'session-expired'
type AuthTab = 'login' | 'signup'

export interface OpenAuthModalOptions {
  reason?: AuthModalReason
  tab?: AuthTab
}

interface AuthModalContextValue {
  /** Opens the sign-in/up dialog. Resolves true once authenticated (immediately when already signed in), false if dismissed. */
  openAuthModal(options?: OpenAuthModalOptions): Promise<boolean>
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null)

const COPY: Record<AuthModalReason, { title: string; description: string }> = {
  save: { title: 'Create a free account to keep this design', description: 'Your work is stored in this browser right now. Sign up and we’ll move it to your account, images included.' },
  share: { title: 'Sign in to share your design', description: 'Share links and comments live in your account. Your design and images come along.' },
  'brand-kit': { title: 'Sign in to use brand kits', description: 'Save your colours, fonts and logos once and apply them to every design.' },
  'version-history': { title: 'Sign in to see version history', description: 'Accounts keep snapshots of your design so you can go back in time.' },
  comment: { title: 'Sign in to comment', description: 'Join the conversation on this design with a free account.' },
  video: { title: 'Sign in to add videos', description: 'Upload your own clips or pick stock videos. Your design and images come along.' },
  generic: { title: 'Welcome to Doory', description: 'Log in or create a free account.' },
  'session-expired': { title: 'Your session ended', description: 'Sign in again to keep saving. What you changed is still on this page.' },
}

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const { status, lostSession } = useAuth()
  const [state, setState] = useState<{ open: boolean; reason: AuthModalReason; tab: AuthTab }>({ open: false, reason: 'generic', tab: 'signup' })
  const resolvers = useRef<Array<(ok: boolean) => void>>([])

  const settle = useCallback((ok: boolean) => {
    const waiting = resolvers.current
    resolvers.current = []
    for (const resolve of waiting) resolve(ok)
    setState((current) => ({ ...current, open: false }))
  }, [])

  /** Every caller gets the outcome of the one dialog; asking again while it is open does not replace it. */
  const openAuthModal = useCallback(
    (options: OpenAuthModalOptions = {}) => {
      if (status === 'authenticated') return Promise.resolve(true)
      return new Promise<boolean>((resolve) => {
        resolvers.current.push(resolve)
        setState((current) => (current.open ? current : { open: true, reason: options.reason ?? 'generic', tab: options.tab ?? 'signup' }))
      })
    },
    [status],
  )

  const value = useMemo(() => ({ openAuthModal }), [openAuthModal])
  const copy = lostSession ? COPY['session-expired'] : COPY[state.reason]

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <Dialog open={state.open} onClose={() => settle(false)} title={copy.title} description={copy.description} size="md">
        {lostSession ? (
          <div className={styles.panel}>
            <LoginForm onSuccess={() => settle(true)} lockedEmail={lostSession.email} expectUserId={lostSession.id} lockedSso={!lostSession.hasPassword && lostSession.ssoLinked} />
          </div>
        ) : (
          <Tabs key={`${state.reason}-${state.tab}`} defaultValue={state.tab}>
            <TabList label="Account" fill>
              <Tab value="signup">Sign up</Tab>
              <Tab value="login">Log in</Tab>
            </TabList>
            <TabPanel value="signup" className={styles.panel}>
              <SignupForm onSuccess={() => settle(true)} showName={false} />
            </TabPanel>
            <TabPanel value="login" className={styles.panel}>
              <LoginForm onSuccess={() => settle(true)} onNavigate={() => settle(false)} />
            </TabPanel>
          </Tabs>
        )}
      </Dialog>
    </AuthModalContext.Provider>
  )
}

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext)
  if (!ctx) throw new Error('useAuthModal must be used inside <AuthModalProvider>')
  return ctx
}
