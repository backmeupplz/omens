import { createId } from '@paralleldrive/cuid2'
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const xSessions = pgTable('x_sessions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  xId: text('x_id').notNull(),
  username: text('username').notNull(),
  authToken: text('auth_token').notNull(),
  ct0: text('ct0').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const tweets = pgTable(
  'tweets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tweetId: text('tweet_id').notNull(),
    authorId: text('author_id').notNull(),
    authorName: text('author_name').notNull(),
    authorHandle: text('author_handle').notNull(),
    authorAvatar: text('author_avatar'),
    authorFollowers: integer('author_followers').notNull().default(0),
    authorBio: text('author_bio'),
    content: text('content').notNull(),
    mediaUrls: text('media_urls'), // JSON array of image/video URLs
    isRetweet: text('is_retweet'), // original author handle if retweet
    quotedTweet: text('quoted_tweet'), // JSON: {authorName, authorHandle, authorAvatar, content, url}
    card: text('card'), // JSON: {title, description, thumbnail, domain, url}
    url: text('url').notNull(),
    likes: integer('likes').notNull().default(0),
    retweets: integer('retweets').notNull().default(0),
    replies: integer('replies').notNull().default(0),
    views: integer('views').notNull().default(0),
    publishedAt: timestamp('published_at'),
    fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tweets_dedup_idx').on(table.userId, table.tweetId),
  ],
)

export const ogCache = pgTable('og_cache', {
  url: text('url').primaryKey(), // the resolved URL (after redirects)
  originalUrl: text('original_url').unique(), // the t.co or short URL
  title: text('title'),
  description: text('description'),
  thumbnail: text('thumbnail'),
  domain: text('domain').notNull(),
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
})

export const aiSettings = pgTable('ai_settings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  apiKey: text('api_key').notNull(), // encrypted
  baseUrl: text('base_url'),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const aiReports = pgTable('ai_reports', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  model: text('model').notNull(),
  tweetCount: integer('tweet_count').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const apiKeys = pgTable('api_keys', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
