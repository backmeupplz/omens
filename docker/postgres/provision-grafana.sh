#!/bin/sh
set -eu

export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
GRAFANA_DB_PASSWORD="${GRAFANA_DB_PASSWORD:?GRAFANA_DB_PASSWORD is required}"

until pg_isready -h postgres -U omens -d omens >/dev/null 2>&1; do
  sleep 2
done

psql \
  -v ON_ERROR_STOP=1 \
  -v grafana_password="$GRAFANA_DB_PASSWORD" \
  -h postgres \
  -U omens \
  -d omens <<'SQL'
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') THEN
    format('ALTER ROLE grafana_ro WITH LOGIN PASSWORD %L', :'grafana_password')
  ELSE
    format('CREATE ROLE grafana_ro LOGIN PASSWORD %L', :'grafana_password')
END
\gexec

GRANT CONNECT ON DATABASE omens TO grafana_ro;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM grafana_ro;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM grafana_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM grafana_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE omens IN SCHEMA public REVOKE ALL ON TABLES FROM grafana_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE omens IN SCHEMA public REVOKE ALL ON SEQUENCES FROM grafana_ro;

CREATE SCHEMA IF NOT EXISTS grafana AUTHORIZATION omens;
ALTER SCHEMA grafana OWNER TO omens;
REVOKE ALL ON SCHEMA grafana FROM PUBLIC;

DROP VIEW IF EXISTS grafana.summary_metrics;
CREATE VIEW grafana.summary_metrics AS
SELECT
  (SELECT COUNT(*)::bigint FROM users) AS total_users,
  (SELECT COUNT(*)::bigint FROM inputs WHERE enabled) AS enabled_inputs,
  (SELECT COUNT(*)::bigint FROM ai_scoring_feeds) AS scoring_feeds,
  (SELECT COUNT(*)::bigint FROM ai_reports) AS total_reports,
  (SELECT COUNT(*)::bigint FROM content_items WHERE created_at >= NOW() - INTERVAL '24 hours') AS content_items_last_24h,
  (SELECT COUNT(*)::bigint FROM item_scores WHERE created_at >= NOW() - INTERVAL '24 hours') AS scores_last_24h,
  (SELECT COUNT(*)::bigint FROM ai_reports WHERE created_at >= NOW() - INTERVAL '24 hours') AS reports_last_24h,
  (SELECT COUNT(DISTINCT owner_user_id)::bigint
     FROM report_email_subscriptions
     WHERE source = 'account' AND status = 'active') AS users_with_email_enabled,
  (SELECT COUNT(*)::bigint FROM report_email_deliveries WHERE status = 'sent') AS report_emails_sent,
  (SELECT COUNT(*)::bigint
     FROM report_email_subscriptions
     WHERE source = 'public_demo' AND status = 'active') AS demo_email_subscribers;

CREATE OR REPLACE VIEW grafana.daily_user_signups AS
WITH days AS (
  SELECT generate_series(
    date_trunc('day', NOW()) - INTERVAL '89 days',
    date_trunc('day', NOW()),
    INTERVAL '1 day'
  ) AS day
),
counts AS (
  SELECT date_trunc('day', created_at) AS day, COUNT(*)::bigint AS users
  FROM users
  WHERE created_at >= date_trunc('day', NOW()) - INTERVAL '89 days'
  GROUP BY 1
)
SELECT days.day, COALESCE(counts.users, 0)::bigint AS users
FROM days
LEFT JOIN counts USING (day)
ORDER BY days.day;

CREATE OR REPLACE VIEW grafana.daily_content_ingestion AS
WITH days AS (
  SELECT generate_series(
    date_trunc('day', NOW()) - INTERVAL '29 days',
    date_trunc('day', NOW()),
    INTERVAL '1 day'
  ) AS day
),
providers AS (
  SELECT unnest(ARRAY['x'::text, 'reddit'::text, 'other'::text]) AS provider
),
counts AS (
  SELECT
    date_trunc('day', created_at) AS day,
    CASE
      WHEN provider IN ('x', 'reddit') THEN provider
      ELSE 'other'
    END AS provider,
    COUNT(*)::bigint AS items
  FROM content_items
  WHERE created_at >= date_trunc('day', NOW()) - INTERVAL '29 days'
  GROUP BY 1, 2
)
SELECT
  days.day,
  providers.provider,
  COALESCE(counts.items, 0)::bigint AS items
FROM days
CROSS JOIN providers
LEFT JOIN counts
  ON counts.day = days.day
 AND counts.provider = providers.provider
ORDER BY days.day, providers.provider;

