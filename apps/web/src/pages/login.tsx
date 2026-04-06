import { useState } from 'preact/hooks'
import { Link, Redirect } from 'wouter-preact'
import { api } from '../helpers/api'
import { useApi } from '../helpers/hooks'
import { NewspaperShell, useNewspaperActive } from '../helpers/newspaper-shell'

function AuthForm({ isRegister }: { isRegister: boolean }) {
  useNewspaperActive()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const { data: mode } = useApi<{ singleUser: boolean; demoMode?: boolean; demoEmail?: string | null }>('/auth/mode')
  if (mode?.singleUser) return <Redirect to="/" />

  const submit = async (e: Event) => {
    e.preventDefault()
    setError('')
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login'
      await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      window.location.href = '/'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <NewspaperShell showMeta={false}>
      <div class="np-page-grid">
        <article class="np-article np-article-lead mx-auto w-full max-w-[38rem]">
          <div class="np-article-header np-section-header np-section-header-md text-center">
            {isRegister ? 'Create account' : 'Sign in'}
          </div>
          <div class="space-y-6">
            <p class="np-copy-muted text-sm text-center">
              {isRegister
                ? 'Create an Omens account to connect your own X feed and generate your own briefings.'
                : 'Sign in to access your Omens feed, filters, and AI-generated daily briefings.'}
            </p>
            <form onSubmit={submit} class="space-y-4" autoComplete={isRegister ? 'off' : 'on'}>
              {error && (
                <p class="np-alert np-alert-error">
                  {error}
                </p>
              )}
              <input
                type="email"
                name="email"
                id="email"
                placeholder="Email"
                autoComplete="email"
                class="np-control"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                required
              />
              <input
                type="password"
                name={isRegister ? 'new-password' : 'password'}
                id={isRegister ? 'new-password' : 'password'}
                placeholder={isRegister ? 'Password (min 8 chars, upper + lower + number)' : 'Password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                class="np-control"
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                required
                minLength={8}
              />
              <button
                type="submit"
                class="np-button np-button-primary w-full"
              >
                {isRegister ? 'Register' : 'Login'}
              </button>
              {isRegister ? (
                <Link href="/login" class="np-link-muted block w-full text-sm text-center">
                  Already have an account? Sign in
                </Link>
              ) : (
                <Link href="/register" class="np-link-muted block w-full text-sm text-center">
                  Don't have an account? Register
                </Link>
              )}
            </form>
            {mode?.demoMode && (
              <div class="np-divider pt-5 text-center space-y-3">
                <p class="np-copy-muted text-sm">
                  Browse the demo feed{mode.demoEmail ? ` curated from ${mode.demoEmail}` : ''}.
                </p>
                <Link
                  href="/"
                  class="np-button np-button-secondary"
                >
                  Continue to demo
                </Link>
              </div>
            )}
            <Footer />
          </div>
        </article>
      </div>
    </NewspaperShell>
  )
}

export function Login() {
  return <AuthForm isRegister={false} />
}

export function Register() {
  return <AuthForm isRegister={true} />
}

function Footer() {
  const { data } = useApi<{ version: string }>('/version')
  return (
    <div class="text-center mt-10 space-y-2">
      <p class="np-copy-muted text-sm">Open source &amp; self-hostable</p>
      <a
        href="https://github.com/backmeupplz/omens"
        target="_blank"
        rel="noopener noreferrer"
        class="np-link-accent inline-flex items-center gap-1.5 text-sm"
      >
        <svg class="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        GitHub
      </a>
      {data && <p class="np-copy-muted text-xs">v{data.version}</p>}
    </div>
  )
}
