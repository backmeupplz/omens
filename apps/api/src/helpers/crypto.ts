import env from '../env'

const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12

async function getKey(): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(env.ENCRYPTION_KEY)
  const hash = await crypto.subtle.digest('SHA-256', keyData)
  return crypto.subtle.importKey('raw', hash, ALGORITHM, false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  )
  // Prepend IV to ciphertext, encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

export async function decrypt(encoded: string): Promise<string> {
  const key = await getKey()
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  )
  return new TextDecoder().decode(decrypted)
}
