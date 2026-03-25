import { runMigrations } from '@omens/db'
import { createApp } from './app'
import { initScheduler } from './scheduler'
import env from './env'

// Run DB migrations on startup
runMigrations(env.DATABASE_URL)

const app = createApp()

// Start scheduler after app is ready
void initScheduler()

console.log(`Omens API starting on port ${env.PORT}`)

export default {
  port: env.PORT,
  fetch: app.fetch,
}
