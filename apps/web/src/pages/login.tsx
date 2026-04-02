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
      <VersionFooter />
    </div>
  )
}

export function Login() {
  return <AuthForm isRegister={false} />
}

export function Register() {
  return <AuthForm isRegister={true} />
}

function VersionFooter() {
  const { data } = useApi<{ version: string }>('/version')
  if (!data) return null
  return <p class="text-xs text-zinc-700 text-center mt-8">Omens v{data.version}</p>
}
