CREATE TABLE "og_cache" (
	"url" text PRIMARY KEY NOT NULL,
	"original_url" text,
	"title" text,
	"description" text,
	"thumbnail" text,
	"domain" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "og_cache_original_url_unique" UNIQUE("original_url")
);
