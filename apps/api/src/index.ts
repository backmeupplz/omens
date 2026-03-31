import { runMigrations } from '@omens/db'
import { createApp } from './app'
import env from './env'
import { initFetcher } from './x/fetcher'

// Run DB migrations on startup
await runMigrations(env.DATABASE_URL)

const app = createApp()

// Start tweet fetcher
initFetcher()

if (env.SINGLE_USER_MODE) {
  console.warn(
    '[security] Running in SINGLE_USER_MODE — all requests bypass authentication. Do not expose to the internet.',
  )
}

console.log(`Omens API starting on port ${env.PORT}`)

export default {
  port: env.PORT,
  fetch: app.fetch,
}
