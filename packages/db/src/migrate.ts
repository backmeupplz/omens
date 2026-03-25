import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { getDb } from './client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '..', 'drizzle')

export function runMigrations(url?: string) {
  const db = getDb(url)
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })
}
