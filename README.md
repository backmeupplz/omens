# Omens

**Signal from noise.** AI-filtered X/Twitter feed that surfaces only what matters to you.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## What it does

1. **Connect your X account** — Log in with your X/Twitter credentials
2. **Choose an AI provider** — OpenAI, Anthropic, Google Gemini, Groq, xAI, Fireworks, OpenRouter, Ollama, or any OpenAI-compatible endpoint
3. **Get signal** — Omens fetches your home timeline, scores every post 0-100 for relevance, and shows you only what matters

## Features

- **AI-filtered feed** — Every post scored by your AI provider, filtered to your configured threshold
- **AI reports** — Daily digest reports summarizing your feed's highlights
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

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing (generate: `openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | Yes | Secret for API key encryption (generate: `openssl rand -hex 32`) |
| `CORS_ORIGIN` | Production | Your domain (e.g. `https://omens.example.com`) |
| `SINGLE_USER_MODE` | No | `true` to skip registration (default: `false`) |
| `PORT` | No | Server port (default: `3000`) |

AI provider credentials are configured per-user through the web UI settings page.

## Tech stack

- **Runtime**: [Bun](https://bun.sh)
- **Backend**: [Hono](https://hono.dev)
- **Frontend**: [Preact](https://preactjs.com) + [wouter](https://github.com/molefrog/wouter) + [Tailwind CSS](https://tailwindcss.com)
- **Database**: PostgreSQL + [Drizzle ORM](https://orm.drizzle.team)
- **Monorepo**: pnpm workspaces + [Turborepo](https://turbo.build)

## License

MIT
