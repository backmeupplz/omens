const BASE = '/api'

function getToken(): string | null {
  return localStorage.getItem('omens_token')
}

export function setToken(token: string) {
  localStorage.setItem('omens_token', token)
}

export function clearToken() {
  localStorage.removeItem('omens_token')
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }

  return res.json()
}
