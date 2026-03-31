ALTER TABLE "tweets" ADD COLUMN "author_followers" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tweets" ADD COLUMN "author_bio" text;