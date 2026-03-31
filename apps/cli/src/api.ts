import { loadConfig } from './config'

export async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const config = loadConfig()
  if (!config.apiKey) {
    console.error('No API key configured. Run: omens config --api-key <key>')
    process.exit(1)
  }

  const url = `${config.apiUrl}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKey,
      ...(options.headers as Record<string, string>),
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    console.error(`Error: ${(body as any).error || `HTTP ${res.status}`}`)
    process.exit(1)
  }

  return res.json() as Promise<T>
}
