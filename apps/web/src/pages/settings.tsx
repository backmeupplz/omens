import { useState } from 'preact/hooks'
import { useLocation } from 'wouter-preact'
import { api } from '../helpers/api'
import { useApi } from '../helpers/hooks'

// === X Section ===

function XSection({ onXChange }: { onXChange: () => void }) {
  const [, navigate] = useLocation()
  const { data: session, refetch } = useApi<{
    connected: boolean
    username?: string
    connectedAt?: string
  }>('/x/session')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const connect = async () => {
    setError('')
    setLoading(true)
    try {
      await api('/x/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          ...(totp && { totp }),
        }),
      })
      setUsername('')
      setPassword('')
      setTotp('')
      refetch()
      onXChange()
      // Redirect to feed after first connection
      navigate('/')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  const disconnect = async () => {
    await api('/x/session', { method: 'DELETE' })
    refetch()
    onXChange()
  }

  if (session?.connected) {
    return (
      <div class="space-y-3">
        <h3 class="font-medium">X Account</h3>
        <div class="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div>
            <span class="text-sm text-zinc-300">
              Connected as{' '}
              <span class="font-medium text-zinc-100">@{session.username}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={disconnect}
            class="rounded px-3 py-1.5 text-xs bg-red-900/50 text-red-400 hover:bg-red-900"
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  return (
    <div class="space-y-3">
      <h3 class="font-medium">Connect X</h3>
      <p class="text-sm text-zinc-500">Connect your X account to read your home feed.</p>

      {error && (
        <p class="text-sm text-red-400 bg-red-900/20 rounded px-3 py-2">{error}</p>
      )}

      <div class="space-y-3">
        <input
          type="text"
          class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
          placeholder="X username"
          value={username}
          onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
        />
        <input
          type="password"
          class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
          placeholder="Password"
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
        />
        <input
          type="text"
          class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
          placeholder="2FA code (optional)"
          value={totp}
          onInput={(e) => setTotp((e.target as HTMLInputElement).value)}
        />
        <button
          type="button"
          onClick={connect}
          disabled={loading || !username || !password}
          class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  )
}

// === API Keys Section ===

function ApiKeysSection() {
  const { data: keys, refetch } = useApi<any[]>('/api-keys')
  const [name, setName] = useState('')
  const [newKey, setNewKey] = useState('')

  const createKey = async () => {
    if (!name) return
    const result = await api<any>('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    setNewKey(result.key)
    setName('')
    refetch()
  }

  const deleteKey = async (id: string) => {
    await api(`/api-keys/${id}`, { method: 'DELETE' })
    refetch()
  }

  return (
    <div class="space-y-4">
      <h3 class="font-medium">API Keys</h3>

      {newKey && (
        <div class="rounded border border-emerald-800 bg-emerald-900/20 p-3">
          <p class="text-sm text-emerald-400 mb-1">
            Copy this key now — it won't be shown again:
          </p>
          <code class="block rounded bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-200 break-all select-all">
            {newKey}
          </code>
          <button
            type="button"
            onClick={() => setNewKey('')}
            class="mt-2 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Dismiss
          </button>
        </div>
      )}

      <div class="flex gap-2">
        <input
          type="text"
          class="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
          placeholder="Key name (e.g., CLI, CI)"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <button
          type="button"
          onClick={createKey}
          class="rounded bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
        >
          Create
        </button>
      </div>

      <div class="space-y-2">
        {keys?.map((k: any) => (
          <div
            key={k.id}
            class="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-4 py-3"
          >
            <div>
              <span class="text-sm text-zinc-300">{k.name}</span>
              <span class="ml-2 text-xs text-zinc-500 font-mono">{k.prefix}...</span>
              {k.lastUsedAt && (
                <span class="ml-2 text-xs text-zinc-600">
                  Last used: {new Date(k.lastUsedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => deleteKey(k.id)}
              class="rounded px-2 py-1 text-xs bg-red-900/50 text-red-400 hover:bg-red-900"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// === Main Settings ===

export function Settings({
  onXChange,
  xConnected,
  singleUser,
  onLogout,
}: {
  onXChange: () => void
  xConnected: boolean
  singleUser: boolean
  onLogout: () => void
}) {
  return (
    <div>
      <h1 class="text-2xl font-bold mb-6">Settings</h1>
      <div class="space-y-8">
        <XSection onXChange={onXChange} />
        {xConnected && (
          <>
            <hr class="border-zinc-800" />
            <ApiKeysSection />
          </>
        )}
        {!singleUser && (
          <>
            <hr class="border-zinc-800" />
            <div>
              <button
                type="button"
                onClick={onLogout}
                class="rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
              >
                Log out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
