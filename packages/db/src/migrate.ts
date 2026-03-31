import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { getDb } from './client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '..', 'drizzle')

export async function runMigrations(url?: string) {
  const db = getDb(url)
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
}
