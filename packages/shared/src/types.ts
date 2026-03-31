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
  totp: z.string().optional(),
})
