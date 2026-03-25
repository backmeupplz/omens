FROM oven/bun:1 AS base
WORKDIR /app

# Install deps
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile

# Build web
FROM deps AS build-web
COPY apps/web/ apps/web/
COPY packages/shared/ packages/shared/
RUN cd apps/web && bun run build

# Build api
FROM deps AS build-api
COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
RUN cd apps/api && bun run build

# Runtime
FROM oven/bun:1-slim AS runtime
WORKDIR /app

COPY --from=build-api /app/apps/api/dist ./api/
COPY --from=build-web /app/apps/web/dist ./web/
COPY --from=deps /app/node_modules ./node_modules/
COPY --from=deps /app/packages/db/drizzle ./packages/db/drizzle/
COPY packages/db/ packages/db/
COPY packages/shared/ packages/shared/

ENV NODE_ENV=production
EXPOSE 3000

VOLUME /app/data
ENV DATABASE_URL=file:/app/data/omens.db

CMD ["bun", "api/index.js"]
