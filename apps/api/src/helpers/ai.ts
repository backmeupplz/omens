/**
 * Provider-agnostic AI client.
 * Uses raw fetch() — no SDK dependencies.
 */

import type { AiProvider } from '@omens/shared'

export const DEFAULT_SYSTEM_PROMPT = `You analyze an X/Twitter feed to find signal in the noise.

Surface what matters: important news, interesting insights, notable discussions. Skip spam, promotions, low-value retweets, and filler.`

export const REPORT_SYSTEM_PROMPT = `Generate a feed digest. Focus only on what matters — the key stories and insights. Write in a clean, readable style.

Rules:
- Use ## headers to separate distinct topics/stories
- Write 2-3 sentence summaries per topic. Add context and why it matters.
- Embed the most important posts inline using [[tweet:TWEET_DB_ID]] on its own line (use the [ID: xxx] shown before each post). Aim for 5-12 inline tweets.
- Do NOT repeat tweet text when you embed it — just provide context around it.
- Leave blank lines between paragraphs for readability.
- No forced categories like "Action Items". Just tell me what happened, organized by topic.
- Cover ALL significant topics from the feed, don't stop early.`

export const FILTER_SYSTEM_PROMPT = `You are a tweet relevance scorer. Score each tweet from 0 to 100 based on the user's preferences described below.

Score guidelines:
- 90-100: Must-see, directly matches interests
- 70-89: Interesting and relevant
- 50-69: Somewhat relevant
- 20-49: Low relevance
- 0-19: Spam or noise

Respond with ONLY a JSON array, no markdown, no explanation.
Format: [{"id":"tweet_db_id","score":85},...]`

export const META_PROMPT = `You are a prompt engineer. Refine an AI system prompt based on user feedback.

You will receive:
1. The DEFAULT base prompt
2. The CURRENT custom prompt
3. User feedback: THUMBS UP (show more like this), THUMBS DOWN (show less), and TEXT INSTRUCTIONS

Generate an IMPROVED system prompt that:
- Retains the core structure of the default prompt
- Incorporates user preferences as specific, actionable guidance
- Stays under 1500 characters
- Outputs ONLY the new prompt text, nothing else`

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
  timeoutMs = 120_000,
): Promise<string> {
  const base = getBaseUrl(config)
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
  }
  // Some providers (Fireworks) don't support max_tokens without streaming
  if (config.provider !== 'fireworks') {
    body.max_tokens = 8192
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
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
  timeoutMs = 120_000,
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
      max_tokens: 8192,
      system: systemMsg?.content || '',
      messages: userMsgs.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(timeoutMs),
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
  timeoutMs = 120_000,
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
      signal: AbortSignal.timeout(timeoutMs),
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
  options?: { timeoutMs?: number },
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]
  const timeout = options?.timeoutMs

  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, messages, timeout)
    case 'google':
      return callGoogle(config, messages, timeout)
    case 'ollama':
      return callOllama(config, messages)
    default:
      return callOpenAICompatible(config, messages, timeout)
  }
}

// --- Streaming entry point ---

async function* streamOpenAICompatible(config: AiConfig, messages: ChatMessage[]): AsyncGenerator<string> {
  const base = getBaseUrl(config)
  const body: Record<string, unknown> = { model: config.model, messages, stream: true }
  if (config.provider !== 'fireworks') body.max_tokens = 8192
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI provider error (${res.status}): ${text.slice(0, 200)}`)
  }
  yield* parseSSEStream(res, (json) => json.choices?.[0]?.delta?.content || '')
}

async function* streamAnthropic(config: AiConfig, messages: ChatMessage[]): AsyncGenerator<string> {
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
      model: config.model, max_tokens: 8192, stream: true,
      system: systemMsg?.content || '',
      messages: userMsgs.map((m) => ({ role: m.role, content: m.content })),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Anthropic error (${res.status}): ${text.slice(0, 200)}`)
  }
  yield* parseSSEStream(res, (json) => {
    if (json.type === 'content_block_delta') return json.delta?.text || ''
    return ''
  })
}

async function* streamGoogle(config: AiConfig, messages: ChatMessage[]): AsyncGenerator<string> {
  const base = getBaseUrl(config)
  const systemMsg = messages.find((m) => m.role === 'system')
  const userMsgs = messages.filter((m) => m.role !== 'system')
  const res = await fetch(
    `${base}/v1beta/models/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
        contents: userMsgs.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 4096 },
      }),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google AI error (${res.status}): ${text.slice(0, 200)}`)
  }
  yield* parseSSEStream(res, (json) => json.candidates?.[0]?.content?.parts?.[0]?.text || '')
}

async function* streamOllama(config: AiConfig, messages: ChatMessage[]): AsyncGenerator<string> {
  const base = getBaseUrl(config)
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages, stream: true }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ollama error (${res.status}): ${text.slice(0, 200)}`)
  }
  // Ollama streams newline-delimited JSON (not SSE)
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const json = JSON.parse(line)
        if (json.message?.content) yield json.message.content
      } catch {}
    }
  }
}

/** Parse an SSE stream from an AI provider response */
async function* parseSSEStream(
  res: Response,
  extractContent: (json: any) => string,
): AsyncGenerator<string> {
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const content = extractContent(json)
        if (content) yield content
      } catch {}
    }
  }
}

export async function* callAIStream(
  config: AiConfig,
  systemPrompt: string,
  userContent: string,
): AsyncGenerator<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]
  switch (config.provider) {
    case 'anthropic': yield* streamAnthropic(config, messages); break
    case 'google': yield* streamGoogle(config, messages); break
    case 'ollama': yield* streamOllama(config, messages); break
    default: yield* streamOpenAICompatible(config, messages); break
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

export interface TweetForAI {
  id: string // DB id
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
}

export function formatTweetsForAI(tweets: TweetForAI[]): string {
  return tweets
    .map((t) => {
      const lines: string[] = []
      const rt = t.isRetweet ? ` (RT by @${t.isRetweet})` : ''
      const time = t.publishedAt ? ` - ${timeAgo(t.publishedAt)}` : ''
      lines.push(`[ID: ${t.id}]`)
      lines.push(
        `@${t.authorHandle} (${t.authorName}, ${t.authorFollowers} followers)${rt}${time}`,
      )
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

