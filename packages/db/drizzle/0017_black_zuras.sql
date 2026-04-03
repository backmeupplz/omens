CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"tweet_id" text NOT NULL,
	"title" text NOT NULL,
	"cover_image" text,
	"body" text NOT NULL,
	"rich_content" text,
	"author_name" text NOT NULL,
	"author_handle" text NOT NULL,
	"author_avatar" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "articles_tweet_id_idx" ON "articles" USING btree ("tweet_id");