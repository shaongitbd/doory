import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { configureBackgroundRemoval } from '@/editor/engine/bgRemoval/install'
import { ApiError, authApi, configApi, DEFAULT_CONFIG, isApiError, setUnauthorizedHandler } from '@/lib/api'
import { setSizeChoicesUser } from '@/lib/sizePresets/choices'
import type { ApiUser, AppConfig, RegisterInput } from '@/types/api'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

/** The account whose session ended while the page was open (it expired, or the user signed out elsewhere). */
export interface LostSession {
  id: string
  email: string
  /** Whether the account has a password to sign in again with. */
  hasPassword: boolean
  /** Whether it is connected to single sign-on. */
  ssoLinked: boolean
}

/** Constraint for a sign-in that must restore a session that ended (the editor keeps saving to this account only). */
export interface SignInOptions {
  expectUserId?: string
}

export interface AuthContextValue {
  status: AuthStatus
  user: ApiUser | null
  config: AppConfig
  /** Set when the API could not be reached while bootstrapping (network/server error). */
  bootstrapError: ApiError | null
  /** True after an explicit sign-out or account deletion, so guards send the visitor home instead of to /login. */
  signedOutByUser: boolean
  /** Set while the session of a signed-in user has ended on the server; the editor stays open and asks to sign in again. */
  lostSession: LostSession | null
  login(input: { email: string; password: string }, options?: SignInOptions): Promise<ApiUser>
  signup(input: RegisterInput): Promise<ApiUser>
  google(credential: string, options?: SignInOptions): Promise<ApiUser>
  logout(): Promise<void>
  /** Re-reads `/auth/me/`. Resolves the current user (or null). */
  refresh(): Promise<ApiUser | null>
  /** Replaces the cached user (after a profile update). */
  setUser(user: ApiUser): void
  /** Forgets the session locally (after the account was deleted). */
  clearSession(): void
  retryBootstrap(): void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUserState] = useState<ApiUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [bootstrapError, setBootstrapError] = useState<ApiError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [signedOutByUser, setSignedOutByUser] = useState(false)
  const [lostSession, setLostSession] = useState<LostSession | null>(null)
  const mounted = useRef(true)
  const userRef = useRef<ApiUser | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      const [me, cfg] = await Promise.allSettled([authApi.me(controller.signal), configApi.get(controller.signal)])
      if (controller.signal.aborted) return
      if (cfg.status === 'fulfilled') {
        setConfig(cfg.value)
        // Before any consumer sees the new config, so the editor's toolbar already knows whether the button works.
        configureBackgroundRemoval(cfg.value)
      }
      if (me.status === 'fulfilled') {
        userRef.current = me.value.user
        setUserState(me.value.user)
        setStatus(me.value.user ? 'authenticated' : 'anonymous')
        setBootstrapError(null)
      } else {
        setBootstrapError(isApiError(me.reason) ? me.reason : new ApiError({ status: 0, code: 'network_error', message: 'Could not reach Doory.' }))
        userRef.current = null
        setUserState(null)
        setStatus('anonymous')
      }
    })()
    return () => controller.abort()
  }, [attempt])

  const applyUser = useCallback((next: ApiUser | null) => {
    if (next) {
      setSignedOutByUser(false)
      setLostSession(null)
    }
    userRef.current = next
    setUserState(next)
    setStatus(next ? 'authenticated' : 'anonymous')
  }, [])

  /** The server no longer knows this session. Cached data stays (an open editor still shows its design) until the next sign-in clears it. */
  const loseSession = useCallback(() => {
    const previous = userRef.current
    if (!previous) return
    userRef.current = null
    setLostSession({ id: previous.id, email: previous.email, hasPassword: previous.has_password, ssoLinked: previous.oidc_linked })
    setUserState(null)
    setStatus('anonymous')
  }, [])

  // Pinned and recent sizes belong to the person signed in, not to the page.
  const userId = user?.id ?? null
  useEffect(() => {
    if (status !== 'loading') setSizeChoicesUser(userId)
  }, [status, userId])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (mounted.current) loseSession()
    })
    return () => setUnauthorizedHandler(null)
  }, [loseSession])

  /** Signs the account out again when the sign-in was meant to restore a particular account and a different one answered. */
  const requireExpectedUser = useCallback(async (next: ApiUser, options: SignInOptions | undefined, lost: LostSession | null) => {
    if (!options?.expectUserId || next.id === options.expectUserId) return
    await authApi.logout().catch(() => undefined)
    throw new ApiError({
      status: 409,
      code: 'wrong_account',
      message: lost ? `That is not the account this design belongs to. Sign in as ${lost.email} to keep saving.` : 'That is not the account this design belongs to.',
    })
  }, [])

  const login = useCallback(
    async (input: { email: string; password: string }, options?: SignInOptions) => {
      const { user: next } = await authApi.login(input)
      await requireExpectedUser(next, options, lostSession)
      // The same person coming back to an open page keeps the data on it (the design in the editor is part of the cache).
      if (lostSession?.id !== next.id) queryClient.clear()
      applyUser(next)
      return next
    },
    [applyUser, queryClient, requireExpectedUser, lostSession],
  )

  const signup = useCallback(
    async (input: RegisterInput) => {
      const { user: next } = await authApi.register(input)
      queryClient.clear()
      applyUser(next)
      return next
    },
    [applyUser, queryClient],
  )

  const google = useCallback(
    async (credential: string, options?: SignInOptions) => {
      const { user: next } = await authApi.google(credential)
      await requireExpectedUser(next, options, lostSession)
      // The same person coming back to an open page keeps the data on it (the design in the editor is part of the cache).
      if (lostSession?.id !== next.id) queryClient.clear()
      applyUser(next)
      return next
    },
    [applyUser, queryClient, requireExpectedUser, lostSession],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setSignedOutByUser(true)
      setLostSession(null)
      applyUser(null)
      queryClient.clear()
    }
  }, [applyUser, queryClient])

  const refresh = useCallback(async () => {
    const { user: next } = await authApi.me()
    if (next) applyUser(next)
    else if (userRef.current) loseSession()
    else applyUser(null)
    return next
  }, [applyUser, loseSession])

  const clearSession = useCallback(() => {
    setSignedOutByUser(true)
    setLostSession(null)
    applyUser(null)
    queryClient.clear()
  }, [applyUser, queryClient])

  const retryBootstrap = useCallback(() => {
    setStatus('loading')
    setAttempt((value) => value + 1)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, config, bootstrapError, signedOutByUser, lostSession, login, signup, google, logout, refresh, setUser: applyUser, clearSession, retryBootstrap }),
    [status, user, config, bootstrapError, signedOutByUser, lostSession, login, signup, google, logout, refresh, applyUser, clearSession, retryBootstrap],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
