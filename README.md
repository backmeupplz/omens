# Omens

**Signal from noise.** AI-filtered social feed that surfaces only what matters to you.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## What it does

1. **Connect your sources** — Log in with X and/or authorize Reddit
2. **Choose an AI provider** — OpenAI, Anthropic, Google Gemini, Groq, xAI, Fireworks, OpenRouter, Ollama, or any OpenAI-compatible endpoint
3. **Get signal** — Omens fetches your home timeline, scores every post 0-100 for relevance, and shows you only what matters

## Features

- **AI-filtered feed** — Every post scored by your AI provider, filtered to your configured threshold
- **AI reports** — Daily digest reports summarizing your feed's highlights
- **Reddit OAuth** — Connect a Reddit developer app once and fetch your personalized Reddit home feed
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
cd omens/docker
cp .env .env.local
# Edit .env.local — set JWT_SECRET, ENCRYPTION_KEY, CORS_ORIGIN
docker compose up -d
```

Open `http://localhost:3000`. Set `SINGLE_USER_MODE=true` for personal use.

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

### App runtime

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing (generate: `openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | Yes | Secret for API key encryption (generate: `openssl rand -hex 32`) |
| `CORS_ORIGIN` | Production | Your domain (e.g. `https://omens.example.com`) |
| `SINGLE_USER_MODE` | No | `true` to skip registration (default: `false`) |
| `PORT` | No | Server port (default: `3000`) |

AI provider credentials are configured per-user through the web UI settings page.

### Docker / Grafana deployment

The production compose file also expects these values in [`docker/.env`](docker/.env):

| Variable | Required | Description |
|----------|----------|-------------|
| `DOMAIN` | Production | Main Omens hostname served by Caddy |
| `POSTGRES_PASSWORD` | Production | PostgreSQL superuser/app password |
| `GRAFANA_DOMAIN` | Production | Grafana hostname, e.g. `dash.omens.online` |
| `GRAFANA_ADMIN_USER` | No | Grafana admin username (default `admin`) |
| `GRAFANA_ADMIN_PASSWORD` | Production | Grafana admin password |
| `GRAFANA_DB_PASSWORD` | Production | Password for the read-only `grafana_ro` PostgreSQL role |
| `GRAFANA_SHARED_DASHBOARD_UID` | No | Stable UID for the externally shared public dashboard |
| `GRAFANA_SHARED_DASHBOARD_ACCESS_TOKEN` | No | Stable public token Caddy rewrites `/` to |

Deploy production from the repo checkout with:

```bash
./docker/deploy-prod.sh
```

That script uses the versioned [`docker/docker-compose.prod.yml`](docker/docker-compose.prod.yml) and [`docker/Caddyfile`](docker/Caddyfile), while reading secrets/domains from the repo root `.env`. This is the intended "same checkout" deployment path.

## Grafana dashboards

Production compose now provisions Grafana 12.4.2 behind Caddy at `https://dash.omens.online` by default.

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
