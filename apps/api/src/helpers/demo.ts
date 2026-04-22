import { eq } from 'drizzle-orm'
import { getDb, users } from '@omens/db'
import env from '../env'

let demoUserIdCache: string | null | undefined

export async function getDemoUserId(): Promise<string | null> {
  if (!env.DEMO_USER_EMAIL) return null
  if (demoUserIdCache !== undefined) return demoUserIdCache

  const db = getDb(env.DATABASE_URL)
  let [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, env.DEMO_USER_EMAIL))
    .limit(1)

  if (!user) {
    ;[user] = await db
      .insert(users)
      .values({ email: env.DEMO_USER_EMAIL })
      .returning({ id: users.id })
  }

  demoUserIdCache = user?.id ?? null
  return demoUserIdCache
}
