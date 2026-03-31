CREATE TABLE "nudges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tweet_id" text NOT NULL,
	"direction" text NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"instruction" text NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tweet_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tweet_id" text NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_reports" ADD COLUMN "tweet_refs" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "prompt_last_regen_at" timestamp;--> statement-breakpoint
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_tweet_id_tweets_id_fk" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_changes" ADD CONSTRAINT "prompt_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tweet_scores" ADD CONSTRAINT "tweet_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tweet_scores" ADD CONSTRAINT "tweet_scores_tweet_id_tweets_id_fk" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nudges_user_tweet_idx" ON "nudges" USING btree ("user_id","tweet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tweet_scores_user_tweet_idx" ON "tweet_scores" USING btree ("user_id","tweet_id");