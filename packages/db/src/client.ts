import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

let db: ReturnType<typeof createDb> | null = null

function createDb(url?: string) {
  const dbPath = url?.replace('file:', '') || './omens.db'
  const sqlite = new Database(dbPath)
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export function getDb(url?: string) {
  if (!db) {
    db = createDb(url)
  }
  return db
}

export type Db = ReturnType<typeof getDb>
