import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { useLocation } from 'wouter-preact'
import { api, API_BASE } from '../helpers/api'
import { Countdown } from '../helpers/components'
import { useApi, useScoringFeeds, type ScoringFeed } from '../helpers/hooks'
import { NewspaperRouteControls, NewspaperShell, useNewspaperActive } from '../helpers/newspaper-shell'
import { SetupStateBlock } from '../helpers/setup-state'
import { Spinner } from '../helpers/spinner'
import { THEME_OPTIONS, useThemePreference } from '../helpers/theme'

function SettingsBlockIntro({
  title,
  description,
  compact = false,
}: {
  title: string
  description?: string
  compact?: boolean
}) {
  if (compact) {
    return (
      <div class="np-settings-item-head">
        <p class="np-settings-item-title">{title}</p>
        {description && <p class="np-settings-item-copy">{description}</p>}
      </div>
    )
  }

  return (
    <>
      <h3>{title}</h3>
      {description && <p class="np-copy-muted">{description}</p>}
    </>
  )
}

function SettingsItem({
  title,
  copy,
  actions,
  children,
}: {
  title?: ComponentChildren
  copy?: ComponentChildren
  actions?: ComponentChildren
  children?: ComponentChildren
}) {
  return (
    <div class="np-settings-item">
      {(title || copy || actions) && (
        <div class="np-settings-item-row">
          <div class="np-settings-item-main">
            {title && <p class="np-settings-item-title">{title}</p>}
            {copy}
          </div>
          {actions && <div class="np-settings-item-actions">{actions}</div>}
        </div>
      )}
      {children && <div class="np-settings-item-body">{children}</div>}
    </div>
  )
}

// === X Section ===

