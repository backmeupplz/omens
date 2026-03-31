import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let db: ReturnType<typeof createDb> | null = null

function createDb(url: string) {
  const client = postgres(url)
  return drizzle(client, { schema })
}

export function getDb(url?: string) {
  if (!db) {
    if (!url) throw new Error('DATABASE_URL is required')
    db = createDb(url)
  }
  return db
}

export type Db = ReturnType<typeof getDb>
