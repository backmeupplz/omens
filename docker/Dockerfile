FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

# Build web (vite — works with node)
FROM deps AS build-web
COPY tsconfig.base.json ./
COPY apps/web/ apps/web/
COPY packages/shared/ packages/shared/
RUN cd apps/web && npx vite build

# Build api (needs bun for bun build)
FROM deps AS build-api
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip && \
    rm -rf /var/lib/apt/lists/* && curl -fsSL https://bun.sh/install | bash
COPY tsconfig.base.json ./
COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
RUN cd apps/api && /root/.bun/bin/bun build src/index.ts --outdir dist --target bun

# Runtime
FROM oven/bun:1-slim AS runtime
WORKDIR /app

# Install curl-impersonate for X/Twitter TLS fingerprint impersonation
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && \
    curl -Lo /tmp/curl-impersonate.tar.gz https://github.com/lwthiker/curl-impersonate/releases/download/v0.6.1/curl-impersonate-v0.6.1.x86_64-linux-gnu.tar.gz && \
    tar -xzf /tmp/curl-impersonate.tar.gz -C /usr/local/bin/ && \
    rm /tmp/curl-impersonate.tar.gz && \
    apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY --from=build-api /app/apps/api/dist ./api/
COPY --from=build-api /app/apps/api/assets ./api/assets/
COPY --from=build-web /app/apps/web/dist ./web/
COPY --from=deps /app/node_modules ./node_modules/
COPY packages/db/ packages/db/
COPY packages/shared/ packages/shared/
# Symlink drizzle migrations to where the bundled code expects them
# __dirname in bundle is /app/api, join('..', 'drizzle') = /app/drizzle
RUN ln -s /app/packages/db/drizzle /app/drizzle

COPY package.json /app/package.json
ENV NODE_ENV=production
ENV WEB_DIR=/app/web
EXPOSE 3000

CMD ["bun", "api/index.js"]
