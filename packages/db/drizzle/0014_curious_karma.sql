CREATE TABLE "user_tweets" (
	"user_id" text NOT NULL,
	"tweet_id" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tweets" DROP CONSTRAINT "tweets_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "tweets_dedup_idx";--> statement-breakpoint
ALTER TABLE "user_tweets" ADD CONSTRAINT "user_tweets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tweets" ADD CONSTRAINT "user_tweets_tweet_id_tweets_id_fk" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_tweets_idx" ON "user_tweets" USING btree ("user_id","tweet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tweets_dedup_idx" ON "tweets" USING btree ("tweet_id");--> statement-breakpoint
ALTER TABLE "tweets" DROP COLUMN "user_id";