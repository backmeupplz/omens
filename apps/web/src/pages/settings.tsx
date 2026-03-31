import { useCallback, useEffect, useState } from 'preact/hooks'
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
    try {
      await api('/x/session', { method: 'DELETE' })
      refetch()
      onXChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect')
    }
  }

  if (session?.connected) {
    return (
      <div class="space-y-3">
        <h3 class="font-medium">X Account</h3>
        {error && (
          <p class="text-sm text-red-400 bg-red-900/20 rounded px-3 py-2">{error}</p>
        )}
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

// === AI Provider Section ===

const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google Gemini' },
  { id: 'groq', name: 'Groq' },
  { id: 'xai', name: 'xAI (Grok)' },
  { id: 'fireworks', name: 'Fireworks AI' },
  { id: 'ollama', name: 'Ollama (local)' },
  { id: 'openrouter', name: 'OpenRouter' },
] as const

interface AiSettingsData {
  configured: boolean
  provider?: string
  apiKeyMasked?: string
  baseUrl?: string
  model?: string
  systemPrompt?: string
  defaultPrompt: string
}

interface ModelInfo {
  id: string
  name: string
}

export function AiSection({ onSave }: { onSave?: () => void } = {}) {
  const { data: settings, refetch } = useApi<AiSettingsData>('/ai/settings')
  const [editing, setEditing] = useState(false)
  const [provider, setProvider] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Populate form when settings load or entering edit mode
  useEffect(() => {
    if (!settings?.configured) return
    setProvider(settings.provider || '')
    setBaseUrl(settings.baseUrl || '')
    setModel(settings.model || '')
  }, [settings])

  const fetchModels = useCallback(async (p: string, key: string, base: string) => {
    if (!p) return
    setModelsLoading(true)
    try {
      const res = await api<{ models: ModelInfo[] }>('/ai/models/preview', {
        method: 'POST',
        body: JSON.stringify({ provider: p, apiKey: key || 'placeholder', baseUrl: base }),
      })
      setModels(res.models || [])
    } catch {
      setModels([])
    } finally {
      setModelsLoading(false)
    }
  }, [])

  // When configured and has saved key, allow fetching models without re-entering key
  const fetchSavedModels = useCallback(async () => {
    if (!settings?.configured) return
    setModelsLoading(true)
    try {
      const res = await api<{ models: ModelInfo[] }>('/ai/models')
      setModels(res.models || [])
    } catch {
      setModels([])
    } finally {
      setModelsLoading(false)
    }
  }, [settings])

  const save = async () => {
    if (!provider || !model) {
      setError('Provider and model are required')
      return
    }
    if (!apiKey && !settings?.configured && provider !== 'ollama') {
      setError('API key is required')
      return
    }
    setError('')
    setSaving(true)
    try {
      await api('/ai/settings', {
        method: 'PUT',
        body: JSON.stringify({
          provider,
          apiKey: apiKey || 'keep-existing',
          baseUrl,
          model,
          systemPrompt: '',
        }),
      })
      refetch()
      onSave?.()
      setEditing(false)
      setApiKey('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const providerName = AI_PROVIDERS.find((p) => p.id === settings?.provider)?.name || settings?.provider

  // Connected state
  if (settings?.configured && !editing) {
    return (
      <div class="space-y-3">
        <h3 class="font-medium">AI Provider</h3>
        {error && <p class="text-sm text-red-400 bg-red-900/20 rounded px-3 py-2">{error}</p>}
        <div class="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div>
            <span class="text-sm text-zinc-300">
              {providerName} &middot;{' '}
              <span class="font-medium text-zinc-100">{settings.model}</span>
            </span>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => { setEditing(true); fetchSavedModels() }}
              class="rounded px-3 py-1.5 text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            >
              Change
            </button>
          </div>
        </div>
      </div>
    )
  }

  const showBaseUrl = provider === 'ollama' || provider === 'openrouter'

  // Setup / edit form
  return (
    <div class="space-y-4">
      <h3 class="font-medium">AI Provider</h3>
      <p class="text-sm text-zinc-500">Configure an AI provider to generate feed reports.</p>

      {error && <p class="text-sm text-red-400 bg-red-900/20 rounded px-3 py-2">{error}</p>}

      <div class="space-y-3">
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">Provider</label>
          <select
            class="w-full rounded bg-zinc-800 px-3 py-2 pr-8 text-sm border border-zinc-700 select-styled"
            value={provider}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value
              setProvider(v)
              setModels([])
              setModel('')
            }}
          >
            <option value="">Select provider...</option>
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {provider && (
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">
              API Key {settings?.configured && settings.apiKeyMasked && (
                <span class="text-zinc-600">(current: {settings.apiKeyMasked})</span>
              )}
            </label>
            <div class="flex gap-2">
              <input
                type="password"
                class="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 min-w-0"
                placeholder={settings?.configured ? 'Leave blank to keep current key' : 'Enter API key'}
                value={apiKey}
                onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                onClick={() => apiKey ? fetchModels(provider, apiKey, baseUrl) : fetchSavedModels()}
                disabled={modelsLoading || (!apiKey && !settings?.configured && provider !== 'ollama')}
                class="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 shrink-0"
              >
                {modelsLoading ? 'Loading...' : 'Fetch models'}
              </button>
            </div>
          </div>
        )}

        {showBaseUrl && (
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">Base URL (optional)</label>
            <input
              type="text"
              class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
              placeholder={provider === 'ollama' ? 'http://localhost:11434' : 'https://openrouter.ai/api/v1'}
              value={baseUrl}
              onInput={(e) => setBaseUrl((e.target as HTMLInputElement).value)}
            />
          </div>
        )}

        {provider && (
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">Model</label>
            {models.length > 0 ? (
              <select
                class="w-full rounded bg-zinc-800 px-3 py-2 pr-8 text-sm border border-zinc-700 select-styled"
                value={model}
                onChange={(e) => setModel((e.target as HTMLSelectElement).value)}
              >
                <option value="">Select model...</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
                placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
                value={model}
                onInput={(e) => setModel((e.target as HTMLInputElement).value)}
              />
            )}
          </div>
        )}

        {provider && (
          <div class="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !provider || !model || (!apiKey && !settings?.configured && provider !== 'ollama')}
              class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {settings?.configured && (
              <button
                type="button"
                onClick={() => { setEditing(false); setError('') }}
                class="rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// === AI Tuning Section ===

interface InternalsData {
  currentPrompt: string
  defaultPrompt: string
  pendingNudges: Array<{ id: string; tweetId: string; tweetContent: string; authorHandle: string; direction: string; createdAt: string }>
  pendingInstructions: Array<{ id: string; instruction: string; createdAt: string }>
  lastRegenAt: string | null
}

function AiTuningSection() {
  const { data: settings } = useApi<{ configured: boolean }>('/ai/settings')
  const { data: internals, refetch } = useApi<InternalsData>('/ai/internals')
  const [instruction, setInstruction] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)

  if (!settings?.configured || !internals) return null

  const addInstruction = async () => {
    if (!instruction.trim()) return
    setError('')
    try {
      await api('/ai/prompt-change', { method: 'POST', body: JSON.stringify({ instruction: instruction.trim() }) })
      setInstruction('')
      refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add instruction')
    }
  }

  const removeNudge = async (tweetId: string) => {
    await api(`/ai/nudge/${tweetId}`, { method: 'DELETE' }).catch(() => {})
    refetch()
  }

  const removeInstruction = async (id: string) => {
    await api(`/ai/prompt-change/${id}`, { method: 'DELETE' }).catch(() => {})
    refetch()
  }

  const regenerate = async () => {
    setRegenerating(true)
    setError('')
    try {
      await api('/ai/regenerate-prompt', { method: 'POST' })
      refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regenerate')
    } finally {
      setRegenerating(false)
    }
  }

  const hasPending = internals.pendingNudges.length > 0 || internals.pendingInstructions.length > 0

  return (
    <div class="space-y-4">
      <h3 class="font-medium">AI Tuning</h3>

      {error && <p class="text-sm text-red-400 bg-red-900/20 rounded px-3 py-2">{error}</p>}

      {/* Quick instruction input */}
      <div>
        <label class="text-xs text-zinc-400 mb-1 block">Tell the AI what you want to see</label>
        <div class="flex gap-2">
          <input
            type="text"
            class="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 min-w-0"
            placeholder='e.g. "show me more memes", "less crypto"'
            value={instruction}
            onInput={(e) => setInstruction((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addInstruction() }}
          />
          <button type="button" onClick={addInstruction} disabled={!instruction.trim()}
            class="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 shrink-0">Add</button>
        </div>
      </div>

      {/* Pending changes */}
      {hasPending && (
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-zinc-400">Pending changes ({internals.pendingNudges.length + internals.pendingInstructions.length})</span>
            <button type="button" onClick={regenerate} disabled={regenerating}
              class="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50">
              {regenerating ? 'Regenerating...' : 'Apply now'}
            </button>
          </div>

          {internals.pendingInstructions.map((p) => (
            <div key={p.id} class="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
              <span class="text-sm text-zinc-300">"{p.instruction}"</span>
              <button type="button" onClick={() => removeInstruction(p.id)}
                class="text-zinc-500 hover:text-zinc-300 text-xs ml-2 shrink-0">&times;</button>
            </div>
          ))}

          {internals.pendingNudges.map((n) => (
            <div key={n.id} class="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
              <span class="text-sm text-zinc-300">
                <span class={n.direction === 'up' ? 'text-emerald-400' : 'text-red-400'}>
                  {n.direction === 'up' ? '+' : '-'}
                </span>
                {' '}@{n.authorHandle}: {n.tweetContent}
              </span>
              <button type="button" onClick={() => removeNudge(n.tweetId)}
                class="text-zinc-500 hover:text-zinc-300 text-xs ml-2 shrink-0">&times;</button>
            </div>
          ))}
        </div>
      )}

      {!hasPending && (
        <p class="text-xs text-zinc-500">No pending changes. Use thumbs up/down on posts or add instructions above to tune the AI.</p>
      )}

      {internals.lastRegenAt && (
        <p class="text-xs text-zinc-600">Last regenerated: {new Date(internals.lastRegenAt).toLocaleString()}</p>
      )}

      {/* Current prompt (collapsible) */}
      <div>
        <button type="button" onClick={() => setShowPrompt(!showPrompt)}
          class="text-xs text-zinc-500 hover:text-zinc-300">
          {showPrompt ? 'Hide' : 'Show'} current prompt
        </button>
        {showPrompt && (
          <pre class="mt-2 rounded bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-zinc-400 whitespace-pre-wrap overflow-auto max-h-60 scrollbar-dark">
            {internals.currentPrompt || internals.defaultPrompt}
          </pre>
        )}
      </div>
    </div>
  )
}

// === API Keys Section ===

function ApiKeysSection() {
  const { data: keys, refetch } = useApi<any[]>('/api-keys')
  const [name, setName] = useState('')
  const [newKey, setNewKey] = useState('')
  const [error, setError] = useState('')

  const createKey = async () => {
    if (!name) return
    setError('')
    try {
      const result = await api<any>('/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setNewKey(result.key)
      setName('')
      refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create API key')
    }
  }

  const deleteKey = async (id: string) => {
    setError('')
    try {
      await api(`/api-keys/${id}`, { method: 'DELETE' })
      refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete API key')
    }
  }

  return (
    <div class="space-y-4">
      <h3 class="font-medium">API Keys</h3>

      {error && (
        <p class="text-sm text-red-400 bg-red-900/20 rounded px-3 py-2">{error}</p>
      )}

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
          disabled={!name}
          class="rounded bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
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
            <AiSection />
            <hr class="border-zinc-800" />
            <AiTuningSection />
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
