CREATE TABLE "rss_posts" (
	"content_item_id" text PRIMARY KEY NOT NULL,
	"rss_post_id" text NOT NULL,
	"feed_url" text NOT NULL,
	"feed_title" text,
	"author_name" text,
	"title" text NOT NULL,
	"body" text,
	"preview_url" text,
	"thumbnail_url" text,
	"media" text,
	"domain" text,
	"permalink" text NOT NULL,
	"guid" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rss_posts_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rss_posts_rss_post_id_unique" UNIQUE("rss_post_id")
);
