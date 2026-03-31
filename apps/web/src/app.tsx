import { useCallback, useEffect, useState } from 'preact/hooks'
import { Link, Redirect, Route, Switch, useLocation } from 'wouter-preact'
import { api } from './helpers/api'
import { Feed } from './pages/feed'
import { Login } from './pages/login'
import { Settings } from './pages/settings'

interface AuthState {
  checked: boolean
  loggedIn: boolean
  singleUser: boolean
  xChecked: boolean
  xConnected: boolean
}

function useAuth(): AuthState & { logout: () => void; recheckX: () => void } {
  const [state, setState] = useState<AuthState>({
    checked: false,
    loggedIn: false,
    singleUser: false,
    xChecked: false,
    xConnected: false,
  })

  const checkXSession = useCallback(() => {
    api<{ connected: boolean }>('/x/session')
      .then((s) =>
        setState((prev) => ({ ...prev, xChecked: true, xConnected: s.connected })),
      )
      .catch(() => setState((prev) => ({ ...prev, xChecked: true })))
  }, [])

  useEffect(() => {
    api<{ singleUser: boolean }>('/auth/mode')
      .then((mode) => {
        if (mode.singleUser) {
          setState((prev) => ({
            ...prev,
            checked: true,
            loggedIn: true,
            singleUser: true,
          }))
          checkXSession()
          return
        }
        return api('/auth/me')
          .then(() => {
            setState((prev) => ({ ...prev, checked: true, loggedIn: true, singleUser: false }))
            checkXSession()
          })
          .catch(() =>
            setState((prev) => ({
              ...prev,
              checked: true,
              loggedIn: false,
              singleUser: false,
              xChecked: true,
            })),
          )
      })
      .catch(() =>
        setState((prev) => ({
          ...prev,
          checked: true,
          loggedIn: false,
          singleUser: false,
          xChecked: true,
        })),
      )
  }, [checkXSession])

  const logout = useCallback(() => {
    api('/auth/logout', { method: 'POST' })
      .catch(() => {})
      .finally(() => {
        window.location.href = '/login'
      })
  }, [])

  return { ...state, logout, recheckX: checkXSession }
}

function AuthGuard({
  auth,
  children,
}: {
  auth: AuthState
  children: preact.ComponentChildren
}) {
  if (!auth.checked) return <p class="text-zinc-500">Loading...</p>
  if (auth.singleUser) return <>{children}</>
  if (!auth.loggedIn) return <Redirect to="/login" />
  return <>{children}</>
}

function XGuard({
  auth,
  children,
}: {
  auth: AuthState
  children: preact.ComponentChildren
}) {
  // Wait until X session check completes before deciding
  if (!auth.xChecked) return <p class="text-zinc-500">Loading...</p>
  if (!auth.xConnected) return <Redirect to="/settings" />
  return <>{children}</>
}

export function App() {
  const [location] = useLocation()
  const auth = useAuth()

  const showFeed = auth.loggedIn && auth.xConnected

  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100">
      <nav class="border-b border-zinc-800 px-6 py-4">
        <div class="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" class="text-xl font-bold tracking-tight">
            Omens
          </Link>
          <div class="flex items-center gap-4 text-sm">
            {showFeed && (
              <Link
                href="/"
                class={
                  location === '/' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'
                }
              >
                Feed
              </Link>
            )}
            {auth.loggedIn && (
              <Link
                href="/settings"
                class={
                  location.startsWith('/settings')
                    ? 'text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-100'
                }
              >
                {auth.xConnected ? 'Settings' : 'Connect X'}
              </Link>
            )}
            {!auth.singleUser && auth.loggedIn && (
              <button
                type="button"
                onClick={auth.logout}
                class="text-zinc-500 hover:text-zinc-300"
              >
                Logout
              </button>
            )}
            {!auth.singleUser && auth.checked && !auth.loggedIn && (
              <Link href="/login" class="text-zinc-400 hover:text-zinc-100">
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>
      <main class="mx-auto max-w-4xl px-6 py-8">
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/">
            <AuthGuard auth={auth}>
              <XGuard auth={auth}>
                <Feed />
              </XGuard>
            </AuthGuard>
          </Route>
          <Route path="/settings">
            <AuthGuard auth={auth}>
              <Settings onXChange={auth.recheckX} xConnected={auth.xConnected} />
            </AuthGuard>
          </Route>
        </Switch>
      </main>
    </div>
  )
}
