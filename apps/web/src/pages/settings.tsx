import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { useLocation } from 'wouter-preact'
import { api, API_BASE } from '../helpers/api'
import { Countdown } from '../helpers/components'
import { useApi } from '../helpers/hooks'
import { NewspaperRouteControls, NewspaperShell, useNewspaperActive } from '../helpers/newspaper-shell'
import { SetupStateBlock, type SetupStep } from '../helpers/setup-state'
import { Spinner } from '../helpers/spinner'
import { THEME_OPTIONS, useThemePreference } from '../helpers/theme'

// === X Section ===

function XSection({ onXChange }: { onXChange: () => void }) {
  const [, navigate] = useLocation()
  const { data: session, loading: sessionLoading, error: sessionError, refetch } = useApi<{
    connected: boolean
    username?: string
    connectedAt?: string
  }>('/x/session')
  const [username, setUsername] = useState('')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReconnect, setShowReconnect] = useState(false)

  const connect = async () => {
    setError('')
    setLoading(true)
    try {
      await api('/x/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          ...(handle && { handle }),
          ...(totp && { totp }),
        }),
      })
      setUsername('')
      setHandle('')
      setPassword('')
      setTotp('')
      setShowReconnect(false)
      refetch()
      onXChange()
      // Redirect to feed after first connection if not reconnecting
      if (!session?.connected) navigate('/')
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

  if (sessionLoading) return <Spinner />

  if (session?.connected) {
    return (
      <div class="space-y-3">
        <h3 class="font-medium">X Account</h3>
        {error && (
          <p class="np-alert np-alert-error">{error}</p>
        )}
        <div class="np-inline-card np-inline-card-row">
          <span class="np-copy-subtle text-sm">
            Connected as <span class="np-copy-strong font-medium">{session.username}</span>
          </span>
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => setShowReconnect((v) => !v)}
              class="np-button np-button-secondary np-button-small whitespace-nowrap"
            >
              Reconnect
            </button>
            <button
              type="button"
              onClick={disconnect}
              class="np-button np-button-danger np-button-small whitespace-nowrap"
            >
              Disconnect
            </button>
          </div>
        </div>
        {showReconnect && (
          <div class="np-inline-card space-y-3">
            <p class="np-copy-muted text-sm">Re-enter credentials to update your session without losing posts.</p>
            <input
              type="text"
              class="np-control"
              placeholder="X email or phone"
              value={username}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
            />
            <input
              type="text"
              class="np-control"
              placeholder="X handle, e.g. backmeupplz (optional)"
              value={handle}
              onInput={(e) => setHandle((e.target as HTMLInputElement).value)}
            />
            <input
              type="password"
              class="np-control"
              placeholder="Password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            />
            <input
              type="text"
              class="np-control"
              placeholder="2FA code (optional)"
              value={totp}
              onInput={(e) => setTotp((e.target as HTMLInputElement).value)}
            />
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={connect}
                disabled={loading || !username || !password}
                class="np-button np-button-primary disabled:opacity-50"
              >
                {loading ? 'Reconnecting...' : 'Update credentials'}
              </button>
              <button
                type="button"
                onClick={() => setShowReconnect(false)}
                class="np-button np-button-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div class="space-y-3">
      <h3 class="font-medium">Connect X</h3>
      <p class="np-copy-muted text-sm">Connect your X account to read your home feed.</p>

      {sessionError && (
        <p class="np-alert np-alert-error">Couldn&apos;t verify your saved X session. Reconnect below.</p>
      )}
      {error && (
        <p class="np-alert np-alert-error">{error}</p>
      )}

      <div class="space-y-3">
        <input
          type="text"
          class="np-control"
          placeholder="X email or phone"
          value={username}
          onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
        />
        <input
          type="text"
          class="np-control"
          placeholder="X handle, e.g. backmeupplz (optional)"
          value={handle}
          onInput={(e) => setHandle((e.target as HTMLInputElement).value)}
        />
        <input
          type="password"
          class="np-control"
          placeholder="Password"
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
        />
        <input
          type="text"
          class="np-control"
          placeholder="2FA code (optional)"
          value={totp}
          onInput={(e) => setTotp((e.target as HTMLInputElement).value)}
        />
        <button
          type="button"
          onClick={connect}
          disabled={loading || !username || !password}
          class="np-button np-button-primary disabled:opacity-50"
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

function ThemeSection() {
  const { theme, setTheme } = useThemePreference()

  return (
    <div class="space-y-3">
      <h3 class="font-medium">Edition Theme</h3>
      <p class="np-copy-muted text-sm">Choose the newspaper palette for Omens across report, feed, and settings.</p>
      <div class="np-inline-card np-inline-card-row">
        <p class="np-copy-subtle text-sm">
          Current theme: <span class="np-copy-strong font-medium">{theme === 'light' ? 'Light' : 'Dark'}</span>
        </p>
        <div class="flex flex-wrap gap-2">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              class={
                theme === option.value
                  ? 'np-button np-button-primary np-button-small'
                  : 'np-button np-button-secondary np-button-small'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function VersionSection() {
  const { data: versionData } = useApi<{ version: string }>('/version')

  if (!versionData?.version) return null

  return (
    <div class="np-inline-card">
      <p class="np-copy-subtle text-sm">Build version</p>
      <p class="np-copy-muted text-xs mt-1">Running Docker build v{versionData.version}</p>
    </div>
  )
}

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
  const { data: settings, error: settingsError, refetch } = useApi<AiSettingsData>('/ai/settings')
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
      setError('Failed to fetch models — check your API key')
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
      setError('Failed to fetch models — check your API key')
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

  const requiresApiKey = !!provider && provider !== 'ollama'
  const canFetchModels = !!provider && (provider === 'ollama' || !!apiKey || !!settings?.configured)
  const previewModels = () => {
    if (!provider) return
    if (provider === 'ollama' || apiKey) {
      fetchModels(provider, apiKey, baseUrl)
      return
    }
    fetchSavedModels()
  }

  // Connected state
  if (settings?.configured && !editing) {
    return (
      <div class="space-y-3">
        <h3 class="font-medium">AI Provider</h3>
        {error && <p class="np-alert np-alert-error">{error}</p>}
        <div class="np-inline-card np-inline-card-row">
          <span class="np-copy-subtle text-sm">
            {providerName} &middot; <span class="np-copy-strong font-medium">{settings.model}</span>
          </span>
          <button
            type="button"
            onClick={() => { setEditing(true); fetchSavedModels() }}
            class="np-button np-button-secondary np-button-small whitespace-nowrap"
          >
            Change
          </button>
        </div>
      </div>
    )
  }

  const showBaseUrl = provider === 'ollama' || provider === 'openrouter'

  // Setup / edit form
  return (
    <div class="space-y-4">
      <h3 class="font-medium">AI Provider</h3>
      <p class="np-copy-muted text-sm">Bring your own AI provider, model, and API key to score your X feed and generate the newspaper.</p>

      {settingsError && <p class="np-alert np-alert-error">Couldn&apos;t load saved AI settings. Re-enter them below.</p>}
      {error && <p class="np-alert np-alert-error">{error}</p>}
      {provider === 'ollama' && (
        <p class="np-setup-hint">Ollama runs locally, so no API key is needed. Set a base URL only if it is not on `http://localhost:11434`.</p>
      )}
      {error && (
        <p class="np-setup-hint">Check the provider, API key, base URL, and model access. Some providers only return model lists for fully valid keys.</p>
      )}

      <div class="space-y-3">
        <div>
          <label class="mb-1 block">Provider</label>
          <select
            class="np-control np-control-select select-styled"
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

        {requiresApiKey && (
          <div>
            <label class="mb-1 block">
              API Key {settings?.configured && settings.apiKeyMasked && (
                <span class="np-copy-muted">(current: {settings.apiKeyMasked})</span>
              )}
            </label>
            <div class="flex gap-2">
              <input
                type="password"
                class="np-control min-w-0 flex-1"
                placeholder={settings?.configured ? 'Leave blank to keep current key' : 'Enter API key'}
                value={apiKey}
                onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                onClick={previewModels}
                disabled={modelsLoading || !canFetchModels}
                class="np-button np-button-secondary disabled:opacity-50 shrink-0"
              >
                {modelsLoading ? 'Loading...' : 'Fetch models'}
              </button>
            </div>
          </div>
        )}

        {showBaseUrl && (
          <div>
            <label class="mb-1 block">Base URL (optional)</label>
            <input
              type="text"
              class="np-control"
              placeholder={provider === 'ollama' ? 'http://localhost:11434' : 'https://openrouter.ai/api/v1'}
              value={baseUrl}
              onInput={(e) => setBaseUrl((e.target as HTMLInputElement).value)}
            />
          </div>
        )}

        {provider === 'ollama' && (
          <div>
            <button
              type="button"
              onClick={previewModels}
              disabled={modelsLoading || !provider}
              class="np-button np-button-secondary disabled:opacity-50"
            >
              {modelsLoading ? 'Loading...' : 'Fetch models'}
            </button>
          </div>
        )}

        {provider && (
          <div>
            <label class="mb-1 block">Model</label>
            {models.length > 0 ? (
              <select
                class="np-control np-control-select select-styled"
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
                class="np-control"
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
              class="np-button np-button-primary disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {settings?.configured && (
              <button
                type="button"
                onClick={() => { setEditing(false); setError('') }}
                class="np-button np-button-secondary"
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

function SettingsOverview({ xConnected }: { xConnected: boolean }) {
  const { data: aiSettings } = useApi<Pick<AiSettingsData, 'configured' | 'provider' | 'model'>>('/ai/settings')
  const aiReady = !!aiSettings?.configured
  const providerName = aiSettings?.provider
    ? (AI_PROVIDERS.find((p) => p.id === aiSettings.provider)?.name || aiSettings.provider)
    : null

  const steps: SetupStep[] = [
    {
      label: 'Connect your X account',
      detail: xConnected
        ? 'Your home timeline is connected and ready to fetch.'
        : 'Omens needs your own X feed before it can ingest posts or build a briefing.',
      state: xConnected ? 'done' : 'active',
    },
    {
      label: 'Bring your own AI provider',
      detail: !xConnected
        ? 'This unlocks after X is connected.'
        : aiReady
          ? `${providerName} ${aiSettings?.model ? `· ${aiSettings.model}` : ''} is configured for scoring and reports.`
          : 'Add your provider, API key, and model to filter the feed and write the newspaper.',
      state: !xConnected ? 'pending' : aiReady ? 'done' : 'active',
    },
    {
      label: 'Generate your own edition',
      detail: aiReady
        ? 'Reports, filtered feed, and AI tuning are ready.'
        : 'Once AI is configured, Omens can score posts, draft reports, and learn from your nudges.',
      state: aiReady ? 'done' : 'pending',
    },
  ]

  return (
    <SetupStateBlock
      kicker="Setup Status"
      title={xConnected ? (aiReady ? 'Your edition is configured' : 'One step left') : 'Set up your own edition'}
      intro={xConnected
        ? (aiReady
          ? 'Your X feed and AI provider are connected. You can fetch posts, tune relevance, and generate reports.'
          : 'Your X feed is connected. Add an AI provider next to unlock the filtered feed and daily briefings.')
        : 'Start by connecting X. After that, bring your own AI provider to filter the people you follow and publish your own briefing.'}
      steps={steps}
    >
      <ThemeSection />
      <VersionSection />
    </SetupStateBlock>
  )
}

// === AI Tuning Section ===

interface InternalsData {
  currentPrompt: string
  defaultPrompt: string
  pendingNudges: Array<{ id: string; tweetId: string; tweetContent: string; authorHandle: string; direction: string }>
  pendingInstructions: Array<{ id: string; instruction: string }>
  lastRegenAt: string | null
  autoApplyAt: number | null
  isApplying: boolean
}

function FetchIntervalSection() {
  const { data: settings } = useApi<{ fetchIntervalMinutes?: number }>('/ai/settings')
  const [fetchInterval, setFetchInterval] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings?.fetchIntervalMinutes != null && fetchInterval === null) setFetchInterval(settings.fetchIntervalMinutes)
  }, [settings, fetchInterval])

  if (fetchInterval === null) return null

  return (
    <div class="space-y-3">
      <h3 class="font-medium">Auto-fetch</h3>
      <label class="block">Fetch new posts every</label>
      <select
        class="np-control np-control-select select-styled"
        value={fetchInterval}
        onChange={(e) => {
          const v = Number((e.target as HTMLSelectElement).value)
          setFetchInterval(v)
          setSaving(true)
          api('/ai/settings/intervals', { method: 'PUT', body: JSON.stringify({ fetchIntervalMinutes: v }) })
            .finally(() => setSaving(false))
        }}
      >
        <option value="0">Manual only</option>
        <option value="5">5 minutes</option>
        <option value="15">15 minutes</option>
        <option value="30">30 minutes</option>
        <option value="60">1 hour</option>
      </select>
      {saving && <span class="np-copy-muted text-xs">Saving...</span>}
    </div>
  )
}

function AiTuningSection() {
  const { data: settings } = useApi<{ configured: boolean; minScore?: number; fetchIntervalMinutes?: number; reportIntervalHours?: number; reportAtHour?: number }>('/ai/settings')
  const { data: internals, refetch } = useApi<InternalsData>('/ai/internals')

  // Poll internals every 30s to catch background prompt regeneration
  useEffect(() => {
    const id = setInterval(refetch, 30_000)
    return () => clearInterval(id)
  }, [refetch])
  const [instruction, setInstruction] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regenStatus, setRegenStatus] = useState('')
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [localMinScore, setLocalMinScore] = useState<number | null>(null)
  const [reportInterval, setReportInterval] = useState<number | null>(null)
  const [reportAtHour, setReportAtHour] = useState<number | null>(null)
  const [savingScore, setSavingScore] = useState(false)
  const [savingIntervals, setSavingIntervals] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (settings?.minScore != null && localMinScore === null) setLocalMinScore(settings.minScore)
    if (settings?.reportIntervalHours != null && reportInterval === null) setReportInterval(settings.reportIntervalHours)
    if (settings?.reportAtHour != null && reportAtHour === null) {
      // Convert UTC hour to local hour for display
      const utcH = settings.reportAtHour
      const localH = (utcH + 24 - new Date().getTimezoneOffset() / 60) % 24
      setReportAtHour(Math.round(localH))
    }
  }, [settings, localMinScore, reportInterval, reportAtHour])

  const onSliderChange = (val: number) => {
    setLocalMinScore(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSavingScore(true)
      try {
        await api('/ai/settings/min-score', { method: 'PUT', body: JSON.stringify({ minScore: val }) })
      } catch {}
      setSavingScore(false)
    }, 500)
  }
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

  const regenAbortRef = useRef<AbortController | null>(null)

  const connectToRegenStream = useCallback(() => {
    regenAbortRef.current?.abort()
    const controller = new AbortController()
    regenAbortRef.current = controller
    setRegenerating(true)
    fetch(`${API_BASE}/ai/regenerate-stream`, { credentials: 'include', signal: controller.signal })
      .then(async (res) => {
        const reader = res.body?.getReader()
        if (!reader) return
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n\n')
          buf = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') { setRegenerating(false); setRegenStatus(''); refetch(); return }
            if (data.startsWith('[ERROR]')) { setError(data.slice(8)); setRegenerating(false); setRegenStatus(''); return }
            try { const j = JSON.parse(data); if (j.status) setRegenStatus(j.status) } catch {}
          }
        }
        setRegenerating(false)
        setRegenStatus('')
        refetch()
      })
      .catch((e) => {
        if (e instanceof Error && e.name === 'AbortError') return
        setRegenerating(false)
        setRegenStatus('')
      })
  }, [refetch])

  // On mount, check if a regeneration is already in progress (e.g. after page reload)
  useEffect(() => {
    api<{ active: boolean; status: string | null }>('/ai/regenerate-status')
      .then((s) => {
        if (s.active) {
          setRegenStatus(s.status || 'Applying...')
          connectToRegenStream()
        }
      })
      .catch(() => {})
  }, [connectToRegenStream])

  const regenerate = async () => {
    setRegenerating(true)
    setRegenStatus('Starting...')
    setError('')
    try {
      await api('/ai/regenerate-prompt', { method: 'POST' })
      connectToRegenStream()
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Failed to regenerate')
      setRegenerating(false)
      setRegenStatus('')
    }
  }

  const hasPending = internals.pendingNudges.length > 0 || internals.pendingInstructions.length > 0

  return (
    <div class="space-y-4">
      <h3 class="font-medium">AI Tuning</h3>

      {error && <p class="np-alert np-alert-error">{error}</p>}

      {/* Min relevance slider */}
      {localMinScore !== null && (
        <div>
          <label class="mb-1 block">Min relevance for filtered feed</label>
          <div class="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={localMinScore}
              onInput={(e) => onSliderChange(Number((e.target as HTMLInputElement).value))}
              class="flex-1"
            />
            <span class="np-copy-subtle text-sm w-8 text-right tabular-nums">{localMinScore}</span>
            {savingScore && (
              <svg class="w-3.5 h-3.5 animate-spin np-copy-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Report intervals */}
      {reportInterval !== null && (
        <div class="space-y-3">
          <label class="block">Auto-generate reports every</label>
          <select
            class="np-control np-control-select select-styled"
            value={reportInterval}
            onChange={(e) => {
              const v = Number((e.target as HTMLSelectElement).value)
              setReportInterval(v)
              setSavingIntervals(true)
              api('/ai/settings/intervals', { method: 'PUT', body: JSON.stringify({ reportIntervalHours: v }) })
                .finally(() => setSavingIntervals(false))
            }}
          >
            <option value="0">Manual only</option>
            <option value="6">6 hours</option>
            <option value="12">12 hours</option>
            <option value="24">24 hours</option>
            <option value="48">2 days</option>
          </select>
          {reportInterval != null && reportInterval > 0 && reportAtHour !== null && (
            <>
              <label class="block">Generate report at</label>
              <select
                class="np-control np-control-select select-styled"
                value={reportAtHour}
                onChange={(e) => {
                  const localH = Number((e.target as HTMLSelectElement).value)
                  setReportAtHour(localH)
                  // Convert local hour to UTC for storage
                  const utcH = (localH + new Date().getTimezoneOffset() / 60 + 24) % 24
                  setSavingIntervals(true)
                  api('/ai/settings/intervals', { method: 'PUT', body: JSON.stringify({ reportAtHour: Math.round(utcH) }) })
                    .finally(() => setSavingIntervals(false))
                }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}</option>
                ))}
              </select>
            </>
          )}
          {savingIntervals && <span class="np-copy-muted text-xs">Saving...</span>}
        </div>
      )}

      {/* Quick instruction input */}
      <div>
        <label class="mb-1 block">Tell the AI what you want to see</label>
        <div class="flex gap-2">
          <input
            type="text"
            class="np-control min-w-0 flex-1"
            placeholder='e.g. "show me more memes", "less crypto"'
            value={instruction}
            onInput={(e) => setInstruction((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addInstruction() }}
          />
          <button type="button" onClick={addInstruction} disabled={!instruction.trim()}
            class="np-button np-button-secondary disabled:opacity-50 shrink-0">Add</button>
        </div>
      </div>

      {/* Pending changes */}
      {hasPending && (
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="np-copy-muted text-xs">
              Pending changes ({internals.pendingNudges.length + internals.pendingInstructions.length})
              {!regenerating && (internals.isApplying
                ? <span> · applying now...</span>
                : internals.autoApplyAt && <Countdown targetMs={internals.autoApplyAt} prefix=" · auto-applies in " expiredLabel=" · applying soon..." />)}
            </span>
            <button type="button" onClick={regenerate} disabled={regenerating}
              class="np-button np-button-primary np-button-small disabled:opacity-50 whitespace-nowrap">
              {regenerating ? 'Applying...' : 'Apply now'}
            </button>
          </div>
          {regenerating && regenStatus && (
            <div class="flex items-center gap-2 text-xs np-copy-muted">
              <svg class="w-3.5 h-3.5 animate-spin shrink-0 np-link-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {regenStatus}
            </div>
          )}

          {internals.pendingInstructions.map((p) => (
            <div key={p.id} class="np-inline-card np-inline-card-row">
              <span class="np-copy-subtle text-sm">"{p.instruction}"</span>
              <button type="button" onClick={() => removeInstruction(p.id)}
                class="np-link-muted text-xs ml-2 shrink-0">&times;</button>
            </div>
          ))}

          {internals.pendingNudges.map((n) => (
            <div key={n.id} class="np-inline-card flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-xs mb-0.5">
                  <span class={`font-medium ${n.direction === 'up' ? 'np-link-accent' : 'np-copy-danger'}`}>
                    {n.direction === 'up' ? 'More like' : 'Less like'}
                  </span>{' '}
                  <span class="np-copy-muted">@{n.authorHandle}</span>
                </p>
                <p class="np-copy-subtle text-sm line-clamp-2">{n.tweetContent}</p>
              </div>
              <button type="button" onClick={() => removeNudge(n.tweetId)}
                class="np-link-muted text-sm mt-0.5 shrink-0">&times;</button>
            </div>
          ))}
        </div>
      )}

      {!hasPending && (
        <p class="np-copy-muted text-xs">No pending changes. Use thumbs up/down on posts or add instructions above to tune the AI.</p>
      )}

      {internals.lastRegenAt && (
        <p class="np-copy-muted text-xs">Last regenerated: {new Date(internals.lastRegenAt).toLocaleString()}</p>
      )}

      {/* Current prompt (collapsible + editable) */}
      <div>
        <div class="flex items-center gap-2">
          <button type="button" onClick={() => setShowPrompt(!showPrompt)}
            class="np-link-muted text-xs">
            {showPrompt ? 'Hide' : 'Show'} current prompt
          </button>
          {showPrompt && !editingPrompt && (
            <button type="button" onClick={() => { setPromptDraft(internals.currentPrompt || internals.defaultPrompt); setEditingPrompt(true) }}
              class="np-link-muted text-xs">Edit</button>
          )}
        </div>
        {showPrompt && !editingPrompt && (
          <pre class="np-inline-code mt-2 text-xs whitespace-pre-wrap overflow-auto max-h-60 scrollbar-dark">
            {internals.currentPrompt || internals.defaultPrompt}
          </pre>
        )}
        {editingPrompt && (
          <div class="mt-2">
            <textarea
              class="np-control np-control-textarea text-xs scrollbar-dark"
              value={promptDraft}
              onInput={(e) => setPromptDraft((e.target as HTMLTextAreaElement).value)}
            />
            <div class="flex items-center gap-2 mt-2">
              <button
                type="button"
                disabled={savingPrompt}
                onClick={async () => {
                  setSavingPrompt(true)
                  try {
                    await api('/ai/settings/prompt', { method: 'PUT', body: JSON.stringify({ systemPrompt: promptDraft }) })
                    setEditingPrompt(false)
                    refetch()
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Failed to save prompt')
                  } finally {
                    setSavingPrompt(false)
                  }
                }}
                class="np-button np-button-primary np-button-small disabled:opacity-50"
              >
                {savingPrompt ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditingPrompt(false)}
                class="np-button np-button-secondary np-button-small"
              >
                Cancel
              </button>
            </div>
          </div>
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
        <p class="np-alert np-alert-error">{error}</p>
      )}

      {newKey && (
        <div class="np-alert np-alert-success">
          <p class="mb-1">
            Copy this key now — it won't be shown again:
          </p>
          <code class="np-inline-code break-all select-all">
            {newKey}
          </code>
          <button
            type="button"
            onClick={() => setNewKey('')}
            class="np-link-muted mt-2 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      <div class="flex gap-2">
        <input
          type="text"
          class="np-control flex-1"
          placeholder="Key name (e.g., CLI, CI)"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <button
          type="button"
          onClick={createKey}
          disabled={!name}
          class="np-button np-button-secondary disabled:opacity-50"
        >
          Create
        </button>
      </div>

      <div class="space-y-2">
        {keys?.map((k: any) => (
          <div
            key={k.id}
            class="np-inline-card np-inline-card-row"
          >
            <div>
              <span class="np-copy-subtle text-sm">{k.name}</span>
              <span class="ml-2 text-xs np-copy-muted font-mono">{k.prefix}...</span>
              {k.lastUsedAt && (
                <span class="ml-2 text-xs np-copy-muted">
                  Last used: {new Date(k.lastUsedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => deleteKey(k.id)}
              class="np-button np-button-danger np-button-small"
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
  useNewspaperActive()
  return (
    <NewspaperShell leftControls={<NewspaperRouteControls current="settings" />} showMeta={false}>
      <div class="np-settings-grid">
        <article class="np-article np-settings-card np-settings-card-wide">
          <SettingsOverview xConnected={xConnected} />
        </article>
        <article class="np-article np-settings-card">
          <XSection onXChange={onXChange} />
        </article>
        {xConnected && (
          <>
            <article class="np-article np-settings-card">
              <FetchIntervalSection />
            </article>
            <article class="np-article np-settings-card">
              <AiSection />
            </article>
            <article class="np-article np-settings-card np-settings-card-wide">
              <AiTuningSection />
            </article>
            <article class="np-article np-settings-card">
              <ApiKeysSection />
            </article>
          </>
        )}
        {!singleUser && (
          <article class="np-article np-settings-card">
            <div class="space-y-4">
              <h3 class="font-medium">Session</h3>
              <p class="np-copy-muted text-sm">Sign out of this Omens session on this device.</p>
              <div>
                <button
                  type="button"
                  onClick={onLogout}
                  class="np-button np-button-secondary"
                >
                  Log out
                </button>
              </div>
            </div>
          </article>
        )}
      </div>
    </NewspaperShell>
  )
}
