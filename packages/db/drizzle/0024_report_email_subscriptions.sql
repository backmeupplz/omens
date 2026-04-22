CREATE TABLE "report_email_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"feed_id" text NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"source" text DEFAULT 'account' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"confirmation_required" boolean DEFAULT true NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"confirm_token_hash" text,
	"confirm_token_expires_at" timestamp with time zone,
	"unsubscribe_token" text NOT NULL,
	"last_confirmation_sent_at" timestamp with time zone,
	"created_from_ip" text,
	"confirmed_from_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_email_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"report_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_email_subscriptions" ADD CONSTRAINT "report_email_subscriptions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "report_email_subscriptions" ADD CONSTRAINT "report_email_subscriptions_feed_id_ai_scoring_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."ai_scoring_feeds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "report_email_deliveries" ADD CONSTRAINT "report_email_deliveries_subscription_id_report_email_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."report_email_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "report_email_deliveries" ADD CONSTRAINT "report_email_deliveries_report_id_ai_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."ai_reports"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "report_email_subscriptions_owner_feed_email_idx" ON "report_email_subscriptions" USING btree ("owner_user_id","feed_id","normalized_email");
--> statement-breakpoint
CREATE UNIQUE INDEX "report_email_subscriptions_unsubscribe_token_idx" ON "report_email_subscriptions" USING btree ("unsubscribe_token");
--> statement-breakpoint
CREATE UNIQUE INDEX "report_email_deliveries_subscription_report_idx" ON "report_email_deliveries" USING btree ("subscription_id","report_id");
