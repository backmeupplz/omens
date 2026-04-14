# Omens

**Signal from noise.** AI-filtered social feed that surfaces only what matters to you.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## What it does

1. **Connect your sources** — Log in with X and/or add subreddit RSS feeds
2. **Choose an AI provider** — OpenAI, Anthropic, Google Gemini, Groq, xAI, Fireworks, OpenRouter, Ollama, or any OpenAI-compatible endpoint
3. **Get signal** — Omens fetches your home timeline, scores every post 0-100 for relevance, and shows you only what matters

## Features

- **AI-filtered feed** — Every post scored by your AI provider, filtered to your configured threshold
- **AI reports** — Daily digest reports summarizing your feed's highlights
- **Reddit via RSS** — Add public subreddits as RSS-backed inputs
- **Generic input model** — RSS is the first generic non-X input path; more feed types can reuse it
- **Prompt tuning** — Thumbs up/down on posts + text instructions to refine your filter
- **Auto-fetch** — Configurable polling interval (5min to 1hr)
- **Shareable posts** — Public share pages with OG metadata for link previews
- **Shareable reports** — Share AI reports with OG images
- **Any LLM** — 9 built-in providers or any OpenAI-compatible endpoint
- **Self-hostable** — Docker Compose with PostgreSQL. Your data stays yours.
- **Tiny frontend** — Preact + Tailwind, minimal bundle

## Quick start

### Self-host with Docker Compose

```bash
git clone https://github.com/backmeupplz/omens.git
cd omens
cp docker/.env.sample .env
# Edit .env — at minimum set JWT_SECRET, ENCRYPTION_KEY, POSTGRES_PASSWORD
./docker/deploy-prod.sh
```

If `DOMAIN` is blank, Caddy stays disabled and Omens is served directly on `http://localhost:3000` or `http://SERVER_IP:${PORT}`.

Set `SINGLE_USER_MODE=true` for personal use.

### Development

```bash
# Prerequisites: Node 22+, pnpm, PostgreSQL
pnpm install
pnpm dev
```

API runs on `:3000`, web dev server on `:5173`.

## Architecture

```
apps/
  api/       Hono + Bun backend
  web/       Preact frontend
  landing/   Static landing page (GitHub Pages)
packages/
  shared/    Zod schemas
  db/        Drizzle ORM + PostgreSQL
```

## Environment variables

Omens uses one real env file at the repo root: `.env`.

This repo ships two starter templates:

- [`.env.sample`](.env.sample): app-focused example for local/non-Docker runs
- [`docker/.env.sample`](docker/.env.sample): Docker/prod-flavored example that includes optional infra vars like `DOMAIN` and `GRAFANA_*`

The overlapping app vars are intentionally the same in both. `./docker/deploy-prod.sh` prefers the repo-root `.env`, so the distinction is just which starter template is more convenient for your setup.

AI provider API keys are not server env vars. Each user enters them in the Omens settings UI.

### Local app runtime

Use this when running Omens directly with `pnpm dev` or a custom process manager.

| Variable | Required | Where to get it | Notes |
|----------|----------|-----------------|-------|
| `DATABASE_URL` | Yes | Your PostgreSQL instance | Example local value: `postgres://omens:omens@localhost:5432/omens` |
| `JWT_SECRET` | Yes | Generate with `openssl rand -hex 32` | Used for session JWT signing |
| `ENCRYPTION_KEY` | Yes | Generate with `openssl rand -hex 32` | Used for encrypting saved provider/API credentials |
| `PORT` | No | Choose locally | Defaults to `3000` |
| `SINGLE_USER_MODE` | No | Set manually | `true` skips registration for personal self-hosting |
| `POLL_INTERVAL_MINUTES` | No | Set manually | Global fetch loop cadence, default `5` |
| `CORS_ORIGIN` | Only if web and API are on different origins | Your frontend URL | Example: `https://omens.example.com` |
| `DEMO_USER_EMAIL` | Optional | One of your Omens user emails | Enables the logged-out demo feed |

### Docker deployment

For Docker, the intended flow is:

```bash
cp docker/.env.sample .env
```

Then edit the repo-root `.env` before running [`./docker/deploy-prod.sh`](docker/deploy-prod.sh).

#### Required for Omens

