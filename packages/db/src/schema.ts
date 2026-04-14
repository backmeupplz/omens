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

export const sourceAccounts = pgTable(
  'source_accounts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'x' | future auth-backed providers
    externalAccountId: text('external_account_id'),
    label: text('label').notNull(),
    status: text('status').notNull().default('active'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('source_accounts_user_provider_external_idx').on(
      table.userId,
      table.provider,
      table.externalAccountId,
    ),
  ],
)

export const xAccounts = pgTable('x_accounts', {
  sourceAccountId: text('source_account_id')
    .primaryKey()
    .references(() => sourceAccounts.id, { onDelete: 'cascade' }),
  xId: text('x_id').notNull(),
  username: text('username').notNull(),
  authToken: text('auth_token').notNull(),
  ct0: text('ct0').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const redditAccounts = pgTable('reddit_accounts', {
  sourceAccountId: text('source_account_id')
    .primaryKey()
    .references(() => sourceAccounts.id, { onDelete: 'cascade' }),
  redditUserId: text('reddit_user_id').notNull(),
  username: text('username').notNull(),
  refreshToken: text('refresh_token').notNull(),
  accessToken: text('access_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const inputs = pgTable('inputs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  sourceAccountId: text('source_account_id')
    .references(() => sourceAccounts.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  pollIntervalMinutes: integer('poll_interval_minutes').notNull().default(15),
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const xInputs = pgTable('x_inputs', {
  inputId: text('input_id')
    .primaryKey()
    .references(() => inputs.id, { onDelete: 'cascade' }),
  timelineType: text('timeline_type').notNull().default('home'),
})

export const redditInputs = pgTable('reddit_inputs', {
  inputId: text('input_id')
    .primaryKey()
    .references(() => inputs.id, { onDelete: 'cascade' }),
  listingType: text('listing_type').notNull().default('best'),
})

export const rssInputs = pgTable('rss_inputs', {
  inputId: text('input_id')
    .primaryKey()
    .references(() => inputs.id, { onDelete: 'cascade' }),
  feedUrl: text('feed_url').notNull(),
  siteUrl: text('site_url'),
  title: text('title'),
  description: text('description'),
  sourceProvider: text('source_provider').notNull().default('rss'),
  sourceKey: text('source_key'),
  sourceLabel: text('source_label'),
  listingType: text('listing_type'),
  timeRange: text('time_range'),
  etag: text('etag'),
  lastModified: text('last_modified'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
})

export const contentItems = pgTable(
  'content_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    provider: text('provider').notNull(),
    entityType: text('entity_type').notNull(),
    externalId: text('external_id').notNull(),
    url: text('url').notNull(),
    authorName: text('author_name'),
    authorHandle: text('author_handle'),
    textPreview: text('text_preview'),
    mediaCount: integer('media_count').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('content_items_provider_entity_external_idx').on(
      table.provider,
      table.entityType,
      table.externalId,
    ),
  ],
)

export const xPosts = pgTable('x_posts', {
  contentItemId: text('content_item_id')
    .primaryKey()
    .references(() => contentItems.id, { onDelete: 'cascade' }),
  xPostId: text('x_post_id').notNull().unique(),
  authorId: text('author_id').notNull(),
  authorName: text('author_name').notNull(),
  authorHandle: text('author_handle').notNull(),
  authorAvatar: text('author_avatar'),
  authorFollowers: integer('author_followers').notNull().default(0),
  authorBio: text('author_bio'),
  content: text('content').notNull(),
  mediaUrls: text('media_urls'),
  isRetweet: text('is_retweet'),
  quotedTweet: text('quoted_tweet'),
  card: text('card'),
  replyToHandle: text('reply_to_handle'),
  replyToXPostId: text('reply_to_x_post_id'),
  likes: integer('likes').notNull().default(0),
  retweets: integer('retweets').notNull().default(0),
  replies: integer('replies').notNull().default(0),
  views: integer('views').notNull().default(0),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
})

export const redditPosts = pgTable('reddit_posts', {
  contentItemId: text('content_item_id')
    .primaryKey()
    .references(() => contentItems.id, { onDelete: 'cascade' }),
  redditPostId: text('reddit_post_id').notNull().unique(),
  fullname: text('fullname').notNull(),
  subreddit: text('subreddit').notNull(),
  authorName: text('author_name'),
  title: text('title').notNull(),
  body: text('body'),
  thumbnailUrl: text('thumbnail_url'),
  previewUrl: text('preview_url'),
  media: text('media'), // JSON object
  domain: text('domain'),
  permalink: text('permalink').notNull(),
  score: integer('score').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  over18: boolean('over_18').notNull().default(false),
  spoiler: boolean('spoiler').notNull().default(false),
  isSelf: boolean('is_self').notNull().default(false),
  linkFlairText: text('link_flair_text'),
  postHint: text('post_hint'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
})

export const inputItems = pgTable(
  'input_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    inputId: text('input_id')
      .notNull()
      .references(() => inputs.id, { onDelete: 'cascade' }),
    contentItemId: text('content_item_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
    rank: integer('rank'),
    rawCursor: text('raw_cursor'),
  },
  (table) => [
    uniqueIndex('input_items_input_content_idx').on(table.inputId, table.contentItemId),
  ],
)

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

export const aiScoringFeeds = pgTable(
  'ai_scoring_feeds',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon').notNull().default('✦'),
    isMain: boolean('is_main').notNull().default(false),
    systemPrompt: text('system_prompt'),
    minScore: integer('min_score').notNull().default(50),
    scoreFromAt: timestamp('score_from_at', { withTimezone: true }),
    reportIntervalHours: integer('report_interval_hours').notNull().default(24),
    reportAtHour: integer('report_at_hour').notNull().default(6),
    promptLastRegenAt: timestamp('prompt_last_regen_at', { withTimezone: true }),
    lastAutoReportAt: timestamp('last_auto_report_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ai_scoring_feeds_user_name_idx').on(table.userId, table.name),
  ],
)

export const aiScoringFeedInputs = pgTable(
  'ai_scoring_feed_inputs',
  {
    feedId: text('feed_id')
      .notNull()
      .references(() => aiScoringFeeds.id, { onDelete: 'cascade' }),
    inputId: text('input_id')
      .notNull()
      .references(() => inputs.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ai_scoring_feed_inputs_idx').on(table.feedId, table.inputId),
  ],
)

export const itemNudges = pgTable(
  'item_nudges',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feedId: text('feed_id')
      .notNull()
      .references(() => aiScoringFeeds.id, { onDelete: 'cascade' }),
    contentItemId: text('content_item_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),
    consumed: boolean('consumed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('item_nudges_user_feed_content_idx').on(
      table.userId,
      table.feedId,
      table.contentItemId,
    ),
  ],
)

export const itemScores = pgTable(
  'item_scores',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feedId: text('feed_id')
      .notNull()
      .references(() => aiScoringFeeds.id, { onDelete: 'cascade' }),
    contentItemId: text('content_item_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('item_scores_user_feed_content_idx').on(
      table.userId,
      table.feedId,
      table.contentItemId,
    ),
  ],
)

export const aiReports = pgTable('ai_reports', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  feedId: text('feed_id')
    .notNull()
    .references(() => aiScoringFeeds.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  model: text('model').notNull(),
  itemCount: integer('item_count').notNull(),
  itemRefs: text('item_refs'), // JSON array of content_item ids referenced in the report
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
    feedId: text('feed_id')
      .notNull()
      .references(() => aiScoringFeeds.id, { onDelete: 'cascade' }),
    tweetId: text('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(), // 'up' | 'down'
    consumed: boolean('consumed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('nudges_user_feed_tweet_idx').on(table.userId, table.feedId, table.tweetId),
  ],
)

export const promptChanges = pgTable('prompt_changes', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  feedId: text('feed_id')
    .notNull()
    .references(() => aiScoringFeeds.id, { onDelete: 'cascade' }),
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
    feedId: text('feed_id')
      .notNull()
      .references(() => aiScoringFeeds.id, { onDelete: 'cascade' }),
    tweetId: text('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(), // 0-100
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tweet_scores_user_feed_tweet_idx').on(table.userId, table.feedId, table.tweetId),
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
