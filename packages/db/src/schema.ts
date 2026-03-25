import { createId } from '@paralleldrive/cuid2'
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  settings: text('settings', { mode: 'json' }).$type<{
    interests: string
    minScore: number
    language: string
  }>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
})

export const sources = sqliteTable('sources', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull().$type<'reddit' | 'twitter' | 'rss'>(),
  config: text('config', { mode: 'json' })
    .notNull()
    .$type<Record<string, unknown>>(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  pollIntervalMinutes: integer('poll_interval_minutes').notNull().default(30),
  lastPolledAt: integer('last_polled_at', { mode: 'timestamp' }),
})

export const items = sqliteTable(
  'items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    url: text('url').notNull(),
    author: text('author').notNull(),
    publishedAt: integer('published_at', { mode: 'timestamp' }),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('items_dedup_idx').on(table.sourceId, table.externalId),
  ],
)

export const signals = sqliteTable('signals', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  itemId: text('item_id')
    .notNull()
    .references(() => items.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
  summary: text('summary').notNull(),
  tags: text('tags', { mode: 'json' }).notNull().$type<string[]>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const llmConfigs = sqliteTable('llm_configs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('fireworks'),
  model: text('model')
    .notNull()
    .default('accounts/fireworks/models/kimi-k2p5'),
  apiKey: text('api_key'),
  baseUrl: text('base_url'),
  options: text('options', { mode: 'json' }).$type<
    Record<string, unknown>
  >(),
})

export const apiKeys = sqliteTable('api_keys', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const outputs = sqliteTable('outputs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type')
    .notNull()
    .$type<'web_feed' | 'webhook' | 'telegram'>(),
  config: text('config', { mode: 'json' })
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
})
