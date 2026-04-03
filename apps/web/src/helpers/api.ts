export const API_BASE = '/api'

// Paths where 401 is expected and should NOT trigger a redirect
const SILENT_401 = ['/auth/', '/x/session', '/demo/']

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Invalid request',
  401: 'Unauthorized',
  403: 'Access denied',
  404: 'Not found',
  429: 'Too many requests, please slow down',
  500: 'Something went wrong, please try again',
  502: 'Server is temporarily unavailable',
  503: 'Server is temporarily unavailable',
}

function extractError(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  // Standard { error: "message" } responses
  if (typeof b.error === 'string') return b.error
  // Zod validation errors from @hono/zod-validator: { success: false, error: { issues: [...] } }
  if (b.success === false && b.error && typeof b.error === 'object') {
    const issues = (b.error as Record<string, unknown>).issues
    if (Array.isArray(issues) && issues.length > 0) {
      return issues.map((i: any) => i.message).join(', ')
    }
  }
  return null
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new Error('Cannot connect to server')
  }

  if (res.status === 401 && !SILENT_401.some((p) => path.startsWith(p))) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = extractError(body) || STATUS_MESSAGES[res.status] || 'Something went wrong'
    throw new Error(message)
  }

  return res.json()
}
