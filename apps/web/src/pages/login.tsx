import { useState } from 'preact/hooks'
import { Redirect, useLocation } from 'wouter-preact'
import { api } from '../helpers/api'
import { useApi } from '../helpers/hooks'

export function Login() {
  const [, navigate] = useLocation()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const { data: mode } = useApi<{ singleUser: boolean }>('/auth/mode')

  // In single-user mode, no login needed
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
      navigate('/')
      // Force reload to update auth state
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
      <form onSubmit={submit} class="space-y-4">
        {error && (
          <p class="text-sm text-red-400 rounded bg-red-900/20 px-3 py-2">
            {error}
          </p>
        )}
        <input
          type="email"
          placeholder="Email"
          class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
          value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          required
        />
        <input
          type="password"
          placeholder="Password (min 8 chars, upper + lower + number)"
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
        <button
          type="button"
          onClick={() => setIsRegister(!isRegister)}
          class="w-full text-sm text-zinc-400 hover:text-zinc-200"
        >
          {isRegister
            ? 'Already have an account? Sign in'
            : "Don't have an account? Register"}
        </button>
      </form>
    </div>
  )
}
