import { bool, cleanEnv, num, str } from 'envalid'
import 'dotenv/config'

const isDev = process.env.NODE_ENV !== 'production'

export default cleanEnv(process.env, {
  PORT: num({ default: 3000 }),
  DATABASE_URL: str({
    default: isDev ? 'postgres://omens:omens@localhost:5432/omens' : undefined,
  }),
  JWT_SECRET: str({
    default: isDev ? 'dev-jwt-secret-not-for-production' : undefined,
  }),
  ENCRYPTION_KEY: str({
    default: isDev ? 'dev-encryption-key-not-for-production' : undefined,
  }),
  SINGLE_USER_MODE: bool({ default: false }),
  POLL_INTERVAL_MINUTES: num({ default: 5 }),
  CORS_ORIGIN: str({ default: '' }),
})
