CREATE TABLE "ai_scoring_feeds" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT '✦' NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"system_prompt" text,
	"min_score" integer DEFAULT 50 NOT NULL,
	"report_interval_hours" integer DEFAULT 24 NOT NULL,
	"report_at_hour" integer DEFAULT 6 NOT NULL,
	"prompt_last_regen_at" timestamp with time zone,
	"last_auto_report_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_scoring_feeds" ADD CONSTRAINT "ai_scoring_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_scoring_feeds_user_name_idx" ON "ai_scoring_feeds" USING btree ("user_id","name");
--> statement-breakpoint
INSERT INTO "ai_scoring_feeds" (
	"id",
	"user_id",
	"name",
	"icon",
	"is_main",
	"system_prompt",
	"min_score",
	"report_interval_hours",
	"report_at_hour",
	"prompt_last_regen_at",
	"last_auto_report_at",
	"created_at",
	"updated_at"
)
SELECT
	md5(random()::text || clock_timestamp()::text || u.user_id),
	u.user_id,
	'Main',
	'✦',
	true,
	s.system_prompt,
	COALESCE(s.min_score, 50),
	COALESCE(s.report_interval_hours, 24),
	COALESCE(s.report_at_hour, 6),
	s.prompt_last_regen_at,
	s.last_auto_report_at,
	COALESCE(s.created_at, now()),
	COALESCE(s.updated_at, now())
FROM (
	SELECT "user_id" FROM "ai_settings"
	UNION
	SELECT "user_id" FROM "ai_reports"
	UNION
	SELECT "user_id" FROM "tweet_scores"
	UNION
	SELECT "user_id" FROM "nudges"
	UNION
	SELECT "user_id" FROM "prompt_changes"
) AS u
LEFT JOIN "ai_settings" s ON s."user_id" = u."user_id";
--> statement-breakpoint
ALTER TABLE "ai_reports" ADD COLUMN "feed_id" text;
--> statement-breakpoint
ALTER TABLE "nudges" ADD COLUMN "feed_id" text;
--> statement-breakpoint
ALTER TABLE "prompt_changes" ADD COLUMN "feed_id" text;
--> statement-breakpoint
ALTER TABLE "tweet_scores" ADD COLUMN "feed_id" text;
--> statement-breakpoint
UPDATE "ai_reports" r
SET "feed_id" = f."id"
FROM "ai_scoring_feeds" f
WHERE f."user_id" = r."user_id" AND f."is_main" = true;
--> statement-breakpoint
UPDATE "nudges" n
SET "feed_id" = f."id"
FROM "ai_scoring_feeds" f
WHERE f."user_id" = n."user_id" AND f."is_main" = true;
--> statement-breakpoint
UPDATE "prompt_changes" p
SET "feed_id" = f."id"
FROM "ai_scoring_feeds" f
WHERE f."user_id" = p."user_id" AND f."is_main" = true;
--> statement-breakpoint
UPDATE "tweet_scores" ts
SET "feed_id" = f."id"
FROM "ai_scoring_feeds" f
WHERE f."user_id" = ts."user_id" AND f."is_main" = true;
--> statement-breakpoint
ALTER TABLE "ai_reports" ALTER COLUMN "feed_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "nudges" ALTER COLUMN "feed_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "prompt_changes" ALTER COLUMN "feed_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tweet_scores" ALTER COLUMN "feed_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_feed_id_ai_scoring_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."ai_scoring_feeds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_feed_id_ai_scoring_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."ai_scoring_feeds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prompt_changes" ADD CONSTRAINT "prompt_changes_feed_id_ai_scoring_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."ai_scoring_feeds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tweet_scores" ADD CONSTRAINT "tweet_scores_feed_id_ai_scoring_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."ai_scoring_feeds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "nudges_user_tweet_idx";
--> statement-breakpoint
DROP INDEX "tweet_scores_user_tweet_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "nudges_user_feed_tweet_idx" ON "nudges" USING btree ("user_id","feed_id","tweet_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tweet_scores_user_feed_tweet_idx" ON "tweet_scores" USING btree ("user_id","feed_id","tweet_id");