| Variable | Required | Where to get it | Notes |
|----------|----------|-----------------|-------|
| `JWT_SECRET` | Yes | Generate with `openssl rand -hex 32` | Must be unique per deployment |
| `ENCRYPTION_KEY` | Yes | Generate with `openssl rand -hex 32` | Must be different from `JWT_SECRET` |
| `POSTGRES_PASSWORD` | Yes | Choose/generate a strong password | Docker compose uses this to build the app `DATABASE_URL` |
| `PORT` | No | Choose locally/on server | Host port for Omens when running without Caddy; defaults to `3000` |
| `SINGLE_USER_MODE` | No | Set manually | `true` for one-user self-hosting |
| `POLL_INTERVAL_MINUTES` | No | Set manually | Global fetch cadence |
| `CORS_ORIGIN` | Only if served from another origin | Your frontend URL | Leave blank when browsing Omens directly on the same host/port |
| `DEMO_USER_EMAIL` | Optional | One of your Omens user emails | Enables logged-out demo mode |

#### Optional: Caddy / HTTPS

| Variable | Required to enable feature | Where to get it | Notes |
|----------|----------------------------|-----------------|-------|
| `DOMAIN` | Yes | Your DNS provider | Point an A/AAAA record for this hostname at your server |

If `DOMAIN` is set, `deploy-prod.sh` enables the `caddy` profile and serves Omens on `https://DOMAIN`.  
If `DOMAIN` is blank, Caddy stays off and Omens is only exposed on `PORT`.

#### Optional: Grafana

| Variable | Required to enable feature | Where to get it | Notes |
|----------|----------------------------|-----------------|-------|
| `GRAFANA_DOMAIN` | Yes | Your DNS provider | Example: `dash.omens.example.com` pointed at the same server |
| `GRAFANA_ADMIN_PASSWORD` | Yes | Generate a strong password | Used for the Grafana admin login |
| `GRAFANA_DB_PASSWORD` | Yes | Generate a strong password | Used for the read-only `grafana_ro` PostgreSQL role |
| `GRAFANA_ADMIN_USER` | No | Set manually | Defaults to `admin` |
| `GRAFANA_SHARED_DASHBOARD_UID` | No | Set manually | Stable UID for the shared dashboard |
| `GRAFANA_SHARED_DASHBOARD_ACCESS_TOKEN` | No | Set manually | Public token used by the Caddy rewrite; use a valid opaque token such as 32 hex chars |

If `GRAFANA_DOMAIN`, `GRAFANA_ADMIN_PASSWORD`, and `GRAFANA_DB_PASSWORD` are all set, `deploy-prod.sh` enables the Grafana profile.  
If any of them are missing, the entire Grafana stack stays disabled.

### Deployment behavior

`./docker/deploy-prod.sh` now auto-enables optional services based on env:

- `DOMAIN` set: enables `caddy`
- `GRAFANA_DOMAIN` + `GRAFANA_ADMIN_PASSWORD` + `GRAFANA_DB_PASSWORD` set: enables `grafana`
- missing optional vars: those services are skipped instead of starting half-configured

## Grafana dashboards

When enabled, production compose provisions Grafana 12.4.2 behind Caddy at `https://GRAFANA_DOMAIN`.

- `/` is rewritten to a public externally shared dashboard with high-level aggregate metrics only.
- `/login` and the normal Grafana UI stay authenticated for private admin dashboards and Explore-based SQL against curated `grafana.*` views.
- PostgreSQL access is through a read-only `grafana_ro` role created idempotently by `docker/postgres/provision-grafana.sh`.
- Grafana does not get direct `SELECT` access to the `public` schema. Both public and admin panels query curated views in the `grafana` schema instead.
- Public aggregate views stay on coarse, non-user-level metrics; admin views expose operational data without database secrets or provider tokens.

Dashboard queries are managed in git, not by editing prod in place:

- Public dashboard JSON: [`docker/grafana/dashboards/public/omens-public-overview.json`](docker/grafana/dashboards/public/omens-public-overview.json)
- Private admin dashboard JSON: [`docker/grafana/dashboards/admin/omens-admin-overview.json`](docker/grafana/dashboards/admin/omens-admin-overview.json)
- Datasource/dashboard provisioning: [`docker/grafana/provisioning`](docker/grafana/provisioning)

The compose setup uses Grafana file provisioning with `allowUiUpdates: false`, so redeploys overwrite drift. Use Grafana Explore for ad hoc read-only SQL against the provisioned `grafana.*` views; commit dashboard JSON or view changes when you want permanent shared/admin query updates.

## Tech stack

- **Runtime**: [Bun](https://bun.sh)
- **Backend**: [Hono](https://hono.dev)
- **Frontend**: [Preact](https://preactjs.com) + [wouter](https://github.com/molefrog/wouter) + [Tailwind CSS](https://tailwindcss.com)
- **Database**: PostgreSQL + [Drizzle ORM](https://orm.drizzle.team)
- **Monorepo**: pnpm workspaces + [Turborepo](https://turbo.build)

## License

MIT
