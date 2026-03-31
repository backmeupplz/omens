ALTER TABLE "tweets" ADD COLUMN "likes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tweets" ADD COLUMN "retweets" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tweets" ADD COLUMN "replies" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tweets" ADD COLUMN "views" integer DEFAULT 0 NOT NULL;