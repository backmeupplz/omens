# Omens

**Signal from noise.** Omens monitors Twitter, Reddit, and other sources — then uses AI to surface only what matters to you.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## What it does

1. **Connect sources** — Add subreddits, Twitter accounts (via Nitter), RSS feeds
2. **Describe your interests** — Tell the AI what matters to you in plain language
3. **Get signal** — Omens polls your sources, scores each item 0–100, and surfaces only what's relevant

## Features

- **Pluggable sources** — Reddit, Twitter/X (Nitter RSS), RSS. Easy adapter interface for adding more.
- **Any LLM** — Fireworks (Kimi K2.5), OpenAI, Anthropic, Ollama, or any OpenAI-compatible endpoint.
- **Self-hostable** — One Docker container, SQLite database. Your data stays yours.
- **Managed instance** — Or just use [app.omens.online](https://app.omens.online).
- **CLI** — Full-featured command-line interface.
- **API** — REST API with API key authentication.
- **Tiny frontend** — Preact + wouter, 11KB gzipped.

## Quick start

### Self-host with Docker

```bash
git clone https://github.com/backmeupplz/omens.git
cd omens/docker
cp .env.sample .env
# Edit .env — set JWT_SECRET and LLM_API_KEY
docker compose up -d
```

Open `http://localhost:3000`. Single-user mode is enabled by default.

### Development

```bash
pnpm install
pnpm dev
```

API runs on `:3000`, web dev server on `:5173`.

### CLI

```bash
# Configure
omens config --api-url http://localhost:3000 --api-key <your-key>

# Add sources
omens sources add --type reddit --config '{"subreddits":["technology","programming"]}'

# View your feed
omens feed --min-score 60
```

## Architecture

```
apps/
  api/       Hono backend (Bun)
  web/       Preact frontend
  cli/       CLI tool
  landing/   Static landing page
packages/
  shared/    Types and Zod schemas
  db/        Drizzle ORM + SQLite
```

### Source adapters

Each source implements a simple interface:

```typescript
interface SourceAdapter {
  type: string
  fetch(config: Record<string, unknown>, since?: Date): Promise<RawItem[]>
}
```

### LLM pipeline

Items are batched and scored using structured output (`generateObject` + Zod schema). The LLM returns a relevance score (0–100), summary, and tags for each item.

### Provider configuration

Inspired by [OpenCode](https://github.com/sst/opencode). Configure via UI, CLI, or environment variables:

```bash
LLM_PROVIDER=fireworks
LLM_MODEL=accounts/fireworks/models/kimi-k2p5
LLM_API_KEY=your-key
LLM_BASE_URL=https://api.fireworks.ai/inference/v1
```

Built-in providers: Fireworks, OpenAI, Anthropic, Ollama, or any custom OpenAI-compatible endpoint.

## API

All endpoints accept Bearer token or `X-API-Key` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/feed` | Signal feed (paginated, filterable) |
| GET/POST/PUT/DELETE | `/sources` | Source CRUD |
| GET/POST/DELETE | `/api-keys` | API key management |
| GET/PUT | `/llm/config` | LLM configuration |
| GET | `/llm/providers` | Available providers |
| GET/PUT | `/settings` | User interests & preferences |
| GET/POST/PUT/DELETE | `/outputs` | Output CRUD |
| POST | `/auth/register` | Register (multi-user mode) |
| POST | `/auth/login` | Login (multi-user mode) |

## Tech stack

- **Runtime**: Bun
- **Backend**: Hono
- **Frontend**: Preact + wouter + Tailwind CSS
- **Database**: SQLite + Drizzle ORM
- **LLM**: Vercel AI SDK (`@ai-sdk/openai-compatible`)
- **Monorepo**: pnpm workspaces + Turborepo

## License

MIT
