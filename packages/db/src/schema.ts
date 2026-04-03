import { createId } from '@paralleldrive/cuid2'
import {
  boolean,
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tweets = pgTable(
  'tweets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
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
    replyToHandle: text('reply_to_handle'), // handle of user being replied to
    replyToTweetId: text('reply_to_tweet_id'), // X snowflake ID of parent tweet
    url: text('url').notNull(),
    likes: integer('likes').notNull().default(0),
    retweets: integer('retweets').notNull().default(0),
    replies: integer('replies').notNull().default(0),
    views: integer('views').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tweets_dedup_idx').on(table.tweetId),
  ],
)

export const userTweets = pgTable(
  'user_tweets',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tweetId: text('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_tweets_idx').on(table.userId, table.tweetId),
  ],
)

export const ogCache = pgTable('og_cache', {
  url: text('url').primaryKey(), // the resolved URL (after redirects)
  originalUrl: text('original_url').unique(), // the t.co or short URL
  title: text('title'),
  description: text('description'),
  thumbnail: text('thumbnail'),
  domain: text('domain').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
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
  minScore: integer('min_score').notNull().default(50),
  fetchIntervalMinutes: integer('fetch_interval_minutes').notNull().default(15), // 0 = manual only
  reportIntervalHours: integer('report_interval_hours').notNull().default(24), // 0 = manual only
  reportAtHour: integer('report_at_hour').notNull().default(6), // 0-23 UTC (frontend converts local→UTC)
  promptLastRegenAt: timestamp('prompt_last_regen_at', { withTimezone: true }),
  lastAutoReportAt: timestamp('last_auto_report_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
  tweetRefs: text('tweet_refs'), // JSON array of tweet DB ids referenced in the report
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const nudges = pgTable(
  'nudges',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tweetId: text('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(), // 'up' | 'down'
    consumed: boolean('consumed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('nudges_user_tweet_idx').on(table.userId, table.tweetId),
  ],
)

export const promptChanges = pgTable('prompt_changes', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  instruction: text('instruction').notNull(),
  consumed: boolean('consumed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tweetScores = pgTable(
  'tweet_scores',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tweetId: text('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(), // 0-100
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tweet_scores_user_tweet_idx').on(table.userId, table.tweetId),
  ],
)

export const articles = pgTable(
  'articles',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    tweetId: text('tweet_id').notNull(),
    title: text('title').notNull(),
    coverImage: text('cover_image'),
    body: text('body').notNull(), // plain text
    richContent: text('rich_content'), // JSON array of ArticleRichBlock
    authorName: text('author_name').notNull(),
    authorHandle: text('author_handle').notNull(),
    authorAvatar: text('author_avatar'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('articles_tweet_id_idx').on(table.tweetId),
  ],
)

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
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
