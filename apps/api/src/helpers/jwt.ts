import { jwtVerify, SignJWT } from 'jose'
import env from '../env'

const secret = new TextEncoder().encode(env.JWT_SECRET)

export async function createToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret)
}

export async function verifyToken(
  token: string,
): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    })
    if (!payload.sub) return null
    return payload as { sub: string }
  } catch {
    return null
  }
}
