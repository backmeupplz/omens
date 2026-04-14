import { useCallback, useEffect, useState } from 'preact/hooks'
import { Link, Redirect, Route, Switch, useLocation } from 'wouter-preact'
import { api, setDemoMode } from './helpers/api'
import { NewspaperRouteControls, NewspaperShell, useNewspaperActive } from './helpers/newspaper-shell'
import { Spinner } from './helpers/spinner'
import { useInitializeThemePreference } from './helpers/theme'
import { AiReportPage, Feed, FilteredFeed, NewspaperFixturePage } from './pages/feed'
import { Login, Register } from './pages/login'
import { Settings } from './pages/settings'
import { ReportSharePage, SharePage } from './pages/share'

interface AuthState {
  checked: boolean
  loggedIn: boolean
  singleUser: boolean
  demoMode: boolean
  xChecked: boolean
  xConnected: boolean
  sourcesChecked: boolean
  sourcesConnected: boolean
}

type AppRoute = 'report' | 'filtered' | 'feed' | 'settings'

function useAuth(): AuthState & { logout: () => void; recheckSources: () => void } {
  const [state, setState] = useState<AuthState>({
    checked: false,
    loggedIn: false,
    singleUser: false,
    demoMode: false,
    xChecked: false,
    xConnected: false,
    sourcesChecked: false,
    sourcesConnected: false,
  })

  const checkConnections = useCallback(() => {
    api<{ connected: boolean }>('/x/session')
      .then((s) =>
        setState((prev) => ({ ...prev, xChecked: true, xConnected: s.connected })),
      )
      .catch(() => setState((prev) => ({ ...prev, xChecked: true })))

    api<{ inputs: Array<{ enabled: boolean }> }>('/inputs')
      .then((s) =>
        setState((prev) => ({
          ...prev,
          sourcesChecked: true,
          sourcesConnected: s.inputs.some((input) => input.enabled),
        })),
      )
      .catch(() => setState((prev) => ({ ...prev, sourcesChecked: true })))
  }, [])

  useEffect(() => {
    api<{ singleUser: boolean; demoMode?: boolean }>('/auth/mode')
      .then((mode) => {
        const demoMode = !!mode.demoMode
        if (demoMode) setDemoMode(true)
        if (mode.singleUser) {
          setState((prev) => ({
            ...prev,
            checked: true,
            loggedIn: true,
            singleUser: true,
            demoMode,
          }))
          checkConnections()
          return
        }
        return api('/auth/me')
          .then(() => {
            setState((prev) => ({ ...prev, checked: true, loggedIn: true, singleUser: false, demoMode }))
            checkConnections()
          })
          .catch(() =>
            setState((prev) => ({
              ...prev,
              checked: true,
              loggedIn: false,
              singleUser: false,
              demoMode,
              xChecked: true,
              sourcesChecked: true,
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
          sourcesChecked: true,
        })),
      )
  }, [checkConnections])

  const logout = useCallback(() => {
    api('/auth/logout', { method: 'POST' })
      .catch(() => {})
      .finally(() => {
        window.location.href = '/login'
      })
  }, [])

  return { ...state, logout, recheckSources: checkConnections }
}

function RouteLoadingShell({ current }: { current: AppRoute }) {
  useNewspaperActive()

  return (
    <NewspaperShell leftControls={<NewspaperRouteControls current={current} />} showMeta={false}>
      <div class="min-h-[18rem]">
        <Spinner />
      </div>
    </NewspaperShell>
  )
}

function AuthGuard({
  auth,
  current,
  children,
}: {
  auth: AuthState
  current: AppRoute
  children: preact.ComponentChildren
}) {
  if (!auth.checked) return <RouteLoadingShell current={current} />
  if (auth.singleUser) return <>{children}</>
  if (!auth.loggedIn) return <Redirect to="/login" />
  return <>{children}</>
}

function SourceGuard({
  auth,
  current,
  children,
}: {
  auth: AuthState
  current: AppRoute
  children: preact.ComponentChildren
}) {
  if (!auth.sourcesChecked) return <RouteLoadingShell current={current} />
  if (!auth.sourcesConnected) return <Redirect to="/settings" />
  return <>{children}</>
}

function ProtectedXPage({
  auth,
  current,
  demo,
  demoPage,
  children,
}: {
  auth: AuthState
  current: AppRoute
  demo: boolean
  demoPage: preact.ComponentChildren
  children: preact.ComponentChildren
}) {
  if (demo) return <>{demoPage}</>
  return (
    <AuthGuard auth={auth} current={current}>
      <SourceGuard auth={auth} current={current}>{children}</SourceGuard>
    </AuthGuard>
  )
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
      class="np-scroll-top fixed bottom-4 right-4 z-40 rounded-full p-2 sm:p-2.5 transition-colors"
      title="Scroll to top"
    >
      <svg class="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M5 15l7-7 7 7" />
      </svg>
    </button>
  )
}

export function App() {
  useInitializeThemePreference()
  const [location] = useLocation()
  const auth = useAuth()

  const isDemo = auth.demoMode && !auth.loggedIn

  // Share pages get their own layout — no navbar
  const shareMatch = location.match(/^\/([^/]+)\/status\/(\d+)$/)
  if (shareMatch) {
    return <SharePage handle={shareMatch[1]} tweetId={shareMatch[2]} />
  }
  const reportMatch = location.match(/^\/report\/([a-z0-9]+)$/)
  if (reportMatch) {
    return <ReportSharePage id={reportMatch[1]} />
  }
  if (location === '/fixture/newspaper') {
    return <NewspaperFixturePage />
  }

  return (
    <>
      {isDemo && location !== '/login' && location !== '/register' && (
        <div class="demo-notice-wrap px-3 pt-4 sm:px-4">
          <div class="mx-auto w-full max-w-[72rem]">
            <div class="demo-notice">
              <div class="demo-notice-copy">
                <div class="demo-notice-kicker">Public Demo Edition</div>
                <div class="demo-notice-title">You&apos;re viewing a sample Omens feed.</div>
                <p class="demo-notice-text">
                  Connect your own sources and AI provider to generate a personal briefing from the people and communities you actually follow.
                </p>
              </div>
              <Link href="/register" class="demo-notice-cta">
                Create Your Own
              </Link>
            </div>
          </div>
        </div>
      )}
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/">
          <ProtectedXPage auth={auth} current="report" demo={isDemo} demoPage={<AiReportPage demo />}>
            <AiReportPage />
          </ProtectedXPage>
        </Route>
        <Route path="/filtered">
          <ProtectedXPage auth={auth} current="filtered" demo={isDemo} demoPage={<FilteredFeed demo />}>
            <FilteredFeed />
          </ProtectedXPage>
        </Route>
        <Route path="/feed">
          <ProtectedXPage auth={auth} current="feed" demo={isDemo} demoPage={<Feed demo />}>
            <Feed />
          </ProtectedXPage>
        </Route>
        <Route path="/settings">
          <AuthGuard auth={auth} current="settings">
            <Settings
              onSourcesChange={auth.recheckSources}
              xChecked={auth.xChecked}
              sourcesChecked={auth.sourcesChecked}
              sourceConnected={auth.sourcesConnected}
              singleUser={auth.singleUser}
              onLogout={auth.logout}
            />
          </AuthGuard>
        </Route>
      </Switch>
      <ScrollToTop />
    </>
  )
}
