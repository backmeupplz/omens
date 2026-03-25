import { cleanEnv, num, str, bool } from 'envalid'
import 'dotenv/config'

const isDev = process.env.NODE_ENV !== 'production'

export default cleanEnv(process.env, {
  PORT: num({ default: 3000 }),
  DATABASE_URL: str({ default: isDev ? 'file:./omens.db' : undefined }),
  JWT_SECRET: str({ default: isDev ? 'dev-jwt-secret' : undefined }),
  SINGLE_USER_MODE: bool({ default: true }),
  LLM_PROVIDER: str({ default: 'fireworks' }),
  LLM_MODEL: str({
    default: 'accounts/fireworks/models/kimi-k2p5',
  }),
  LLM_API_KEY: str({ default: '' }),
  LLM_BASE_URL: str({
    default: 'https://api.fireworks.ai/inference/v1',
  }),
})
