import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { resolveConnectionOptions } from './connection'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRIZZLE_DIR = join(__dirname, '..', 'drizzle')
const JOURNAL_PATH = join(DRIZZLE_DIR, 'meta', '_journal.json')

type JournalEntry = {
  idx: number
  when: number
  tag: string
}

type Journal = {
  entries: JournalEntry[]
}

function createSqlClient(url: string) {
  return postgres(resolveConnectionOptions(url))
}

function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex')
}

async function ensureMigrationsTable(sql: postgres.Sql) {
  await sql.unsafe('CREATE SCHEMA IF NOT EXISTS "drizzle"')
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      "id" serial PRIMARY KEY NOT NULL,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `)
}

async function readJournal() {
  const raw = await readFile(JOURNAL_PATH, 'utf8')
  return JSON.parse(raw) as Journal
}

async function applyMigration(sql: postgres.Sql, entry: JournalEntry) {
  const migrationPath = join(DRIZZLE_DIR, `${entry.tag}.sql`)
  const migrationSql = await readFile(migrationPath, 'utf8')
  const hash = sha256(migrationSql)
  const [existing] = await sql<{ hash: string }[]>`
    select "hash"
    from "drizzle"."__drizzle_migrations"
    where "hash" = ${hash}
    limit 1
  `

  if (existing) return

  const statements = migrationSql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)

  await sql.begin(async (tx) => {
    for (const statement of statements) {
      await tx.unsafe(statement)
    }

    await tx.unsafe(
      `insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ('${hash}', ${entry.when})`,
    )
  })
}

export async function runMigrations(url?: string) {
  if (!url) throw new Error('DATABASE_URL is required')

  const sql = createSqlClient(url)

  try {
    await ensureMigrationsTable(sql)
    const journal = await readJournal()

    for (const entry of journal.entries) {
      await applyMigration(sql, entry)
    }
  } finally {
    await sql.end()
  }
}
