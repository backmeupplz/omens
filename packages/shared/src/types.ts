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
