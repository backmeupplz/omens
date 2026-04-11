UPDATE "ai_scoring_feeds"
SET "score_from_at" = "created_at" - interval '24 hours'
WHERE "is_main" = false AND "score_from_at" IS NULL;
