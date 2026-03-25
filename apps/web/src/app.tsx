import { Route, Switch, Link, useLocation } from 'wouter-preact'
import { Feed } from './pages/feed'
import { Settings } from './pages/settings'
import { Login } from './pages/login'

export function App() {
  const [location] = useLocation()

  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100">
      <nav class="border-b border-zinc-800 px-6 py-4">
        <div class="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" class="text-xl font-bold tracking-tight">
            Omens
          </Link>
          <div class="flex gap-4 text-sm">
            <Link
              href="/"
              class={
                location === '/'
                  ? 'text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-100'
              }
            >
              Feed
            </Link>
            <Link
              href="/settings"
              class={
                location.startsWith('/settings')
                  ? 'text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-100'
              }
            >
              Settings
            </Link>
          </div>
        </div>
      </nav>
      <main class="mx-auto max-w-4xl px-6 py-8">
        <Switch>
          <Route path="/" component={Feed} />
          <Route path="/settings" component={Settings} />
          <Route path="/login" component={Login} />
        </Switch>
      </main>
    </div>
  )
}
