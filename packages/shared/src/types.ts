import { z } from 'zod'

// === Source Types ===

export const sourceTypes = ['reddit', 'twitter', 'rss'] as const
export type SourceType = (typeof sourceTypes)[number]

export const redditConfigSchema = z.object({
  subreddits: z.array(z.string().min(1)).min(1),
  sort: z.enum(['hot', 'new', 'top', 'rising']).default('hot'),
  limit: z.number().min(1).max(100).default(50),
})
export type RedditConfig = z.infer<typeof redditConfigSchema>

export const twitterConfigSchema = z.object({
  accounts: z.array(z.string().min(1)).min(1),
  nitterInstance: z
    .string()
    .url()
    .default('https://nitter.net'),
})
export type TwitterConfig = z.infer<typeof twitterConfigSchema>

export const rssConfigSchema = z.object({
  urls: z.array(z.string().url()).min(1),
})
export type RssConfig = z.infer<typeof rssConfigSchema>

export const sourceConfigSchemas = {
  reddit: redditConfigSchema,
  twitter: twitterConfigSchema,
  rss: rssConfigSchema,
} as const

// === Output Types ===

export const outputTypes = ['web_feed', 'webhook', 'telegram'] as const
export type OutputType = (typeof outputTypes)[number]

export const webFeedConfigSchema = z.object({})
export const webhookConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
})
export const telegramConfigSchema = z.object({
  botToken: z.string().min(1),
  chatId: z.string().min(1),
})

export const outputConfigSchemas = {
  web_feed: webFeedConfigSchema,
  webhook: webhookConfigSchema,
  telegram: telegramConfigSchema,
} as const

// === LLM Types ===

export const llmProviders = [
  'fireworks',
  'openai',
  'anthropic',
  'ollama',
  'custom',
] as const
export type LLMProvider = (typeof llmProviders)[number]

export const llmConfigSchema = z.object({
  provider: z.enum(llmProviders).default('fireworks'),
  model: z
    .string()
    .default('accounts/fireworks/models/kimi-k2p5'),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  options: z.record(z.unknown()).optional(),
})
export type LLMConfig = z.infer<typeof llmConfigSchema>

// === Raw Item (from source adapters) ===

export interface RawItem {
  externalId: string
  title: string
  content: string
  url: string
  author: string
  publishedAt: Date
  sourceType: SourceType
  metadata?: Record<string, unknown>
}

// === Signal (LLM output) ===

export const signalSchema = z.object({
  index: z.number(),
  score: z
    .number()
    .min(0)
    .max(100)
    .describe('Relevance score from 0-100'),
  summary: z
    .string()
    .max(500)
    .describe('Brief summary of why this is relevant'),
  tags: z
    .array(z.string())
    .max(5)
    .describe('Category tags'),
})

export const signalBatchSchema = z.object({
  signals: z.array(signalSchema),
})

export interface Signal {
  id: string
  itemId: string
  score: number
  summary: string
  tags: string[]
  createdAt: Date
}

// === User Settings ===

export const userSettingsSchema = z.object({
  interests: z.string().default(''),
  minScore: z.number().min(0).max(100).default(30),
  language: z.string().default('en'),
})
export type UserSettings = z.infer<typeof userSettingsSchema>

// === API Request Schemas ===

export const createSourceSchema = z.object({
  type: z.enum(sourceTypes),
  config: z.record(z.unknown()),
  pollIntervalMinutes: z.number().min(5).max(1440).default(30),
})

export const updateSourceSchema = z.object({
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  pollIntervalMinutes: z.number().min(5).max(1440).optional(),
})

export const createOutputSchema = z.object({
  type: z.enum(outputTypes),
  config: z.record(z.unknown()).default({}),
})

export const updateOutputSchema = z.object({
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
})

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})
