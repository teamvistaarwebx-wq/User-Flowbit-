import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Secrets at rest (a workspace's Razorpay keys): AES-256-GCM under
 * APP_ENCRYPTION_KEY. Pure, node:crypto only. A sealed value reads
 * `v1.<iv>.<tag>.<ciphertext>` (base64url), so a tampered or foreign value
 * fails to open instead of decrypting to garbage. Never send a sealed or
 * opened value to a page: show `lastFour()` only.
 */

const VERSION = 'v1'
const IV_BYTES = 12
const KEY_BYTES = 32

/**
 * The 32-byte key from APP_ENCRYPTION_KEY: 64 hex characters or 44 base64
 * characters (`openssl rand -base64 32`). Null when missing or the wrong size.
 */
export function parseEncryptionKey(raw: string | null | undefined): Buffer | null {
  const value = (raw ?? '').trim()
  if (!value) return null
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64')
  return key.length === KEY_BYTES ? key : null
}

export function sealSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.')
}

/** The plain text, or null when the value was not sealed with this key or was changed. */
export function openSecret(sealed: string | null | undefined, key: Buffer): string | null {
  const [version, iv, tag, data, extra] = (sealed ?? '').split('.')
  if (version !== VERSION || !iv || !tag || data === undefined || extra !== undefined) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** "••••1a2B": all a page may ever show of a secret. */
export const lastFour = (value: string | null | undefined): string => {
  const v = (value ?? '').trim()
  return v ? `••••${v.slice(-4)}` : ''
}