CREATE OR REPLACE VIEW grafana.daily_reports AS
WITH days AS (
  SELECT generate_series(
    date_trunc('day', NOW()) - INTERVAL '29 days',
    date_trunc('day', NOW()),
    INTERVAL '1 day'
  ) AS day
),
counts AS (
  SELECT date_trunc('day', created_at) AS day, COUNT(*)::bigint AS reports
  FROM ai_reports
  WHERE created_at >= date_trunc('day', NOW()) - INTERVAL '29 days'
  GROUP BY 1
)
SELECT days.day, COALESCE(counts.reports, 0)::bigint AS reports
FROM days
LEFT JOIN counts USING (day)
ORDER BY days.day;

CREATE OR REPLACE VIEW grafana.daily_scores AS
WITH days AS (
  SELECT generate_series(
    date_trunc('day', NOW()) - INTERVAL '29 days',
    date_trunc('day', NOW()),
    INTERVAL '1 day'
  ) AS day
),
counts AS (
  SELECT date_trunc('day', created_at) AS day, COUNT(*)::bigint AS scores
  FROM item_scores
  WHERE created_at >= date_trunc('day', NOW()) - INTERVAL '29 days'
  GROUP BY 1
)
SELECT days.day, COALESCE(counts.scores, 0)::bigint AS scores
FROM days
LEFT JOIN counts USING (day)
ORDER BY days.day;

CREATE OR REPLACE VIEW grafana.source_accounts_by_provider AS
SELECT
  provider,
  COUNT(*)::bigint AS source_accounts
FROM source_accounts
GROUP BY provider
ORDER BY source_accounts DESC, provider;

CREATE OR REPLACE VIEW grafana.input_breakdown AS
SELECT
  provider,
  kind,
  COUNT(*)::bigint AS inputs,
  COUNT(*) FILTER (WHERE enabled)::bigint AS enabled_inputs,
  MAX(updated_at) AS last_updated
FROM inputs
GROUP BY provider, kind
ORDER BY inputs DESC, provider, kind;

CREATE OR REPLACE VIEW grafana.recent_users AS
SELECT
  created_at,
  COALESCE(email, '(no email)') AS email,
  id
FROM users
ORDER BY created_at DESC
LIMIT 200;

CREATE OR REPLACE VIEW grafana.user_activity_30d AS
SELECT
  COALESCE(u.email, u.id) AS user_ref,
  COUNT(ii.id)::bigint AS items_seen_30d,
  COUNT(DISTINCT i.id)::bigint AS input_count,
  COUNT(DISTINCT f.id)::bigint AS feed_count,
  COUNT(DISTINCT r.id)::bigint AS report_count_30d
FROM users u
LEFT JOIN inputs i
  ON i.user_id = u.id
LEFT JOIN ai_scoring_feeds f
  ON f.user_id = u.id
LEFT JOIN input_items ii
  ON ii.input_id = i.id
 AND ii.seen_at >= NOW() - INTERVAL '30 days'
LEFT JOIN ai_reports r
  ON r.user_id = u.id
 AND r.created_at >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.email
ORDER BY items_seen_30d DESC, user_ref;

CREATE OR REPLACE VIEW grafana.recent_input_errors AS
SELECT
  updated_at,
  name,
  provider,
  kind,
  last_error
FROM inputs
WHERE last_error IS NOT NULL
ORDER BY updated_at DESC
LIMIT 200;

CREATE OR REPLACE VIEW grafana.user_admin_overview AS
SELECT
  u.id,
  COALESCE(u.email, '(no email)') AS email,
  u.created_at,
  COUNT(DISTINCT i.id)::bigint AS input_count,
  COUNT(DISTINCT i.id) FILTER (WHERE i.enabled)::bigint AS enabled_input_count,
  COUNT(DISTINCT sa.id)::bigint AS source_account_count,
  COUNT(DISTINCT f.id)::bigint AS feed_count,
  COUNT(DISTINCT r.id)::bigint AS report_count,
  MAX(ii.seen_at) AS last_seen_at,
  MAX(r.created_at) AS last_report_at
FROM users u
LEFT JOIN inputs i
  ON i.user_id = u.id
LEFT JOIN source_accounts sa
  ON sa.user_id = u.id
LEFT JOIN ai_scoring_feeds f
  ON f.user_id = u.id
LEFT JOIN ai_reports r
  ON r.user_id = u.id
LEFT JOIN input_items ii
  ON ii.input_id = i.id
GROUP BY u.id, u.email, u.created_at
ORDER BY u.created_at DESC;

GRANT USAGE ON SCHEMA grafana TO grafana_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA grafana TO grafana_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE omens IN SCHEMA grafana GRANT SELECT ON TABLES TO grafana_ro;
SQL
