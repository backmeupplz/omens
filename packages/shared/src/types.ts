import { z } from 'zod'

// === API Request Schemas ===

export const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const xLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  handle: z.string().optional(),
  totp: z.string().optional(),
})

export const aiProviders = [
  'openai',
  'anthropic',
  'google',
  'groq',
  'xai',
  'fireworks',
  'ollama',
  'openrouter',
] as const

export type AiProvider = (typeof aiProviders)[number]

export const aiSettingsSchema = z.object({
  provider: z.enum(aiProviders),
  apiKey: z.string().min(1),
  baseUrl: z.string().optional().default(''),
  model: z.string().min(1),
  systemPrompt: z.string().max(10000).optional().default(''),
})

export const nudgeSchema = z.object({
  feedId: z.string().min(1).optional(),
  itemId: z.string().min(1),
  direction: z.enum(['up', 'down']),
})

export const promptChangeSchema = z.object({
  feedId: z.string().min(1).optional(),
  instruction: z.string().min(1).max(500),
})

export const scoringFeedCreateSchema = z.object({
  name: z.string().min(1).max(40),
  icon: z.string().trim().min(1).max(8).default('✦'),
})

export const scoringFeedUpdateSchema = z.object({
  name: z.string().min(1).max(40),
  icon: z.string().trim().min(1).max(8),
  systemPrompt: z.string().max(10000).optional().default(''),
  minScore: z.number().int().min(0).max(100),
  reportIntervalHours: z.number().int().min(0).max(168),
  reportAtHour: z.number().int().min(0).max(23),
})

export const redditRssListingTypes = ['hot', 'new', 'top'] as const
export const redditRssTimeRanges = ['day', 'week', 'month', 'year', 'all'] as const

export const redditRssInputCreateSchema = z.object({
  subreddit: z.string().trim().min(2).max(64),
  listingType: z.enum(redditRssListingTypes).default('new'),
  timeRange: z.enum(redditRssTimeRanges).optional().default('week'),
})

export const telegramChannelInputCreateSchema = z.object({
  channel: z.string().trim().min(3).max(256),
})

export const genericRssInputCreateSchema = z.object({
  feedUrl: z.string().trim().url().max(2048),
})

export const reportEmailSubscribeSchema = z.object({
  email: z.string().trim().email(),
})

export const reportEmailFeedSchema = z.object({
  feedId: z.string().trim().min(1),
})

export const reportEmailTokenSchema = z.object({
  token: z.string().trim().min(16).max(512),
})
