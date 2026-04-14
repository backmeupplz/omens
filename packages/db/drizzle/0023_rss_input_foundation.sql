CREATE TABLE "rss_inputs" (
	"input_id" text PRIMARY KEY NOT NULL,
	"feed_url" text NOT NULL,
	"site_url" text,
	"title" text,
	"description" text,
	"source_provider" text DEFAULT 'rss' NOT NULL,
	"source_key" text,
	"source_label" text,
	"listing_type" text,
	"time_range" text,
	"etag" text,
	"last_modified" text,
	"last_checked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "rss_inputs" ADD CONSTRAINT "rss_inputs_input_id_inputs_id_fk" FOREIGN KEY ("input_id") REFERENCES "public"."inputs"("id") ON DELETE cascade ON UPDATE no action;
