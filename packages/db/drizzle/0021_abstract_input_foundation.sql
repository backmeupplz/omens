CREATE TABLE "source_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text,
	"label" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_accounts" (
	"source_account_id" text PRIMARY KEY NOT NULL,
	"x_id" text NOT NULL,
	"username" text NOT NULL,
	"auth_token" text NOT NULL,
	"ct0" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reddit_accounts" (
	"source_account_id" text PRIMARY KEY NOT NULL,
	"reddit_user_id" text NOT NULL,
	"username" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inputs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_account_id" text,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"poll_interval_minutes" integer DEFAULT 15 NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_inputs" (
	"input_id" text PRIMARY KEY NOT NULL,
	"timeline_type" text DEFAULT 'home' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reddit_inputs" (
	"input_id" text PRIMARY KEY NOT NULL,
	"listing_type" text DEFAULT 'best' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"entity_type" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"author_name" text,
	"author_handle" text,
	"text_preview" text,
	"media_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_posts" (
	"content_item_id" text PRIMARY KEY NOT NULL,
	"x_post_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"author_handle" text NOT NULL,
	"author_avatar" text,
	"author_followers" integer DEFAULT 0 NOT NULL,
	"author_bio" text,
	"content" text NOT NULL,
	"media_urls" text,
	"is_retweet" text,
	"quoted_tweet" text,
	"card" text,
	"reply_to_handle" text,
	"reply_to_x_post_id" text,
	"likes" integer DEFAULT 0 NOT NULL,
	"retweets" integer DEFAULT 0 NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x_posts_x_post_id_unique" UNIQUE("x_post_id")
);
--> statement-breakpoint
CREATE TABLE "reddit_posts" (
	"content_item_id" text PRIMARY KEY NOT NULL,
	"reddit_post_id" text NOT NULL,
	"fullname" text NOT NULL,
	"subreddit" text NOT NULL,
	"author_name" text,
	"title" text NOT NULL,
	"body" text,
	"thumbnail_url" text,
	"preview_url" text,
	"media" text,
	"domain" text,
	"permalink" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"over_18" boolean DEFAULT false NOT NULL,
	"spoiler" boolean DEFAULT false NOT NULL,
	"is_self" boolean DEFAULT false NOT NULL,
	"link_flair_text" text,
	"post_hint" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reddit_posts_reddit_post_id_unique" UNIQUE("reddit_post_id")
);
--> statement-breakpoint
CREATE TABLE "input_items" (
	"id" text PRIMARY KEY NOT NULL,
	"input_id" text NOT NULL,
	"content_item_id" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rank" integer,
	"raw_cursor" text
);
--> statement-breakpoint
CREATE TABLE "ai_scoring_feed_inputs" (
	"feed_id" text NOT NULL,
	"input_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_nudges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feed_id" text NOT NULL,
	"content_item_id" text NOT NULL,
	"direction" text NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feed_id" text NOT NULL,
	"content_item_id" text NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_accounts" ADD CONSTRAINT "source_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_accounts" ADD CONSTRAINT "x_accounts_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reddit_accounts" ADD CONSTRAINT "reddit_accounts_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inputs" ADD CONSTRAINT "inputs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inputs" ADD CONSTRAINT "inputs_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_inputs" ADD CONSTRAINT "x_inputs_input_id_inputs_id_fk" FOREIGN KEY ("input_id") REFERENCES "public"."inputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reddit_inputs" ADD CONSTRAINT "reddit_inputs_input_id_inputs_id_fk" FOREIGN KEY ("input_id") REFERENCES "public"."inputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_posts" ADD CONSTRAINT "x_posts_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reddit_posts" ADD CONSTRAINT "reddit_posts_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_items" ADD CONSTRAINT "input_items_input_id_inputs_id_fk" FOREIGN KEY ("input_id") REFERENCES "public"."inputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_items" ADD CONSTRAINT "input_items_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_scoring_feed_inputs" ADD CONSTRAINT "ai_scoring_feed_inputs_feed_id_ai_scoring_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."ai_scoring_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_scoring_feed_inputs" ADD CONSTRAINT "ai_scoring_feed_inputs_input_id_inputs_id_fk" FOREIGN KEY ("input_id") REFERENCES "public"."inputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_nudges" ADD CONSTRAINT "item_nudges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_nudges" ADD CONSTRAINT "item_nudges_feed_id_ai_scoring_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."ai_scoring_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_nudges" ADD CONSTRAINT "item_nudges_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scores" ADD CONSTRAINT "item_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scores" ADD CONSTRAINT "item_scores_feed_id_ai_scoring_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."ai_scoring_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scores" ADD CONSTRAINT "item_scores_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_accounts_user_provider_external_idx" ON "source_accounts" USING btree ("user_id","provider","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_items_provider_entity_external_idx" ON "content_items" USING btree ("provider","entity_type","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "input_items_input_content_idx" ON "input_items" USING btree ("input_id","content_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_scoring_feed_inputs_idx" ON "ai_scoring_feed_inputs" USING btree ("feed_id","input_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_nudges_user_feed_content_idx" ON "item_nudges" USING btree ("user_id","feed_id","content_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_scores_user_feed_content_idx" ON "item_scores" USING btree ("user_id","feed_id","content_item_id");