function XSection({ onXChange, compact = false }: { onXChange: () => void; compact?: boolean }) {
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

  if (sessionLoading) return <Spinner class={compact ? 'py-2' : undefined} />

  if (session?.connected) {
    return (
      <div class={compact ? 'np-settings-item' : 'np-settings-subsection'}>
        {!compact && <h3>X Account</h3>}
        {error && (
          <p class="np-alert np-alert-error">{error}</p>
        )}
        {compact ? (
          <SettingsItem
            title={<>X <span class="np-settings-item-copy-inline">({session.username})</span></>}
            actions={(
              <>
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
              </>
            )}
          >
            {showReconnect && (
              <div class="np-settings-fields">
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
                  placeholder="X handle (optional)"
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
                <div class="np-settings-inline">
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
          </SettingsItem>
        ) : (
          <div class="np-inline-card np-inline-card-row">
            <div class="min-w-0">
              <p class="np-copy-subtle">
                Connected as <span class="np-copy-strong">{session.username}</span>
              </p>
            </div>
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
        )}
        {!compact && showReconnect && (
          <div class="np-inline-card np-settings-subsection">
            {!compact && <p class="np-copy-muted">Re-enter credentials to refresh the session without losing posts.</p>}
            <div class="np-settings-subsection">
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
                placeholder="X handle (optional)"
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
            </div>
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
    <div class={compact ? 'np-settings-item' : 'np-settings-subsection'}>
      <SettingsBlockIntro
        title="X"
        compact={compact}
      />

      {sessionError && (
        <p class="np-alert np-alert-error">Couldn&apos;t verify your saved X session. Reconnect below.</p>
      )}
      {error && (
        <p class="np-alert np-alert-error">{error}</p>
      )}

      <div class={compact ? 'np-settings-item-body' : 'np-settings-subsection'}>
        <div class={compact ? 'np-settings-fields' : 'np-settings-subsection'}>
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
        </div>
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

// === Reddit RSS Section ===

type InputSummary = {
  id: string
  provider: string
  kind: string
  name: string
  enabled: boolean
  pollIntervalMinutes: number
  lastFetchedAt: string | null
  lastError: string | null
  config?: {
    type?: string
    sourceProvider?: string | null
    sourceKey?: string | null
    sourceLabel?: string | null
    listingType?: string | null
    timeRange?: string | null
    feedUrl?: string | null
  } | null
}

function formatInputTimestamp(value: string | null | undefined) {
  if (!value) return 'Not synced yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not synced yet'
  return `Last synced ${parsed.toLocaleString()}`
}

function formatRedditInputLabel(input: InputSummary) {
  const baseLabel = input.config?.sourceLabel || input.name
  const listingType = input.config?.listingType
  if (!listingType) return baseLabel

  const listingLabel = listingType === 'top'
    ? `Top${input.config?.timeRange ? ` (${input.config.timeRange})` : ''}`
    : listingType[0].toUpperCase() + listingType.slice(1)

  return `${baseLabel} · ${listingLabel}`
}

function RedditSection({ onSourcesChange, compact = false }: { onSourcesChange: () => void; compact?: boolean }) {
  const { data, loading: inputsLoading, error: inputsError, refetch } = useApi<{ inputs: InputSummary[] }>('/inputs')
  const [subreddit, setSubreddit] = useState('')
  const [listingType, setListingType] = useState<'hot' | 'new' | 'top'>('new')
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('week')
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const redditInputs = (data?.inputs || []).filter(
    (input) => input.provider === 'rss' && input.kind === 'reddit_subreddit' && input.config?.sourceProvider === 'reddit',
  )

  const addSubreddit = async () => {
    setError('')
    setSaving(true)
    try {
      await api('/inputs/rss/reddit', {
        method: 'POST',
        body: JSON.stringify({
          subreddit,
          listingType,
          ...(listingType === 'top' ? { timeRange } : {}),
        }),
      })
      setSubreddit('')
      setShowAddForm(false)
      await refetch()
      onSourcesChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add subreddit')
    } finally {
      setSaving(false)
    }
  }

  const removeInput = async (id: string) => {
    setError('')
    try {
      await api(`/inputs/${id}`, { method: 'DELETE' })
      await refetch()
      onSourcesChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove subreddit')
    }
  }

  if (inputsLoading) return <Spinner class={compact ? 'py-2' : undefined} />

  if (compact) {
    return (
      <SettingsItem title="Reddit Subreddits">
        {inputsError && <p class="np-alert np-alert-error">Couldn&apos;t load your current inputs.</p>}
        {error && <p class="np-alert np-alert-error">{error}</p>}

        <div class="np-settings-pill-row">
          {redditInputs.map((input) => (
            <div
              key={input.id}
              class={`np-settings-pill${input.enabled ? '' : ' is-disabled'}`}
              title={formatRedditInputLabel(input)}
            >
              <span class="np-settings-pill-label">
                {formatRedditInputLabel(input)}
              </span>
              <button
                type="button"
                onClick={() => removeInput(input.id)}
                class="np-settings-pill-remove"
                aria-label={`Remove ${input.config?.sourceLabel || input.name}`}
                title="Remove subreddit"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setShowAddForm((value) => !value)}
            class="np-settings-pill np-settings-pill-add"
          >
            + Add subreddit
          </button>
        </div>

        {showAddForm && (
          <div class="np-settings-fields">
            <div class="np-settings-pill-form-row">
              <input
                type="text"
                class="np-control flex-1"
                placeholder="Subreddit, e.g. programming"
                value={subreddit}
                onInput={(e) => setSubreddit((e.target as HTMLInputElement).value)}
              />
              <div class="np-settings-inline-select-wrap">
                <select
                  class="np-control np-control-select select-styled np-settings-inline-select"
                  value={listingType}
                  onChange={(e) => setListingType((e.target as HTMLSelectElement).value as 'hot' | 'new' | 'top')}
                  aria-label="Subreddit listing"
                >
                  <option value="new">New</option>
                  <option value="hot">Hot</option>
                  <option value="top">Top</option>
                </select>
                <span class="np-settings-inline-select-indicator" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none">
                    <path d="M6 8l4 4 4-4" />
                  </svg>
                </span>
              </div>
            </div>
            {listingType === 'top' && (
              <div class="np-settings-inline">
                <span class="np-settings-item-copy">Top window</span>
                <div class="np-settings-inline-select-wrap">
                  <select
                    class="np-control np-control-select select-styled np-settings-inline-select"
                    value={timeRange}
                    onChange={(e) => setTimeRange((e.target as HTMLSelectElement).value as 'day' | 'week' | 'month' | 'year' | 'all')}
                    aria-label="Top time range"
                  >
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                    <option value="all">All time</option>
                  </select>
                  <span class="np-settings-inline-select-indicator" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none">
                      <path d="M6 8l4 4 4-4" />
                    </svg>
                  </span>
                </div>
              </div>
            )}
            <div class="np-settings-inline">
              <button
                type="button"
                onClick={addSubreddit}
                disabled={saving || !subreddit.trim()}
                class="np-button np-button-primary disabled:opacity-50"
              >
                {saving ? 'Adding…' : 'Add subreddit'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                class="np-button np-button-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!showAddForm && redditInputs.length === 0 && (
          <p class="np-settings-item-copy">No subreddit feeds yet.</p>
        )}
      </SettingsItem>
    )
  }

  const form = (
    <>
      {inputsError && <p class="np-alert np-alert-error">Couldn&apos;t load your current inputs.</p>}
      {error && <p class="np-alert np-alert-error">{error}</p>}

      <div class={compact ? 'np-settings-fields' : 'np-settings-subsection'}>
        <input
          type="text"
          class="np-control"
          placeholder="Subreddit, e.g. programming"
          value={subreddit}
          onInput={(e) => setSubreddit((e.target as HTMLInputElement).value)}
        />
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="np-settings-field">
            <span class="np-settings-item-copy">Listing</span>
            <select
              class="np-control"
              value={listingType}
              onChange={(e) => setListingType((e.target as HTMLSelectElement).value as 'hot' | 'new' | 'top')}
            >
              <option value="new">New</option>
              <option value="hot">Hot</option>
              <option value="top">Top</option>
            </select>
          </label>
          {listingType === 'top' && (
            <label class="np-settings-field">
              <span class="np-settings-item-copy">Top window</span>
              <select
                class="np-control"
                value={timeRange}
                onChange={(e) => setTimeRange((e.target as HTMLSelectElement).value as 'day' | 'week' | 'month' | 'year' | 'all')}
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
                <option value="all">All time</option>
              </select>
            </label>
          )}
        </div>
      </div>

      <div class="np-settings-inline">
        <button
          type="button"
          onClick={addSubreddit}
          disabled={saving || !subreddit.trim()}
          class="np-button np-button-primary disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add subreddit'}
        </button>
      </div>

      <div class="space-y-3">
        {redditInputs.length === 0 ? (
          <p class="np-copy-muted">No subreddit feeds yet. Add one above to pull public Reddit posts over RSS.</p>
        ) : redditInputs.map((input) => (
          <div class="np-inline-card np-inline-card-row" key={input.id}>
            <div class="min-w-0">
              <p class="np-copy-strong">
                {input.config?.sourceLabel || input.name}
                {input.config?.listingType && (
                  <span class="np-copy-subtle"> · {input.config.listingType}{input.config.timeRange ? ` (${input.config.timeRange})` : ''}</span>
                )}
              </p>
              <p class="np-copy-muted">{formatInputTimestamp(input.lastFetchedAt)}</p>
              {input.lastError && <p class="np-alert np-alert-error mt-2">{input.lastError}</p>}
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleInput(input)}
                class="np-button np-button-secondary np-button-small whitespace-nowrap"
              >
                {input.enabled ? 'Pause' : 'Enable'}
              </button>
              <button
                type="button"
                onClick={() => removeInput(input.id)}
                class="np-button np-button-danger np-button-small whitespace-nowrap"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )

  return (
    <div class="np-settings-subsection">
      <SettingsBlockIntro
        title="Reddit Subreddits"
        description="Add public subreddits as RSS-backed inputs. Omens stores them as Reddit posts, but the ingestion path is generic RSS so non-Reddit feeds can fit next."
        compact={compact}
      />
      {form}
    </div>
  )
}

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

function ThemeSection({ compact = false }: { compact?: boolean } = {}) {
  const { theme, setTheme } = useThemePreference()

  if (compact) {
    return (
      <SettingsItem
        title="Theme"
        actions={THEME_OPTIONS.map((option) => (
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
      />
    )
  }

  return (
    <div class="np-settings-subsection">
      <SettingsBlockIntro
        title="Edition Theme"
        description="Choose the newspaper palette for Omens across report, feed, and settings."
      />
      <div class="np-inline-card np-inline-card-row">
        <div class="min-w-0">
          <p class="np-copy-subtle">
            Theme: <span class="np-copy-strong">{theme === 'light' ? 'Light' : 'Dark'}</span>
          </p>
        </div>
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

function VersionSection({ compact = false }: { compact?: boolean } = {}) {
  const { data: versionData } = useApi<{ version: string }>('/version')

  if (!versionData?.version) return null

  if (compact) {
    return (
      <SettingsItem
        title="Build"
        actions={<p class="np-settings-item-copy">v{versionData.version}</p>}
      />
    )
  }

  return (
    <div class="np-inline-card">
      <>
        <p class="np-copy-subtle">Build version</p>
        <p class="np-copy-muted mt-1">Running Docker build v{versionData.version}</p>
      </>
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

export function AiSection({ onSave, compact = false }: { onSave?: () => void; compact?: boolean } = {}) {
  const { data: settings, loading: settingsLoading, error: settingsError, refetch } = useApi<AiSettingsData>('/ai/settings')
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
      <div class={compact ? 'np-settings-item' : 'np-settings-subsection'}>
        {!compact && <h3>AI Provider</h3>}
        {error && <p class="np-alert np-alert-error">{error}</p>}
        {compact ? (
          <SettingsItem
            title="AI Provider"
            copy={(
              <>
                <p class="np-settings-item-copy">{providerName}</p>
                <p class="np-settings-item-copy np-settings-truncate">{settings.model}</p>
              </>
            )}
            actions={(
              <button
                type="button"
                onClick={() => { setEditing(true); fetchSavedModels() }}
                class="np-button np-button-secondary np-button-small whitespace-nowrap"
              >
                Change
              </button>
            )}
          />
        ) : (
          <div class="np-inline-card np-inline-card-row">
            <div class="min-w-0 flex-1">
              <p class="np-copy-subtle">
                {providerName} &middot; <span class="np-copy-strong">{settings.model}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setEditing(true); fetchSavedModels() }}
              class="np-button np-button-secondary np-button-small whitespace-nowrap"
            >
              Change
            </button>
          </div>
        )}
      </div>
    )
  }

  const showBaseUrl = provider === 'ollama' || provider === 'openrouter'

  if (settingsLoading && !settings && !settingsError) {
    return (
      <div class="np-settings-subsection">
        {!compact && <h3>AI Provider</h3>}
        <Spinner class={compact ? 'py-2' : 'py-4'} />
      </div>
    )
  }

  // Setup / edit form
  return (
    <div class={compact ? 'np-settings-item' : 'np-settings-subsection'}>
      <SettingsBlockIntro
        title="AI Provider"
        compact={compact}
      />

      {settingsError && <p class="np-alert np-alert-error">Couldn&apos;t load saved AI settings. Re-enter them below.</p>}
      {error && <p class="np-alert np-alert-error">{error}</p>}
      {provider === 'ollama' && (
        <p class="np-setup-hint">Ollama runs locally, so no API key is needed. Set a base URL only if it is not on `http://localhost:11434`.</p>
      )}
      {error && (
        <p class="np-setup-hint">Check the provider, API key, base URL, and model access. Some providers only return model lists for fully valid keys.</p>
      )}

      <div class={compact ? 'np-settings-item-body' : 'np-settings-subsection'}>
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
            <div class="flex flex-wrap gap-2">
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
            <input
              type="text"
              class="np-control"
              list={models.length > 0 ? 'ai-model-suggestions' : undefined}
              placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
              value={model}
              onInput={(e) => setModel((e.target as HTMLInputElement).value)}
            />
            {models.length > 0 && (
              <>
                <datalist id="ai-model-suggestions">
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </datalist>
                <p class="np-copy-muted mt-1">You can type any model manually or pick one of the fetched suggestions.</p>
              </>
            )}
          </div>
        )}

        {provider && (
          <div class="flex flex-wrap gap-2">
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

function SettingsOverview({ sourceConnected }: { sourceConnected: boolean }) {
  const { data: aiSettings, loading: aiSettingsLoading } = useApi<Pick<AiSettingsData, 'configured' | 'provider' | 'model'>>('/ai/settings')

  if (sourceConnected && aiSettingsLoading && !aiSettings) {
    return (
      <SetupStateBlock
        kicker="Setup Status"
        title="Loading your edition"
        intro="Checking your sources and AI configuration before rendering settings."
        steps={[
          {
            label: 'Resolve saved connections',
            detail: 'Verifying connected sources and edition settings.',
            state: 'active',
          },
          {
            label: 'Render your controls',
            detail: 'Settings will appear once the current edition state is loaded.',
            state: 'pending',
          },
        ]}
      >
        <Spinner class="py-4" />
      </SetupStateBlock>
    )
  }

  const aiReady = !!aiSettings?.configured
  const providerName = aiSettings?.provider
    ? (AI_PROVIDERS.find((p) => p.id === aiSettings.provider)?.name || aiSettings.provider)
    : null

  return (
    <div class="np-settings-inline">
      <span class={`np-settings-status-badge ${sourceConnected && aiReady ? 'is-done' : sourceConnected ? 'is-live' : 'is-later'}`}>
        {sourceConnected && aiReady ? 'Ready' : sourceConnected ? 'Setup' : 'Start'}
      </span>
      <p class="np-settings-item-copy">
        {sourceConnected && aiReady
          ? `Sources connected. ${providerName || 'AI'} is configured.`
          : sourceConnected
            ? 'Sources connected. Configure AI provider next.'
            : 'Connect a source, then configure an AI provider.'}
      </p>
    </div>
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

const FETCH_INTERVAL_OPTIONS = [
  { value: 0, label: 'Manual only' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
] as const

function FetchIntervalSection({ compact = false }: { compact?: boolean } = {}) {
  const { data: settings } = useApi<{ fetchIntervalMinutes?: number }>('/ai/settings')
  const [fetchInterval, setFetchInterval] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings?.fetchIntervalMinutes != null && fetchInterval === null) setFetchInterval(settings.fetchIntervalMinutes)
  }, [settings, fetchInterval])

  if (fetchInterval === null) return null

  const currentIntervalLabel = FETCH_INTERVAL_OPTIONS.find((option) => option.value === fetchInterval)?.label || `${fetchInterval} minutes`

  const updateInterval = (value: number) => {
    setFetchInterval(value)
    setSaving(true)
    api('/ai/settings/intervals', { method: 'PUT', body: JSON.stringify({ fetchIntervalMinutes: value }) })
      .finally(() => setSaving(false))
  }

  if (compact) {
    return (
      <SettingsItem
        title="Auto-fetch posts"
        actions={(
          <div class="np-settings-inline">
            <div class="np-settings-inline-select-wrap">
              <select
                class="np-control np-control-select select-styled np-settings-inline-select"
                value={fetchInterval}
                onChange={(e) => updateInterval(Number((e.target as HTMLSelectElement).value))}
                aria-label="Auto-fetch interval"
              >
                {FETCH_INTERVAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <span class="np-settings-inline-select-indicator" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                  <path d="M6 8l4 4 4-4" />
                </svg>
              </span>
            </div>
            {saving && <span class="np-settings-item-copy">Saving...</span>}
          </div>
        )}
      />
    )
  }

  return (
    <div class="np-settings-subsection">
      <h3>Auto-fetch</h3>
      <div class="np-settings-subsection">
        <div class="min-w-0">
          <label class="block">Fetch new posts every</label>
        </div>
        <div class="flex items-center gap-2">
          <select
            class="np-control np-control-select select-styled min-w-[11rem]"
            value={fetchInterval}
            onChange={(e) => updateInterval(Number((e.target as HTMLSelectElement).value))}
          >
            {FETCH_INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {saving && <span class="np-copy-muted">Saving...</span>}
        </div>
      </div>
    </div>
  )
}

function FeedTuningEditor({
  feed,
  refetchFeeds,
}: {
  feed: ScoringFeed
  refetchFeeds: () => void
}) {
  const feedId = feed.id
  const { data: internals, refetch } = useApi<InternalsData>(`/ai/internals?feedId=${encodeURIComponent(feedId)}`)
  const [instruction, setInstruction] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regenStatus, setRegenStatus] = useState('')
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [feedName, setFeedName] = useState(feed.name)
  const [feedIcon, setFeedIcon] = useState(feed.icon)
  const [savingFeedMeta, setSavingFeedMeta] = useState(false)
  const [deletingFeed, setDeletingFeed] = useState(false)
  const [localMinScore, setLocalMinScore] = useState<number | null>(feed.minScore)
  const [reportInterval, setReportInterval] = useState<number | null>(feed.reportIntervalHours)
  const [reportAtHour, setReportAtHour] = useState<number | null>(null)
  const [savingScore, setSavingScore] = useState(false)
  const [savingIntervals, setSavingIntervals] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const regenAbortRef = useRef<AbortController | null>(null)
  const [error, setError] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const id = setInterval(refetch, 30_000)
    return () => clearInterval(id)
  }, [refetch])

  useEffect(() => {
    setFeedName(feed.name)
    setFeedIcon(feed.icon)
    setLocalMinScore(feed.minScore)
    setReportInterval(feed.reportIntervalHours)
    const localH = (feed.reportAtHour + 24 - new Date().getTimezoneOffset() / 60) % 24
    setReportAtHour(Math.round(localH))
    setPromptDraft(feed.systemPrompt || '')
    setInstruction('')
    setShowPrompt(false)
    setEditingPrompt(false)
    setError('')
  }, [feed])

  const saveFeedPatch = useCallback(async (patch: Partial<{
    name: string
    icon: string
    systemPrompt: string
    minScore: number
    reportIntervalHours: number
    reportAtHour: number
  }>) => {
    if (localMinScore === null || reportInterval === null || reportAtHour === null) return
    const utcH = (reportAtHour + new Date().getTimezoneOffset() / 60 + 24) % 24
    await api(`/ai/feeds/${feedId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: patch.name ?? feedName,
        icon: patch.icon ?? feedIcon,
        systemPrompt: patch.systemPrompt ?? promptDraft,
        minScore: patch.minScore ?? localMinScore,
        reportIntervalHours: patch.reportIntervalHours ?? reportInterval,
        reportAtHour: patch.reportAtHour ?? Math.round(utcH),
      }),
    })
    refetchFeeds()
    refetch()
  }, [feedIcon, feedId, feedName, localMinScore, promptDraft, refetch, refetchFeeds, reportAtHour, reportInterval])

  const onSliderChange = (val: number) => {
    setLocalMinScore(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSavingScore(true)
      try {
        await saveFeedPatch({ minScore: val })
      } catch {}
      setSavingScore(false)
    }, 500)
  }

  const addInstruction = async () => {
    if (!instruction.trim()) return
    setError('')
    try {
      await api('/ai/prompt-change', { method: 'POST', body: JSON.stringify({ instruction: instruction.trim(), feedId }) })
      setInstruction('')
      refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add instruction')
    }
  }

  const removeNudge = async (tweetId: string) => {
    await api(`/ai/nudge/${tweetId}?feedId=${encodeURIComponent(feedId)}`, { method: 'DELETE' }).catch(() => {})
    refetch()
  }

  const removeInstruction = async (id: string) => {
    await api(`/ai/prompt-change/${id}`, { method: 'DELETE' }).catch(() => {})
    refetch()
  }

  const connectToRegenStream = useCallback(() => {
    regenAbortRef.current?.abort()
    const controller = new AbortController()
    regenAbortRef.current = controller
    setRegenerating(true)
    fetch(`${API_BASE}/ai/regenerate-stream?feedId=${encodeURIComponent(feedId)}`, { credentials: 'include', signal: controller.signal })
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
  }, [feedId, refetch])

  useEffect(() => {
    api<{ active: boolean; status: string | null }>(`/ai/regenerate-status?feedId=${encodeURIComponent(feedId)}`)
      .then((s) => {
        if (s.active) {
          setRegenStatus(s.status || 'Applying...')
          connectToRegenStream()
        }
      })
      .catch(() => {})
  }, [connectToRegenStream, feedId])

  const regenerate = async () => {
    setRegenerating(true)
    setRegenStatus('Starting...')
    setError('')
    try {
      await api(`/ai/regenerate-prompt?feedId=${encodeURIComponent(feedId)}`, { method: 'POST' })
      connectToRegenStream()
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Failed to regenerate')
      setRegenerating(false)
      setRegenStatus('')
    }
  }

  if (!internals) {
    return (
      <section class="np-settings-section">
        <Spinner class="py-4" />
      </section>
    )
  }

  const hasPending = internals.pendingNudges.length > 0 || internals.pendingInstructions.length > 0

  return (
    <section class="np-settings-section">
      {error && <p class="np-alert np-alert-error">{error}</p>}
      <div class="np-settings-section-items">
        <SettingsItem
          title={`${feed.icon} ${feed.name}${feed.isMain ? ' · Main feed' : ''}`}
          actions={!feed.isMain ? (
            <button
              type="button"
              disabled={deletingFeed}
              onClick={async () => {
                setDeletingFeed(true)
                setError('')
                try {
                  await api(`/ai/feeds/${feed.id}`, { method: 'DELETE' })
                  refetchFeeds()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed to delete feed')
                } finally {
                  setDeletingFeed(false)
                }
              }}
              class="np-button np-button-danger np-button-small disabled:opacity-50"
            >
              {deletingFeed ? 'Removing...' : 'Remove'}
            </button>
          ) : undefined}
        >
          <div class="np-settings-fields">
            <div class="np-settings-form-grid np-settings-form-grid-feed">
              <div>
                <label class="block">Icon</label>
                <input
                  type="text"
                  class="np-control text-center"
                  maxLength={8}
                  value={feedIcon}
                  onInput={(e) => setFeedIcon((e.target as HTMLInputElement).value)}
                />
              </div>
              <div>
                <label class="block">Feed name</label>
                <input
                  type="text"
                  class="np-control"
                  value={feedName}
                  onInput={(e) => setFeedName((e.target as HTMLInputElement).value)}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={savingFeedMeta || !feedName.trim() || !feedIcon.trim()}
              onClick={async () => {
                setSavingFeedMeta(true)
                setError('')
                try {
                  await saveFeedPatch({ name: feedName.trim(), icon: feedIcon.trim() })
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed to save feed details')
                } finally {
                  setSavingFeedMeta(false)
                }
              }}
              class="np-button np-button-secondary np-button-small disabled:opacity-50"
            >
              {savingFeedMeta ? 'Saving...' : 'Save feed details'}
            </button>
          </div>
        </SettingsItem>

        {localMinScore !== null && (
          <SettingsItem title={`Min relevance for ${feed.name}`}>
            <div class="np-settings-inline">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={localMinScore}
                onInput={(e) => onSliderChange(Number((e.target as HTMLInputElement).value))}
                class="flex-1"
              />
              <span class="np-settings-item-copy">{localMinScore}</span>
              {savingScore && (
                <svg class="w-3.5 h-3.5 animate-spin np-copy-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </div>
          </SettingsItem>
        )}

        {reportInterval !== null && (
          <SettingsItem title="Report schedule">
            <div class="np-settings-fields">
              <div>
                <label class="block">Auto-generate reports for {feed.name} every</label>
                <select
                  class="np-control np-control-select select-styled"
                  value={reportInterval}
                  onChange={(e) => {
                    const v = Number((e.target as HTMLSelectElement).value)
                    setReportInterval(v)
                    setSavingIntervals(true)
                    saveFeedPatch({ reportIntervalHours: v }).finally(() => setSavingIntervals(false))
                  }}
                >
                  <option value="0">Manual only</option>
                  <option value="6">6 hours</option>
                  <option value="12">12 hours</option>
                  <option value="24">24 hours</option>
                  <option value="48">2 days</option>
                </select>
              </div>
              {reportInterval > 0 && reportAtHour !== null && (
                <div>
                  <label class="block">Generate report at</label>
                  <select
                    class="np-control np-control-select select-styled"
                    value={reportAtHour}
                    onChange={(e) => {
                      const localH = Number((e.target as HTMLSelectElement).value)
                      setReportAtHour(localH)
                      const utcH = (localH + new Date().getTimezoneOffset() / 60 + 24) % 24
                      setSavingIntervals(true)
                      saveFeedPatch({ reportAtHour: Math.round(utcH) }).finally(() => setSavingIntervals(false))
                    }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}</option>
                    ))}
                  </select>
                </div>
              )}
              {savingIntervals && <p class="np-settings-item-copy">Saving...</p>}
            </div>
          </SettingsItem>
        )}

        <SettingsItem title={`Tell the AI what you want to see in ${feed.name}`}>
          <div class="np-settings-inline">
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
        </SettingsItem>

        <SettingsItem
          title="Pending changes"
          copy={!hasPending ? 'No pending changes for this feed. Use thumbs up/down on posts or add instructions above to tune it.' : undefined}
          actions={hasPending ? (
            <button type="button" onClick={regenerate} disabled={regenerating}
              class="np-button np-button-primary np-button-small disabled:opacity-50 whitespace-nowrap">
              {regenerating ? 'Applying...' : 'Apply now'}
            </button>
          ) : undefined}
        >
          {hasPending && (
            <div class="np-settings-fields">
              <p class="np-settings-item-copy">
                Pending changes ({internals.pendingNudges.length + internals.pendingInstructions.length})
                {!regenerating && (internals.isApplying
                  ? <span> · applying now...</span>
                  : internals.autoApplyAt && <Countdown targetMs={internals.autoApplyAt} prefix=" · auto-applies in " expiredLabel=" · applying soon..." />)}
              </p>
              {regenerating && regenStatus && (
                <div class="np-settings-inline">
                  <svg class="w-3.5 h-3.5 animate-spin shrink-0 np-link-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span class="np-settings-item-copy">{regenStatus}</span>
                </div>
              )}
              {internals.pendingInstructions.map((p) => (
                <div key={p.id} class="np-settings-item-row">
                  <div class="np-settings-item-main">
                    <span class="np-settings-item-copy">"{p.instruction}"</span>
                  </div>
                  <button type="button" onClick={() => removeInstruction(p.id)}
                    class="np-link-muted shrink-0">&times;</button>
                </div>
              ))}
              {internals.pendingNudges.map((n) => (
                <div key={n.id} class="np-settings-item-row">
                  <div class="np-settings-item-main">
                    <p class="np-settings-item-copy">
                      <span class={n.direction === 'up' ? 'np-link-accent' : 'np-copy-danger'}>
                        {n.direction === 'up' ? 'More like' : 'Less like'}
                      </span>{' '}
                      <span class="np-copy-muted">@{n.authorHandle}</span>
                    </p>
                    <p class="np-settings-item-copy line-clamp-2">{n.tweetContent}</p>
                  </div>
                  <button type="button" onClick={() => removeNudge(n.tweetId)}
                    class="np-link-muted shrink-0">&times;</button>
                </div>
              ))}
            </div>
          )}
        </SettingsItem>

        <SettingsItem
          title="Prompt"
          actions={(
            <>
              <button type="button" onClick={() => setShowPrompt(!showPrompt)} class="np-link-muted">
                {showPrompt ? 'Hide' : 'Show'} current prompt
              </button>
              {showPrompt && !editingPrompt && (
                <button type="button" onClick={() => { setPromptDraft(internals.currentPrompt || internals.defaultPrompt); setEditingPrompt(true) }} class="np-link-muted">
                  Edit
                </button>
              )}
            </>
          )}
          copy={internals.lastRegenAt ? `Last regenerated: ${new Date(internals.lastRegenAt).toLocaleString()}` : undefined}
        >
          {showPrompt && !editingPrompt && (
            <pre class="np-inline-code whitespace-pre-wrap overflow-auto max-h-60 scrollbar-dark">
              {internals.currentPrompt || internals.defaultPrompt}
            </pre>
          )}
          {editingPrompt && (
            <div class="np-settings-fields">
              <textarea
                class="np-control np-control-textarea scrollbar-dark"
                value={promptDraft}
                onInput={(e) => setPromptDraft((e.target as HTMLTextAreaElement).value)}
              />
              <div class="np-settings-inline">
                <button
                  type="button"
                  disabled={savingPrompt}
                  onClick={async () => {
                    setSavingPrompt(true)
                    try {
                      await saveFeedPatch({ systemPrompt: promptDraft })
                      setEditingPrompt(false)
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
        </SettingsItem>
      </div>
    </section>
  )
}

function AiTuningSection({ compact = false }: { compact?: boolean } = {}) {
  const { data: settings } = useApi<{ configured: boolean }>('/ai/settings')
  const { feeds, loading: feedsLoading, refetch: refetchFeeds } = useScoringFeeds(!!settings?.configured)
  const [showAddFeed, setShowAddFeed] = useState(false)
  const [newFeedName, setNewFeedName] = useState('')
  const [newFeedIcon, setNewFeedIcon] = useState('✦')
  const [creatingFeed, setCreatingFeed] = useState(false)
  const [error, setError] = useState('')

  if (!settings?.configured) return null
  if (feedsLoading && feeds.length === 0) return <Spinner />

  return (
    <div class="np-settings-feed-panel">
      {error && <p class="np-alert np-alert-error">{error}</p>}
      {feeds.map((feed) => (
        <FeedTuningEditor
          key={feed.id}
          feed={feed}
          refetchFeeds={refetchFeeds}
        />
      ))}
      <section class="np-settings-section">
        <div class="np-settings-section-items">
          <SettingsItem
            title="Add new feed"
            actions={(
              <button
                type="button"
                onClick={() => setShowAddFeed((v) => !v)}
                class="np-button np-button-secondary np-button-small whitespace-nowrap"
              >
                {showAddFeed ? 'Close' : 'Add feed'}
              </button>
            )}
          >
            {showAddFeed && (
              <div class="np-settings-fields">
                <div class="np-settings-form-grid np-settings-form-grid-feed">
                  <div>
                    <label class="block">Icon</label>
                    <input
                      type="text"
                      class="np-control text-center"
                      maxLength={8}
                      value={newFeedIcon}
                      onInput={(e) => setNewFeedIcon((e.target as HTMLInputElement).value)}
                    />
                  </div>
                  <div>
                    <label class="block">Name</label>
                    <input
                      type="text"
                      class="np-control"
                      placeholder="e.g. Work, Memes"
                      value={newFeedName}
                      onInput={(e) => setNewFeedName((e.target as HTMLInputElement).value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={creatingFeed || !newFeedName.trim() || !newFeedIcon.trim()}
                  onClick={async () => {
                    setCreatingFeed(true)
                    setError('')
                    try {
                      await api('/ai/feeds', {
                        method: 'POST',
                        body: JSON.stringify({ name: newFeedName.trim(), icon: newFeedIcon.trim() }),
                      })
                      setNewFeedName('')
                      setNewFeedIcon('✦')
                      setShowAddFeed(false)
                      refetchFeeds()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed to create feed')
                    } finally {
                      setCreatingFeed(false)
                    }
                  }}
                  class="np-button np-button-primary disabled:opacity-50"
                >
                  {creatingFeed ? 'Creating...' : 'Create feed'}
                </button>
              </div>
            )}
          </SettingsItem>
        </div>
      </section>
    </div>
  )
}

// === API Keys Section ===

function ApiKeysSection({ compact = false }: { compact?: boolean } = {}) {
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
    <div class={compact ? 'np-settings-item' : 'np-settings-subsection'}>
      {!compact && <h3>API Keys</h3>}

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
            class="np-link-muted mt-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <div class={compact ? 'np-settings-inline' : 'flex flex-wrap gap-2'}>
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
          Create API key
        </button>
      </div>

      <div class={compact ? 'np-settings-item-body' : 'np-settings-subsection'}>
        {!keys?.length && !newKey && (
          <p class="np-settings-item-copy">No API keys yet.</p>
        )}
        {keys?.map((k: any) => (
          <div
            key={k.id}
            class={compact ? 'np-settings-item-row' : 'np-inline-card np-inline-card-row'}
          >
            <div class={compact ? 'np-settings-item-main' : ''}>
              <span class={compact ? 'np-settings-item-title' : 'np-copy-subtle'}>{k.name}</span>
              <span class={compact ? 'np-settings-item-copy' : 'ml-2 np-copy-muted'}>{k.prefix}...</span>
              {k.lastUsedAt && (
                <span class={compact ? 'np-settings-item-copy' : 'ml-2 np-copy-muted'}>
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

function SessionSection({ onLogout, compact = false }: { onLogout: () => void; compact?: boolean }) {
  if (compact) {
    return (
      <SettingsItem
        title="Session"
        actions={(
          <button
            type="button"
            onClick={onLogout}
            class="np-button np-button-secondary np-button-small"
          >
            Log out
          </button>
        )}
      />
    )
  }

  return (
    <div class="np-settings-subsection">
      <SettingsBlockIntro
        title="Session"
      />
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
  )
}

// === Main Settings ===

export function Settings({
  onSourcesChange,
  xChecked,
  sourcesChecked,
  sourceConnected,
  singleUser,
  onLogout,
}: {
  onSourcesChange: () => void
  xChecked: boolean
  sourcesChecked: boolean
  sourceConnected: boolean
  singleUser: boolean
  onLogout: () => void
}) {
  useNewspaperActive()

  if (!xChecked || !sourcesChecked) {
    return (
      <NewspaperShell leftControls={<NewspaperRouteControls current="settings" />} showMeta={false}>
        <div class="np-settings-page">
          <article class="np-settings-section">
            <SetupStateBlock
              kicker="Settings"
              title="Loading your edition"
              intro="Checking connected sources and saved configuration before showing settings."
              steps={[
                {
                  label: 'Resolve source sessions',
                  detail: 'Verifying X access and checking configured inputs.',
                  state: 'active',
                },
                {
                  label: 'Load controls',
                  detail: 'The settings desk appears once the current state is known.',
                  state: 'pending',
                },
              ]}
            >
              <Spinner class="py-4" />
            </SetupStateBlock>
          </article>
        </div>
      </NewspaperShell>
    )
  }

  return (
    <NewspaperShell leftControls={<NewspaperRouteControls current="settings" />} showMeta={false}>
      <div class="np-settings-page">
        <article class="np-settings-section np-settings-status-section">
          <SettingsOverview sourceConnected={sourceConnected} />
        </article>
        <div class="np-settings-flow">
          <div class="np-settings-section-block">
            <p class="np-settings-section-title">Sources</p>
            <section class="np-settings-section">
              <div class="np-settings-section-items">
                <XSection onXChange={onSourcesChange} compact />
                <RedditSection onSourcesChange={onSourcesChange} compact />
              </div>
            </section>
          </div>

          <div class="np-settings-section-block">
            <p class="np-settings-section-title">Basics</p>
            <section class="np-settings-section">
              <div class="np-settings-section-items">
                <ThemeSection compact />
                {sourceConnected ? (
                  <>
                    <FetchIntervalSection compact />
                    <AiSection compact />
                  </>
                ) : (
                  <p class="np-copy-muted">Connect a source to unlock AI setup.</p>
                )}
                <VersionSection compact />
              </div>
            </section>
          </div>

          {sourceConnected && (
            <div class="np-settings-section-block">
              <p class="np-settings-section-title">Feed Tuning</p>
              <AiTuningSection compact />
            </div>
          )}

          <div class="np-settings-section-block">
            <p class="np-settings-section-title">Access</p>
            <section class="np-settings-section">
              <div class="np-settings-section-items">
                <ApiKeysSection compact />
                {!singleUser && <SessionSection onLogout={onLogout} compact />}
              </div>
            </section>
          </div>
        </div>
      </div>
    </NewspaperShell>
  )
}
