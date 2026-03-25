import { useState } from 'preact/hooks'
import { useApi } from '../helpers/hooks'
import { api } from '../helpers/api'

// === Sources Tab ===

function SourcesTab() {
  const { data: sources, refetch } = useApi<any[]>('/sources')
  const [adding, setAdding] = useState(false)
  const [type, setType] = useState('reddit')
  const [config, setConfig] = useState('')

  const addSource = async () => {
    try {
      const parsed = JSON.parse(config)
      await api('/sources', {
        method: 'POST',
        body: JSON.stringify({ type, config: parsed }),
      })
      setAdding(false)
      setConfig('')
      refetch()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const deleteSource = async (id: string) => {
    await api(`/sources/${id}`, { method: 'DELETE' })
    refetch()
  }

  const toggleSource = async (id: string, enabled: boolean) => {
    await api(`/sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: !enabled }),
    })
    refetch()
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-medium">Sources</h3>
        <button
          onClick={() => setAdding(!adding)}
          class="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
        >
          {adding ? 'Cancel' : 'Add source'}
        </button>
      </div>

      {adding && (
        <div class="mb-4 rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <select
            class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
            value={type}
            onChange={(e) => setType((e.target as HTMLSelectElement).value)}
          >
            <option value="reddit">Reddit</option>
            <option value="twitter">Twitter (Nitter)</option>
            <option value="rss">RSS</option>
          </select>
          <textarea
            class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 font-mono"
            rows={4}
            placeholder={
              type === 'reddit'
                ? '{"subreddits": ["technology", "programming"], "sort": "hot"}'
                : type === 'twitter'
                  ? '{"accounts": ["elonmusk"], "nitterInstance": "https://nitter.net"}'
                  : '{"urls": ["https://example.com/feed.xml"]}'
            }
            value={config}
            onInput={(e) => setConfig((e.target as HTMLTextAreaElement).value)}
          />
          <button
            onClick={addSource}
            class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
          >
            Save
          </button>
        </div>
      )}

      <div class="space-y-2">
        {sources?.map((s: any) => (
          <div
            key={s.id}
            class="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-4 py-3"
          >
            <div>
              <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400 mr-2">
                {s.type}
              </span>
              <span class="text-sm text-zinc-300">
                {JSON.stringify(s.config)}
              </span>
            </div>
            <div class="flex gap-2">
              <button
                onClick={() => toggleSource(s.id, s.enabled)}
                class={`rounded px-2 py-1 text-xs ${s.enabled ? 'bg-emerald-900/50 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}
              >
                {s.enabled ? 'On' : 'Off'}
              </button>
              <button
                onClick={() => deleteSource(s.id)}
                class="rounded px-2 py-1 text-xs bg-red-900/50 text-red-400 hover:bg-red-900"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {sources?.length === 0 && (
          <p class="text-sm text-zinc-500">No sources configured.</p>
        )}
      </div>
    </div>
  )
}

// === LLM Tab ===

function LLMTab() {
  const { data: config, refetch } = useApi<any>('/llm/config')
  const { data: providers } = useApi<any>('/llm/providers')
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  const save = async () => {
    await api('/llm/config', {
      method: 'PUT',
      body: JSON.stringify({
        provider: provider || config?.provider,
        model: model || config?.model,
        ...(apiKey && { apiKey }),
        ...(baseUrl && { baseUrl }),
      }),
    })
    refetch()
    setApiKey('')
  }

  const providerList = providers ? Object.entries(providers) : []

  return (
    <div class="space-y-4">
      <h3 class="font-medium">LLM Configuration</h3>

      <div class="space-y-3">
        <div>
          <label class="block text-sm text-zinc-400 mb-1">Provider</label>
          <select
            class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
            value={provider || config?.provider || ''}
            onChange={(e) => setProvider((e.target as HTMLSelectElement).value)}
          >
            {providerList.map(([id, p]: [string, any]) => (
              <option key={id} value={id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label class="block text-sm text-zinc-400 mb-1">Model</label>
          <input
            type="text"
            class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
            value={model || config?.model || ''}
            onInput={(e) => setModel((e.target as HTMLInputElement).value)}
          />
        </div>

        <div>
          <label class="block text-sm text-zinc-400 mb-1">
            API Key {config?.hasApiKey && '(set)'}
          </label>
          <input
            type="password"
            class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
            placeholder="Enter new API key..."
            value={apiKey}
            onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
          />
        </div>

        <div>
          <label class="block text-sm text-zinc-400 mb-1">
            Base URL (optional)
          </label>
          <input
            type="text"
            class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
            value={baseUrl || config?.baseUrl || ''}
            onInput={(e) => setBaseUrl((e.target as HTMLInputElement).value)}
          />
        </div>

        <button
          onClick={save}
          class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
        >
          Save
        </button>
      </div>
    </div>
  )
}

// === Interests Tab ===

function InterestsTab() {
  const { data: settings, refetch } = useApi<any>('/settings')
  const [interests, setInterests] = useState('')
  const [minScore, setMinScore] = useState(30)
  const [loaded, setLoaded] = useState(false)

  if (settings && !loaded) {
    setInterests(settings.interests || '')
    setMinScore(settings.minScore ?? 30)
    setLoaded(true)
  }

  const save = async () => {
    await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({ interests, minScore, language: 'en' }),
    })
    refetch()
  }

  return (
    <div class="space-y-4">
      <h3 class="font-medium">Interests & Filtering</h3>
      <div>
        <label class="block text-sm text-zinc-400 mb-1">
          Describe your interests (guides LLM scoring)
        </label>
        <textarea
          class="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700"
          rows={4}
          placeholder="e.g., AI/ML breakthroughs, open source tools, startup funding news, crypto regulations..."
          value={interests}
          onInput={(e) =>
            setInterests((e.target as HTMLTextAreaElement).value)
          }
        />
      </div>
      <div>
        <label class="block text-sm text-zinc-400 mb-1">
          Minimum score threshold: {minScore}
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={minScore}
          onInput={(e) =>
            setMinScore(Number((e.target as HTMLInputElement).value))
          }
          class="w-full"
        />
      </div>
      <button
        onClick={save}
        class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
      >
        Save
      </button>
    </div>
  )
}

// === API Keys Tab ===

function ApiKeysTab() {
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
              <span class="ml-2 text-xs text-zinc-500 font-mono">
                {k.prefix}...
              </span>
              {k.lastUsedAt && (
                <span class="ml-2 text-xs text-zinc-600">
                  Last used: {new Date(k.lastUsedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <button
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

export function Settings() {
  const [tab, setTab] = useState<'sources' | 'llm' | 'interests' | 'apikeys'>(
    'sources',
  )

  const tabs = [
    { id: 'sources' as const, label: 'Sources' },
    { id: 'llm' as const, label: 'LLM' },
    { id: 'interests' as const, label: 'Interests' },
    { id: 'apikeys' as const, label: 'API Keys' },
  ]

  return (
    <div>
      <h1 class="text-2xl font-bold mb-6">Settings</h1>

      <div class="flex gap-1 mb-6 border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            class={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
              tab === t.id
                ? 'border-zinc-100 text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sources' && <SourcesTab />}
      {tab === 'llm' && <LLMTab />}
      {tab === 'interests' && <InterestsTab />}
      {tab === 'apikeys' && <ApiKeysTab />}
    </div>
  )
}
