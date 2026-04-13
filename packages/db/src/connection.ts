import { existsSync } from 'node:fs'

const DEFAULT_SOCKET_DIR = '/run/postgresql'

export function resolveConnectionOptions(url: string) {
  const parsed = new URL(url)
  const configuredSocketDir = process.env.DATABASE_SOCKET_PATH || parsed.searchParams.get('host')
  const localhostSocketDir = parsed.hostname === 'localhost'
    && existsSync(`${DEFAULT_SOCKET_DIR}/.s.PGSQL.5432`)
    ? DEFAULT_SOCKET_DIR
    : null
  const socketDir = configuredSocketDir || localhostSocketDir || undefined

  return {
    host: socketDir || parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  }
}
