import { useState } from 'preact/hooks'
import { Link, Redirect, useLocation } from 'wouter-preact'
import { api, API_BASE } from '../helpers/api'
import { useApi } from '../helpers/hooks'

function AuthForm({ isRegister }: { isRegister: boolean }) {
  const [, navigate] = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const { data: mode } = useApi<{ singleUser: boolean }>('/auth/mode')
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
    <div class="mx-auto max-w-sm mt-16">
      <h1 class="text-2xl font-bold mb-6 text-center">
        {isRegister ? 'Create account' : 'Sign in'}
      </h1>
      <form onSubmit={submit} class="space-y-4" autoComplete={isRegister ? 'off' : 'on'}>
        {error && (
          <p class="text-sm text-red-400 rounded bg-red-900/20 px-3 py-2">
            {error}
          </p>
        )}
        <input
          type="email"
          name="email"
          id="email"
          placeholder="Email"
          autoComplete="email"
          class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
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
          class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          required
          minLength={8}
        />
        <button
          type="submit"
          class="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
        >
          {isRegister ? 'Register' : 'Login'}
        </button>
        {isRegister ? (
          <Link href="/login" class="block w-full text-sm text-zinc-400 hover:text-zinc-200 text-center">
            Already have an account? Sign in
          </Link>
        ) : (
          <Link href="/register" class="block w-full text-sm text-zinc-400 hover:text-zinc-200 text-center">
            Don't have an account? Register
          </Link>
        )}
      </form>
      <Footer />
    </div>
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
      <p class="text-sm text-zinc-500">Open source &amp; self-hostable</p>
      <a
        href="https://github.com/backmeupplz/omens"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-emerald-400 transition-colors"
      >
        <svg class="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        GitHub
      </a>
      {data && <p class="text-xs text-zinc-700">v{data.version}</p>}
    </div>
  )
}
