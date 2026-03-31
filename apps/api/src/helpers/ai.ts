/**
 * Provider-agnostic AI client.
 * Uses raw fetch() — no SDK dependencies.
 */

import type { AiProvider } from '@omens/shared'

export const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant analyzing a user's X/Twitter feed. Your job is to surface the most important, interesting, and actionable items from the posts below.

Structure your report as:
1. **Key Headlines** — The most important news or developments
2. **Trending Topics** — Themes that multiple people are discussing
3. **Notable Takes** — Interesting opinions or analysis worth reading
4. **Action Items** — Things the user might want to act on or follow up

Be concise but informative. Reference specific posts and authors (@handle) when relevant. Skip low-value content like generic promotions or spam. Use markdown formatting.`

interface AiConfig {
  provider: AiProvider
  apiKey: string
  baseUrl: string
  model: string
}

interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

const PROVIDER_BASE_URLS: Record<AiProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com',
  groq: 'https://api.groq.com/openai/v1',
  xai: 'https://api.x.ai/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  ollama: 'http://localhost:11434',
  openrouter: 'https://openrouter.ai/api/v1',
}

function getBaseUrl(config: AiConfig): string {
  return config.baseUrl || PROVIDER_BASE_URLS[config.provider]
}

// --- OpenAI-compatible providers ---

async function callOpenAICompatible(
  config: AiConfig,
  messages: ChatMessage[],
): Promise<string> {
  const base = getBaseUrl(config)
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`AI provider error (${res.status}): ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// --- Anthropic Messages API ---

async function callAnthropic(
  config: AiConfig,
  messages: ChatMessage[],
): Promise<string> {
  const base = getBaseUrl(config)
  const systemMsg = messages.find((m) => m.role === 'system')
  const userMsgs = messages.filter((m) => m.role !== 'system')

  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemMsg?.content || '',
      messages: userMsgs.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic error (${res.status}): ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

// --- Google Gemini ---

async function callGoogle(
  config: AiConfig,
  messages: ChatMessage[],
): Promise<string> {
  const base = getBaseUrl(config)
  const systemMsg = messages.find((m) => m.role === 'system')
  const userMsgs = messages.filter((m) => m.role !== 'system')

  const res = await fetch(
    `${base}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: systemMsg
          ? { parts: [{ text: systemMsg.content }] }
          : undefined,
        contents: userMsgs.map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google AI error (${res.status}): ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// --- Ollama ---

async function callOllama(
  config: AiConfig,
  messages: ChatMessage[],
): Promise<string> {
  const base = getBaseUrl(config)
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
    }),
    signal: AbortSignal.timeout(300_000), // Ollama can be slow
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ollama error (${res.status}): ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.message?.content || ''
}

// --- Main entry point ---

export async function callAI(
  config: AiConfig,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]

  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, messages)
    case 'google':
      return callGoogle(config, messages)
    case 'ollama':
      return callOllama(config, messages)
    default:
      // openai, groq, xai, openrouter — all OpenAI-compatible
      return callOpenAICompatible(config, messages)
  }
}

// --- Model listing ---

export interface ModelInfo {
  id: string
  name: string
}

const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
]

export async function listModels(config: {
  provider: AiProvider
  apiKey: string
  baseUrl: string
}): Promise<ModelInfo[]> {
  const base = config.baseUrl || PROVIDER_BASE_URLS[config.provider]

  try {
    switch (config.provider) {
      case 'anthropic':
        return ANTHROPIC_MODELS

      case 'google': {
        const res = await fetch(
          `${base}/v1beta/models?key=${config.apiKey}`,
          { signal: AbortSignal.timeout(10_000) },
        )
        if (!res.ok) return []
        const data = await res.json()
        return (data.models || [])
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => ({
            id: m.name?.replace('models/', '') || m.name,
            name: m.displayName || m.name,
          }))
      }

      case 'ollama': {
        const res = await fetch(`${base}/api/tags`, {
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) return []
        const data = await res.json()
        return (data.models || []).map((m: any) => ({
          id: m.name,
          name: m.name,
        }))
      }

      default: {
        // OpenAI-compatible: openai, groq, xai, openrouter
        const res = await fetch(`${base}/models`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) return []
        const data = await res.json()
        return (data.data || [])
          .map((m: any) => ({ id: m.id, name: m.id }))
          .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
      }
    }
  } catch {
    return []
  }
}

// --- Tweet formatting ---

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function formatTweetsForAI(
  tweets: {
    authorHandle: string
    authorName: string
    authorFollowers: number
    content: string
    likes: number
    retweets: number
    replies: number
    views: number
    publishedAt: Date | null
    isRetweet: string | null
    quotedTweet: string | null
    card: string | null
  }[],
): string {
  return tweets
    .map((t) => {
      const lines: string[] = []
      const rt = t.isRetweet ? ` (RT by @${t.isRetweet})` : ''
      const time = t.publishedAt ? ` - ${timeAgo(t.publishedAt)}` : ''
      lines.push(
        `@${t.authorHandle} (${t.authorName}, ${t.authorFollowers} followers)${rt}${time}`,
      )
      // Truncate long content to save tokens
      const content = t.content.length > 500 ? t.content.slice(0, 500) + '...' : t.content
      lines.push(content)
      lines.push(
        `[Likes: ${t.likes} | RTs: ${t.retweets} | Replies: ${t.replies} | Views: ${t.views}]`,
      )
      if (t.quotedTweet) {
        try {
          const qt = JSON.parse(t.quotedTweet)
          lines.push(`> Quoting @${qt.authorHandle}: ${qt.content?.slice(0, 200) || ''}`)
        } catch {}
      }
      if (t.card) {
        try {
          const c = JSON.parse(t.card)
          if (c.title) lines.push(`> Link: ${c.title} (${c.domain})`)
        } catch {}
      }
      return lines.join('\n')
    })
    .join('\n---\n')
}
