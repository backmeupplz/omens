import { useCallback, useEffect, useState } from 'preact/hooks'
import { Link, Redirect, Route, Switch, useLocation } from 'wouter-preact'
import { api } from './helpers/api'
import { AiReportPage, Feed, FilteredFeed } from './pages/feed'
import { Login } from './pages/login'
import { Settings } from './pages/settings'
import { ReportSharePage, SharePage } from './pages/share'

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
  if (!auth.xChecked) return <p class="text-zinc-500">Loading...</p>
  if (!auth.xConnected) return <Redirect to="/settings" />
  return <>{children}</>
}

function ScrollToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!show) return null
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      class="fixed bottom-4 right-4 z-40 rounded-full bg-zinc-800 border border-zinc-700 p-2 sm:p-2.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 shadow-lg transition-colors"
      title="Scroll to top"
    >
      <svg class="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M5 15l7-7 7 7" />
      </svg>
    </button>
  )
}

export function App() {
  const [location] = useLocation()
  const auth = useAuth()
  const [refreshFn, setRefreshFn] = useState<(() => Promise<void>) | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    if (!refreshFn || refreshing) return
    setRefreshing(true)
    try {
      await refreshFn()
    } finally {
      setRefreshing(false)
    }
  }

  const showFeed = auth.loggedIn && auth.xConnected

  // Share pages get their own layout — no navbar
  const shareMatch = location.match(/^\/([^/]+)\/status\/(\d+)$/)
  if (shareMatch) {
    return <SharePage handle={shareMatch[1]} tweetId={shareMatch[2]} />
  }
  const reportMatch = location.match(/^\/report\/([a-z0-9]+)$/)
  if (reportMatch) {
    return <ReportSharePage id={reportMatch[1]} />
  }

  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100">
      <nav class="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur px-3 sm:px-4 py-3">
        <div class="mx-auto max-w-xl w-full flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <Link href="/" class="text-lg font-bold tracking-tight">
              Omens
            </Link>
            {showFeed && (location === '/feed' || location === '/filtered') && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                title="Refresh feed"
              >
                <svg
                  class={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              </button>
            )}
          </div>
          <div class="flex items-center gap-1 sm:gap-2 shrink-0">
            {showFeed && (
              <Link
                href="/"
                class={`p-1.5 rounded-lg transition-colors ${
                  location === '/'
                    ? 'text-zinc-100 bg-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
                title="AI Report"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
              </Link>
            )}
            {showFeed && (
              <Link
                href="/filtered"
                class={`p-1.5 rounded-lg transition-colors ${
                  location === '/filtered'
                    ? 'text-zinc-100 bg-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
                title="AI-Filtered Feed"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                </svg>
              </Link>
            )}
            {showFeed && (
              <Link
                href="/feed"
                class={`p-1.5 rounded-lg transition-colors ${
                  location === '/feed'
                    ? 'text-zinc-100 bg-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
                title="All Posts"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
                </svg>
              </Link>
            )}
            {auth.loggedIn && (
              <Link
                href="/settings"
                class={`p-1.5 rounded-lg transition-colors ${
                  location.startsWith('/settings')
                    ? 'text-zinc-100 bg-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
                title="Settings"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
            )}
            {!auth.singleUser && auth.checked && !auth.loggedIn && (
              <Link href="/login" class="text-sm text-zinc-400 hover:text-zinc-100">
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>
      <main class="mx-auto max-w-xl w-full px-3 sm:px-4 py-4 pb-16 overflow-hidden">
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/">
            <AuthGuard auth={auth}>
              <XGuard auth={auth}>
                <AiReportPage />
              </XGuard>
            </AuthGuard>
          </Route>
          <Route path="/filtered">
            <AuthGuard auth={auth}>
              <XGuard auth={auth}>
                <FilteredFeed onRefreshRef={(fn) => setRefreshFn(() => fn)} />
              </XGuard>
            </AuthGuard>
          </Route>
          <Route path="/feed">
            <AuthGuard auth={auth}>
              <XGuard auth={auth}>
                <Feed onRefreshRef={(fn) => setRefreshFn(() => fn)} />
              </XGuard>
            </AuthGuard>
          </Route>
          <Route path="/settings">
            <AuthGuard auth={auth}>
              <Settings onXChange={auth.recheckX} xConnected={auth.xConnected} singleUser={auth.singleUser} onLogout={auth.logout} />
            </AuthGuard>
          </Route>
        </Switch>
      </main>
      <ScrollToTop />
    </div>
  )
}
