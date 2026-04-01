ALTER TABLE "ai_settings" ADD COLUMN "fetch_interval_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "report_interval_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "last_auto_report_at" timestamp;