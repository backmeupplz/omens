import { createId } from '@paralleldrive/cuid2'

export function generateApiKey(): { key: string; prefix: string } {
  const prefix = `omens_${createId().slice(0, 8)}`
  const secret = createId() + createId()
  const key = `${prefix}_${secret}`
  return { key, prefix }
}

export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
