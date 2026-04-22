CREATE TABLE "telegram_inputs" (
	"input_id" text PRIMARY KEY NOT NULL,
	"channel_username" text NOT NULL,
	"channel_title" text,
	"site_url" text NOT NULL,
	"latest_seen_message_id" integer,
	"last_checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telegram_posts" (
	"content_item_id" text PRIMARY KEY NOT NULL,
	"telegram_post_id" text NOT NULL,
	"channel_username" text NOT NULL,
	"channel_title" text,
	"message_id" integer NOT NULL,
	"content" text,
	"media" text,
	"preview_url" text,
	"thumbnail_url" text,
	"domain" text,
	"link_url" text,
	"permalink" text NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"post_type" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_posts_telegram_post_id_unique" UNIQUE("telegram_post_id")
);
--> statement-breakpoint
ALTER TABLE "telegram_inputs" ADD CONSTRAINT "telegram_inputs_input_id_inputs_id_fk" FOREIGN KEY ("input_id") REFERENCES "public"."inputs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "telegram_posts" ADD CONSTRAINT "telegram_posts_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;
